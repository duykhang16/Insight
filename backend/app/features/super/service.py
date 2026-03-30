"""
Super Admin Service — platform-level brand and super-user operations.
"""
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
import pytz
from bson.objectid import ObjectId
from email_validator import EmailNotValidError, validate_email

from fastapi import HTTPException
from app.database.connection import get_database
from app.database.models import LogResponse
from app.database.tenants_crud import (
    create_tenant,
    get_all_tenants,
    get_tenant_by_id,
    get_tenant_by_admin_email,
    update_tenant,
)
from app.database.auth_crud import create_user_no_password, get_user_by_email
from app.shared.rbac import (
    ROLE_BRAND_ADMIN,
    ROLE_SUPER_ADMIN,
    VALID_ROLES,
    normalize_legacy_role,
)

VN_TZ = pytz.timezone("Asia/Ho_Chi_Minh")


class SuperService:
    """Handles super-admin-level operations: brands, super users, logs, permissions."""

    async def list_tenants(self) -> List[dict]:
        tenants = await get_all_tenants()
        db = get_database()
        for t in tenants:
            admin_email = t.get("admin_email", "")
            if admin_email:
                t["user_count"] = await db.users.count_documents({"brand_admin_email": admin_email})
            else:
                t["user_count"] = 0
        return tenants

    async def create_tenant(
        self,
        name: str,
        note: str = "",
        owner_email: str = "",
        primary_contact_email: str = "",
        notification_emails: Optional[List[str]] = None,
        caller_email: str = "",
    ) -> dict:
        if not name.strip():
            raise HTTPException(status_code=400, detail="Tên brand là bắt buộc.")
        owner_email = self._normalize_email(owner_email, field_name="owner_email", required=True)
        primary_contact_email, normalized_notification_emails = self._normalize_brand_contacts(
            primary_contact_email=primary_contact_email or owner_email,
            notification_emails=notification_emails,
            require_primary=True,
        )
        existing_brand = await get_tenant_by_admin_email(owner_email)
        if existing_brand:
            raise HTTPException(
                status_code=409,
                detail=f"Email {owner_email} đang là Brand Admin của brand '{existing_brand['name']}'.",
            )
        await self._ensure_brand_admin_account(owner_email=owner_email, caller_email=caller_email)
        tenant_id = await create_tenant(
            name=name.strip(),
            note=note.strip(),
            admin_email=owner_email,
            primary_contact_email=primary_contact_email,
            notification_emails=normalized_notification_emails,
        )
        return {
            "message": "Tạo brand thành công.",
            "id": tenant_id,
            "brand_admin_email": owner_email,
        }

    async def update_tenant(self, tenant_id: str, payload: dict) -> dict:
        tenant = await get_tenant_by_id(tenant_id)
        if not tenant:
            raise HTTPException(status_code=404, detail="Brand không tồn tại.")

        updates = {}
        if "name" in payload and payload["name"].strip():
            updates["name"] = payload["name"].strip()
        if "note" in payload:
            updates["note"] = payload["note"].strip()
        if "primary_contact_email" in payload or "notification_emails" in payload:
            primary_contact_email, normalized_notification_emails = self._normalize_brand_contacts(
                primary_contact_email=payload.get("primary_contact_email", tenant.get("primary_contact_email", "")),
                notification_emails=payload.get("notification_emails", tenant.get("notification_emails", [])),
                require_primary=True,
            )
            updates["primary_contact_email"] = primary_contact_email
            updates["notification_emails"] = normalized_notification_emails

        if not updates:
            raise HTTPException(status_code=400, detail="Không có thông tin cần cập nhật.")

        success = await update_tenant(tenant_id, updates)
        if not success:
            raise HTTPException(status_code=404, detail="Brand không tồn tại.")
        return {"message": "Cập nhật brand thành công."}

    async def suspend_tenant(self, tenant_id: str) -> dict:
        tenant = await get_tenant_by_id(tenant_id)
        if not tenant:
            raise HTTPException(status_code=404, detail="Brand không tồn tại.")
        if tenant.get("subscription_status") == "suspended":
            return {"message": "Brand đã ở trạng thái suspended."}
        await update_tenant(
            tenant_id,
            {"subscription_status": "suspended", "suspended_at": datetime.now(timezone.utc)},
        )
        return {
            "message": "Đã tạm ngưng brand.",
            "notification_targets": self._get_brand_notification_targets(tenant),
            "notification_event": "brand_suspended",
        }

    async def activate_tenant(self, tenant_id: str) -> dict:
        tenant = await get_tenant_by_id(tenant_id)
        if not tenant:
            raise HTTPException(status_code=404, detail="Brand không tồn tại.")
        await update_tenant(
            tenant_id,
            {"subscription_status": "active", "suspended_at": None},
        )
        return {
            "message": "Đã kích hoạt lại brand.",
            "notification_targets": self._get_brand_notification_targets(tenant),
            "notification_event": "brand_resumed",
        }

    async def delete_tenant(self, tenant_id: str) -> dict:
        raise HTTPException(
            status_code=403,
            detail="Không xóa brand theo cơ chế mới. Hãy dùng suspend để dừng dịch vụ mà không xóa dữ liệu.",
        )

    async def assign_admin(self, tenant_id: str, admin_email: str) -> dict:
        raise HTTPException(
            status_code=403,
            detail="Không cho phép thay đổi hoặc gán mới Brand Admin cho brand đã tồn tại trong flow hiện tại.",
        )

    async def list_users(self) -> List[dict]:
        db = get_database()
        users = await db.users.find().to_list(1000)
        tenants = await get_all_tenants()
        tenant_map = {t.get("admin_email", ""): t for t in tenants if t.get("admin_email")}

        result = []
        for u in users:
            u["id"] = str(u.pop("_id"))
            u["role"] = normalize_legacy_role(u.get("role"))
            u.pop("password_hash", None)
            u.pop("two_factor_secret", None)
            u.pop("two_factor_pending_secret", None)
            if u.get("role") == ROLE_BRAND_ADMIN and u.get("email") in tenant_map:
                u["tenant"] = {
                    "id": tenant_map[u["email"]]["id"],
                    "name": tenant_map[u["email"]]["name"],
                    "subscription_status": tenant_map[u["email"]].get("subscription_status", "active"),
                }
            result.append(u)
        return result

    async def create_user(self, email: str, role: str, brand_admin_email: str = "", caller_email: str = "") -> dict:
        raise HTTPException(
            status_code=403,
            detail="Super Admin không còn được tạo user trong màn hình Quản lý Người dùng. Chỉ được phép reset mật khẩu.",
        )

    async def assign_user_brand(self, user_id: str, brand_admin_email: str = "") -> dict:
        raise HTTPException(
            status_code=403,
            detail="Super Admin không còn được gán hoặc chuyển user giữa các brand trong màn hình này.",
        )

    async def update_user(self, user_id: str, payload: dict, caller_email: str) -> dict:
        db = get_database()
        obj_id = self._parse_object_id(user_id)
        target = await db.users.find_one({"_id": obj_id})
        if not target:
            raise HTTPException(status_code=404, detail="User không tồn tại.")
        if target.get("email") == caller_email:
            raise HTTPException(status_code=400, detail="Không thể chỉnh sửa tài khoản của chính mình.")

        target_role = normalize_legacy_role(target.get("role"))
        if target_role != ROLE_SUPER_ADMIN:
            raise HTTPException(
                status_code=403,
                detail="Super Admin không chỉnh sửa trực tiếp user của brand ở thời điểm hiện tại.",
            )

        set_fields: Dict[str, Any] = {}
        if "isApproved" in payload:
            set_fields["isApproved"] = bool(payload["isApproved"])
        if "is_locked" in payload:
            set_fields["is_locked"] = bool(payload["is_locked"])

        if not set_fields:
            raise HTTPException(status_code=400, detail="Không có trường nào để cập nhật.")

        await db.users.update_one({"_id": obj_id}, {"$set": set_fields})
        return {"message": "Cập nhật user thành công."}

    async def delete_user(self, user_id: str, caller_email: str) -> dict:
        raise HTTPException(
            status_code=403,
            detail="Chức năng xóa user đang tạm thời bị vô hiệu hóa.",
        )

    async def reset_password(self, user_id: str, caller_email: str) -> dict:
        db = get_database()
        obj_id = self._parse_object_id(user_id)
        target = await db.users.find_one({"_id": obj_id})
        if not target:
            raise HTTPException(status_code=404, detail="User không tồn tại.")
        if target.get("email") == caller_email:
            raise HTTPException(status_code=400, detail="Dùng tính năng đổi mật khẩu cá nhân.")
        if normalize_legacy_role(target.get("role")) != ROLE_BRAND_ADMIN:
            raise HTTPException(
                status_code=403,
                detail="Super Admin chỉ được reset mật khẩu cho Brand Admin.",
            )

        await db.users.update_one(
            {"_id": obj_id},
            {"$unset": {"password_hash": ""}, "$set": {"must_set_password": True}},
        )
        return {"message": "Đã reset mật khẩu. User sẽ được yêu cầu đặt mật khẩu mới khi đăng nhập."}

    async def get_system_logs(self, limit: int = 100, skip: int = 0) -> List[LogResponse]:
        db = get_database()
        cursor = db.audit_logs.find({}).sort("timestamp", -1).skip(skip).limit(limit)
        logs = await cursor.to_list(length=limit)
        return [self._format_log(log) for log in logs]

    async def list_permissions(self) -> list:
        from app.database.roles_crud import get_all_roles_permissions
        return await get_all_roles_permissions()

    async def update_permissions(self, role: str, permissions: dict) -> dict:
        normalized_role = normalize_legacy_role(role)
        if normalized_role not in VALID_ROLES:
            raise HTTPException(status_code=400, detail=f"Role không hợp lệ: {VALID_ROLES}")
        if normalized_role == ROLE_SUPER_ADMIN:
            raise HTTPException(status_code=400, detail="Không được phép thay đổi quyền của super_admin.")

        from app.database.roles_crud import update_role_permissions
        success = await update_role_permissions(normalized_role, permissions)
        if not success:
            raise HTTPException(status_code=500, detail="Không thể cập nhật quyền.")
        return {"message": f"Cập nhật quyền cho {normalized_role} thành công."}

    @staticmethod
    def _parse_object_id(raw_id: str) -> ObjectId:
        try:
            return ObjectId(raw_id)
        except Exception:
            raise HTTPException(status_code=400, detail="ID user không hợp lệ.")

    @staticmethod
    async def _has_child_accounts(parent_email: str) -> bool:
        db = get_database()
        return await db.users.count_documents({"parent_admin_id": parent_email}) > 0

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
        )

    @staticmethod
    def _normalize_brand_contacts(
        primary_contact_email: str,
        notification_emails: Optional[Any],
        require_primary: bool = False,
    ) -> tuple[str, List[str]]:
        primary = (primary_contact_email or "").strip().lower()
        if require_primary and not primary:
            raise HTTPException(status_code=400, detail="primary_contact_email là bắt buộc khi tạo hoặc cập nhật brand.")

        normalized_primary = ""
        if primary:
            try:
                normalized_primary = validate_email(primary, check_deliverability=False).normalized
            except EmailNotValidError as exc:
                raise HTTPException(status_code=400, detail=f"Email không hợp lệ: {primary}. {exc}") from exc

        raw_items: List[str] = []
        if isinstance(notification_emails, list):
            raw_items = [str(item) for item in notification_emails]
        elif isinstance(notification_emails, str):
            raw_items = notification_emails.replace(";", ",").replace("\n", ",").split(",")
        elif notification_emails is None:
            raw_items = []
        else:
            raw_items = [str(notification_emails)]

        normalized_list: List[str] = []
        seen = set()

        def add_email(value: str) -> None:
            cleaned = (value or "").strip().lower()
            if not cleaned:
                return
            try:
                normalized = validate_email(cleaned, check_deliverability=False).normalized
            except EmailNotValidError as exc:
                raise HTTPException(status_code=400, detail=f"Email không hợp lệ: {cleaned}. {exc}") from exc
            if normalized not in seen:
                seen.add(normalized)
                normalized_list.append(normalized)

        if normalized_primary:
            add_email(normalized_primary)

        for item in raw_items:
            add_email(item)

        return normalized_primary, normalized_list

    @staticmethod
    def _get_brand_notification_targets(tenant: Dict[str, Any]) -> List[str]:
        primary = (tenant.get("primary_contact_email") or "").strip().lower()
        extras = [str(email).strip().lower() for email in tenant.get("notification_emails", []) if str(email).strip()]
        targets: List[str] = []
        seen = set()
        for email in [primary, *extras]:
            if email and email not in seen:
                seen.add(email)
                targets.append(email)
        return targets

    @staticmethod
    def _normalize_email(value: str, field_name: str = "email", required: bool = False) -> str:
        cleaned = (value or "").strip().lower()
        if required and not cleaned:
            raise HTTPException(status_code=400, detail=f"{field_name} là bắt buộc.")
        if not cleaned:
            return ""
        try:
            return validate_email(cleaned, check_deliverability=False).normalized
        except EmailNotValidError as exc:
            raise HTTPException(status_code=400, detail=f"Email không hợp lệ cho {field_name}: {cleaned}. {exc}") from exc

    async def _ensure_brand_admin_account(self, owner_email: str, caller_email: str) -> None:
        existing = await get_user_by_email(owner_email)
        if existing:
            if normalize_legacy_role(existing.get("role")) != ROLE_BRAND_ADMIN:
                raise HTTPException(
                    status_code=409,
                    detail=f"Email {owner_email} đã tồn tại nhưng không phải Brand Admin.",
                )
            return

        await create_user_no_password(
            email=owner_email,
            role=ROLE_BRAND_ADMIN,
            is_approved=True,
            parent_admin_id=caller_email or None,
            brand_admin_email=owner_email,
        )


super_service = SuperService()
