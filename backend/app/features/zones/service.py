<<<<<<< HEAD
"""Business logic for zone management.

Members are now stored in the zone_member_permissions collection
(separate from zones). This service bridges both.
"""
from datetime import timezone
from typing import Dict, Any, List, Optional
from app.database import zones_crud
from app.database import member_permissions_crud as perms_crud
=======
"""Business logic for zone management."""
from datetime import timezone
from typing import Dict, Any, List, Optional
from app.database import zones_crud
>>>>>>> parent of 0c80cd2 (Delete backend directory)
from .schemas import ZoneResponse, ZoneListItem, ZoneMemberResponse, VALID_ZONE_ROLES


def _fmt_dt(dt) -> str:
    """Format datetime to ISO string with UTC timezone."""
    if dt is None:
        return ""
    if hasattr(dt, "isoformat"):
        return dt.isoformat()
    return str(dt)


<<<<<<< HEAD
async def _build_zone_response(z: Dict[str, Any]) -> ZoneResponse:
    """Build full ZoneResponse including members from permissions collection."""
    zone_id = str(z["_id"])
    raw_members = await perms_crud.get_zone_members(zone_id)
=======
def _serialize_zone(z: Dict[str, Any]) -> ZoneResponse:
>>>>>>> parent of 0c80cd2 (Delete backend directory)
    members = [
        ZoneMemberResponse(
            email=m["email"],
            zone_role=m["zone_role"],
<<<<<<< HEAD
            all_sites=m.get("all_sites", True),
            allowed_site_ids=m.get("allowed_site_ids", []),
            assigned_by=m.get("assigned_by", ""),
            assigned_at=_fmt_dt(m.get("assigned_at")),
            updated_at=_fmt_dt(m.get("updated_at")),
        )
        for m in raw_members
    ]
    return ZoneResponse(
        id=zone_id,
=======
            assigned_by=m.get("assigned_by", ""),
            assigned_at=_fmt_dt(m.get("assigned_at")),
        )
        for m in z.get("members", [])
    ]
    return ZoneResponse(
        id=str(z["_id"]),
>>>>>>> parent of 0c80cd2 (Delete backend directory)
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


<<<<<<< HEAD
async def _build_zone_list_item(z: Dict[str, Any]) -> ZoneListItem:
    zone_id = str(z["_id"])
    member_count = len(await perms_crud.get_zone_members(zone_id))
    return ZoneListItem(
        id=zone_id,
=======
def _serialize_zone_list_item(z: Dict[str, Any]) -> ZoneListItem:
    return ZoneListItem(
        id=str(z["_id"]),
>>>>>>> parent of 0c80cd2 (Delete backend directory)
        name=z["name"],
        description=z.get("description"),
        color=z.get("color", "#3B82F6"),
        created_by=z.get("created_by", ""),
        created_at=_fmt_dt(z.get("created_at")),
<<<<<<< HEAD
        member_count=member_count,
=======
        member_count=len(z.get("members", [])),
>>>>>>> parent of 0c80cd2 (Delete backend directory)
        site_count=len(z.get("site_ids", [])),
        site_ids=z.get("site_ids", []),
    )


<<<<<<< HEAD
# ── Zone CRUD ───────────────────────────────────────────────────────────────

async def list_zones(caller_email: str, caller_role: str = "super_admin") -> List[ZoneListItem]:
    """Admin route: list zones visible to this admin.
    
    - super_admin: NO access (DEV-level, not a tenant)
    - tenant_admin: sees ONLY zones they created (tenant isolation)
    """
    if caller_role == "super_admin":
        return []  # Super admin is system-level, no tenant data
    # Tenant admin → only their own zones
    zones = await zones_crud.get_all_zones_by_owner(caller_email)
    results = []
    for z in zones:
        results.append(await _build_zone_list_item(z))
    return results


async def list_my_zones(caller_email: str, caller_role: str) -> List[ZoneListItem]:
    """My Zones: scoped by role.
    
    - super_admin: NO access (DEV-level, not a tenant)
    - tenant_admin: zones they created (owns)
    - manager/viewer: zones they are a member of
    """
    if caller_role == "super_admin":
        return []  # Super admin is system-level, no tenant data
    elif caller_role == "tenant_admin":
        # Only zones owned by this tenant admin
        zones = await zones_crud.get_all_zones_by_owner(caller_email)
    else:
        zone_ids = await perms_crud.get_zone_ids_for_member(caller_email)
        zones = await zones_crud.get_zones_by_ids(zone_ids) if zone_ids else []
    results = []
    for z in zones:
        results.append(await _build_zone_list_item(z))
    return results
=======
async def list_zones(caller_email: str, is_global_admin: bool) -> List[ZoneListItem]:
    if is_global_admin:
        zones = await zones_crud.get_all_zones()
    else:
        # tenant_admin: sees zones they created or are a member of
        zones = await zones_crud.get_zones_for_tenant_admin(caller_email)
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
>>>>>>> parent of 0c80cd2 (Delete backend directory)


async def get_zone_detail(zone_id: str) -> Optional[ZoneResponse]:
    z = await zones_crud.get_zone_by_id(zone_id)
    if not z:
        return None
<<<<<<< HEAD
    return await _build_zone_response(z)
=======
    return _serialize_zone(z)
>>>>>>> parent of 0c80cd2 (Delete backend directory)


async def create_zone(name: str, created_by: str, description: Optional[str], color: str) -> ZoneResponse:
    existing = await zones_crud.get_zone_by_name(name)
    if existing:
        raise ValueError(f"Zone '{name}' đã tồn tại.")
    z = await zones_crud.create_zone(name=name, created_by=created_by, description=description, color=color)
<<<<<<< HEAD
    return await _build_zone_response(z)


async def update_zone(zone_id: str, updates: Dict[str, Any]) -> Optional[ZoneResponse]:
=======
    return _serialize_zone(z)


async def update_zone(zone_id: str, updates: Dict[str, Any]) -> Optional[ZoneResponse]:
    # Check for duplicate name
>>>>>>> parent of 0c80cd2 (Delete backend directory)
    if "name" in updates:
        existing = await zones_crud.get_zone_by_name(updates["name"])
        if existing and str(existing["_id"]) != zone_id:
            raise ValueError(f"Zone '{updates['name']}' đã tồn tại.")
    ok = await zones_crud.update_zone(zone_id, {k: v for k, v in updates.items() if v is not None})
    if not ok:
        return None
    return await get_zone_detail(zone_id)


async def delete_zone(zone_id: str) -> bool:
<<<<<<< HEAD
    """Delete zone group — sites become unassigned. Cleans up all member permissions."""
    # Clean up permissions first
    await perms_crud.remove_all_zone_permissions(zone_id)
=======
>>>>>>> parent of 0c80cd2 (Delete backend directory)
    return await zones_crud.delete_zone(zone_id)


async def update_zone_sites(zone_id: str, site_ids: List[str]) -> Optional[ZoneResponse]:
    ok = await zones_crud.set_zone_sites(zone_id, site_ids)
    if not ok:
        return None
    return await get_zone_detail(zone_id)


<<<<<<< HEAD
# ── Member Permission Management ────────────────────────────────────────────

async def add_member(
    zone_id: str,
    email: str,
    zone_role: str,
    assigned_by: str,
    all_sites: bool = True,
    allowed_site_ids: Optional[List[str]] = None,
) -> Optional[ZoneResponse]:
    if zone_role not in VALID_ZONE_ROLES:
        raise ValueError(f"zone_role không hợp lệ. Phải là: {VALID_ZONE_ROLES}")
    await perms_crud.add_member_permission(
        zone_id=zone_id,
        email=email,
        zone_role=zone_role,
        assigned_by=assigned_by,
        all_sites=all_sites,
        allowed_site_ids=allowed_site_ids,
    )
=======
async def add_member(zone_id: str, email: str, zone_role: str, assigned_by: str) -> Optional[ZoneResponse]:
    if zone_role not in VALID_ZONE_ROLES:
        raise ValueError(f"zone_role không hợp lệ. Phải là: {VALID_ZONE_ROLES}")
    ok = await zones_crud.add_zone_member(zone_id, email, zone_role, assigned_by)
    if not ok:
        return None
>>>>>>> parent of 0c80cd2 (Delete backend directory)
    return await get_zone_detail(zone_id)


async def update_member_role(zone_id: str, email: str, zone_role: str) -> Optional[ZoneResponse]:
    if zone_role not in VALID_ZONE_ROLES:
        raise ValueError(f"zone_role không hợp lệ. Phải là: {VALID_ZONE_ROLES}")
<<<<<<< HEAD
    ok = await perms_crud.update_member_role(zone_id, email, zone_role)
    if not ok:
        return None
    return await get_zone_detail(zone_id)


async def update_member_sites(
    zone_id: str,
    email: str,
    all_sites: bool,
    allowed_site_ids: Optional[List[str]] = None,
) -> Optional[ZoneResponse]:
    """Update a member's site-level permission."""
    ok = await perms_crud.update_member_sites(zone_id, email, all_sites, allowed_site_ids)
=======
    ok = await zones_crud.update_zone_member_role(zone_id, email, zone_role)
>>>>>>> parent of 0c80cd2 (Delete backend directory)
    if not ok:
        return None
    return await get_zone_detail(zone_id)


async def remove_member(zone_id: str, email: str) -> bool:
<<<<<<< HEAD
    return await perms_crud.remove_member_permission(zone_id, email)
=======
    return await zones_crud.remove_zone_member(zone_id, email)
>>>>>>> parent of 0c80cd2 (Delete backend directory)


async def resolve_sites_from_groups(zone_ids: List[str]) -> List[str]:
    """Map a list of zone IDs to an aggregated unique list of site IDs."""
    if not zone_ids:
        return []
    return await zones_crud.get_site_ids_for_zones(zone_ids)
