"""
Super Admin Service — business logic cho super admin operations.

Tách ra khỏi routes để:
  - Dễ test tenant CRUD, system user management riêng biệt
  - Routes chỉ validate input + gọi service
  - Shared log formatting reusable across admin/super
"""
from typing import Any, Dict, List, Optional
import pytz
from bson.objectid import ObjectId

from fastapi import HTTPException
from app.database.connection import get_database
from app.database.models import LogResponse
from app.database.tenants_crud import (
    create_tenant,
    get_all_tenants,
    get_tenant_by_id,
    get_tenant_by_admin_email,
    update_tenant,
    assign_tenant_admin,
    delete_tenant,
)
from app.database.auth_crud import (
    create_user_no_password,
    get_user_by_email,
)

VN_TZ = pytz.timezone("Asia/Ho_Chi_Minh")
VALID_ROLES = ["super_admin", "tenant_admin", "manager", "viewer"]


class SuperService:
    """Handles super-admin-level operations: tenants, users, logs, permissions."""

    # ═══ Tenant CRUD ═══════════════════════════════════════════════

    async def list_tenants(self) -> List[dict]:
        """List all tenants with user counts."""
        tenants = await get_all_tenants()
        db = get_database()
        for t in tenants:
            admin_email = t.get("admin_email", "")
            t["user_count"] = await db.users.count_documents({"parent_admin_id": admin_email}) if admin_email else 0
        return tenants

    async def create_tenant(self, name: str, note: str = "") -> dict:
        """Create a new tenant."""
        if not name.strip():
            raise HTTPException(status_code=400, detail="Tên tenant là bắt buộc.")
        tenant_id = await create_tenant(name=name.strip(), note=note.strip())
        return {"message": "Tạo tenant thành công.", "id": tenant_id}

    async def update_tenant(self, tenant_id: str, payload: dict) -> dict:
        """Update tenant name/note."""
        tenant = await get_tenant_by_id(tenant_id)
        if not tenant:
            raise HTTPException(status_code=404, detail="Tenant không tồn tại.")

        updates = {}
        if "name" in payload and payload["name"].strip():
            updates["name"] = payload["name"].strip()
        if "note" in payload:
            updates["note"] = payload["note"].strip()

        if not updates:
            raise HTTPException(status_code=400, detail="Không có thông tin cần cập nhật.")

        success = await update_tenant(tenant_id, updates)
        if not success:
            raise HTTPException(status_code=404, detail="Tenant không tồn tại.")
        return {"message": "Cập nhật tenant thành công."}

    async def delete_tenant(self, tenant_id: str) -> dict:
        """Delete a tenant."""
        tenant = await get_tenant_by_id(tenant_id)
        if not tenant:
            raise HTTPException(status_code=404, detail="Tenant không tồn tại.")
        success = await delete_tenant(tenant_id)
        if not success:
            raise HTTPException(status_code=500, detail="Xóa tenant thất bại.")
        return {"message": "Xóa tenant thành công."}

    async def assign_admin(self, tenant_id: str, admin_email: str) -> dict:
        """Assign a tenant_admin to a tenant."""
        if not admin_email.strip():
            raise HTTPException(status_code=400, detail="admin_email là bắt buộc.")

        tenant = await get_tenant_by_id(tenant_id)
        if not tenant:
            raise HTTPException(status_code=404, detail="Tenant không tồn tại.")

        db = get_database()
        target_user = await db.users.find_one({"email": admin_email})
        if not target_user:
            raise HTTPException(status_code=404, detail=f"User {admin_email} không tồn tại.")
        if target_user.get("role") != "tenant_admin":
            raise HTTPException(status_code=400, detail=f"User {admin_email} không có role tenant_admin.")

        existing = await get_tenant_by_admin_email(admin_email)
        warning = None
        if existing and existing["id"] != tenant_id:
            warning = f"Cảnh báo: {admin_email} đang là admin của tenant '{existing['name']}'. Gán sẽ chuyển quyền sang tenant này."

        await assign_tenant_admin(tenant_id, admin_email)
        result = {"message": f"Đã gán {admin_email} làm Tenant Admin của tenant này."}
        if warning:
            result["warning"] = warning
        return result

    # ═══ System users ══════════════════════════════════════════════

    async def list_users(self) -> List[dict]:
        """List all system users with tenant info."""
        db = get_database()
        users = await db.users.find().to_list(1000)
        tenants = await get_all_tenants()
        tenant_map = {t.get("admin_email", ""): t for t in tenants if t.get("admin_email")}

        result = []
        for u in users:
            u["id"] = str(u.pop("_id"))
            u.pop("password_hash", None)
            if u.get("role") == "tenant_admin" and u.get("email") in tenant_map:
                u["tenant"] = {
                    "id": tenant_map[u["email"]]["id"],
                    "name": tenant_map[u["email"]]["name"],
                }
            result.append(u)
        return result

    async def create_user(self, email: str, role: str, parent_admin_id: str = "", caller_email: str = "") -> dict:
        """Create user without password (first-login setup)."""
        if not email:
            raise HTTPException(status_code=400, detail="Email là bắt buộc.")
        if role not in VALID_ROLES:
            raise HTTPException(status_code=400, detail=f"Role không hợp lệ: {VALID_ROLES}")
        if email == caller_email:
            raise HTTPException(status_code=400, detail="Không thể tạo tài khoản trùng email của chính mình.")

        existing = await get_user_by_email(email)
        if existing:
            raise HTTPException(status_code=409, detail="Email đã tồn tại trong hệ thống.")

        user_id = await create_user_no_password(
            email=email, role=role, is_approved=True,
            parent_admin_id=parent_admin_id or None,
        )
        return {"message": "Tạo user thành công. User sẽ được yêu cầu đặt mật khẩu khi đăng nhập lần đầu.", "id": user_id}

    async def update_user(self, user_id: str, payload: dict, caller_email: str) -> dict:
        """Update user role/approval/lock."""
        db = get_database()
        obj_id = self._parse_object_id(user_id)
        target = await db.users.find_one({"_id": obj_id})
        if not target:
            raise HTTPException(status_code=404, detail="User không tồn tại.")
        if target.get("email") == caller_email:
            raise HTTPException(status_code=400, detail="Không thể chỉnh sửa tài khoản của chính mình.")

        set_fields: Dict[str, Any] = {}
        if "role" in payload:
            if payload["role"] not in VALID_ROLES:
                raise HTTPException(status_code=400, detail=f"Role không hợp lệ: {VALID_ROLES}")
            set_fields["role"] = payload["role"]
        if "isApproved" in payload:
            set_fields["isApproved"] = bool(payload["isApproved"])
        if "parent_admin_id" in payload:
            set_fields["parent_admin_id"] = payload["parent_admin_id"]
        if "is_locked" in payload:
            set_fields["is_locked"] = bool(payload["is_locked"])

        if not set_fields:
            raise HTTPException(status_code=400, detail="Không có trường nào để cập nhật.")

        await db.users.update_one({"_id": obj_id}, {"$set": set_fields})
        return {"message": "Cập nhật user thành công."}

    async def delete_user(self, user_id: str, caller_email: str) -> dict:
        """Delete a user."""
        db = get_database()
        obj_id = self._parse_object_id(user_id)
        target = await db.users.find_one({"_id": obj_id})
        if not target:
            raise HTTPException(status_code=404, detail="User không tồn tại.")
        if target.get("email") == caller_email:
            raise HTTPException(status_code=400, detail="Không thể xóa tài khoản của chính mình.")

        await db.users.delete_one({"_id": obj_id})
        return {"message": "Xóa user thành công."}

    async def reset_password(self, user_id: str, caller_email: str) -> dict:
        """Reset user password — forces re-setup on next login."""
        db = get_database()
        obj_id = self._parse_object_id(user_id)
        target = await db.users.find_one({"_id": obj_id})
        if not target:
            raise HTTPException(status_code=404, detail="User không tồn tại.")
        if target.get("email") == caller_email:
            raise HTTPException(status_code=400, detail="Dùng tính năng đổi mật khẩu cá nhân.")

        await db.users.update_one(
            {"_id": obj_id},
            {"$unset": {"password_hash": ""}, "$set": {"must_set_password": True}},
        )
        return {"message": "Đã reset mật khẩu. User sẽ được yêu cầu đặt mật khẩu mới khi đăng nhập."}

    # ═══ System-wide audit logs ════════════════════════════════════

    async def get_system_logs(self, limit: int = 100, skip: int = 0) -> List[LogResponse]:
        """Fetch system-wide audit logs (no scoping)."""
        db = get_database()
        cursor = db.audit_logs.find({}).sort("timestamp", -1).skip(skip).limit(limit)
        logs = await cursor.to_list(length=limit)
        return [self._format_log(log) for log in logs]

    # ═══ Role permissions ══════════════════════════════════════════

    async def list_permissions(self) -> list:
        """Get all roles' permissions."""
        from app.database.roles_crud import get_all_roles_permissions
        return await get_all_roles_permissions()

    async def update_permissions(self, role: str, permissions: dict) -> dict:
        """Update permissions for a role."""
        if role not in VALID_ROLES:
            raise HTTPException(status_code=400, detail=f"Role không hợp lệ: {VALID_ROLES}")
        if role == "super_admin":
            raise HTTPException(status_code=400, detail="Không được phép thay đổi quyền của super_admin.")

        from app.database.roles_crud import update_role_permissions
        success = await update_role_permissions(role, permissions)
        if not success:
            raise HTTPException(status_code=500, detail="Không thể cập nhật quyền.")
        return {"message": f"Cập nhật quyền cho {role} thành công."}

    # ═══ Helpers ═══════════════════════════════════════════════════

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
            gmt7_str = utc_dt.astimezone(VN_TZ).strftime("%Y-%m-%d %H:%M:%S %Z")

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
        )


super_service = SuperService()
