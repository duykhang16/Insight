"""Zone management API routes."""
from fastapi import APIRouter, HTTPException, Request, Depends
from typing import List, Dict, Any
from app.shared.auth_deps import require_internal_admin, require_zone_access, require_zone_admin, get_current_insight_user
from app.database.member_permissions_crud import get_all_member_emails_in_zone
from . import service
from .schemas import (
    ZoneCreateRequest, ZoneUpdateRequest, ZoneSitesUpdateRequest,
    ZoneMemberAddRequest, ZoneMemberUpdateRequest, ZoneMemberSitesUpdateRequest,
    ZoneResponse, ZoneListItem,
)

router = APIRouter(prefix="/zones", tags=["zones"])


# ── Zone CRUD ──────────────────────────────────────────────────────────────

@router.get("", response_model=List[ZoneListItem])
async def list_zones(
    request: Request,
    user: Dict[str, Any] = Depends(require_internal_admin),
):
    """Brand/Admin: list zones in their own ownership scope."""
    if user.get("role") != "brand_admin":
        raise HTTPException(status_code=403, detail="Chỉ Brand Admin mới được xem danh sách zone quản lý.")
    return await service.list_zones(user["email"], caller_role=user.get("role", "brand_admin"))


@router.get("/my", response_model=List[ZoneListItem])
async def list_my_zones(request: Request):
    """Any approved user: list zones they belong to."""
    user = await get_current_insight_user(request)
    role = user.get("role", "viewer")
    caller_email = user["email"]
    caller_role = role
    return await service.list_my_zones(caller_email, caller_role=caller_role)


@router.post("", response_model=ZoneResponse, status_code=201)
async def create_zone(
    payload: ZoneCreateRequest,
    request: Request,
    user: Dict[str, Any] = Depends(require_internal_admin),
):
    if user.get("role") != "brand_admin":
        raise HTTPException(status_code=403, detail="Chỉ Brand Admin mới được tạo zone.")
    try:
        zone = await service.create_zone(
            name=payload.name,
            created_by=user["email"],
            brand_admin_email=user["email"],
            description=payload.description,
            color=payload.color,
            creator_role=user.get("role", "brand_admin"),
        )
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    return zone


async def _verify_zone_ownership(zone_id: str, user: Dict[str, Any]):
    """Brand isolation: brand_admin owns zone management within the brand."""
    zone = await service.get_zone_detail(zone_id)
    if not zone:
        raise HTTPException(status_code=404, detail="Zone không tồn tại.")
    if zone.brand_admin_email != user["email"]:
        raise HTTPException(status_code=403, detail="Bạn không có quyền truy cập Zone này.")


@router.get("/{zone_id}", response_model=ZoneResponse)
async def get_zone(zone_id: str, request: Request):
    user = await get_current_insight_user(request)
    role = user.get("role", "viewer")
    if role == "super_admin":
        raise HTTPException(status_code=403, detail="Super Admin không truy cập trực tiếp zone của brand.")
    if role == "brand_admin":
        await _verify_zone_ownership(zone_id, user)
    else:
        # admin/viewer/delegator: must be a zone member
        await require_zone_access(zone_id, request)
    zone = await service.get_zone_detail(zone_id)
    if not zone:
        raise HTTPException(status_code=404, detail="Zone không tồn tại.")
    return zone


@router.put("/{zone_id}", response_model=ZoneResponse)
async def update_zone(zone_id: str, payload: ZoneUpdateRequest, request: Request):
    user = await get_current_insight_user(request)
    role = user.get("role", "viewer")
    if role != "brand_admin":
        raise HTTPException(status_code=403, detail="Chỉ Brand Admin mới được chỉnh sửa thông tin zone.")
    await _verify_zone_ownership(zone_id, user)
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
    if user.get("role") != "brand_admin":
        raise HTTPException(status_code=403, detail="Chỉ Brand Admin mới được xóa zone.")
    # Tenant isolation: only owner can delete
    await _verify_zone_ownership(zone_id, user)
    ok = await service.delete_zone(zone_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Zone không tồn tại.")
    return {"message": f"Zone {zone_id} đã được xóa. Sites chuyển về Unassigned."}


# ── Site assignment ────────────────────────────────────────────────────────

@router.put("/{zone_id}/sites", response_model=ZoneResponse)
async def update_zone_sites(
    zone_id: str,
    payload: ZoneSitesUpdateRequest,
    request: Request,
    user: Dict[str, Any] = Depends(require_internal_admin),
):
    """Replace site list for a zone. Called by drag-drop frontend."""
    if user.get("role") != "brand_admin":
        raise HTTPException(status_code=403, detail="Chỉ Brand Admin mới được thay đổi site của zone.")
    # Tenant isolation: only owner can modify sites
    await _verify_zone_ownership(zone_id, user)
    zone = await service.update_zone_sites(zone_id, payload.site_ids)
    if not zone:
        raise HTTPException(status_code=404, detail="Zone không tồn tại.")
    return zone


# ── Member management ──────────────────────────────────────────────────────

@router.post("/{zone_id}/members", response_model=ZoneResponse)
async def add_member(zone_id: str, payload: ZoneMemberAddRequest, request: Request):
    caller = await get_current_insight_user(request)
    role = caller.get("role", "viewer")
    
    # Brand isolation + super admin block
    if role == "super_admin":
        raise HTTPException(status_code=403, detail="Super Admin không quản lý trực tiếp thành viên zone của brand.")
    if role == "brand_admin":
        await _verify_zone_ownership(zone_id, caller)
    else:
        await require_zone_admin(zone_id, request)

    from app.database.auth_crud import get_user_by_email
    target_user = await get_user_by_email(payload.email)
    if not target_user:
        raise HTTPException(status_code=404, detail="User không tồn tại.")

    try:
        zone = await service.add_member(
            zone_id=zone_id,
            email=payload.email,
            zone_role=payload.zone_role or "viewer",
            assigned_by=caller["email"],
            all_sites=payload.all_sites,
            allowed_site_ids=payload.allowed_site_ids,
            site_role_overrides=[item.model_dump() for item in payload.site_role_overrides],
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not zone:
        raise HTTPException(status_code=404, detail="Zone không tồn tại.")
    return zone


@router.put("/{zone_id}/members/{email}", response_model=ZoneResponse)
async def update_member(zone_id: str, email: str, payload: ZoneMemberUpdateRequest, request: Request):
    caller = await get_current_insight_user(request)
    role = caller.get("role", "viewer")
    
    # Tenant isolation + super admin block
    if role == "super_admin":
        raise HTTPException(status_code=403, detail="Super Admin không quản lý trực tiếp thành viên zone của brand.")
    if role == "brand_admin":
        await _verify_zone_ownership(zone_id, caller)
    else:
        await require_zone_admin(zone_id, request)
    
    # Update role if provided
    if payload.zone_role is not None:
        from app.database.auth_crud import get_user_by_email
        target_user = await get_user_by_email(email)
        if not target_user:
            raise HTTPException(status_code=404, detail="User không tồn tại.")
        try:
            zone = await service.update_member_role(zone_id, email, payload.zone_role)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        if not zone:
            raise HTTPException(status_code=404, detail="Zone hoặc member không tồn tại.")

    # Update site permissions if provided
    if payload.all_sites is not None:
        zone = await service.update_member_sites(
            zone_id,
            email,
            payload.all_sites,
            payload.allowed_site_ids,
            None if payload.site_role_overrides is None else [item.model_dump() for item in payload.site_role_overrides],
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
    if role == "super_admin":
        raise HTTPException(status_code=403, detail="Super Admin không quản lý trực tiếp thành viên zone của brand.")
    if role == "brand_admin":
        await _verify_zone_ownership(zone_id, caller)
    else:
        await require_zone_admin(zone_id, request)
    zone = await service.update_member_sites(
        zone_id,
        email,
        payload.all_sites,
        payload.allowed_site_ids,
        [item.model_dump() for item in payload.site_role_overrides],
        caller["email"],
        payload.replacement_admin_email,
    )
    if not zone:
        raise HTTPException(status_code=404, detail="Zone hoặc member không tồn tại.")
    return zone


@router.delete("/{zone_id}/members/{email}")
async def remove_member(zone_id: str, email: str, request: Request):
    caller = await get_current_insight_user(request)
    role = caller.get("role", "viewer")
    if role == "super_admin":
        raise HTTPException(status_code=403, detail="Super Admin không quản lý trực tiếp thành viên zone của brand.")
    if role == "brand_admin":
        await _verify_zone_ownership(zone_id, caller)
    else:
        await require_zone_admin(zone_id, request)
    try:
        ok = await service.remove_member(zone_id, email)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
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
    user = await get_current_insight_user(request)
    role = user.get("role", "viewer")
    if role == "super_admin":
        raise HTTPException(status_code=403, detail="Super Admin không xem trực tiếp zone logs của brand.")
    if role == "brand_admin":
        await _verify_zone_ownership(zone_id, user)
    else:
        await require_zone_access(zone_id, request)

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
            "site_id": log.get("site_id"),
            "zone_id": log.get("zone_id"),
            "status": log.get("status"),
            "result_detail": log.get("result_detail"),
        })
    return logs
