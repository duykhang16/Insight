"""
Auth Service — business logic cho authentication flows.

Tách ra khỏi routes để:
  - Dễ test login/session/refresh flows riêng biệt
  - Reuse logic check zone_admin, permissions từ nhiều nơi
  - Routes chỉ parse HTTP input + gọi service
"""
from typing import Any, Dict

from fastapi import HTTPException

from app.database.auth_crud import (
    authenticate_user,
    get_user_by_email,
    hash_password,
    verify_password,
)
from app.database.connection import get_database
from app.shared.jwt_utils import (
    create_insight_token,
    verify_insight_token,
    verify_insight_session_token,
)
from app.shared import (
    build_provisioning_uri,
    build_qr_svg,
    generate_two_factor_secret,
    verify_two_factor_code,
)


_SETUP_TOKEN_PURPOSE = "must_set_password"
_OTP_LOGIN_TOKEN_PURPOSE = "otp_login"


class AuthService:
    """Handles all authentication-related business logic."""

    async def check_email(self, email: str) -> dict:
        """Step 1: Validate email before asking for password."""
        user = await get_user_by_email(email)
        if not user:
            raise HTTPException(status_code=404, detail="Email không tồn tại trong hệ thống.")

        if not user.get("isApproved", False):
            raise HTTPException(status_code=403, detail="Tài khoản chưa được kích hoạt. Vui lòng liên hệ Admin.")

        role = user.get("role", "viewer")
        admin_roles = {"super_admin", "tenant_admin"}
        if role not in admin_roles:
            from app.database.member_permissions_crud import get_zone_ids_for_member
            zone_ids = await get_zone_ids_for_member(email)
            if not zone_ids:
                raise HTTPException(
                    status_code=403,
                    detail="Bạn chưa được phân quyền quản lý Zone nào. Vui lòng liên hệ Admin.",
                )

        password_hash = user.get("password_hash")
        if not password_hash and user.get("must_set_password"):
            setup_token = create_insight_token(
                email=email,
                role=role,
                extra={"purpose": _SETUP_TOKEN_PURPOSE},
                expiry_hours=1,
            )
            return {
                "status": "ok",
                "next_step": "must_set_password",
                "setup_token": setup_token,
                "email": email,
            }

        return {
            "status": "ok",
            "next_step": "enter_password",
            "email": email,
        }

    async def login(self, email: str, password: str) -> dict:
        """Authenticate email/password and either issue session or require OTP."""
        result = await authenticate_user(email, password)

        if not result.ok:
            error_messages = {
                "bad_credentials": (401, "Tên đăng nhập hoặc mật khẩu không chính xác."),
                "not_approved": (403, "Tài khoản của bạn chưa được kích hoạt. Vui lòng liên hệ Admin Master."),
                "no_zones": (403, "Bạn chưa được phân quyền quản lý Zone nào. Vui lòng liên hệ Admin để được cấp quyền."),
            }
            status_code, detail = error_messages.get(result.error, (401, "Xác thực thất bại."))
            raise HTTPException(status_code=status_code, detail=detail)

        user = result.user
        role = user.get("role", "viewer")

        if result.must_set_password:
            setup_token = create_insight_token(
                email=email,
                role=role,
                extra={"purpose": _SETUP_TOKEN_PURPOSE},
                expiry_hours=1,
            )
            return {
                "status": "must_set_password",
                "setup_token": setup_token,
                "email": email,
            }

        return await self._build_login_response(user)

    async def verify_otp(self, otp_challenge_token: str, otp: str) -> dict:
        if not otp_challenge_token:
            raise HTTPException(status_code=400, detail="otp_challenge_token là bắt buộc.")

        payload = verify_insight_token(otp_challenge_token)
        if payload.get("purpose") != _OTP_LOGIN_TOKEN_PURPOSE:
            raise HTTPException(status_code=403, detail="Token OTP không hợp lệ.")

        email = payload.get("sub")
        user = await get_user_by_email(email)
        if not user:
            raise HTTPException(status_code=404, detail="Tài khoản không tồn tại.")
        if not user.get("two_factor_enabled"):
            raise HTTPException(status_code=400, detail="Tài khoản này chưa bật xác thực hai lớp.")
        if not verify_two_factor_code(user.get("two_factor_secret") or "", otp):
            raise HTTPException(status_code=401, detail="OTP không chính xác.")

        return await self._build_login_success_response(user)

    async def check_session(self, token: str) -> dict:
        """Verify JWT and return current session info."""
        payload = verify_insight_session_token(token)

        user = await get_user_by_email(payload["sub"])
        if not user or not user.get("isApproved", False):
            raise HTTPException(status_code=403, detail="Tài khoản chưa được phê duyệt.")

        email = payload["sub"]
        role = user.get("role", payload.get("role", "viewer"))
        is_zone_admin = await self._check_zone_admin(email, role)
        permissions = await self._get_permissions(role)

        return {
            "status": "active",
            "email": email,
            "role": role,
            "is_zone_admin": is_zone_admin,
            "permissions": permissions,
        }

    async def refresh_token(self, old_token: str) -> dict:
        """Issue new JWT from a valid old token."""
        payload = verify_insight_session_token(old_token)
        email = payload["sub"]

        user = await get_user_by_email(email)
        if not user or not user.get("isApproved", False):
            raise HTTPException(status_code=403, detail="Tài khoản không hợp lệ.")

        role = user.get("role", "viewer")
        new_token = create_insight_token(email=email, role=role)
        return {
            "status": "success",
            "access_token": new_token,
            "token_type": "Bearer",
        }

    async def set_password(self, setup_token: str, new_password: str) -> dict:
        """Handle first-login password setup flow."""
        if not setup_token:
            raise HTTPException(status_code=400, detail="setup_token là bắt buộc.")
        if not new_password or len(new_password) < 8:
            raise HTTPException(status_code=400, detail="Mật khẩu mới phải ít nhất 8 ký tự.")

        payload = verify_insight_token(setup_token)
        if payload.get("purpose") != _SETUP_TOKEN_PURPOSE:
            raise HTTPException(status_code=403, detail="Token không hợp lệ cho tác vụ này.")

        email = payload.get("sub")
        user = await get_user_by_email(email)
        if not user:
            raise HTTPException(status_code=404, detail="Tài khoản không tồn tại.")
        if not user.get("must_set_password"):
            raise HTTPException(status_code=400, detail="Tài khoản này không cần đặt mật khẩu lần đầu.")

        db = get_database()
        await db.users.update_one(
            {"email": email},
            {
                "$set": {"password_hash": hash_password(new_password)},
                "$unset": {"must_set_password": ""},
            },
        )

        refreshed_user = await get_user_by_email(email)
        return await self._build_login_response(refreshed_user)

    async def change_password(self, email: str, old_password: str, new_password: str) -> dict:
        """Change password for an authenticated user."""
        if not old_password:
            raise HTTPException(status_code=400, detail="Mật khẩu cũ là bắt buộc.")
        if not new_password or len(new_password) < 8:
            raise HTTPException(status_code=400, detail="Mật khẩu mới phải ít nhất 8 ký tự.")

        user = await get_user_by_email(email)
        if not user:
            raise HTTPException(status_code=404, detail="Tài khoản không tồn tại.")

        password_hash = user.get("password_hash")
        if not password_hash:
            raise HTTPException(status_code=400, detail="Tài khoản chưa có mật khẩu. Sử dụng chức năng đặt mật khẩu lần đầu.")

        if not verify_password(old_password, password_hash):
            raise HTTPException(status_code=401, detail="Mật khẩu cũ không chính xác.")

        db = get_database()
        await db.users.update_one(
            {"email": email},
            {"$set": {"password_hash": hash_password(new_password)}},
        )

        return {
            "status": "success",
            "message": "Đổi mật khẩu thành công.",
        }

    async def get_two_factor_status(self, email: str) -> dict:
        user = await get_user_by_email(email)
        if not user:
            raise HTTPException(status_code=404, detail="Tài khoản không tồn tại.")

        return {
            "status": "success",
            "two_factor_enabled": bool(user.get("two_factor_enabled", False)),
            "label_email": user.get("two_factor_label_email") or user.get("email") or "",
            "has_pending_setup": bool(user.get("two_factor_pending_secret")),
        }

    async def setup_two_factor(self, email: str, current_password: str, label_email: str) -> dict:
        user = await get_user_by_email(email)
        if not user:
            raise HTTPException(status_code=404, detail="Tài khoản không tồn tại.")
        if not current_password:
            raise HTTPException(status_code=400, detail="Mật khẩu hiện tại là bắt buộc.")
        if not verify_password(current_password, user.get("password_hash") or ""):
            raise HTTPException(status_code=401, detail="Mật khẩu hiện tại không chính xác.")

        normalized_label_email = str(label_email or "").strip().lower()
        if not normalized_label_email:
            raise HTTPException(status_code=400, detail="Email dùng cho QR là bắt buộc.")

        pending_secret = generate_two_factor_secret()
        provisioning_uri = build_provisioning_uri(pending_secret, normalized_label_email)
        qr_svg = build_qr_svg(provisioning_uri)

        db = get_database()
        await db.users.update_one(
            {"email": email},
            {
                "$set": {
                    "two_factor_pending_secret": pending_secret,
                    "two_factor_pending_label_email": normalized_label_email,
                }
            },
        )

        return {
            "status": "success",
            "label_email": normalized_label_email,
            "provisioning_uri": provisioning_uri,
            "qr_svg": qr_svg,
        }

    async def confirm_two_factor(self, email: str, otp: str) -> dict:
        user = await get_user_by_email(email)
        if not user:
            raise HTTPException(status_code=404, detail="Tài khoản không tồn tại.")

        pending_secret = user.get("two_factor_pending_secret")
        if not pending_secret:
            raise HTTPException(status_code=400, detail="Không có thiết lập 2FA đang chờ xác nhận.")
        if not verify_two_factor_code(pending_secret, otp):
            raise HTTPException(status_code=401, detail="OTP không chính xác.")

        label_email = (
            user.get("two_factor_pending_label_email")
            or user.get("two_factor_label_email")
            or user.get("email")
        )

        db = get_database()
        await db.users.update_one(
            {"email": email},
            {
                "$set": {
                    "two_factor_enabled": True,
                    "two_factor_secret": pending_secret,
                    "two_factor_label_email": label_email,
                    "two_factor_pending_secret": None,
                    "two_factor_pending_label_email": None,
                }
            },
        )

        return {
            "status": "success",
            "message": "Đã bật xác thực hai lớp.",
            "two_factor_enabled": True,
            "label_email": label_email,
        }

    async def disable_two_factor(self, email: str, current_password: str, otp: str) -> dict:
        user = await get_user_by_email(email)
        if not user:
            raise HTTPException(status_code=404, detail="Tài khoản không tồn tại.")
        if not user.get("two_factor_enabled"):
            raise HTTPException(status_code=400, detail="Tài khoản chưa bật xác thực hai lớp.")
        if not current_password:
            raise HTTPException(status_code=400, detail="Mật khẩu hiện tại là bắt buộc.")
        if not verify_password(current_password, user.get("password_hash") or ""):
            raise HTTPException(status_code=401, detail="Mật khẩu hiện tại không chính xác.")
        if not verify_two_factor_code(user.get("two_factor_secret") or "", otp):
            raise HTTPException(status_code=401, detail="OTP không chính xác.")

        db = get_database()
        await db.users.update_one(
            {"email": email},
            {
                "$set": {
                    "two_factor_enabled": False,
                    "two_factor_secret": None,
                    "two_factor_label_email": None,
                    "two_factor_pending_secret": None,
                    "two_factor_pending_label_email": None,
                }
            },
        )

        return {
            "status": "success",
            "message": "Đã tắt xác thực hai lớp.",
            "two_factor_enabled": False,
        }

    @staticmethod
    async def _check_zone_admin(email: str, role: str) -> bool:
        """Check if user is a zone manager (only for manager/viewer roles)."""
        if role in ("super_admin", "tenant_admin"):
            return False
        from app.database.member_permissions_crud import get_zones_for_member

        permissions = await get_zones_for_member(email)
        return any(p.get("zone_role") == "manager" for p in permissions)

    @staticmethod
    async def _get_permissions(role: str) -> dict:
        """Get role permissions from DB."""
        from app.database.roles_crud import get_role_permissions

        return await get_role_permissions(role)

    async def _build_login_response(self, user: Dict[str, Any]) -> dict:
        if user.get("two_factor_enabled"):
            role = user.get("role", "viewer")
            otp_challenge_token = create_insight_token(
                email=user["email"],
                role=role,
                extra={"purpose": _OTP_LOGIN_TOKEN_PURPOSE},
                expiry_hours=5 / 60,
            )
            return {
                "status": "otp_required",
                "next_step": "verify_otp",
                "otp_challenge_token": otp_challenge_token,
                "email": user["email"],
            }

        return await self._build_login_success_response(user)

    async def _build_login_success_response(self, user: Dict[str, Any]) -> dict:
        email = user["email"]
        role = user.get("role", "viewer")
        access_token = create_insight_token(email=email, role=role)
        is_zone_admin = await self._check_zone_admin(email, role)
        permissions = await self._get_permissions(role)

        return {
            "status": "success",
            "access_token": access_token,
            "token_type": "Bearer",
            "email": email,
            "role": role,
            "is_zone_admin": is_zone_admin,
            "permissions": permissions,
        }


auth_service = AuthService()
