"""MongoDB CRUD operations for the zone_member_permissions collection.

Each document represents one member's permission within one zone,
including their role and site-level access control.

Schema:
  zone_id:          str (ref to zones._id as string)
  email:            str
  zone_role:        str ("manager" | "viewer")
  has_zone_access:  bool (True = zone appears in My Zones / zone-scoped UI;
                          False = site-only assignment inside the zone)
  all_sites:        bool (True = see all sites in zone)
  allowed_site_ids: List[str] (only used when all_sites=False)
  assigned_by:      str
  assigned_at:      datetime
  updated_at:       datetime
"""
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from bson import ObjectId
from .connection import get_database
from . import zones_crud
from app.shared.rbac import ROLE_SUB_ADMIN, ROLE_DELEGATOR, ROLE_VIEWER, normalize_legacy_role, normalize_zone_role
from .auth_crud import get_user_by_email

COLLECTION = "zone_member_permissions"
ROLE_PRIORITY = {
    ROLE_VIEWER: 1,
    ROLE_DELEGATOR: 2,
    ROLE_SUB_ADMIN: 3,
}


def _serialize(doc: Dict[str, Any]) -> Dict[str, Any]:
    """Convert ObjectId to string for JSON serialization."""
    if doc and "_id" in doc:
        doc["_id"] = str(doc["_id"])
    return doc


def _normalize_site_role_overrides(site_role_overrides: Optional[List[Dict[str, Any]]]) -> List[Dict[str, str]]:
    seen: Dict[str, str] = {}
    for item in site_role_overrides or []:
        site_id = str(item.get("site_id") or "").strip()
        zone_role = normalize_zone_role(item.get("zone_role"))
        if not site_id:
            continue
        seen[site_id] = zone_role
    return [{"site_id": site_id, "zone_role": zone_role} for site_id, zone_role in seen.items()]


def _build_effective_site_role_map(permission: Dict[str, Any], zone_site_ids: List[str]) -> Dict[str, str]:
    zone_site_set = set(zone_site_ids)
    if permission.get("all_sites", True):
        accessible_site_ids = list(zone_site_set)
    else:
        accessible_site_ids = [site_id for site_id in permission.get("allowed_site_ids", []) if site_id in zone_site_set]

    role_map = {
        site_id: normalize_zone_role(permission.get("zone_role"))
        for site_id in accessible_site_ids
    }
    for override in permission.get("site_role_overrides", []) or []:
        site_id = override.get("site_id")
        if site_id in role_map:
            role_map[site_id] = normalize_zone_role(override.get("zone_role"))
    return role_map


# ---------------------------------------------------------------------------
# Core CRUD
# ---------------------------------------------------------------------------

async def add_member_permission(
    zone_id: str,
    email: str,
    zone_role: str,
    assigned_by: str,
    has_zone_access: bool = True,
    all_sites: bool = True,
    allowed_site_ids: Optional[List[str]] = None,
    site_role_overrides: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """Add or upsert a member permission for a zone."""
    db = get_database()
    now = datetime.now(timezone.utc)
    doc = {
        "zone_id": zone_id,
        "email": email,
        "zone_role": zone_role,
        "has_zone_access": has_zone_access,
        "all_sites": all_sites,
        "allowed_site_ids": allowed_site_ids or [],
        "site_role_overrides": _normalize_site_role_overrides(site_role_overrides),
        "assigned_by": assigned_by,
        "assigned_at": now,
        "updated_at": now,
    }
    # Upsert: if member already exists in this zone, replace
    result = await db[COLLECTION].find_one_and_update(
        {"zone_id": zone_id, "email": email},
        {"$set": doc},
        upsert=True,
        return_document=True,
    )
    return _serialize(result)


async def get_member_permission(zone_id: str, email: str) -> Optional[Dict[str, Any]]:
    """Get a specific member's permission in a zone."""
    db = get_database()
    doc = await db[COLLECTION].find_one({"zone_id": zone_id, "email": email})
    return _serialize(doc) if doc else None


async def get_zone_members(zone_id: str) -> List[Dict[str, Any]]:
    """Get all members of a zone."""
    db = get_database()
    cursor = db[COLLECTION].find(
        {
            "zone_id": zone_id,
            "$or": [{"has_zone_access": {"$exists": False}}, {"has_zone_access": True}],
        }
    ).sort("assigned_at", -1)
    return [_serialize(doc) async for doc in cursor]


async def get_all_zone_member_permissions(zone_id: str) -> List[Dict[str, Any]]:
    """Get all member permissions of a zone, including site-only hidden members."""
    db = get_database()
    cursor = db[COLLECTION].find({"zone_id": zone_id}).sort("assigned_at", -1)
    return [_serialize(doc) async for doc in cursor]


async def get_zones_for_member(email: str) -> List[Dict[str, Any]]:
    """Get all zone permissions for a member (across all zones)."""
    db = get_database()
    cursor = db[COLLECTION].find({"email": email})
    return [_serialize(doc) async for doc in cursor]


async def get_zone_ids_for_member(email: str, zone_types: Optional[List[str]] = None) -> List[str]:
    """Return visible zone_ids where email has zone-level access."""
    db = get_database()
    cursor = db[COLLECTION].find(
        {
            "email": email,
            "$or": [{"has_zone_access": {"$exists": False}}, {"has_zone_access": True}],
        },
        {"zone_id": 1}
    )
    zone_ids = [doc["zone_id"] async for doc in cursor]
    if not zone_types:
        return zone_ids
    zones = await zones_crud.get_zones_by_ids(zone_ids)
    allowed_types = set(zone_types)
    return [str(zone["_id"]) for zone in zones if zone.get("zone_type") in allowed_types]


async def get_zone_role_for_user(zone_id: str, email: str) -> Optional[str]:
    """Return the highest effective role in the zone for this user."""
    permission = await get_member_permission(zone_id, email)
    if not permission:
        return None
    if permission.get("has_zone_access") is False:
        return None
    zone_doc = await zones_crud.get_zone_by_id(zone_id)
    if not zone_doc:
        return None
    role_map = _build_effective_site_role_map(permission, zone_doc.get("site_ids", []))
    roles = [normalize_zone_role(permission.get("zone_role"))]
    roles.extend(role_map.values())
    return max(roles, key=lambda role: ROLE_PRIORITY.get(role, 0)) if roles else None


# ---------------------------------------------------------------------------
# Update operations
# ---------------------------------------------------------------------------

async def update_member_role(zone_id: str, email: str, zone_role: str) -> bool:
    """Update a member's role in a zone."""
    db = get_database()
    result = await db[COLLECTION].update_one(
        {"zone_id": zone_id, "email": email},
        {"$set": {"zone_role": zone_role, "updated_at": datetime.now(timezone.utc)}}
    )
    return result.modified_count > 0


async def update_member_sites(
    zone_id: str,
    email: str,
    all_sites: bool,
    allowed_site_ids: Optional[List[str]] = None,
    site_role_overrides: Optional[List[Dict[str, Any]]] = None,
) -> bool:
    """Update a member's site-level permission in a zone."""
    db = get_database()
    current = await db[COLLECTION].find_one({"zone_id": zone_id, "email": email})
    normalized_overrides = (
        _normalize_site_role_overrides(site_role_overrides)
        if site_role_overrides is not None
        else (current.get("site_role_overrides", []) if current else [])
    )
    update = {
        "all_sites": all_sites,
        "allowed_site_ids": allowed_site_ids or [],
        "site_role_overrides": normalized_overrides,
        "updated_at": datetime.now(timezone.utc),
    }
    result = await db[COLLECTION].update_one(
        {"zone_id": zone_id, "email": email},
        {"$set": update}
    )
    return result.modified_count > 0


async def find_active_admin_conflicts(
    zone_id: str,
    site_ids: Optional[List[str]] = None,
    all_sites: bool = False,
    exclude_emails: Optional[List[str]] = None,
) -> List[Dict[str, Any]]:
    """Return active admin conflicts for the requested site scope in one zone."""
    zone_doc = await zones_crud.get_zone_by_id(zone_id)
    if not zone_doc:
        return []

    zone_site_ids = list(dict.fromkeys(zone_doc.get("site_ids", [])))
    target_site_ids = zone_site_ids if all_sites else [
        site_id for site_id in list(dict.fromkeys(site_ids or [])) if site_id in set(zone_site_ids)
    ]
    target_site_set = set(target_site_ids)
    if not target_site_set:
        return []

    excluded = {str(email or "").strip().lower() for email in (exclude_emails or []) if email}
    conflicts: List[Dict[str, Any]] = []

    for permission in await get_all_zone_member_permissions(zone_id):
        member_email = str(permission.get("email") or "").strip().lower()
        if not member_email or member_email in excluded:
            continue

        member_user = await get_user_by_email(member_email)
        if not member_user:
            continue
        if normalize_legacy_role(member_user.get("role")) != ROLE_SUB_ADMIN:
            continue
        if not member_user.get("isApproved", False) or member_user.get("is_locked", False):
            continue

        role_map = _build_effective_site_role_map(permission, zone_site_ids)
        admin_site_ids = sorted(site_id for site_id, role in role_map.items() if role == ROLE_SUB_ADMIN)
        overlaps = sorted(target_site_set & set(admin_site_ids))
        if overlaps:
            conflicts.append({"email": member_email, "site_ids": overlaps})

    return conflicts


async def add_site_to_member(zone_id: str, email: str, site_id: str) -> bool:
    """Add a single site to a member's allowed_site_ids (when all_sites=False)."""
    db = get_database()
    result = await db[COLLECTION].update_one(
        {"zone_id": zone_id, "email": email},
        {
            "$addToSet": {"allowed_site_ids": site_id},
            "$set": {"updated_at": datetime.now(timezone.utc)},
        }
    )
    return result.modified_count > 0


async def remove_site_from_member(zone_id: str, email: str, site_id: str) -> bool:
    """Remove a single site from a member's allowed_site_ids."""
    db = get_database()
    result = await db[COLLECTION].update_one(
        {"zone_id": zone_id, "email": email},
        {
            "$pull": {"allowed_site_ids": site_id},
            "$set": {"updated_at": datetime.now(timezone.utc)},
        }
    )
    return result.modified_count > 0


# ---------------------------------------------------------------------------
# Delete operations
# ---------------------------------------------------------------------------

async def remove_member_permission(zone_id: str, email: str) -> bool:
    """Remove a member from a zone entirely."""
    db = get_database()
    result = await db[COLLECTION].delete_one({"zone_id": zone_id, "email": email})
    return result.deleted_count > 0


async def remove_all_zone_permissions(zone_id: str) -> int:
    """Remove ALL member permissions for a zone (used when deleting a zone)."""
    db = get_database()
    result = await db[COLLECTION].delete_many({"zone_id": zone_id})
    return result.deleted_count


# ---------------------------------------------------------------------------
# Bulk cleanup: when a site is removed from a zone
# ---------------------------------------------------------------------------

async def remove_site_from_all_members(zone_id: str, site_id: str) -> int:
    """Remove a site_id from ALL members' allowed_site_ids in a zone.
    
    Called when a site is removed from a zone's site_ids.
    """
    db = get_database()
    result = await db[COLLECTION].update_many(
        {"zone_id": zone_id},
        {
            "$pull": {
                "allowed_site_ids": site_id,
                "site_role_overrides": {"site_id": site_id},
            },
            "$set": {"updated_at": datetime.now(timezone.utc)},
        }
    )
    return result.modified_count


# ---------------------------------------------------------------------------
# Site access resolution
# ---------------------------------------------------------------------------

async def get_effective_site_ids_for_user(email: str, zone_types: Optional[List[str]] = None) -> List[str]:
    """Get ALL site_ids a user can access across ALL their zones.
    
    This is the core permission resolution function.
    For each zone membership:
      - If all_sites=True → include all zone.site_ids
      - If all_sites=False → include intersection of allowed_site_ids & zone.site_ids
    """
    db = get_database()
    permissions = await get_zones_for_member(email)
    if not permissions:
        return []

    effective = set()
    for perm in permissions:
        zone_id = perm["zone_id"]
        zone_doc = await zones_crud.get_zone_by_id(zone_id)
        if not zone_doc:
            continue
        if zone_types and zone_doc.get("zone_type") not in set(zone_types):
            continue

        effective.update(_build_effective_site_role_map(perm, zone_doc.get("site_ids", [])).keys())

    return list(effective)


async def get_effective_site_ids_in_zone(zone_id: str, email: str) -> Optional[List[str]]:
    """Get site_ids a user can access within a specific zone.
    
    Returns None if user is not a member of the zone.
    """
    db = get_database()
    perm = await get_member_permission(zone_id, email)
    if not perm:
        return None

    try:
        zone_doc = await db.zones.find_one({"_id": ObjectId(zone_id)}, {"site_ids": 1})
    except Exception:
        return None
    if not zone_doc:
        return None

    return list(_build_effective_site_role_map(perm, zone_doc.get("site_ids", [])).keys())


async def get_effective_site_roles_in_zone(zone_id: str, email: str) -> Optional[Dict[str, str]]:
    """Return effective role per accessible site for one user in one zone."""
    permission = await get_member_permission(zone_id, email)
    if not permission:
        return None
    zone_doc = await zones_crud.get_zone_by_id(zone_id)
    if not zone_doc:
        return None
    return _build_effective_site_role_map(permission, zone_doc.get("site_ids", []))


async def has_admin_scope(email: str) -> bool:
    """Return True if the user has admin scope in any accessible site of any zone."""
    permissions = await get_zones_for_member(email)
    for permission in permissions:
        zone_doc = await zones_crud.get_zone_by_id(permission["zone_id"])
        if not zone_doc:
            continue
        role_map = _build_effective_site_role_map(permission, zone_doc.get("site_ids", []))
        if any(role == ROLE_SUB_ADMIN for role in role_map.values()):
            return True
        if normalize_zone_role(permission.get("zone_role")) == ROLE_SUB_ADMIN and role_map:
            return True
    return False


async def get_all_member_emails_in_zone(zone_id: str) -> List[str]:
    """Return list of all member emails in a zone."""
    db = get_database()
    cursor = db[COLLECTION].find({"zone_id": zone_id}, {"email": 1})
    return [doc["email"] async for doc in cursor]


# ---------------------------------------------------------------------------
# Index setup (call once at startup)
# ---------------------------------------------------------------------------

async def ensure_indexes():
    """Create indexes for zone_member_permissions collection."""
    db = get_database()
    await db[COLLECTION].create_index(
        [("zone_id", 1), ("email", 1)],
        unique=True,
        name="idx_zone_email_unique"
    )
    await db[COLLECTION].create_index(
        [("email", 1)],
        name="idx_email"
    )
