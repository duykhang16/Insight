"""MongoDB CRUD operations for the zone_member_permissions collection.

Each document represents one member's permission within one zone,
including their role and site-level access control.

Schema:
  zone_id:          str (ref to zones._id as string)
  email:            str
  zone_role:        str ("manager" | "viewer")
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

COLLECTION = "zone_member_permissions"


def _serialize(doc: Dict[str, Any]) -> Dict[str, Any]:
    """Convert ObjectId to string for JSON serialization."""
    if doc and "_id" in doc:
        doc["_id"] = str(doc["_id"])
    return doc


# ---------------------------------------------------------------------------
# Core CRUD
# ---------------------------------------------------------------------------

async def add_member_permission(
    zone_id: str,
    email: str,
    zone_role: str,
    assigned_by: str,
    all_sites: bool = True,
    allowed_site_ids: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Add or upsert a member permission for a zone."""
    db = get_database()
    now = datetime.now(timezone.utc)
    doc = {
        "zone_id": zone_id,
        "email": email,
        "zone_role": zone_role,
        "all_sites": all_sites,
        "allowed_site_ids": allowed_site_ids or [],
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
    cursor = db[COLLECTION].find({"zone_id": zone_id}).sort("assigned_at", -1)
    return [_serialize(doc) async for doc in cursor]


async def get_zones_for_member(email: str) -> List[Dict[str, Any]]:
    """Get all zone permissions for a member (across all zones)."""
    db = get_database()
    cursor = db[COLLECTION].find({"email": email})
    return [_serialize(doc) async for doc in cursor]


async def get_zone_ids_for_member(email: str) -> List[str]:
    """Return list of zone_ids where email has any permission."""
    db = get_database()
    cursor = db[COLLECTION].find({"email": email}, {"zone_id": 1})
    return [doc["zone_id"] async for doc in cursor]


async def get_zone_role_for_user(zone_id: str, email: str) -> Optional[str]:
    """Return zone_role for email in the given zone, or None if not a member."""
    db = get_database()
    doc = await db[COLLECTION].find_one(
        {"zone_id": zone_id, "email": email},
        {"zone_role": 1}
    )
    return doc["zone_role"] if doc else None


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
) -> bool:
    """Update a member's site-level permission in a zone."""
    db = get_database()
    update = {
        "all_sites": all_sites,
        "allowed_site_ids": allowed_site_ids or [],
        "updated_at": datetime.now(timezone.utc),
    }
    result = await db[COLLECTION].update_one(
        {"zone_id": zone_id, "email": email},
        {"$set": update}
    )
    return result.modified_count > 0


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
            "$pull": {"allowed_site_ids": site_id},
            "$set": {"updated_at": datetime.now(timezone.utc)},
        }
    )
    return result.modified_count


# ---------------------------------------------------------------------------
# Site access resolution
# ---------------------------------------------------------------------------

async def get_effective_site_ids_for_user(email: str) -> List[str]:
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
        try:
            zone_doc = await db.zones.find_one({"_id": ObjectId(zone_id)}, {"site_ids": 1})
        except Exception:
            continue
        if not zone_doc:
            continue

        zone_site_ids = set(zone_doc.get("site_ids", []))

        if perm.get("all_sites", True):
            effective.update(zone_site_ids)
        else:
            allowed = set(perm.get("allowed_site_ids", []))
            effective.update(allowed & zone_site_ids)

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

    zone_site_ids = set(zone_doc.get("site_ids", []))

    if perm.get("all_sites", True):
        return list(zone_site_ids)
    else:
        allowed = set(perm.get("allowed_site_ids", []))
        return list(allowed & zone_site_ids)


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
