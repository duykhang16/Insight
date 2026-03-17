"""
Auth Service — business logic cho authentication flows.

Tách ra khỏi routes để:
  - Dễ test login/session/refresh flows riêng biệt
  - Reuse logic check zone_admin, permissions từ nhiều nơi
  - Routes chỉ parse HTTP input + gọi service
"""
from typing import Any, Dict, Optional

from fastapi import HTTPException
from app.shared.jwt_utils import create_insight_token, verify_insight_token
from app.database.auth_crud import authenticate_user, get_user_by_email, hash_password


_SETUP_TOKEN_PURPOSE = "must_set_password"


class AuthService:
    """Handles all authentication-related business logic."""

    # ── Check email (Step 1) ─────────────────────────────────────

    async def check_email(self, email: str) -> dict:
        """Step 1: Validate email before asking for password.

        Returns next_step:
          - "enter_password"    → normal account, proceed to password input
          - "must_set_password" → first-login, show set-password form + setup_token
        Raises HTTPException for: not found, not approved, no zones.
        """
        user = await get_user_by_email(email)
        if not user:
            raise HTTPException(status_code=404, detail="Email không tồn tại trong hệ thống.")

        if not user.get("isApproved", False):
            raise HTTPException(status_code=403, detail="Tài khoản chưa được kích hoạt. Vui lòng liên hệ Admin.")

        # Zone check for non-admin roles
        role = user.get("role", "viewer")
        _ADMIN_ROLES = {"super_admin", "tenant_admin"}
        if role not in _ADMIN_ROLES:
            from app.database.member_permissions_crud import get_zone_ids_for_member
            zone_ids = await get_zone_ids_for_member(email)
            if not zone_ids:
                raise HTTPException(
                    status_code=403,
                    detail="Bạn chưa được phân quyền quản lý Zone nào. Vui lòng liên hệ Admin.",
                )

        # Check password status
        password_hash = user.get("password_hash")
        if not password_hash and user.get("must_set_password"):
            setup_token = create_insight_token(
                email=email, role=role,
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

    # ── Login (Step 2) ────────────────────────────────────────────

    async def login(self, email: str, password: str) -> dict:
        """Authenticate user and return token + metadata."""
        result = await authenticate_user(email, password)

        if not result.ok:
            _ERROR_MESSAGES = {
                "bad_credentials": (401, "Tên đăng nhập hoặc mật khẩu không chính xác."),
                "not_approved":    (403, "Tài khoản của bạn chưa được kích hoạt. Vui lòng liên hệ Admin Master."),
                "no_zones":        (403, "Bạn chưa được phân quyền quản lý Zone nào. Vui lòng liên hệ Admin để được cấp quyền."),
            }
            status_code, detail = _ERROR_MESSAGES.get(result.error, (401, "Xác thực thất bại."))
            raise HTTPException(status_code=status_code, detail=detail)

        user = result.user
        role = user.get("role", "viewer")

        # First-login: no password yet → issue setup token
        if result.must_set_password:
            setup_token = create_insight_token(
                email=email, role=role,
                extra={"purpose": _SETUP_TOKEN_PURPOSE},
                expiry_hours=1,
            )
            return {
                "status": "must_set_password",
                "setup_token": setup_token,
                "email": email,
            }

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

    # ── Session check ──────────────────────────────────────────────

    async def check_session(self, token: str) -> dict:
        """Verify JWT and return current session info."""
        payload = verify_insight_token(token)  # raises 401 if invalid

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

    # ── Refresh ────────────────────────────────────────────────────

    async def refresh_token(self, old_token: str) -> dict:
        """Issue new JWT from a valid old token."""
        payload = verify_insight_token(old_token)
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

    # ── Set password (first login) ─────────────────────────────────

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

        from app.database.connection import get_database
        db = get_database()
        await db.users.update_one(
            {"email": email},
            {"$set": {"password_hash": hash_password(new_password)}, "$unset": {"must_set_password": ""}}
        )

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

    # ── Shared helpers ─────────────────────────────────────────────

    @staticmethod
    async def _check_zone_admin(email: str, role: str) -> bool:
        """Check if user is a zone manager (only for manager/viewer roles)."""
        if role in ("super_admin", "tenant_admin"):
            return False
        from app.database.member_permissions_crud import get_zones_for_member
        permissions = await get_zones_for_member(email)
        return any(
            p.get("zone_role") == "manager"
            for p in permissions
        )

    @staticmethod
    async def _get_permissions(role: str) -> dict:
        """Get role permissions from DB."""
        from app.database.roles_crud import get_role_permissions
        return await get_role_permissions(role)


auth_service = AuthService()
