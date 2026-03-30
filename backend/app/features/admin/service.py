"""
Admin Service — brand-admin and admin user management & scoped audit logs.
"""
from typing import Any, Dict, List, Optional, Set, Tuple
import pytz
from bson.objectid import ObjectId

from fastapi import HTTPException
from app.config import SUPER_ADMIN_EMAILS
from app.database.connection import get_database
from app.database.models import LogResponse
from app.database.auth_crud import create_user_no_password, get_user_by_email
from app.database import zones_crud
from app.database import member_permissions_crud as perms_crud
from app.shared.rbac import (
    ROLE_BRAND_ADMIN,
    ROLE_DELEGATOR,
    ROLE_SUB_ADMIN,
    ROLE_SUPER_ADMIN,
    ROLE_VIEWER,
    VALID_ROLES,
    can_create_role,
    normalize_legacy_role,
)

VN_TZ = pytz.timezone("Asia/Ho_Chi_Minh")


class AdminService:
    """Handles brand-level and admin-level user management."""

    @staticmethod
    def _get_email_local_part(email: Optional[str]) -> str:
        normalized = str(email or "").strip().lower()
        return normalized.split("@", 1)[0] if "@" in normalized else normalized

    async def _get_reserved_super_admin_emails(self) -> Set[str]:
        db = get_database()
        reserved = {email.strip().lower() for email in SUPER_ADMIN_EMAILS if email.strip()}
        super_admin_users = await db.users.find({"role": ROLE_SUPER_ADMIN}, {"email": 1}).to_list(100)
        for user in super_admin_users:
            normalized = str(user.get("email") or "").strip().lower()
            if normalized:
                reserved.add(normalized)
        return reserved

    async def _get_reserved_higher_authority_emails(self, caller: Dict[str, Any]) -> Set[str]:
        caller_role = normalize_legacy_role(caller.get("role"))
        reserved = await self._get_reserved_super_admin_emails()
        if caller_role == ROLE_SUB_ADMIN:
            db = get_database()
            brand_admin_users = await db.users.find({"role": ROLE_BRAND_ADMIN}, {"email": 1}).to_list(200)
            for user in brand_admin_users:
                normalized = str(user.get("email") or "").strip().lower()
                if normalized:
                    reserved.add(normalized)
        return reserved

    async def _assert_email_not_reserved_for_caller(self, email: str, caller: Dict[str, Any]) -> None:
        normalized_email = str(email or "").strip().lower()
        reserved_emails = await self._get_reserved_higher_authority_emails(caller)
        reserved_local_parts = {
            self._get_email_local_part(reserved_email)
            for reserved_email in reserved_emails
            if reserved_email
        }
        if normalized_email in reserved_emails:
            raise HTTPException(status_code=409, detail="Email này thuộc cấp quyền cao hơn và không thể dùng để tạo user khác.")
        if self._get_email_local_part(normalized_email) in reserved_local_parts:
            raise HTTPException(status_code=409, detail="Tên email này thuộc cấp quyền cao hơn và không thể dùng để tạo user khác.")

    async def check_create_email(self, email: str, caller: Dict[str, Any]) -> Dict[str, Any]:
        normalized_email = (email or "").strip().lower()
        if not normalized_email:
            raise HTTPException(status_code=400, detail="Email là bắt buộc.")

        if "@" not in normalized_email:
            return {"available": False, "reason": "invalid", "message": "Email không đúng định dạng."}

        if normalized_email == str(caller.get("email") or "").strip().lower():
            return {
                "available": False,
                "reason": "self",
                "message": "Không thể tạo tài khoản trùng email của chính mình.",
            }

        try:
            await self._assert_email_not_reserved_for_caller(normalized_email, caller)
        except HTTPException as exc:
            return {
                "available": False,
                "reason": "reserved_higher_authority",
                "message": exc.detail,
            }

        existing = await get_user_by_email(normalized_email)
        if existing:
            return {
                "available": False,
                "reason": "exists",
                "message": "Email đã tồn tại trong hệ thống.",
            }

        return {"available": True, "reason": None, "message": ""}

    async def list_users(self, caller: Dict[str, Any]) -> List[dict]:
        db = get_database()
        caller_role = normalize_legacy_role(caller.get("role"))

        if caller_role == ROLE_SUPER_ADMIN:
            users = await db.users.find().to_list(500)
        elif caller_role == ROLE_BRAND_ADMIN:
            users = await db.users.find({"brand_admin_email": caller["email"]}).to_list(300)
        elif caller_role == ROLE_SUB_ADMIN:
            users = await db.users.find(
                {"$or": [{"email": caller["email"]}, {"parent_admin_id": caller["email"]}]}
            ).to_list(200)
        else:
            raise HTTPException(status_code=403, detail="Bạn không có quyền quản lý user.")

        return [self._sanitize_user_doc(u) for u in users]

    async def get_user_assignments(self, user_id: str, caller: Dict[str, Any]) -> Dict[str, Any]:
        db = get_database()
        obj_id = self._parse_object_id(user_id)
        target_user = await db.users.find_one({"_id": obj_id})
        if not target_user:
            raise HTTPException(status_code=404, detail="User không tồn tại.")

        target_user = {**target_user, "role": normalize_legacy_role(target_user.get("role"))}
        await self._assert_can_manage_target(caller, target_user)

        permissions = await perms_crud.get_zones_for_member(target_user.get("email", ""))
        assignments = [
            {
                "zone_id": permission.get("zone_id"),
                "zone_role": normalize_legacy_role(permission.get("zone_role")),
                "all_sites": bool(permission.get("all_sites", True)),
                "allowed_site_ids": permission.get("allowed_site_ids", []),
                "site_role_overrides": permission.get("site_role_overrides", []),
                "has_zone_access": bool(permission.get("has_zone_access", True)),
            }
            for permission in permissions
        ]
        return {
            "user": self._sanitize_user_doc(target_user),
            "assignments": assignments,
        }

    async def create_user(self, payload: dict, caller: Dict[str, Any]) -> dict:
        caller_role = normalize_legacy_role(caller.get("role"))
        email = payload.get("email", "").strip().lower()
        assignments_payload = payload.get("assignments") or []
        requested_parent = (payload.get("parent_admin_id") or "").strip().lower() or None

        if not email:
            raise HTTPException(status_code=400, detail="Email là bắt buộc.")
        if email == caller.get("email"):
            raise HTTPException(status_code=400, detail="Không thể tạo tài khoản trùng email của chính mình.")
        await self._assert_email_not_reserved_for_caller(email, caller)

        existing = await get_user_by_email(email)
        if existing:
            raise HTTPException(status_code=409, detail="Email đã tồn tại trong hệ thống.")

        if assignments_payload:
            normalized_assignments = await self._normalize_zone_assignments(caller, assignments_payload)
            if not normalized_assignments:
                raise HTTPException(status_code=400, detail="Cần chọn ít nhất một zone hoặc site để gán cho user mới.")
            target_role = self._infer_target_role_from_assignments(normalized_assignments)
        else:
            normalized_assignments = []
            target_role = normalize_legacy_role(payload.get("role", ROLE_VIEWER))
            if target_role not in VALID_ROLES:
                raise HTTPException(status_code=400, detail=f"Role không hợp lệ. Phải là: {VALID_ROLES}")

        if not can_create_role(caller_role, target_role):
            raise HTTPException(status_code=403, detail="Bạn không được tạo user có role này.")

        parent_email, brand_admin_email = await self._resolve_hierarchy_for_target(
            caller=caller,
            target_role=target_role,
            target_email=email,
            requested_parent_email=requested_parent,
        )
        await self._assert_single_admin_scope_rule(
            target_role=target_role,
            target_email=email,
            parent_email=parent_email,
            assignments=normalized_assignments,
        )

        try:
            user_id = await create_user_no_password(
                email=email,
                role=target_role,
                is_approved=(caller_role == ROLE_BRAND_ADMIN),
                parent_admin_id=parent_email,
                brand_admin_email=brand_admin_email,
            )
        except ValueError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        for assignment in normalized_assignments:
            await perms_crud.add_member_permission(
                zone_id=assignment["zone_id"],
                email=email,
                zone_role=assignment["zone_role"],
                assigned_by=caller["email"],
                has_zone_access=assignment["all_sites"],
                all_sites=assignment["all_sites"],
                allowed_site_ids=assignment["allowed_site_ids"],
                site_role_overrides=assignment["site_role_overrides"],
            )
        await self._assert_parent_admin_scope_for_assignments(
            target_role=target_role,
            parent_email=parent_email,
            assignments=normalized_assignments,
        )
        return {"message": "Tạo user thành công. User sẽ đặt mật khẩu khi đăng nhập lần đầu.", "id": user_id}

    async def update_user_assignments(self, user_id: str, payload: dict, caller: Dict[str, Any]) -> dict:
        db = get_database()
        obj_id = self._parse_object_id(user_id)
        target_user = await db.users.find_one({"_id": obj_id})
        if not target_user:
            raise HTTPException(status_code=404, detail="User không tồn tại.")

        target_user = {**target_user, "role": normalize_legacy_role(target_user.get("role"))}
        await self._assert_can_manage_target(caller, target_user)

        assignments_payload = payload.get("assignments") or []
        normalized_assignments = await self._normalize_zone_assignments(caller, assignments_payload)

        await self._assert_single_admin_scope_rule(
            target_role=target_user.get("role", ROLE_VIEWER),
            target_email=target_user.get("email", ""),
            parent_email=target_user.get("parent_admin_id"),
            assignments=normalized_assignments,
        )
        await self._assert_parent_admin_scope_for_assignments(
            target_role=target_user.get("role", ROLE_VIEWER),
            parent_email=target_user.get("parent_admin_id"),
            assignments=normalized_assignments,
        )

        await db.zone_member_permissions.delete_many({"email": target_user.get("email", "")})
        for assignment in normalized_assignments:
            await perms_crud.add_member_permission(
                zone_id=assignment["zone_id"],
                email=target_user["email"],
                zone_role=assignment["zone_role"],
                assigned_by=caller["email"],
                has_zone_access=assignment["all_sites"],
                all_sites=assignment["all_sites"],
                allowed_site_ids=assignment["allowed_site_ids"],
                site_role_overrides=assignment["site_role_overrides"],
            )
        return {"message": "Đã cập nhật danh sách zone/site của user."}

    async def update_user(self, user_id: str, payload: dict, caller: Dict[str, Any]) -> dict:
        db = get_database()
        obj_id = self._parse_object_id(user_id)
        target_user = await db.users.find_one({"_id": obj_id})
        if not target_user:
            raise HTTPException(status_code=404, detail="User không tồn tại.")

        target_user = {**target_user, "role": normalize_legacy_role(target_user.get("role"))}
        caller_role = normalize_legacy_role(caller.get("role"))
        if target_user.get("email") == caller.get("email"):
            raise HTTPException(status_code=400, detail="Không thể chỉnh sửa tài khoản của chính mình.")
        if caller_role == ROLE_SUPER_ADMIN:
            raise HTTPException(status_code=403, detail="Super Admin không chỉnh sửa trực tiếp user của brand qua màn hình này.")

        await self._assert_can_manage_target(caller, target_user)

        next_role = normalize_legacy_role(payload.get("role", target_user.get("role", ROLE_VIEWER)))
        if next_role not in VALID_ROLES:
            raise HTTPException(status_code=400, detail=f"Role không hợp lệ. Phải là: {VALID_ROLES}")
        if not can_create_role(caller_role, next_role):
            raise HTTPException(status_code=403, detail="Bạn không được gán user sang role này.")

        if next_role != ROLE_SUB_ADMIN and await self._has_child_accounts(target_user["email"]):
            if not (
                caller_role == ROLE_BRAND_ADMIN
                and target_user.get("role") == ROLE_SUB_ADMIN
                and next_role in {ROLE_VIEWER, ROLE_DELEGATOR}
            ):
                raise HTTPException(
                    status_code=400,
                    detail="Không thể hạ role hoặc chỉnh parent của tài khoản đang có user con. Hãy xử lý user con trước.",
                )

        requested_parent = payload.get("parent_admin_id", target_user.get("parent_admin_id"))
        requested_parent = (requested_parent or "").strip().lower() or None
        is_admin_downgrade = (
            caller_role == ROLE_BRAND_ADMIN
            and target_user.get("role") == ROLE_SUB_ADMIN
            and next_role in {ROLE_VIEWER, ROLE_DELEGATOR}
        )
        if is_admin_downgrade:
            replacement_admin_email = await self._promote_or_create_replacement_admin_for_downgrade(
                caller=caller,
                source_admin=target_user,
                replacement_admin_email=str(payload.get("replacement_admin_email") or "").strip().lower(),
            )
            parent_email = replacement_admin_email
            brand_admin_email = caller["email"]
        else:
            parent_email, brand_admin_email = await self._resolve_hierarchy_for_target(
                caller=caller,
                target_role=next_role,
                target_email=target_user["email"],
                requested_parent_email=requested_parent,
            )
        parent_changed = parent_email != target_user.get("parent_admin_id")

        next_is_approved = target_user.get("isApproved", False)
        if caller_role == ROLE_BRAND_ADMIN and "isApproved" in payload:
            next_is_approved = bool(payload.get("isApproved"))

        set_fields: Dict[str, Any] = {
            "role": next_role,
            "isApproved": next_is_approved,
            "parent_admin_id": parent_email,
            "brand_admin_email": brand_admin_email,
        }

        result = await db.users.update_one({"_id": obj_id}, {"$set": set_fields})
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="User không tồn tại.")
        permissions_cleared = False
        if is_admin_downgrade:
            await db.users.update_many(
                {
                    "parent_admin_id": target_user["email"],
                    "brand_admin_email": caller["email"],
                    "role": {"$in": [ROLE_VIEWER, ROLE_DELEGATOR]},
                    "email": {"$ne": parent_email},
                },
                {"$set": {"parent_admin_id": parent_email}},
            )
            await db.zone_member_permissions.delete_many({"email": target_user["email"]})
            permissions_cleared = True
        elif parent_changed and next_role in {ROLE_VIEWER, ROLE_DELEGATOR}:
            await db.zone_member_permissions.delete_many({"email": target_user["email"]})
            permissions_cleared = True

        message = "Cập nhật user thành công."
        if is_admin_downgrade:
            message = "Đã hạ quyền admin, chuyển authority sang admin kế thừa và đưa user này về dưới admin mới."
        elif permissions_cleared:
            message = "Đã chuyển user sang admin mới và xóa toàn bộ quyền zone/site hiện tại. Admin mới cần gán lại quyền truy cập."
        return {"message": message, "permissions_cleared": permissions_cleared}

    async def delete_user(self, user_id: str, caller: Dict[str, Any], payload: Optional[dict] = None) -> dict:
        db = get_database()
        obj_id = self._parse_object_id(user_id)
        target_user = await db.users.find_one({"_id": obj_id})
        if not target_user:
            raise HTTPException(status_code=404, detail="User không tồn tại.")
        if target_user.get("email") == caller.get("email"):
            raise HTTPException(status_code=400, detail="Không thể xóa tài khoản của chính mình.")

        caller_role = normalize_legacy_role(caller.get("role"))
        if caller_role not in {ROLE_BRAND_ADMIN, ROLE_SUB_ADMIN}:
            raise HTTPException(
                status_code=403,
                detail="Bạn không có quyền xóa user này.",
            )

        target_user = {**target_user, "role": normalize_legacy_role(target_user.get("role"))}
        await self._assert_can_manage_target(caller, target_user)

        target_role = target_user.get("role")
        target_email = target_user.get("email", "")
        payload = payload or {}

        if caller_role == ROLE_SUB_ADMIN and target_role not in {ROLE_VIEWER, ROLE_DELEGATOR}:
            raise HTTPException(
                status_code=403,
                detail="Admin chỉ được xóa Viewer và Delegator thuộc nhánh trực tiếp của mình.",
            )

        has_child_users = False
        if target_role == ROLE_SUB_ADMIN:
            has_child_users = await db.users.count_documents(
                {
                    "parent_admin_id": target_email,
                    "brand_admin_email": caller["email"],
                    "role": {"$in": [ROLE_VIEWER, ROLE_DELEGATOR]},
                }
            ) > 0

        replacement_admin_id = None
        replacement_admin_email = None
        if target_role == ROLE_SUB_ADMIN and has_child_users:
            replacement_admin_email = str(payload.get("replacement_admin_email") or "").strip().lower()
            if not replacement_admin_email:
                raise HTTPException(
                    status_code=400,
                    detail="Cần nhập email admin mới để thay thế admin hiện tại.",
                )
            if replacement_admin_email == target_email:
                raise HTTPException(
                    status_code=400,
                    detail="Email admin thay thế phải khác admin đang bị xóa.",
                )
            existing_replacement = await get_user_by_email(replacement_admin_email)
            if existing_replacement:
                raise HTTPException(
                    status_code=409,
                    detail="Email admin thay thế đã tồn tại trong hệ thống.",
                )

            target_permissions = await perms_crud.get_zones_for_member(target_email)
            replacement_admin_id = await create_user_no_password(
                email=replacement_admin_email,
                role=ROLE_SUB_ADMIN,
                is_approved=True,
                parent_admin_id=caller["email"],
                brand_admin_email=caller["email"],
            )

            for permission in target_permissions:
                await perms_crud.add_member_permission(
                    zone_id=permission["zone_id"],
                    email=replacement_admin_email,
                    zone_role=permission.get("zone_role", ROLE_SUB_ADMIN),
                    assigned_by=caller["email"],
                    has_zone_access=permission.get("has_zone_access", True),
                    all_sites=permission.get("all_sites", True),
                    allowed_site_ids=permission.get("allowed_site_ids", []),
                    site_role_overrides=permission.get("site_role_overrides", []),
                )

            await db.users.update_many(
                {
                    "parent_admin_id": target_email,
                    "brand_admin_email": caller["email"],
                    "role": {"$in": [ROLE_VIEWER, ROLE_DELEGATOR]},
                },
                {"$set": {"parent_admin_id": replacement_admin_email}},
            )

        await db.zone_member_permissions.delete_many({"email": target_email})
        result = await db.users.delete_one({"_id": obj_id})
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="User không tồn tại.")
        response = {
            "message": f"Đã xóa user {target_email}.",
            "result": "deleted",
        }
        if target_role == ROLE_SUB_ADMIN and has_child_users:
            response = {
                "message": f"Đã tạo admin thay thế {replacement_admin_email} và xóa admin {target_email}.",
                "result": "deleted",
                "replacement_admin_id": replacement_admin_id,
                "replacement_admin_email": replacement_admin_email,
            }
        return response

    async def reset_password(self, user_id: str, caller: Dict[str, Any]) -> dict:
        db = get_database()
        obj_id = self._parse_object_id(user_id)
        user = await db.users.find_one({"_id": obj_id})
        if not user:
            raise HTTPException(status_code=404, detail="User không tồn tại.")
        if user.get("email") == caller.get("email"):
            raise HTTPException(status_code=400, detail="Dùng tính năng đổi mật khẩu cá nhân để thay đổi mật khẩu của chính mình.")

        caller_role = normalize_legacy_role(caller.get("role"))
        if caller_role == ROLE_SUPER_ADMIN:
            raise HTTPException(status_code=403, detail="Super Admin không reset mật khẩu trực tiếp cho user của brand.")

        await self._assert_can_manage_target(caller, user)
        await db.users.update_one(
            {"_id": obj_id},
            {"$unset": {"password_hash": ""}, "$set": {"must_set_password": True}}
        )
        return {"message": "Đã reset. User sẽ được yêu cầu đặt mật khẩu mới khi đăng nhập."}

    async def get_audit_logs(
        self,
        caller: Dict[str, Any],
        limit: int = 50,
        skip: int = 0,
        zone_id: Optional[str] = None,
    ) -> List[LogResponse]:
        db = get_database()
        query = {}

        caller_role = normalize_legacy_role(caller.get("role"))
        visible_emails: Set[str] = set()

        if zone_id:
            from app.database.member_permissions_crud import get_all_member_emails_in_zone

            member_emails = await get_all_member_emails_in_zone(zone_id)
            if not member_emails:
                return []
            visible_emails.update(member_emails)
        elif caller_role == ROLE_SUPER_ADMIN:
            pass
        elif caller_role == ROLE_BRAND_ADMIN:
            brand_admin_email = caller["email"]
            brand_users = await db.users.find({"brand_admin_email": brand_admin_email}, {"email": 1}).to_list(500)
            visible_emails.update(u["email"] for u in brand_users)
        elif caller_role == ROLE_SUB_ADMIN:
            visible_emails.add(caller["email"])
            child_users = await db.users.find({"parent_admin_id": caller["email"]}, {"email": 1}).to_list(200)
            visible_emails.update(u["email"] for u in child_users)
        else:
            visible_emails.add(caller["email"])

        if caller_role != ROLE_SUPER_ADMIN or visible_emails:
            if visible_emails:
                email_list = list(visible_emails)
                query["$or"] = [
                    {"actor_email": {"$in": email_list}},
                    {"insight_user_id": {"$in": email_list}},
                ]

        cursor = db.audit_logs.find(query).sort("timestamp", -1).skip(skip).limit(limit)
        logs = await cursor.to_list(length=limit)
        return [self._format_log(log) for log in logs]

    async def _resolve_hierarchy_for_target(
        self,
        caller: Dict[str, Any],
        target_role: str,
        target_email: str,
        requested_parent_email: Optional[str],
    ) -> Tuple[Optional[str], Optional[str]]:
        caller_role = normalize_legacy_role(caller.get("role"))

        if target_role == ROLE_BRAND_ADMIN:
            if caller_role != ROLE_SUPER_ADMIN:
                raise HTTPException(status_code=403, detail="Chỉ Super Admin mới tạo Brand Admin.")
            return caller["email"], target_email

        if target_role == ROLE_SUB_ADMIN:
            if caller_role == ROLE_BRAND_ADMIN:
                if requested_parent_email and requested_parent_email != caller["email"]:
                    raise HTTPException(status_code=400, detail="Admin phải có Brand Admin hiện tại làm parent trực tiếp.")
                return caller["email"], caller["email"]
            if caller_role == ROLE_SUPER_ADMIN:
                if not requested_parent_email:
                    raise HTTPException(status_code=400, detail="Cần chọn Brand Admin parent cho Admin.")
                parent_user = await get_user_by_email(requested_parent_email)
                if not parent_user or normalize_legacy_role(parent_user.get("role")) != ROLE_BRAND_ADMIN:
                    raise HTTPException(status_code=400, detail="Parent của Admin phải là Brand Admin.")
                return parent_user["email"], parent_user["email"]
            raise HTTPException(status_code=403, detail="Bạn không được tạo Admin.")

        if target_role in {ROLE_VIEWER, ROLE_DELEGATOR}:
            if caller_role == ROLE_SUB_ADMIN:
                brand_admin_email = caller.get("brand_admin_email")
                if not brand_admin_email:
                    raise HTTPException(status_code=400, detail="Tài khoản Admin chưa có brand_admin_email.")
                return caller["email"], brand_admin_email

            if caller_role in {ROLE_BRAND_ADMIN, ROLE_SUPER_ADMIN}:
                if caller_role == ROLE_BRAND_ADMIN and not requested_parent_email:
                    raise HTTPException(status_code=400, detail="Viewer/Delegator phải được gán dưới một admin cụ thể.")
                if not requested_parent_email:
                    raise HTTPException(status_code=400, detail="Viewer/Delegator phải có Admin parent trực tiếp.")
                parent_user = await get_user_by_email(requested_parent_email)
                if not parent_user or normalize_legacy_role(parent_user.get("role")) != ROLE_SUB_ADMIN:
                    raise HTTPException(status_code=400, detail="Parent của Viewer/Delegator phải là Admin.")
                if caller_role == ROLE_BRAND_ADMIN and parent_user.get("brand_admin_email") != caller["email"]:
                    raise HTTPException(status_code=403, detail="Admin parent không thuộc brand của bạn.")
                return parent_user["email"], parent_user.get("brand_admin_email")

        raise HTTPException(status_code=400, detail="Không xác định được cấu trúc parent cho role này.")

    async def _assert_can_manage_target(self, caller: Dict[str, Any], target_user: Dict[str, Any]) -> None:
        caller_role = normalize_legacy_role(caller.get("role"))
        target_role = normalize_legacy_role(target_user.get("role"))

        if caller_role == ROLE_BRAND_ADMIN:
            if target_role not in {ROLE_SUB_ADMIN, ROLE_VIEWER, ROLE_DELEGATOR}:
                raise HTTPException(status_code=403, detail="Brand Admin chỉ quản lý được Admin, Viewer, Delegator.")
            if target_user.get("brand_admin_email") != caller["email"]:
                raise HTTPException(status_code=403, detail="User này không thuộc brand của bạn.")
            return

        if caller_role == ROLE_SUB_ADMIN:
            if target_role not in {ROLE_VIEWER, ROLE_DELEGATOR}:
                raise HTTPException(status_code=403, detail="Admin chỉ quản lý được Viewer và Delegator.")
            if target_user.get("parent_admin_id") != caller["email"]:
                raise HTTPException(status_code=403, detail="User này không thuộc nhánh quản lý trực tiếp của bạn.")
            return

        raise HTTPException(status_code=403, detail="Bạn không có quyền quản lý user này.")

    async def _has_child_accounts(self, parent_email: str) -> bool:
        db = get_database()
        return await db.users.count_documents({"parent_admin_id": parent_email}) > 0

    async def _assert_parent_admin_scope_for_assignments(
        self,
        target_role: str,
        parent_email: Optional[str],
        assignments: List[Dict[str, Any]],
    ) -> None:
        if target_role not in {ROLE_VIEWER, ROLE_DELEGATOR} or not parent_email or not assignments:
            return

        parent_user = await get_user_by_email(parent_email)
        if not parent_user or normalize_legacy_role(parent_user.get("role")) != ROLE_SUB_ADMIN:
            return

        for assignment in assignments:
            zone_id = str(assignment.get("zone_id") or "").strip()
            if not zone_id:
                continue
            required_site_ids = self._extract_admin_scope_site_ids_for_assignment(target_role, assignment)
            if not required_site_ids:
                continue
            parent_site_roles = await perms_crud.get_effective_site_roles_in_zone(zone_id, parent_email) or {}
            missing_site_ids = [
                site_id
                for site_id in required_site_ids
                if normalize_legacy_role(parent_site_roles.get(site_id)) != ROLE_SUB_ADMIN
            ]
            if missing_site_ids:
                zone = await zones_crud.get_zone_by_id(zone_id)
                zone_name = (zone or {}).get("name") or zone_id
                raise HTTPException(
                    status_code=409,
                    detail=(
                        f"User này đang thuộc admin {parent_email}, nhưng admin đó không có authority "
                        f"cho zone/site trong '{zone_name}'. Hãy chuyển user sang đúng admin rồi gán lại quyền."
                    ),
                )

    async def _promote_or_create_replacement_admin_for_downgrade(
        self,
        caller: Dict[str, Any],
        source_admin: Dict[str, Any],
        replacement_admin_email: str,
    ) -> str:
        db = get_database()
        source_email = str(source_admin.get("email") or "").strip().lower()
        replacement_admin_email = str(replacement_admin_email or "").strip().lower()
        if not replacement_admin_email:
            raise HTTPException(status_code=400, detail="Cần chọn hoặc nhập email admin kế thừa.")
        if replacement_admin_email == source_email:
            raise HTTPException(status_code=400, detail="Admin kế thừa phải khác admin đang bị hạ quyền.")

        existing = await get_user_by_email(replacement_admin_email)
        if existing:
            existing_role = normalize_legacy_role(existing.get("role"))
            if existing.get("brand_admin_email") != caller["email"]:
                raise HTTPException(status_code=403, detail="Admin kế thừa phải thuộc cùng brand.")
            if existing_role not in {ROLE_VIEWER, ROLE_DELEGATOR}:
                raise HTTPException(status_code=400, detail="Chỉ được chọn viewer hoặc delegator hiện có để nâng lên admin kế thừa.")
            if str(existing.get("parent_admin_id") or "").strip().lower() != source_email:
                raise HTTPException(
                    status_code=400,
                    detail="Chỉ được chọn viewer hoặc delegator đang trực thuộc admin này để nâng lên admin kế thừa.",
                )
            await db.users.update_one(
                {"email": replacement_admin_email},
                {"$set": {"role": ROLE_SUB_ADMIN, "parent_admin_id": caller["email"], "brand_admin_email": caller["email"], "isApproved": True}},
            )
        else:
            await create_user_no_password(
                email=replacement_admin_email,
                role=ROLE_SUB_ADMIN,
                is_approved=True,
                parent_admin_id=caller["email"],
                brand_admin_email=caller["email"],
            )

        source_permissions = await perms_crud.get_zones_for_member(source_email)
        for permission in source_permissions:
            await perms_crud.add_member_permission(
                zone_id=permission["zone_id"],
                email=replacement_admin_email,
                zone_role=permission.get("zone_role", ROLE_SUB_ADMIN),
                assigned_by=caller["email"],
                has_zone_access=permission.get("has_zone_access", True),
                all_sites=permission.get("all_sites", True),
                allowed_site_ids=permission.get("allowed_site_ids", []),
                site_role_overrides=permission.get("site_role_overrides", []),
            )
        return replacement_admin_email

    async def _assert_single_admin_scope_rule(
        self,
        target_role: str,
        target_email: str,
        parent_email: Optional[str],
        assignments: List[Dict[str, Any]],
        extra_excluded_admin_emails: Optional[List[str]] = None,
    ) -> None:
        if not assignments:
            return

        admin_email = None
        if target_role == ROLE_SUB_ADMIN:
            admin_email = target_email
        elif target_role in {ROLE_VIEWER, ROLE_DELEGATOR}:
            parent_user = await get_user_by_email(parent_email or "")
            if parent_user and normalize_legacy_role(parent_user.get("role")) == ROLE_SUB_ADMIN:
                admin_email = parent_user.get("email")

        if not admin_email:
            return

        excluded = [admin_email]
        if extra_excluded_admin_emails:
            excluded.extend(extra_excluded_admin_emails)

        for assignment in assignments:
            zone_id = str(assignment.get("zone_id") or "").strip()
            if not zone_id:
                continue
            scoped_site_ids = self._extract_admin_scope_site_ids_for_assignment(target_role, assignment)
            if not scoped_site_ids:
                continue
            conflicts = await perms_crud.find_active_admin_conflicts(
                zone_id=zone_id,
                site_ids=scoped_site_ids,
                all_sites=False,
                exclude_emails=excluded,
            )
            if conflicts:
                conflict_emails = ", ".join(sorted({item["email"] for item in conflicts}))
                raise HTTPException(
                    status_code=409,
                    detail=f"Mỗi zone/site chỉ được có một admin hoạt động. Phạm vi này đang thuộc admin: {conflict_emails}.",
                )

    @staticmethod
    def _extract_admin_scope_site_ids_for_assignment(target_role: str, assignment: Dict[str, Any]) -> List[str]:
        zone_site_ids = list(dict.fromkeys(assignment.get("zone_site_ids", [])))
        accessible_site_ids = zone_site_ids if assignment.get("all_sites") else list(dict.fromkeys(assignment.get("allowed_site_ids") or []))
        if not accessible_site_ids:
            return []

        if target_role in {ROLE_VIEWER, ROLE_DELEGATOR}:
            return accessible_site_ids

        default_role = normalize_legacy_role(assignment.get("zone_role") or ROLE_VIEWER)
        override_map = {
            str(item.get("site_id") or "").strip(): normalize_legacy_role(item.get("zone_role") or default_role)
            for item in assignment.get("site_role_overrides", []) or []
            if str(item.get("site_id") or "").strip()
        }
        admin_site_ids = []
        for site_id in accessible_site_ids:
            effective_role = override_map.get(site_id, default_role)
            if effective_role == ROLE_SUB_ADMIN:
                admin_site_ids.append(site_id)
        return admin_site_ids

    async def _normalize_zone_assignments(self, caller: Dict[str, Any], assignments: List[dict]) -> List[Dict[str, Any]]:
        caller_role = normalize_legacy_role(caller.get("role"))
        normalized: List[Dict[str, Any]] = []
        seen_zone_ids: Set[str] = set()

        for raw in assignments:
            zone_id = str(raw.get("zone_id") or "").strip()
            zone_role = normalize_legacy_role(raw.get("zone_role") or ROLE_VIEWER)
            all_sites = bool(raw.get("all_sites", True))
            allowed_site_ids = list(dict.fromkeys(raw.get("allowed_site_ids") or []))
            site_role_overrides_raw = raw.get("site_role_overrides") or []

            if not zone_id:
                raise HTTPException(status_code=400, detail="Thiếu zone_id trong assignments.")
            if zone_id in seen_zone_ids:
                raise HTTPException(status_code=400, detail="Mỗi zone chỉ được gán một lần trong lúc tạo user.")
            if zone_role not in {ROLE_SUB_ADMIN, ROLE_VIEWER, ROLE_DELEGATOR}:
                raise HTTPException(status_code=400, detail="Zone role không hợp lệ.")
            if not can_create_role(caller_role, zone_role):
                raise HTTPException(status_code=403, detail="Bạn không được gán role này trong zone.")

            zone = await zones_crud.get_zone_by_id(zone_id)
            if not zone:
                raise HTTPException(status_code=404, detail="Zone không tồn tại.")

            zone_site_ids = list(dict.fromkeys(zone.get("site_ids", [])))
            available_site_ids = zone_site_ids

            if caller_role == ROLE_BRAND_ADMIN:
                if zone.get("brand_admin_email") != caller["email"]:
                    raise HTTPException(status_code=403, detail="Zone này không thuộc brand của bạn.")
            elif caller_role == ROLE_SUB_ADMIN:
                permission = await perms_crud.get_member_permission(zone_id, caller["email"])
                if not permission or permission.get("zone_role") != ROLE_SUB_ADMIN:
                    raise HTTPException(status_code=403, detail="Bạn chỉ được gán user trong các zone mà bạn có quyền admin.")
                available_site_ids = (
                    zone_site_ids
                    if permission.get("all_sites", True)
                    else [site_id for site_id in permission.get("allowed_site_ids", []) if site_id in zone_site_ids]
                )
            else:
                raise HTTPException(status_code=403, detail="Bạn không có quyền gán zone cho user.")

            if all_sites:
                normalized_allowed_site_ids: List[str] = []
            else:
                if zone_role == ROLE_SUB_ADMIN:
                    raise HTTPException(status_code=400, detail="Khi gán theo site trong zone, role không thể là admin.")
                normalized_allowed_site_ids = [site_id for site_id in allowed_site_ids if site_id in available_site_ids]
                if not normalized_allowed_site_ids:
                    raise HTTPException(status_code=400, detail="Mỗi zone gán theo site phải có ít nhất một site hợp lệ.")
                invalid_site_ids = set(allowed_site_ids) - set(normalized_allowed_site_ids)
                if invalid_site_ids:
                    raise HTTPException(status_code=403, detail="Có site nằm ngoài phạm vi quản lý của bạn.")

            valid_override_scope = set(available_site_ids if all_sites else normalized_allowed_site_ids)
            normalized_site_role_overrides: List[Dict[str, str]] = []
            seen_override_site_ids: Set[str] = set()
            for override in site_role_overrides_raw:
                site_id = str(override.get("site_id") or "").strip()
                override_role = normalize_legacy_role(override.get("zone_role") or zone_role)
                if not site_id or site_id in seen_override_site_ids:
                    continue
                if site_id not in valid_override_scope:
                    raise HTTPException(status_code=403, detail="Có site override nằm ngoài phạm vi được gán.")
                if override_role not in {ROLE_SUB_ADMIN, ROLE_VIEWER, ROLE_DELEGATOR}:
                    raise HTTPException(status_code=400, detail="Site role override không hợp lệ.")
                if override_role == ROLE_SUB_ADMIN:
                    raise HTTPException(status_code=400, detail="Role theo site trong zone không thể là admin.")
                if not can_create_role(caller_role, override_role):
                    raise HTTPException(status_code=403, detail="Bạn không được gán role này cho site.")
                normalized_site_role_overrides.append({"site_id": site_id, "zone_role": override_role})
                seen_override_site_ids.add(site_id)

            normalized.append(
                {
                    "zone_id": zone_id,
                    "zone_role": zone_role,
                    "all_sites": all_sites,
                    "allowed_site_ids": normalized_allowed_site_ids,
                    "site_role_overrides": normalized_site_role_overrides,
                    "zone_site_ids": zone_site_ids,
                }
            )
            seen_zone_ids.add(zone_id)

        return normalized

    @staticmethod
    def _infer_target_role_from_assignments(assignments: List[Dict[str, Any]]) -> str:
        if any(
            item["zone_role"] == ROLE_SUB_ADMIN or any(override["zone_role"] == ROLE_SUB_ADMIN for override in item.get("site_role_overrides", []))
            for item in assignments
        ):
            return ROLE_SUB_ADMIN
        if any(
            item["zone_role"] == ROLE_DELEGATOR or any(override["zone_role"] == ROLE_DELEGATOR for override in item.get("site_role_overrides", []))
            for item in assignments
        ):
            return ROLE_DELEGATOR
        return ROLE_VIEWER

    @staticmethod
    def _sanitize_user_doc(u: Dict[str, Any]) -> dict:
        u["id"] = str(u["_id"])
        del u["_id"]
        u["role"] = normalize_legacy_role(u.get("role"))
        u.pop("password_hash", None)
        u.pop("two_factor_secret", None)
        u.pop("two_factor_pending_secret", None)
        return u

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
            status=log.get("status"),
            result_detail=log.get("result_detail"),
        )


admin_service = AdminService()
