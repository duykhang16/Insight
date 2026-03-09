"""Zone management API routes."""
from fastapi import APIRouter, HTTPException, Request, Depends
from typing import List, Dict, Any
from app.shared.auth_deps import require_internal_admin, require_zone_access, require_zone_admin, get_current_insight_user
from app.database.zones_crud import get_all_member_emails_in_zone
from . import service
from .schemas import (
    ZoneCreateRequest, ZoneUpdateRequest, ZoneSitesUpdateRequest,
    ZoneMemberAddRequest, ZoneMemberUpdateRequest,
    ZoneResponse, ZoneListItem,
)

router = APIRouter(prefix="/zones", tags=["zones"])


# ── Zone CRUD ──────────────────────────────────────────────────────────────

@router.get("", response_model=List[ZoneListItem])
async def list_zones(
    request: Request,
    user: Dict[str, Any] = Depends(require_internal_admin),
):
    """Admin Master: list all zones."""
    return await service.list_zones(user["email"], is_global_admin=True)


@router.get("/my", response_model=List[ZoneListItem])
async def list_my_zones(request: Request):
    """Any approved user: list zones they belong to."""
    user = await get_current_insight_user(request)
    role = user.get("role", "")
    is_super = role == "super_admin"
    is_tenant = role == "tenant_admin"
    return await service.list_my_zones(user["email"], is_super=is_super, is_tenant=is_tenant)


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


@router.get("/{zone_id}", response_model=ZoneResponse)
async def get_zone(zone_id: str, request: Request):
    user = await get_current_insight_user(request)
    if user.get("role") != "admin":
        await require_zone_access(zone_id, request)
    zone = await service.get_zone_detail(zone_id)
    if not zone:
        raise HTTPException(status_code=404, detail="Zone không tồn tại.")
    return zone


@router.put("/{zone_id}", response_model=ZoneResponse)
async def update_zone(zone_id: str, payload: ZoneUpdateRequest, request: Request):
    await require_zone_admin(zone_id, request)
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
    ok = await service.delete_zone(zone_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Zone không tồn tại.")
    return {"message": f"Zone {zone_id} đã được xóa."}


# ── Site assignment ────────────────────────────────────────────────────────

@router.put("/{zone_id}/sites", response_model=ZoneResponse)
async def update_zone_sites(
    zone_id: str,
    payload: ZoneSitesUpdateRequest,
    request: Request,
    user: Dict[str, Any] = Depends(require_internal_admin),
):
    """Replace site list for a zone. Called by drag-drop frontend."""
    zone = await service.update_zone_sites(zone_id, payload.site_ids)
    if not zone:
        raise HTTPException(status_code=404, detail="Zone không tồn tại.")
    return zone


# ── Member management ──────────────────────────────────────────────────────

@router.post("/{zone_id}/members", response_model=ZoneResponse)
async def add_member(zone_id: str, payload: ZoneMemberAddRequest, request: Request):
    caller = await require_zone_admin(zone_id, request)
    
    from app.database.auth_crud import get_user_by_email
    target_user = await get_user_by_email(payload.email)
    if not target_user:
        raise HTTPException(status_code=404, detail="User không tồn tại.")
        
    sys_role = target_user.get("role", "viewer")
    mapped_role = "manager" if sys_role in ["super_admin", "tenant_admin", "manager"] else "viewer"

    try:
        zone = await service.add_member(zone_id, payload.email, mapped_role, caller["email"])
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not zone:
        raise HTTPException(status_code=404, detail="Zone không tồn tại.")
    return zone


@router.put("/{zone_id}/members/{email}", response_model=ZoneResponse)
async def update_member(zone_id: str, email: str, payload: ZoneMemberUpdateRequest, request: Request):
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
    if not zone:
        raise HTTPException(status_code=404, detail="Zone hoặc member không tồn tại.")
    return zone


@router.delete("/{zone_id}/members/{email}")
async def remove_member(zone_id: str, email: str, request: Request):
    await require_zone_admin(zone_id, request)
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
            ts = ts.astimezone(vn_tz).strftime("%Y-%m-%d %H:%M:%S")
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
        })
    return logs
