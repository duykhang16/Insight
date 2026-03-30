"""Zone management API routes."""
from fastapi import APIRouter, HTTPException, Request, Depends
from typing import List, Dict, Any
from app.shared.auth_deps import require_internal_admin, require_zone_access, require_zone_admin, get_current_insight_user
<<<<<<< HEAD
from app.database.member_permissions_crud import get_all_member_emails_in_zone
from . import service
from .schemas import (
    ZoneCreateRequest, ZoneUpdateRequest, ZoneSitesUpdateRequest,
    ZoneMemberAddRequest, ZoneMemberUpdateRequest, ZoneMemberSitesUpdateRequest,
=======
from app.database.zones_crud import get_all_member_emails_in_zone
from . import service
from .schemas import (
    ZoneCreateRequest, ZoneUpdateRequest, ZoneSitesUpdateRequest,
    ZoneMemberAddRequest, ZoneMemberUpdateRequest,
>>>>>>> parent of 0c80cd2 (Delete backend directory)
    ZoneResponse, ZoneListItem,
)

router = APIRouter(prefix="/zones", tags=["zones"])


# ── Zone CRUD ──────────────────────────────────────────────────────────────

@router.get("", response_model=List[ZoneListItem])
async def list_zones(
    request: Request,
    user: Dict[str, Any] = Depends(require_internal_admin),
):
<<<<<<< HEAD
    """Admin Master: list zones (scoped by tenant)."""
    return await service.list_zones(user["email"], caller_role=user.get("role", "tenant_admin"))
=======
    """Admin: list zones. super_admin sees all, tenant_admin sees only their own."""
    is_super = user.get("role") == "super_admin"
    return await service.list_zones(user["email"], is_global_admin=is_super)
>>>>>>> parent of 0c80cd2 (Delete backend directory)


@router.get("/my", response_model=List[ZoneListItem])
async def list_my_zones(request: Request):
<<<<<<< HEAD
    """Any approved user: list zones they belong to."""
    user = await get_current_insight_user(request)
    role = user.get("role", "viewer")
    return await service.list_my_zones(user["email"], caller_role=role)
=======
    """Any approved user: list zones they belong to. super_admin gets empty (separate UI)."""
    user = await get_current_insight_user(request)
    role = user.get("role", "")
    if role == "super_admin":
        return []  # super_admin has separate management UI, not zone-based
    is_tenant = role == "tenant_admin"
    return await service.list_my_zones(user["email"], is_super=False, is_tenant=is_tenant)
>>>>>>> parent of 0c80cd2 (Delete backend directory)


@router.post("", response_model=ZoneResponse, status_code=201)
async def create_zone(
    payload: ZoneCreateRequest,
    request: Request,
    user: Dict[str, Any] = Depends(require_internal_admin),
):
    try:
        zone = await service.create_zone(
            name=payload.name,
            created_by=user["email"],
            description=payload.description,
            color=payload.color,
        )
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    return zone


<<<<<<< HEAD
async def _verify_zone_ownership(zone_id: str, user: Dict[str, Any]):
    """Tenant isolation: tenant_admin can only access zones they created.
    super_admin is blocked entirely (system-level, no tenant data access)."""
    if user.get("role") == "super_admin":
        raise HTTPException(status_code=403, detail="Super Admin không quản lý Zone. Đăng nhập bằng Tenant Admin.")
    zone = await service.get_zone_detail(zone_id)
    if not zone:
        raise HTTPException(status_code=404, detail="Zone không tồn tại.")
    if zone.created_by != user["email"]:
        raise HTTPException(status_code=403, detail="Bạn không có quyền truy cập Zone này.")


@router.get("/{zone_id}", response_model=ZoneResponse)
async def get_zone(zone_id: str, request: Request):
    user = await get_current_insight_user(request)
    role = user.get("role", "viewer")
    # Super admin or tenant admin: verify zone ownership (super blocked, tenant scoped)
    if role in ("super_admin", "tenant_admin"):
        await _verify_zone_ownership(zone_id, user)
    else:
        # manager/viewer: must be a zone member
=======
@router.get("/{zone_id}", response_model=ZoneResponse)
async def get_zone(zone_id: str, request: Request):
    user = await get_current_insight_user(request)
    role = user.get("role", "")
    if role == "super_admin":
        pass  # super_admin sees everything
    elif role == "tenant_admin":
        # tenant_admin can only access zones they created or are member of
        zone_doc = await service.get_zone_detail(zone_id)
        if not zone_doc:
            raise HTTPException(status_code=404, detail="Zone không tồn tại.")
        is_creator = zone_doc.created_by == user["email"]
        is_member = any(m.email == user["email"] for m in (zone_doc.members or []))
        if not is_creator and not is_member:
            raise HTTPException(status_code=403, detail="Bạn không có quyền truy cập Zone này.")
        return zone_doc
    else:
>>>>>>> parent of 0c80cd2 (Delete backend directory)
        await require_zone_access(zone_id, request)
    zone = await service.get_zone_detail(zone_id)
    if not zone:
        raise HTTPException(status_code=404, detail="Zone không tồn tại.")
    return zone


@router.put("/{zone_id}", response_model=ZoneResponse)
async def update_zone(zone_id: str, payload: ZoneUpdateRequest, request: Request):
<<<<<<< HEAD
    user = await get_current_insight_user(request)
    role = user.get("role", "viewer")
    if role in ("super_admin", "tenant_admin"):
        await _verify_zone_ownership(zone_id, user)
    else:
        await require_zone_admin(zone_id, request)
=======
    await require_zone_admin(zone_id, request)
>>>>>>> parent of 0c80cd2 (Delete backend directory)
    updates = payload.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="Không có trường nào để cập nhật.")
    try:
        zone = await service.update_zone(zone_id, updates)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    if not zone:
        raise HTTPException(status_code=404, detail="Zone không tồn tại.")
    return zone


@router.delete("/{zone_id}")
async def delete_zone(
    zone_id: str,
    request: Request,
    user: Dict[str, Any] = Depends(require_internal_admin),
):
<<<<<<< HEAD
    # Tenant isolation: only owner can delete
    await _verify_zone_ownership(zone_id, user)
    ok = await service.delete_zone(zone_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Zone không tồn tại.")
    return {"message": f"Zone {zone_id} đã được xóa. Sites chuyển về Unassigned."}
=======
    # tenant_admin can only delete zones they created
    if user.get("role") == "tenant_admin":
        zone_doc = await service.get_zone_detail(zone_id)
        if not zone_doc:
            raise HTTPException(status_code=404, detail="Zone không tồn tại.")
        if zone_doc.created_by != user["email"]:
            raise HTTPException(status_code=403, detail="Bạn chỉ có thể xóa Zone do mình tạo.")
    ok = await service.delete_zone(zone_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Zone không tồn tại.")
    return {"message": f"Zone {zone_id} đã được xóa."}
>>>>>>> parent of 0c80cd2 (Delete backend directory)


# ── Site assignment ────────────────────────────────────────────────────────

@router.put("/{zone_id}/sites", response_model=ZoneResponse)
async def update_zone_sites(
    zone_id: str,
    payload: ZoneSitesUpdateRequest,
    request: Request,
    user: Dict[str, Any] = Depends(require_internal_admin),
):
    """Replace site list for a zone. Called by drag-drop frontend."""
<<<<<<< HEAD
    # Tenant isolation: only owner can modify sites
    await _verify_zone_ownership(zone_id, user)
=======
>>>>>>> parent of 0c80cd2 (Delete backend directory)
    zone = await service.update_zone_sites(zone_id, payload.site_ids)
    if not zone:
        raise HTTPException(status_code=404, detail="Zone không tồn tại.")
    return zone


# ── Member management ──────────────────────────────────────────────────────

@router.post("/{zone_id}/members", response_model=ZoneResponse)
async def add_member(zone_id: str, payload: ZoneMemberAddRequest, request: Request):
<<<<<<< HEAD
    caller = await get_current_insight_user(request)
    role = caller.get("role", "viewer")
    
    # Tenant isolation + super admin block
    if role in ("super_admin", "tenant_admin"):
        await _verify_zone_ownership(zone_id, caller)
    else:
        await require_zone_admin(zone_id, request)

=======
    caller = await require_zone_admin(zone_id, request)
    
>>>>>>> parent of 0c80cd2 (Delete backend directory)
    from app.database.auth_crud import get_user_by_email
    target_user = await get_user_by_email(payload.email)
    if not target_user:
        raise HTTPException(status_code=404, detail="User không tồn tại.")
        
    sys_role = target_user.get("role", "viewer")
    mapped_role = "manager" if sys_role in ["super_admin", "tenant_admin", "manager"] else "viewer"

    try:
<<<<<<< HEAD
        zone = await service.add_member(
            zone_id=zone_id,
            email=payload.email,
            zone_role=mapped_role,
            assigned_by=caller["email"],
            all_sites=payload.all_sites,
            allowed_site_ids=payload.allowed_site_ids,
        )
=======
        zone = await service.add_member(zone_id, payload.email, mapped_role, caller["email"])
>>>>>>> parent of 0c80cd2 (Delete backend directory)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not zone:
        raise HTTPException(status_code=404, detail="Zone không tồn tại.")
    return zone


@router.put("/{zone_id}/members/{email}", response_model=ZoneResponse)
async def update_member(zone_id: str, email: str, payload: ZoneMemberUpdateRequest, request: Request):
<<<<<<< HEAD
    caller = await get_current_insight_user(request)
    role = caller.get("role", "viewer")
    
    # Tenant isolation + super admin block
    if role in ("super_admin", "tenant_admin"):
        await _verify_zone_ownership(zone_id, caller)
    else:
        await require_zone_admin(zone_id, request)
    
    # Update role if provided
    if payload.zone_role is not None:
        from app.database.auth_crud import get_user_by_email
        target_user = await get_user_by_email(email)
        if not target_user:
            raise HTTPException(status_code=404, detail="User không tồn tại.")
        sys_role = target_user.get("role", "viewer")
        mapped_role = "manager" if sys_role in ["super_admin", "tenant_admin", "manager"] else "viewer"
        try:
            zone = await service.update_member_role(zone_id, email, mapped_role)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        if not zone:
            raise HTTPException(status_code=404, detail="Zone hoặc member không tồn tại.")

    # Update site permissions if provided
    if payload.all_sites is not None:
        zone = await service.update_member_sites(
            zone_id, email, payload.all_sites, payload.allowed_site_ids
        )
        if not zone:
            raise HTTPException(status_code=404, detail="Zone hoặc member không tồn tại.")

    zone = await service.get_zone_detail(zone_id)
    return zone


@router.put("/{zone_id}/members/{email}/sites")
async def update_member_sites(
    zone_id: str,
    email: str,
    payload: ZoneMemberSitesUpdateRequest,
    request: Request,
):
    """Dedicated endpoint to update a member's site-level permission."""
    caller = await get_current_insight_user(request)
    role = caller.get("role", "viewer")
    if role in ("super_admin", "tenant_admin"):
        await _verify_zone_ownership(zone_id, caller)
    else:
        await require_zone_admin(zone_id, request)
    zone = await service.update_member_sites(
        zone_id, email, payload.all_sites, payload.allowed_site_ids
    )
=======
    caller = await require_zone_admin(zone_id, request)
    
    from app.database.auth_crud import get_user_by_email
    target_user = await get_user_by_email(email)
    if not target_user:
        raise HTTPException(status_code=404, detail="User không tồn tại.")
        
    sys_role = target_user.get("role", "viewer")
    mapped_role = "manager" if sys_role in ["super_admin", "tenant_admin", "manager"] else "viewer"

    try:
        zone = await service.update_member_role(zone_id, email, mapped_role)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
>>>>>>> parent of 0c80cd2 (Delete backend directory)
    if not zone:
        raise HTTPException(status_code=404, detail="Zone hoặc member không tồn tại.")
    return zone


@router.delete("/{zone_id}/members/{email}")
async def remove_member(zone_id: str, email: str, request: Request):
<<<<<<< HEAD
    caller = await get_current_insight_user(request)
    role = caller.get("role", "viewer")
    if role in ("super_admin", "tenant_admin"):
        await _verify_zone_ownership(zone_id, caller)
    else:
        await require_zone_admin(zone_id, request)
=======
    await require_zone_admin(zone_id, request)
>>>>>>> parent of 0c80cd2 (Delete backend directory)
    ok = await service.remove_member(zone_id, email)
    if not ok:
        raise HTTPException(status_code=404, detail="Zone không tồn tại.")
    return {"message": f"Đã xóa {email} khỏi zone."}


# ── Zone-scoped audit logs ─────────────────────────────────────────────────

@router.get("/{zone_id}/logs")
async def get_zone_logs(
    zone_id: str,
    request: Request,
    limit: int = 50,
    skip: int = 0,
):
    """Return audit logs filtered to members of this zone."""
<<<<<<< HEAD
    user = await get_current_insight_user(request)
    role = user.get("role", "viewer")
    if role in ("super_admin", "tenant_admin"):
        await _verify_zone_ownership(zone_id, user)
    else:
        await require_zone_access(zone_id, request)
=======
    await require_zone_access(zone_id, request)
>>>>>>> parent of 0c80cd2 (Delete backend directory)

    from app.database.connection import get_database
    from pytz import timezone as tz

    member_emails = await get_all_member_emails_in_zone(zone_id)
    if not member_emails:
        return []

    db = get_database()
    vn_tz = tz("Asia/Ho_Chi_Minh")
    cursor = db.audit_logs.find({
        "$or": [
            {"actor_email": {"$in": member_emails}},
            {"insight_user_id": {"$in": member_emails}}
        ]
    }).sort("timestamp", -1).skip(skip).limit(limit)

    logs = []
    async for log in cursor:
        ts = log.get("timestamp")
        if ts and hasattr(ts, "astimezone"):
            ts = ts.astimezone(vn_tz).strftime("%H:%M %d/%m/%Y")
        logs.append({
            "id": str(log["_id"]),
            "timestamp": ts,
            "actor_email": log.get("actor_email") or log.get("insight_user_id"),
            "insight_user_id": log.get("insight_user_id") or log.get("actor_email"),
            "method": log.get("method"),
            "endpoint": log.get("endpoint"),
            "payload": log.get("payload"),
            "ip_address": log.get("ip_address"),
            "statusCode": log.get("statusCode", 0),
            "action": log.get("action"),
<<<<<<< HEAD
            "site_id": log.get("site_id"),
            "zone_id": log.get("zone_id"),
            "status": log.get("status"),
            "result_detail": log.get("result_detail"),
=======
>>>>>>> parent of 0c80cd2 (Delete backend directory)
        })
    return logs
