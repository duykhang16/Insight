"""Business logic for zone management."""
from datetime import timezone
from typing import Dict, Any, List, Optional
from app.database import zones_crud
from .schemas import ZoneResponse, ZoneListItem, ZoneMemberResponse, VALID_ZONE_ROLES


def _fmt_dt(dt) -> str:
    """Format datetime to ISO string with UTC timezone."""
    if dt is None:
        return ""
    if hasattr(dt, "isoformat"):
        return dt.isoformat()
    return str(dt)


def _serialize_zone(z: Dict[str, Any]) -> ZoneResponse:
    members = [
        ZoneMemberResponse(
            email=m["email"],
            zone_role=m["zone_role"],
            assigned_by=m.get("assigned_by", ""),
            assigned_at=_fmt_dt(m.get("assigned_at")),
        )
        for m in z.get("members", [])
    ]
    return ZoneResponse(
        id=str(z["_id"]),
        name=z["name"],
        description=z.get("description"),
        color=z.get("color", "#3B82F6"),
        created_by=z.get("created_by", ""),
        created_at=_fmt_dt(z.get("created_at")),
        updated_at=_fmt_dt(z.get("updated_at")),
        site_ids=z.get("site_ids", []),
        members=members,
        member_count=len(members),
        site_count=len(z.get("site_ids", [])),
    )


def _serialize_zone_list_item(z: Dict[str, Any]) -> ZoneListItem:
    return ZoneListItem(
        id=str(z["_id"]),
        name=z["name"],
        description=z.get("description"),
        color=z.get("color", "#3B82F6"),
        created_by=z.get("created_by", ""),
        created_at=_fmt_dt(z.get("created_at")),
        member_count=len(z.get("members", [])),
        site_count=len(z.get("site_ids", [])),
        site_ids=z.get("site_ids", []),
    )


async def list_zones(caller_email: str, is_global_admin: bool) -> List[ZoneListItem]:
    if is_global_admin:
        zones = await zones_crud.get_all_zones()
    else:
        zones = await zones_crud.get_zones_for_member(caller_email)
    return [_serialize_zone_list_item(z) for z in zones]


async def list_my_zones(caller_email: str, is_super: bool, is_tenant: bool) -> List[ZoneListItem]:
    """My Zones endpoint: super_admin sees all, tenant_admin sees zones they created or are member of, others see member-only."""
    if is_super:
        zones = await zones_crud.get_all_zones()
    elif is_tenant:
        zones = await zones_crud.get_zones_for_tenant_admin(caller_email)
    else:
        zones = await zones_crud.get_zones_for_member(caller_email)
    return [_serialize_zone_list_item(z) for z in zones]


async def get_zone_detail(zone_id: str) -> Optional[ZoneResponse]:
    z = await zones_crud.get_zone_by_id(zone_id)
    if not z:
        return None
    return _serialize_zone(z)


async def create_zone(name: str, created_by: str, description: Optional[str], color: str) -> ZoneResponse:
    existing = await zones_crud.get_zone_by_name(name)
    if existing:
        raise ValueError(f"Zone '{name}' đã tồn tại.")
    z = await zones_crud.create_zone(name=name, created_by=created_by, description=description, color=color)
    return _serialize_zone(z)


async def update_zone(zone_id: str, updates: Dict[str, Any]) -> Optional[ZoneResponse]:
    # Check for duplicate name
    if "name" in updates:
        existing = await zones_crud.get_zone_by_name(updates["name"])
        if existing and str(existing["_id"]) != zone_id:
            raise ValueError(f"Zone '{updates['name']}' đã tồn tại.")
    ok = await zones_crud.update_zone(zone_id, {k: v for k, v in updates.items() if v is not None})
    if not ok:
        return None
    return await get_zone_detail(zone_id)


async def delete_zone(zone_id: str) -> bool:
    return await zones_crud.delete_zone(zone_id)


async def update_zone_sites(zone_id: str, site_ids: List[str]) -> Optional[ZoneResponse]:
    ok = await zones_crud.set_zone_sites(zone_id, site_ids)
    if not ok:
        return None
    return await get_zone_detail(zone_id)


async def add_member(zone_id: str, email: str, zone_role: str, assigned_by: str) -> Optional[ZoneResponse]:
    if zone_role not in VALID_ZONE_ROLES:
        raise ValueError(f"zone_role không hợp lệ. Phải là: {VALID_ZONE_ROLES}")
    ok = await zones_crud.add_zone_member(zone_id, email, zone_role, assigned_by)
    if not ok:
        return None
    return await get_zone_detail(zone_id)


async def update_member_role(zone_id: str, email: str, zone_role: str) -> Optional[ZoneResponse]:
    if zone_role not in VALID_ZONE_ROLES:
        raise ValueError(f"zone_role không hợp lệ. Phải là: {VALID_ZONE_ROLES}")
    ok = await zones_crud.update_zone_member_role(zone_id, email, zone_role)
    if not ok:
        return None
    return await get_zone_detail(zone_id)


async def remove_member(zone_id: str, email: str) -> bool:
    return await zones_crud.remove_zone_member(zone_id, email)


async def resolve_sites_from_groups(zone_ids: List[str]) -> List[str]:
    """Map a list of zone IDs to an aggregated unique list of site IDs."""
    if not zone_ids:
        return []
    return await zones_crud.get_site_ids_for_zones(zone_ids)
