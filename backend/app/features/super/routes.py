"""Super Admin routes — only accessible by role=super_admin.

Endpoints:
  GET    /api/v1/super/tenants                     — list all tenants
  POST   /api/v1/super/tenants                     — create tenant
  PUT    /api/v1/super/tenants/{id}                — update tenant (name/note)
  DELETE /api/v1/super/tenants/{id}                — delete tenant
  POST   /api/v1/super/tenants/{id}/assign-admin   — assign tenant_admin
  GET    /api/v1/super/users                       — list all users (with tenant info)
  POST   /api/v1/super/users                       — create user (no password — must_set_password)
  PUT    /api/v1/super/users/{id}                  — update user role/approval/parent
  DELETE /api/v1/super/users/{id}                  — delete user
  POST   /api/v1/super/users/{id}/reset-password   — reset user password (super only)
  GET    /api/v1/super/logs                        — system-wide audit logs
"""
from fastapi import APIRouter, Depends, HTTPException
from typing import Any, Dict, List
import pytz

from app.shared.auth_deps import require_super_admin
from app.database.connection import get_database
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
    reset_user_password,
)
from app.database.models import LogResponse

router = APIRouter()
VN_TZ = pytz.timezone("Asia/Ho_Chi_Minh")

VALID_ROLES = ["super_admin", "tenant_admin", "manager", "viewer"]


def _require_super(current_user: Dict[str, Any]):
    if current_user.get("role") != "super_admin":
        raise HTTPException(status_code=403, detail="Chỉ Super Admin mới có quyền truy cập.")


# ===== Tenant CRUD =====

@router.get("/tenants")
async def list_tenants(current_user: Dict[str, Any] = Depends(require_super_admin)):
    _require_super(current_user)
    tenants = await get_all_tenants()
    # Attach user counts per tenant
    db = get_database()
    for t in tenants:
        admin_email = t.get("admin_email", "")
        if admin_email:
            count = await db.users.count_documents({"parent_admin_id": admin_email})
            t["user_count"] = count
        else:
            t["user_count"] = 0
    return tenants


@router.post("/tenants")
async def create_tenant_endpoint(
    payload: dict,
    current_user: Dict[str, Any] = Depends(require_super_admin),
):
    _require_super(current_user)
    name = payload.get("name", "").strip()
    note = payload.get("note", "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Tên tenant là bắt buộc.")
    tenant_id = await create_tenant(name=name, note=note)
    return {"message": "Tạo tenant thành công.", "id": tenant_id}


@router.put("/tenants/{tenant_id}")
async def update_tenant_endpoint(
    tenant_id: str,
    payload: dict,
    current_user: Dict[str, Any] = Depends(require_super_admin),
):
    _require_super(current_user)
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


@router.delete("/tenants/{tenant_id}")
async def delete_tenant_endpoint(
    tenant_id: str,
    current_user: Dict[str, Any] = Depends(require_super_admin),
):
    _require_super(current_user)
    tenant = await get_tenant_by_id(tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant không tồn tại.")
    success = await delete_tenant(tenant_id)
    if not success:
        raise HTTPException(status_code=500, detail="Xóa tenant thất bại.")
    return {"message": "Xóa tenant thành công."}


@router.post("/tenants/{tenant_id}/assign-admin")
async def assign_admin_endpoint(
    tenant_id: str,
    payload: dict,
    current_user: Dict[str, Any] = Depends(require_super_admin),
):
    _require_super(current_user)
    admin_email = payload.get("admin_email", "").strip()
    if not admin_email:
        raise HTTPException(status_code=400, detail="admin_email là bắt buộc.")

    tenant = await get_tenant_by_id(tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant không tồn tại.")

    # Verify target user exists and is tenant_admin
    db = get_database()
    target_user = await db.users.find_one({"email": admin_email})
    if not target_user:
        raise HTTPException(status_code=404, detail=f"User {admin_email} không tồn tại.")
    if target_user.get("role") != "tenant_admin":
        raise HTTPException(status_code=400, detail=f"User {admin_email} không có role tenant_admin.")

    # Warn if this admin already manages another tenant
    existing = await get_tenant_by_admin_email(admin_email)
    warning = None
    if existing and existing["id"] != tenant_id:
        warning = f"Cảnh báo: {admin_email} đang là admin của tenant '{existing['name']}'. Gán sẽ chuyển quyền sang tenant này."

    await assign_tenant_admin(tenant_id, admin_email)
    result = {"message": f"Đã gán {admin_email} làm Tenant Admin của tenant này."}
    if warning:
        result["warning"] = warning
    return result


# ===== System users management (super_admin sees/manages ALL) =====

@router.get("/users")
async def list_all_users(current_user: Dict[str, Any] = Depends(require_super_admin)):
    _require_super(current_user)
    db = get_database()
    users = await db.users.find().to_list(1000)
    tenants = await get_all_tenants()
    tenant_map = {t.get("admin_email", ""): t for t in tenants if t.get("admin_email")}

    result = []
    for u in users:
        u["id"] = str(u.pop("_id"))
        u.pop("password_hash", None)
        # Attach tenant info if this user is a tenant_admin
        if u.get("role") == "tenant_admin" and u.get("email") in tenant_map:
            u["tenant"] = {
                "id": tenant_map[u["email"]]["id"],
                "name": tenant_map[u["email"]]["name"],
            }
        result.append(u)
    return result


@router.post("/users")
async def create_user_endpoint(
    payload: dict,
    current_user: Dict[str, Any] = Depends(require_super_admin),
):
    """Super admin creates a user without password — user must set it on first login."""
    _require_super(current_user)
    email = payload.get("email", "").strip().lower()
    role = payload.get("role", "viewer")
    parent_admin_id = payload.get("parent_admin_id", "")

    if not email:
        raise HTTPException(status_code=400, detail="Email là bắt buộc.")
    if role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail=f"Role không hợp lệ: {VALID_ROLES}")
    if email == current_user.get("email"):
        raise HTTPException(status_code=400, detail="Không thể tạo tài khoản trùng email của chính mình.")

    existing = await get_user_by_email(email)
    if existing:
        raise HTTPException(status_code=409, detail="Email đã tồn tại trong hệ thống.")

    user_id = await create_user_no_password(
        email=email,
        role=role,
        is_approved=True,
        parent_admin_id=parent_admin_id or None,
    )
    return {"message": "Tạo user thành công. User sẽ được yêu cầu đặt mật khẩu khi đăng nhập lần đầu.", "id": user_id}


@router.put("/users/{user_id}")
async def update_user_endpoint(
    user_id: str,
    payload: dict,
    current_user: Dict[str, Any] = Depends(require_super_admin),
):
    _require_super(current_user)
    db = get_database()
    from bson.objectid import ObjectId
    try:
        obj_id = ObjectId(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="ID user không hợp lệ.")

    target = await db.users.find_one({"_id": obj_id})
    if not target:
        raise HTTPException(status_code=404, detail="User không tồn tại.")

    if target.get("email") == current_user.get("email"):
        raise HTTPException(status_code=400, detail="Không thể chỉnh sửa tài khoản của chính mình.")

    set_fields: Dict[str, Any] = {}
    if "role" in payload:
        role = payload["role"]
        if role not in VALID_ROLES:
            raise HTTPException(status_code=400, detail=f"Role không hợp lệ: {VALID_ROLES}")
        set_fields["role"] = role
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


@router.delete("/users/{user_id}")
async def delete_user_endpoint(
    user_id: str,
    current_user: Dict[str, Any] = Depends(require_super_admin),
):
    _require_super(current_user)
    db = get_database()
    from bson.objectid import ObjectId
    try:
        obj_id = ObjectId(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="ID user không hợp lệ.")

    target = await db.users.find_one({"_id": obj_id})
    if not target:
        raise HTTPException(status_code=404, detail="User không tồn tại.")
    if target.get("email") == current_user.get("email"):
        raise HTTPException(status_code=400, detail="Không thể xóa tài khoản của chính mình.")

    await db.users.delete_one({"_id": obj_id})
    return {"message": "Xóa user thành công."}


@router.post("/users/{user_id}/reset-password")
async def reset_password_endpoint(
    user_id: str,
    payload: dict,
    current_user: Dict[str, Any] = Depends(require_super_admin),
):
    """Super admin resets a user's password — user will be forced to set a new one on next login."""
    _require_super(current_user)
    db = get_database()
    from bson.objectid import ObjectId
    try:
        obj_id = ObjectId(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="ID user không hợp lệ.")

    target = await db.users.find_one({"_id": obj_id})
    if not target:
        raise HTTPException(status_code=404, detail="User không tồn tại.")
    if target.get("email") == current_user.get("email"):
        raise HTTPException(status_code=400, detail="Dùng tính năng đổi mật khẩu cá nhân.")

    # After reset, mark must_set_password so user is forced to set new one on login
    await db.users.update_one(
        {"_id": obj_id},
        {"$unset": {"password_hash": ""}, "$set": {"must_set_password": True}}
    )
    return {"message": "Đã reset mật khẩu. User sẽ được yêu cầu đặt mật khẩu mới khi đăng nhập."}


# ===== System-wide audit logs =====

@router.get("/logs", response_model=List[LogResponse])
async def get_system_logs(
    limit: int = 100,
    skip: int = 0,
    current_user: Dict[str, Any] = Depends(require_super_admin),
):
    _require_super(current_user)
    db = get_database()
    cursor = db.audit_logs.find({}).sort("timestamp", -1).skip(skip).limit(limit)
    logs = await cursor.to_list(length=limit)

    formatted = []
    for log in logs:
        utc_dt = log.get("timestamp")
        gmt7_str = ""
        if utc_dt:
            if utc_dt.tzinfo is None:
                utc_dt = pytz.utc.localize(utc_dt)
            gmt7_str = utc_dt.astimezone(VN_TZ).strftime("%Y-%m-%d %H:%M:%S %Z")

        formatted.append(LogResponse(
            id=str(log["_id"]),
            timestamp=gmt7_str,
            actor_email=log.get("actor_email"),
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
        ))
    return formatted
