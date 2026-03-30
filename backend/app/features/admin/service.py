"""
Admin Service — business logic cho user management & audit logs.

Tách ra khỏi routes để:
  - Dễ test (unit test service mà không cần HTTP context)
  - Routes chỉ validate input + gọi service
  - Có thể reuse từ nhiều nơi (CLI, background jobs, etc.)
"""
from typing import Any, Dict, List, Optional
import pytz
from bson.objectid import ObjectId

from fastapi import HTTPException
from app.database.connection import get_database
from app.database.models import LogResponse
from app.database.auth_crud import (
    create_user_no_password,
    get_user_by_email,
)

VN_TZ = pytz.timezone("Asia/Ho_Chi_Minh")
VALID_ROLES = ["super_admin", "tenant_admin", "manager", "viewer"]
_TENANT_ADMIN_CREATABLE = {"manager", "viewer"}


class AdminService:
    """Handles admin-level user management and audit log queries."""

    # ── User listing ───────────────────────────────────────────────

    async def list_users(self, caller: Dict[str, Any]) -> List[dict]:
        """Return users visible to the caller (scoped by role)."""
        db = get_database()
        caller_role = caller.get("role")

        if caller_role == "super_admin":
            users = await db.users.find().to_list(500)
        else:
            users = await db.users.find({
                "$or": [
                    {"parent_admin_id": caller["email"]},
                    {"email": caller["email"]},
                ]
            }).to_list(200)

        result = []
        for u in users:
            u["id"] = str(u["_id"])
            del u["_id"]
            u.pop("password_hash", None)
<<<<<<< HEAD
            u.pop("two_factor_secret", None)
            u.pop("two_factor_pending_secret", None)
=======
>>>>>>> parent of 0c80cd2 (Delete backend directory)
            result.append(u)
        return result

    # ── User creation ──────────────────────────────────────────────

    async def create_user(self, payload: dict, caller: Dict[str, Any]) -> dict:
        """Create a new user (no password — set on first login)."""
        caller_role = caller.get("role")
        email = payload.get("email", "").strip().lower()
        role = payload.get("role", "viewer")

        # Permission checks
        if caller_role == "tenant_admin" and role not in _TENANT_ADMIN_CREATABLE:
            raise HTTPException(
                status_code=403,
                detail=f"Tenant Admin chỉ được tạo các role: {sorted(_TENANT_ADMIN_CREATABLE)}."
            )
        if not email:
            raise HTTPException(status_code=400, detail="Email là bắt buộc.")
        if email == caller.get("email"):
            raise HTTPException(status_code=400, detail="Không thể tạo tài khoản trùng email của chính mình.")
        if role not in VALID_ROLES:
            raise HTTPException(status_code=400, detail=f"Role không hợp lệ. Phải là: {VALID_ROLES}")

        existing = await get_user_by_email(email)
        if existing:
            raise HTTPException(status_code=409, detail="Email đã tồn tại trong hệ thống.")

        parent_admin_id = caller["email"]
        user_id = await create_user_no_password(email, role, is_approved=True, parent_admin_id=parent_admin_id)
        return {"message": "Tạo user thành công. User sẽ đặt mật khẩu khi đăng nhập lần đầu.", "id": user_id}

    # ── User update ────────────────────────────────────────────────

    async def update_user(self, user_id: str, payload: dict, caller: Dict[str, Any]) -> dict:
        """Update role / approval / lock status of a user."""
        role = payload.get("role")
        is_approved = payload.get("isApproved")
        caller_role = caller.get("role")

        if role not in VALID_ROLES:
            raise HTTPException(status_code=400, detail=f"Role không hợp lệ. Phải là: {VALID_ROLES}")

        if caller_role == "tenant_admin" and role not in _TENANT_ADMIN_CREATABLE:
            raise HTTPException(status_code=403, detail=f"Tenant Admin không được gán role cao hơn hoặc ngang cấp: {role}.")

        db = get_database()
        obj_id = self._parse_object_id(user_id)

        target_user = await db.users.find_one({"_id": obj_id})
        if not target_user:
            raise HTTPException(status_code=404, detail="User không tồn tại.")
        if target_user.get("email") == caller.get("email"):
            raise HTTPException(status_code=400, detail="Không thể chỉnh sửa quyền của chính mình.")
        if caller_role == "tenant_admin" and target_user.get("parent_admin_id") != caller.get("email"):
            raise HTTPException(status_code=403, detail="Bạn không có quyền chỉnh sửa tài khoản này.")
        if caller_role == "tenant_admin" and target_user.get("role") not in _TENANT_ADMIN_CREATABLE:
            raise HTTPException(status_code=403, detail="Không thể chỉnh sửa tài khoản có role cao hơn hoặc ngang cấp.")
        if target_user.get("is_locked") and caller_role != "super_admin":
            raise HTTPException(status_code=403, detail="Tài khoản bị khóa. Chỉ Super Admin mới có thể chỉnh sửa.")

        set_fields: Dict[str, Any] = {"role": role, "isApproved": bool(is_approved)}
        if "parent_admin_id" in payload:
            set_fields["parent_admin_id"] = payload["parent_admin_id"]
        if "is_locked" in payload and caller_role == "super_admin":
            set_fields["is_locked"] = bool(payload["is_locked"])

        result = await db.users.update_one({"_id": obj_id}, {"$set": set_fields})
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="User không tồn tại.")
        return {"message": "Cập nhật user thành công."}

    # ── User deletion ──────────────────────────────────────────────

    async def delete_user(self, user_id: str, caller: Dict[str, Any]) -> dict:
        """Delete a user with permission checks."""
        db = get_database()
        obj_id = self._parse_object_id(user_id)

        user = await db.users.find_one({"_id": obj_id})
        if not user:
            raise HTTPException(status_code=404, detail="User không tồn tại.")

        caller_role = caller.get("role")
        if user.get("email") == caller.get("email"):
            raise HTTPException(status_code=400, detail="Không thể xóa tài khoản của chính mình.")
        if caller_role == "tenant_admin":
            if user.get("parent_admin_id") != caller.get("email"):
                raise HTTPException(status_code=403, detail="Bạn không có quyền xóa tài khoản này.")
            if user.get("role") not in _TENANT_ADMIN_CREATABLE:
                raise HTTPException(status_code=403, detail="Không thể xóa tài khoản có role cao hơn hoặc ngang cấp.")
        if user.get("is_locked") and caller_role != "super_admin":
            raise HTTPException(status_code=403, detail="Tài khoản bị khóa. Chỉ Super Admin mới có thể xóa.")

        await db.users.delete_one({"_id": obj_id})
        return {"message": "Xóa user thành công."}

    # ── Password reset ─────────────────────────────────────────────

    async def reset_password(self, user_id: str, caller: Dict[str, Any]) -> dict:
        """Reset user password — forces set-password on next login."""
        db = get_database()
        obj_id = self._parse_object_id(user_id)

        user = await db.users.find_one({"_id": obj_id})
        if not user:
            raise HTTPException(status_code=404, detail="User không tồn tại.")

        caller_role = caller.get("role")
        if user.get("email") == caller.get("email"):
            raise HTTPException(status_code=400, detail="Dùng tính năng đổi mật khẩu cá nhân để thay đổi mật khẩu của chính mình.")
        if caller_role == "tenant_admin":
            if user.get("parent_admin_id") != caller.get("email"):
                raise HTTPException(status_code=403, detail="Bạn không có quyền reset mật khẩu tài khoản này.")
            if user.get("role") not in _TENANT_ADMIN_CREATABLE:
                raise HTTPException(status_code=403, detail="Không thể reset mật khẩu tài khoản có role cao hơn hoặc ngang cấp.")

        await db.users.update_one(
            {"_id": obj_id},
            {"$unset": {"password_hash": ""}, "$set": {"must_set_password": True}}
        )
        return {"message": "Đã reset. User sẽ được yêu cầu đặt mật khẩu mới khi đăng nhập."}

    # ── Audit logs ─────────────────────────────────────────────────

    async def get_audit_logs(
        self,
        caller: Dict[str, Any],
        limit: int = 50,
        skip: int = 0,
        zone_id: Optional[str] = None,
    ) -> List[LogResponse]:
        """Fetch audit logs scoped to caller's visibility."""
        db = get_database()
        query = {}

        from app.config import SUPER_ADMIN_EMAILS
        is_super = caller.get("role") == "super_admin" or caller.get("email") in SUPER_ADMIN_EMAILS

        if zone_id:
<<<<<<< HEAD
            from app.database.member_permissions_crud import get_all_member_emails_in_zone
=======
            from app.database.zones_crud import get_all_member_emails_in_zone
>>>>>>> parent of 0c80cd2 (Delete backend directory)
            member_emails = await get_all_member_emails_in_zone(zone_id)
            if member_emails:
                query["$or"] = [
                    {"actor_email": {"$in": member_emails}},
                    {"insight_user_id": {"$in": member_emails}},
                ]
            else:
                return []
        elif not is_super:
<<<<<<< HEAD
            caller_email = caller.get("email")
            caller_role = caller.get("role")
            
            # Collect all emails visible to this user
            visible_emails = {caller_email}  # Always see own logs
            
            # Include child accounts (users created by this tenant admin)
            if caller_role == "tenant_admin":
                child_users = await db.users.find(
                    {"parent_admin_id": caller_email}, {"email": 1}
                ).to_list(200)
                for u in child_users:
                    visible_emails.add(u["email"])
            
            # Include zone member emails from all zones this user has access to
            from app.database.member_permissions_crud import get_zone_ids_for_member, get_all_member_emails_in_zone
            if caller_role == "tenant_admin":
                # Tenant admin: get zones they created + zones they're member of
                from app.database.zones_crud import get_zones_for_creator
                created_zones = await get_zones_for_creator(caller_email)
                member_zone_ids = await get_zone_ids_for_member(caller_email)
                all_zone_ids = set(str(z["_id"]) for z in created_zones) | set(member_zone_ids)
            else:
                all_zone_ids = set(await get_zone_ids_for_member(caller_email))
            
            for zid in all_zone_ids:
                zone_member_emails = await get_all_member_emails_in_zone(zid)
                visible_emails.update(zone_member_emails)
            
            email_list = list(visible_emails)
            query["$or"] = [
                {"actor_email": {"$in": email_list}},
                {"insight_user_id": {"$in": email_list}},
            ]
=======
            from app.database.zones_crud import get_zones_for_member
            zones = await get_zones_for_member(caller.get("email"))
            sub_emails = set()
            for z in zones:
                for m in z.get("members", []):
                    sub_emails.add(m["email"])
            if sub_emails:
                sub_list = list(sub_emails)
                query["$or"] = [
                    {"actor_email": {"$in": sub_list}},
                    {"insight_user_id": {"$in": sub_list}},
                ]
            else:
                query["$or"] = [
                    {"actor_email": caller.get("email")},
                    {"insight_user_id": caller.get("email")},
                ]
>>>>>>> parent of 0c80cd2 (Delete backend directory)

        cursor = db.audit_logs.find(query).sort("timestamp", -1).skip(skip).limit(limit)
        logs = await cursor.to_list(length=limit)
        return [self._format_log(log) for log in logs]

    # ── Helpers ────────────────────────────────────────────────────

    @staticmethod
    def _parse_object_id(raw_id: str) -> ObjectId:
        try:
            return ObjectId(raw_id)
        except Exception:
            raise HTTPException(status_code=400, detail="ID user không hợp lệ.")

    @staticmethod
    def _format_log(log: dict) -> LogResponse:
        utc_dt = log.get("timestamp")
        gmt7_str = ""
        if utc_dt:
            if utc_dt.tzinfo is None:
                utc_dt = pytz.utc.localize(utc_dt)
            gmt7_str = utc_dt.astimezone(VN_TZ).strftime("%H:%M %d/%m/%Y")

        return LogResponse(
            id=str(log["_id"]),
            timestamp=gmt7_str,
            actor_email=log.get("actor_email") or log.get("insight_user_id"),
            insight_user_id=log.get("insight_user_id"),
            method=log.get("method", ""),
            endpoint=log.get("endpoint", ""),
            payload=log.get("payload"),
            ip_address=log.get("ip_address"),
            statusCode=log.get("statusCode", 0),
            action=log.get("action"),
            site_id=log.get("site_id"),
            zone_id=log.get("zone_id"),
            master_account_used=log.get("master_account_used", False),
<<<<<<< HEAD
            status=log.get("status"),
            result_detail=log.get("result_detail"),
=======
>>>>>>> parent of 0c80cd2 (Delete backend directory)
        )


admin_service = AdminService()
