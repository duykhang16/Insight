"""Business logic for zone management.

Members are now stored in the zone_member_permissions collection
(separate from zones). This service bridges both.
"""
from datetime import timezone
from typing import Dict, Any, List, Optional
from app.database import zones_crud
from app.database import member_permissions_crud as perms_crud
from app.database.auth_crud import create_user_no_password, get_user_by_email
from app.database.connection import get_database
from .schemas import ZoneResponse, ZoneListItem, ZoneMemberResponse, VALID_ZONE_ROLES
from app.shared.rbac import ROLE_BRAND_ADMIN, ROLE_DELEGATOR, ROLE_SUB_ADMIN, ROLE_SUPER_ADMIN, ROLE_VIEWER, normalize_legacy_role


def _fmt_dt(dt) -> str:
    """Format datetime to ISO string with UTC timezone."""
    if dt is None:
        return ""
    if hasattr(dt, "isoformat"):
        return dt.isoformat()
    return str(dt)


async def _build_zone_response(z: Dict[str, Any]) -> ZoneResponse:
    """Build full ZoneResponse including members from permissions collection."""
    zone_id = str(z["_id"])
    raw_members = await perms_crud.get_zone_members(zone_id)
    members = [
        ZoneMemberResponse(
            email=m["email"],
            zone_role=m["zone_role"],
            all_sites=m.get("all_sites", True),
            allowed_site_ids=m.get("allowed_site_ids", []),
            site_role_overrides=m.get("site_role_overrides", []),
            assigned_by=m.get("assigned_by", ""),
            assigned_at=_fmt_dt(m.get("assigned_at")),
            updated_at=_fmt_dt(m.get("updated_at")),
        )
        for m in raw_members
    ]
    return ZoneResponse(
        id=zone_id,
        name=z["name"],
        description=z.get("description"),
        color=z.get("color", "#3B82F6"),
        created_by=z.get("created_by", ""),
        brand_admin_email=z.get("brand_admin_email"),
        zone_type=zones_crud.ZONE_TYPE_CANONICAL,
        created_at=_fmt_dt(z.get("created_at")),
        updated_at=_fmt_dt(z.get("updated_at")),
        site_ids=z.get("site_ids", []),
        members=members,
        member_count=len(members),
        site_count=len(z.get("site_ids", [])),
    )


async def _build_zone_list_item(z: Dict[str, Any]) -> ZoneListItem:
    zone_id = str(z["_id"])
    member_count = len(await perms_crud.get_zone_members(zone_id))
    return ZoneListItem(
        id=zone_id,
        name=z["name"],
        description=z.get("description"),
        color=z.get("color", "#3B82F6"),
        created_by=z.get("created_by", ""),
        brand_admin_email=z.get("brand_admin_email"),
        zone_type=zones_crud.ZONE_TYPE_CANONICAL,
        created_at=_fmt_dt(z.get("created_at")),
        member_count=member_count,
        site_count=len(z.get("site_ids", [])),
        site_ids=z.get("site_ids", []),
    )


# ── Zone CRUD ───────────────────────────────────────────────────────────────

async def list_zones(caller_email: str, caller_role: str = "super_admin") -> List[ZoneListItem]:
    """Admin route: list zones visible to this admin.
    
    - super_admin: NO access (DEV-level, not a brand)
    - brand_admin: sees zones in their brand
    - admin: no direct zone-management surface
    """
    if caller_role == "super_admin":
        return []  # Super admin is system-level, no tenant data
    if caller_role == "brand_admin":
        zones = await zones_crud.get_brand_zones(brand_admin_email=caller_email)
    else:
        zones = []
    results = []
    for z in zones:
        results.append(await _build_zone_list_item(z))
    return results


async def list_my_zones(caller_email: str, caller_role: str) -> List[ZoneListItem]:
    """My Zones: scoped by role.
    
    - super_admin: NO access (DEV-level, not a brand)
    - brand_admin: zones in their brand
    - admin/viewer/delegator: zones they are a member of
    """
    if caller_role == "super_admin":
        return []  # Super admin is system-level, no tenant data
    elif caller_role == "brand_admin":
        zones = await zones_crud.get_brand_zones(brand_admin_email=caller_email)
    else:
        zone_ids = await perms_crud.get_zone_ids_for_member(caller_email)
        zones = await zones_crud.get_zones_by_ids(zone_ids) if zone_ids else []
    results = []
    for z in zones:
        results.append(await _build_zone_list_item(z))
    return results


async def get_zone_detail(zone_id: str) -> Optional[ZoneResponse]:
    z = await zones_crud.get_zone_by_id(zone_id)
    if not z:
        return None
    return await _build_zone_response(z)


async def create_zone(
    name: str,
    created_by: str,
    brand_admin_email: str,
    description: Optional[str],
    color: str,
    creator_role: str = "brand_admin",
) -> ZoneResponse:
    zone_type = zones_crud.ZONE_TYPE_CANONICAL
    existing = await zones_crud.find_zone_by_name_in_scope(
        name=name,
        brand_admin_email=brand_admin_email,
        zone_type=zone_type,
        created_by=created_by,
    )
    if existing:
        raise ValueError(f"Zone '{name}' đã tồn tại.")
    z = await zones_crud.create_zone(
        name=name,
        created_by=created_by,
        brand_admin_email=brand_admin_email,
        zone_type=zone_type,
        description=description,
        color=color,
    )
    if creator_role in {"brand_admin", "admin"}:
        await perms_crud.add_member_permission(
            zone_id=str(z["_id"]),
            email=created_by,
            zone_role="admin",
            assigned_by=created_by,
            all_sites=True,
        )
    return await _build_zone_response(z)


async def update_zone(zone_id: str, updates: Dict[str, Any]) -> Optional[ZoneResponse]:
    existing_zone = await zones_crud.get_zone_by_id(zone_id)
    if not existing_zone:
        return None
    if "name" in updates:
        existing = await zones_crud.find_zone_by_name_in_scope(
            name=updates["name"],
            brand_admin_email=existing_zone.get("brand_admin_email") or existing_zone.get("created_by", ""),
            zone_type=existing_zone.get("zone_type", zones_crud.ZONE_TYPE_CANONICAL),
            created_by=existing_zone.get("created_by"),
        )
        if existing and str(existing["_id"]) != zone_id:
            raise ValueError(f"Zone '{updates['name']}' đã tồn tại.")
    ok = await zones_crud.update_zone(zone_id, {k: v for k, v in updates.items() if v is not None})
    if not ok:
        return None
    return await get_zone_detail(zone_id)


async def delete_zone(zone_id: str) -> bool:
    """Delete zone group — sites become unassigned. Cleans up all member permissions."""
    # Clean up permissions first
    await perms_crud.remove_all_zone_permissions(zone_id)
    return await zones_crud.delete_zone(zone_id)


async def update_zone_sites(zone_id: str, site_ids: List[str]) -> Optional[ZoneResponse]:
    zone = await zones_crud.get_zone_by_id(zone_id)
    if not zone:
        return None

    deduped_site_ids = list(dict.fromkeys(site_ids))
    current_site_ids = set(zone.get("site_ids", []))
    added_to_current = set(deduped_site_ids) - current_site_ids
    removed_from_current = current_site_ids - set(deduped_site_ids)
    removed_site_scope = set(removed_from_current)

    other_zones = await zones_crud.get_brand_zones(
        brand_admin_email=zone.get("brand_admin_email") or zone.get("created_by", ""),
    )
    for other_zone in other_zones:
        other_zone_id = str(other_zone["_id"])
        if other_zone_id == zone_id:
            continue
        overlaps = sorted(set(other_zone.get("site_ids", [])) & set(deduped_site_ids))
        if not overlaps:
            continue
        await zones_crud.remove_sites_from_zone(other_zone_id, overlaps)
        removed_site_scope.update(overlaps)
        for site_id in overlaps:
            await perms_crud.remove_site_from_all_members(other_zone_id, site_id)

    ok = await zones_crud.set_zone_sites(zone_id, deduped_site_ids)
    if not ok:
        return None
    for site_id in added_to_current:
        await perms_crud.remove_site_from_all_members(zone_id, site_id)
    for site_id in removed_from_current:
        await perms_crud.remove_site_from_all_members(zone_id, site_id)
    return await get_zone_detail(zone_id)


# ── Member Permission Management ────────────────────────────────────────────

async def add_member(
    zone_id: str,
    email: str,
    zone_role: str,
    assigned_by: str,
    all_sites: bool = True,
    allowed_site_ids: Optional[List[str]] = None,
    site_role_overrides: Optional[List[Dict[str, Any]]] = None,
) -> Optional[ZoneResponse]:
    if zone_role not in VALID_ZONE_ROLES:
        raise ValueError(f"zone_role không hợp lệ. Phải là: {VALID_ZONE_ROLES}")
    if not all_sites and zone_role == ROLE_SUB_ADMIN:
        raise ValueError("Khi gán theo site trong zone, role không thể là admin.")
    zone = await zones_crud.get_zone_by_id(zone_id)
    if not zone:
        return None
    await _assert_single_admin_scope_rule_for_member(
        zone_id=zone_id,
        member_email=email,
        zone_role=zone_role,
        all_sites=all_sites,
        allowed_site_ids=allowed_site_ids,
        site_role_overrides=site_role_overrides,
    )
    zone_site_ids = set(zone.get("site_ids", []))
    valid_scope = zone_site_ids if all_sites else set(allowed_site_ids or [])
    for override in site_role_overrides or []:
        if override.get("zone_role") not in VALID_ZONE_ROLES:
            raise ValueError(f"site_role_overrides chứa role không hợp lệ. Phải là: {VALID_ZONE_ROLES}")
        if override.get("zone_role") == ROLE_SUB_ADMIN:
            raise ValueError("Role theo site trong zone không thể là admin.")
        if override.get("site_id") not in valid_scope:
            raise ValueError("site_role_overrides chứa site nằm ngoài phạm vi được gán trong zone.")
    await _assert_parent_admin_scope_for_member(
        zone_id=zone_id,
        member_email=email,
        all_sites=all_sites,
        allowed_site_ids=allowed_site_ids,
    )
    await perms_crud.add_member_permission(
        zone_id=zone_id,
        email=email,
        zone_role=zone_role,
        assigned_by=assigned_by,
        all_sites=all_sites,
        allowed_site_ids=allowed_site_ids,
        site_role_overrides=site_role_overrides,
    )
    return await get_zone_detail(zone_id)


async def update_member_role(zone_id: str, email: str, zone_role: str) -> Optional[ZoneResponse]:
    if zone_role not in VALID_ZONE_ROLES:
        raise ValueError(f"zone_role không hợp lệ. Phải là: {VALID_ZONE_ROLES}")
    zone = await zones_crud.get_zone_by_id(zone_id)
    if not zone:
        return None
    brand_admin_email = (zone.get("brand_admin_email") or zone.get("created_by") or "").strip().lower()
    if email.strip().lower() == brand_admin_email:
        raise ValueError("Role của Brand Admin mặc định trong zone không thể bị thay đổi.")
    permission = await perms_crud.get_member_permission(zone_id, email)
    if permission and not bool(permission.get("all_sites", True)):
        raise ValueError("Khi thành viên đang dùng specific site trong zone, role toàn zone bị vô hiệu hóa.")
    if permission and not bool(permission.get("all_sites", True)) and zone_role == ROLE_SUB_ADMIN:
        raise ValueError("Khi gán theo site trong zone, role không thể là admin.")
    await _assert_single_admin_scope_rule_for_member(
        zone_id=zone_id,
        member_email=email,
        zone_role=zone_role,
        all_sites=bool((permission or {}).get("all_sites", True)),
        allowed_site_ids=(permission or {}).get("allowed_site_ids", []),
        site_role_overrides=(permission or {}).get("site_role_overrides", []),
    )
    await _assert_parent_admin_scope_for_member(
        zone_id=zone_id,
        member_email=email,
        all_sites=bool((permission or {}).get("all_sites", True)),
        allowed_site_ids=(permission or {}).get("allowed_site_ids", []),
    )
    ok = await perms_crud.update_member_role(zone_id, email, zone_role)
    if not ok:
        return None
    return await get_zone_detail(zone_id)


async def update_member_sites(
    zone_id: str,
    email: str,
    all_sites: bool,
    allowed_site_ids: Optional[List[str]] = None,
    site_role_overrides: Optional[List[Dict[str, Any]]] = None,
    assigned_by: Optional[str] = None,
    replacement_admin_email: Optional[str] = None,
) -> Optional[ZoneResponse]:
    """Update a member's site-level permission."""
    zone = await zones_crud.get_zone_by_id(zone_id)
    if not zone:
        return None
    brand_admin_email = (zone.get("brand_admin_email") or zone.get("created_by") or "").strip().lower()
    if email.strip().lower() == brand_admin_email:
        raise ValueError("Brand Admin mặc định trong zone luôn có toàn quyền và không thể bị giới hạn theo site.")
    current_permission = await perms_crud.get_member_permission(zone_id, email)
    effective_zone_role = (current_permission or {}).get("zone_role", ROLE_VIEWER)
    requires_replacement_admin = bool(
        current_permission
        and bool(current_permission.get("all_sites", True))
        and not all_sites
        and normalize_legacy_role(effective_zone_role) == ROLE_SUB_ADMIN
    )
    if requires_replacement_admin:
        await _promote_or_create_replacement_admin_for_zone_scope(
            zone_id=zone_id,
            source_email=email,
            brand_admin_email=brand_admin_email,
            assigned_by=assigned_by or email,
            replacement_admin_email=str(replacement_admin_email or "").strip().lower(),
            source_permission=current_permission,
        )
        await perms_crud.update_member_role(zone_id, email, ROLE_VIEWER)
        effective_zone_role = ROLE_VIEWER
    if not all_sites and normalize_legacy_role(effective_zone_role) == ROLE_SUB_ADMIN:
        raise ValueError("Khi gán theo site trong zone, role không thể là admin.")
    await _assert_single_admin_scope_rule_for_member(
        zone_id=zone_id,
        member_email=email,
        zone_role=effective_zone_role,
        all_sites=all_sites,
        allowed_site_ids=allowed_site_ids,
        site_role_overrides=site_role_overrides,
    )
    await _assert_parent_admin_scope_for_member(
        zone_id=zone_id,
        member_email=email,
        all_sites=all_sites,
        allowed_site_ids=allowed_site_ids,
    )
    zone_site_ids = set(zone.get("site_ids", []))
    valid_scope = zone_site_ids if all_sites else set(allowed_site_ids or [])
    for override in site_role_overrides or []:
        if override.get("zone_role") not in VALID_ZONE_ROLES:
            raise ValueError(f"site_role_overrides chứa role không hợp lệ. Phải là: {VALID_ZONE_ROLES}")
        if override.get("zone_role") == ROLE_SUB_ADMIN:
            raise ValueError("Role theo site trong zone không thể là admin.")
        if override.get("site_id") not in valid_scope:
            raise ValueError("site_role_overrides chứa site nằm ngoài phạm vi được gán trong zone.")
    ok = await perms_crud.update_member_sites(zone_id, email, all_sites, allowed_site_ids, site_role_overrides)
    if not ok:
        return None
    return await get_zone_detail(zone_id)


async def _promote_or_create_replacement_admin_for_zone_scope(
    zone_id: str,
    source_email: str,
    brand_admin_email: str,
    assigned_by: str,
    replacement_admin_email: str,
    source_permission: Dict[str, Any],
) -> str:
    replacement_admin_email = str(replacement_admin_email or "").strip().lower()
    source_email = str(source_email or "").strip().lower()
    if not replacement_admin_email:
        raise ValueError("Cần chọn hoặc nhập email admin thay thế trước khi chuyển sang specific site.")
    if replacement_admin_email == source_email:
        raise ValueError("Admin thay thế phải khác người đang bị chuyển sang specific site.")

    db = get_database()
    existing = await get_user_by_email(replacement_admin_email)
    if existing:
        existing_role = normalize_legacy_role(existing.get("role"))
        if existing.get("brand_admin_email") != brand_admin_email:
            raise ValueError("Admin thay thế phải thuộc cùng brand.")
        if existing_role in {ROLE_BRAND_ADMIN, ROLE_SUPER_ADMIN}:
            raise ValueError("Không thể dùng Brand Admin hoặc Super Admin làm admin thay thế.")
        if existing_role != ROLE_SUB_ADMIN:
            await db.users.update_one(
                {"email": replacement_admin_email},
                {
                    "$set": {
                        "role": ROLE_SUB_ADMIN,
                        "parent_admin_id": brand_admin_email,
                        "brand_admin_email": brand_admin_email,
                        "isApproved": True,
                    }
                },
            )
    else:
        await create_user_no_password(
            email=replacement_admin_email,
            role=ROLE_SUB_ADMIN,
            is_approved=True,
            parent_admin_id=brand_admin_email,
            brand_admin_email=brand_admin_email,
        )

    await perms_crud.add_member_permission(
        zone_id=zone_id,
        email=replacement_admin_email,
        zone_role=ROLE_SUB_ADMIN,
        assigned_by=assigned_by,
        has_zone_access=True,
        all_sites=bool(source_permission.get("all_sites", True)),
        allowed_site_ids=source_permission.get("allowed_site_ids", []),
        site_role_overrides=source_permission.get("site_role_overrides", []),
    )
    return replacement_admin_email


async def remove_member(zone_id: str, email: str) -> bool:
    zone = await zones_crud.get_zone_by_id(zone_id)
    if not zone:
        return False
    brand_admin_email = (zone.get("brand_admin_email") or zone.get("created_by") or "").strip().lower()
    if email.strip().lower() == brand_admin_email:
        raise ValueError("Brand Admin mặc định của zone không thể bị xóa khỏi zone.")
    return await perms_crud.remove_member_permission(zone_id, email)


async def _assert_parent_admin_scope_for_member(
    zone_id: str,
    member_email: str,
    all_sites: bool,
    allowed_site_ids: Optional[List[str]] = None,
) -> None:
    member_user = await get_user_by_email(member_email)
    if not member_user:
        return

    member_role = normalize_legacy_role(member_user.get("role"))
    parent_email = (member_user.get("parent_admin_id") or "").strip().lower()
    if member_role not in {ROLE_VIEWER, ROLE_DELEGATOR} or not parent_email:
        return

    parent_user = await get_user_by_email(parent_email)
    if not parent_user or normalize_legacy_role(parent_user.get("role")) != ROLE_SUB_ADMIN:
        return

    zone = await zones_crud.get_zone_by_id(zone_id)
    if not zone:
        return

    zone_site_ids = list(dict.fromkeys(zone.get("site_ids", [])))
    required_site_ids = zone_site_ids if all_sites else list(dict.fromkeys(allowed_site_ids or []))
    if not required_site_ids:
        return

    parent_site_roles = await perms_crud.get_effective_site_roles_in_zone(zone_id, parent_email) or {}
    missing_site_ids = [
        site_id
        for site_id in required_site_ids
        if normalize_legacy_role(parent_site_roles.get(site_id)) != ROLE_SUB_ADMIN
    ]
    if missing_site_ids:
        raise ValueError(
            f"User này đang thuộc admin {parent_email}, nhưng admin đó không có authority cho zone/site trong '{zone.get('name') or zone_id}'. "
            "Hãy chuyển user sang đúng admin rồi gán lại quyền."
        )


async def _assert_single_admin_scope_rule_for_member(
    zone_id: str,
    member_email: str,
    zone_role: str,
    all_sites: bool,
    allowed_site_ids: Optional[List[str]] = None,
    site_role_overrides: Optional[List[Dict[str, Any]]] = None,
) -> None:
    member_user = await get_user_by_email(member_email)
    if not member_user:
        return

    member_role = normalize_legacy_role(member_user.get("role"))
    excluded = [member_email]
    admin_email = None

    if member_role == ROLE_SUB_ADMIN and zone_role == ROLE_SUB_ADMIN:
        admin_email = member_email
    elif member_role in {ROLE_VIEWER, ROLE_DELEGATOR}:
        parent_email = (member_user.get("parent_admin_id") or "").strip().lower()
        parent_user = await get_user_by_email(parent_email) if parent_email else None
        if parent_user and normalize_legacy_role(parent_user.get("role")) == ROLE_SUB_ADMIN:
            admin_email = parent_email
            excluded.append(parent_email)

    if not admin_email:
        return

    zone = await zones_crud.get_zone_by_id(zone_id)
    if not zone:
        return
    zone_site_ids = list(dict.fromkeys(zone.get("site_ids", [])))
    accessible_site_ids = zone_site_ids if all_sites else list(dict.fromkeys(allowed_site_ids or []))
    if member_role in {ROLE_VIEWER, ROLE_DELEGATOR}:
        admin_scope_site_ids = accessible_site_ids
    else:
        default_role = normalize_legacy_role(zone_role or ROLE_VIEWER)
        override_map = {
            str(item.get("site_id") or "").strip(): normalize_legacy_role(item.get("zone_role") or default_role)
            for item in site_role_overrides or []
            if str(item.get("site_id") or "").strip()
        }
        admin_scope_site_ids = [
            site_id for site_id in accessible_site_ids
            if override_map.get(site_id, default_role) == ROLE_SUB_ADMIN
        ]
    if not admin_scope_site_ids:
        return

    conflicts = await perms_crud.find_active_admin_conflicts(
        zone_id=zone_id,
        site_ids=admin_scope_site_ids,
        all_sites=False,
        exclude_emails=excluded,
    )
    if conflicts:
        conflict_emails = ", ".join(sorted({item["email"] for item in conflicts}))
        raise ValueError(f"Mỗi zone/site chỉ được có một admin hoạt động. Phạm vi này đang thuộc admin: {conflict_emails}.")


async def resolve_sites_from_groups(zone_ids: List[str]) -> List[str]:
    """Map a list of zone IDs to an aggregated unique list of site IDs."""
    if not zone_ids:
        return []
    return await zones_crud.get_site_ids_for_zones(zone_ids)
