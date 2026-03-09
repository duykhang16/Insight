from fastapi import APIRouter, Depends, HTTPException
from typing import List, Any, Dict
import pytz
from app.shared.auth_deps import require_internal_admin
from app.database.connection import get_database
from app.database.models import LogResponse
from app.database.auth_crud import (
    create_user_with_password,
    create_user_no_password,
    update_user_role_approval,
    reset_user_password,
    delete_user,
    get_user_by_email,
)

router = APIRouter()

VN_TZ = pytz.timezone("Asia/Ho_Chi_Minh")

VALID_ROLES = ["super_admin", "tenant_admin", "manager", "viewer"]

# Roles that tenant_admin is allowed to create (cannot create same-tier or higher)
_TENANT_ADMIN_CREATABLE = {"manager", "viewer"}


# ===== User management =====

@router.get("/users")
async def get_all_users(current_user: Dict[str, Any] = Depends(require_internal_admin)):
    db = get_database()
    caller_role = current_user.get("role")

    if caller_role == "super_admin":
        # super_admin sees all users
        users = await db.users.find().to_list(500)
    else:
        # tenant_admin sees only their own sub-accounts + themselves
        users = await db.users.find({
            "$or": [
                {"parent_admin_id": current_user["email"]},
                {"email": current_user["email"]},
            ]
        }).to_list(200)

    result = []
    for u in users:
        u["id"] = str(u["_id"])
        del u["_id"]
        u.pop("password_hash", None)
        result.append(u)
    return result


@router.post("/users")
async def create_user_endpoint(
    payload: dict,
    current_user: Dict[str, Any] = Depends(require_internal_admin),
):
    caller_role = current_user.get("role")
    email = payload.get("email", "").strip().lower()
    role = payload.get("role", "viewer")

    # tenant_admin can only create manager / viewer
    if caller_role == "tenant_admin" and role not in _TENANT_ADMIN_CREATABLE:
        raise HTTPException(
            status_code=403,
            detail=f"Tenant Admin chỉ được tạo các role: {sorted(_TENANT_ADMIN_CREATABLE)}."
        )

    if not email:
        raise HTTPException(status_code=400, detail="Email là bắt buộc.")
    if email == current_user.get("email"):
        raise HTTPException(status_code=400, detail="Không thể tạo tài khoản trùng email của chính mình.")
    if role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail=f"Role không hợp lệ. Phải là: {VALID_ROLES}")

    # parent_admin_id: tenant_admin is always the parent for their sub-accounts
    parent_admin_id = current_user["email"]

    existing = await get_user_by_email(email)
    if existing:
        raise HTTPException(status_code=409, detail="Email đã tồn tại trong hệ thống.")

    # No password at creation — user sets it on first login
    user_id = await create_user_no_password(email, role, is_approved=True, parent_admin_id=parent_admin_id)
    return {"message": "Tạo user thành công. User sẽ đặt mật khẩu khi đăng nhập lần đầu.", "id": user_id}


@router.put("/users/{user_id}")
async def update_user(
    user_id: str,
    payload: dict,
    current_user: Dict[str, Any] = Depends(require_internal_admin),
):
    role = payload.get("role")
    is_approved = payload.get("isApproved")
    caller_role = current_user.get("role")

    if role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail=f"Role không hợp lệ. Phải là: {VALID_ROLES}")

    # tenant_admin chỉ được gán role thuộc phạm vi của mình (manager/viewer)
    if caller_role == "tenant_admin" and role not in _TENANT_ADMIN_CREATABLE:
        raise HTTPException(
            status_code=403,
            detail=f"Tenant Admin không được gán role cao hơn hoặc ngang cấp: {role}."
        )

    db = get_database()
    from bson.objectid import ObjectId
    try:
        obj_id = ObjectId(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="ID user không hợp lệ.")

    # Check is_locked: only super_admin can edit locked accounts
    target_user = await db.users.find_one({"_id": obj_id})
    if not target_user:
        raise HTTPException(status_code=404, detail="User không tồn tại.")

    # Self-protection: không được chỉnh sửa role/approval của chính mình
    if target_user.get("email") == current_user.get("email"):
        raise HTTPException(status_code=400, detail="Không thể chỉnh sửa quyền của chính mình.")

    # tenant_admin chỉ được edit user thuộc tenant của mình (parent_admin_id == caller email)
    if caller_role == "tenant_admin" and target_user.get("parent_admin_id") != current_user.get("email"):
        raise HTTPException(status_code=403, detail="Bạn không có quyền chỉnh sửa tài khoản này.")

    # tenant_admin không được edit user có role cao hơn hoặc ngang cấp
    if caller_role == "tenant_admin" and target_user.get("role") not in _TENANT_ADMIN_CREATABLE:
        raise HTTPException(status_code=403, detail="Không thể chỉnh sửa tài khoản có role cao hơn hoặc ngang cấp.")

    if target_user.get("is_locked") and caller_role != "super_admin":
        raise HTTPException(status_code=403, detail="Tài khoản bị khóa. Chỉ Super Admin mới có thể chỉnh sửa.")

    set_fields: Dict[str, Any] = {"role": role, "isApproved": bool(is_approved)}
    if "parent_admin_id" in payload:
        set_fields["parent_admin_id"] = payload["parent_admin_id"]
    if "is_locked" in payload and current_user.get("role") == "super_admin":
        set_fields["is_locked"] = bool(payload["is_locked"])

    result = await db.users.update_one(
        {"_id": obj_id},
        {"$set": set_fields}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User không tồn tại.")

    return {"message": "Cập nhật user thành công."}


@router.delete("/users/{user_id}")
async def delete_user_endpoint(
    user_id: str,
    current_user: Dict[str, Any] = Depends(require_internal_admin),
):
    db = get_database()
    from bson.objectid import ObjectId
    try:
        obj_id = ObjectId(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="ID user không hợp lệ.")

    user = await db.users.find_one({"_id": obj_id})
    if not user:
        raise HTTPException(status_code=404, detail="User không tồn tại.")

    caller_role = current_user.get("role")

    # Prevent self-deletion
    if user.get("email") == current_user.get("email"):
        raise HTTPException(status_code=400, detail="Không thể xóa tài khoản của chính mình.")

    # tenant_admin chỉ được xóa user thuộc tenant của mình và role thấp hơn
    if caller_role == "tenant_admin":
        if user.get("parent_admin_id") != current_user.get("email"):
            raise HTTPException(status_code=403, detail="Bạn không có quyền xóa tài khoản này.")
        if user.get("role") not in _TENANT_ADMIN_CREATABLE:
            raise HTTPException(status_code=403, detail="Không thể xóa tài khoản có role cao hơn hoặc ngang cấp.")

    # is_locked: only super_admin can delete locked accounts
    if user.get("is_locked") and caller_role != "super_admin":
        raise HTTPException(status_code=403, detail="Tài khoản bị khóa. Chỉ Super Admin mới có thể xóa.")

    await db.users.delete_one({"_id": obj_id})
    return {"message": "Xóa user thành công."}


@router.post("/users/{user_id}/reset-password")
async def reset_password_endpoint(
    user_id: str,
    payload: dict,
    current_user: Dict[str, Any] = Depends(require_internal_admin),
):
    db = get_database()
    from bson.objectid import ObjectId
    try:
        obj_id = ObjectId(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="ID user không hợp lệ.")

    user = await db.users.find_one({"_id": obj_id})
    if not user:
        raise HTTPException(status_code=404, detail="User không tồn tại.")

    caller_role = current_user.get("role")

    # Self-protection
    if user.get("email") == current_user.get("email"):
        raise HTTPException(status_code=400, detail="Dùng tính năng đổi mật khẩu cá nhân để thay đổi mật khẩu của chính mình.")

    # tenant_admin chỉ được reset password user thuộc tenant của mình và role thấp hơn
    if caller_role == "tenant_admin":
        if user.get("parent_admin_id") != current_user.get("email"):
            raise HTTPException(status_code=403, detail="Bạn không có quyền reset mật khẩu tài khoản này.")
        if user.get("role") not in _TENANT_ADMIN_CREATABLE:
            raise HTTPException(status_code=403, detail="Không thể reset mật khẩu tài khoản có role cao hơn hoặc ngang cấp.")

    # Reset = xóa password, bắt user tự đặt lại khi đăng nhập
    await db.users.update_one(
        {"_id": obj_id},
        {"$unset": {"password_hash": ""}, "$set": {"must_set_password": True}}
    )
    return {"message": "Đã reset. User sẽ được yêu cầu đặt mật khẩu mới khi đăng nhập."}


# ===== Audit logs =====

@router.get("/logs", response_model=List[LogResponse])
async def get_audit_logs(
    limit: int = 50,
    skip: int = 0,
    zone_id: str = None,
    current_user: Dict[str, Any] = Depends(require_internal_admin),
):
    db = get_database()
    query = {}

    from app.config import SUPER_ADMIN_EMAILS
    is_super_admin = current_user.get("role") == "super_admin" or current_user.get("email") in SUPER_ADMIN_EMAILS

    if zone_id:
        from app.database.zones_crud import get_all_member_emails_in_zone
        member_emails = await get_all_member_emails_in_zone(zone_id)
        if member_emails:
            query["$or"] = [
                {"actor_email": {"$in": member_emails}},
                {"insight_user_id": {"$in": member_emails}}
            ]
        else:
            return []
    elif not is_super_admin:
        from app.database.zones_crud import get_zones_for_member
        zones = await get_zones_for_member(current_user.get("email"))
        sub_emails = set()
        for z in zones:
            for m in z.get("members", []):
                sub_emails.add(m["email"])
        
        if sub_emails:
            sub_list = list(sub_emails)
            query["$or"] = [
                {"actor_email": {"$in": sub_list}},
                {"insight_user_id": {"$in": sub_list}}
            ]
        else:
            query["$or"] = [
                {"actor_email": current_user.get("email")},
                {"insight_user_id": current_user.get("email")}
            ]

    cursor = db.audit_logs.find(query).sort("timestamp", -1).skip(skip).limit(limit)
    logs = await cursor.to_list(length=limit)

    formatted_logs = []
    for log in logs:
        utc_dt = log.get("timestamp")
        gmt7_str = ""
        if utc_dt:
            if utc_dt.tzinfo is None:
                utc_dt = pytz.utc.localize(utc_dt)
            gmt7_dt = utc_dt.astimezone(VN_TZ)
            gmt7_str = gmt7_dt.strftime("%Y-%m-%d %H:%M:%S %Z")

        formatted_logs.append(LogResponse(
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
    return formatted_logs
