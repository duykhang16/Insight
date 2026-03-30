"""MongoDB CRUD operations for the zones collection.

Note: Member operations have been moved to member_permissions_crud.py.
This module only handles zone CRUD and site_ids management.
"""
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from bson import ObjectId
from .connection import get_database
from app.shared.rbac import ROLE_BRAND_ADMIN, normalize_legacy_role

ZONE_TYPE_CANONICAL = "canonical"
ZONE_TYPE_WORKSPACE = "workspace"
VALID_ZONE_TYPES = {ZONE_TYPE_CANONICAL, ZONE_TYPE_WORKSPACE}


def _serialize(doc: Dict[str, Any]) -> Dict[str, Any]:
    """Convert ObjectId to string for JSON serialization."""
    if doc and "_id" in doc:
        doc["_id"] = str(doc["_id"])
    return doc


async def _hydrate_zone_defaults(doc: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not doc:
        return None

    updates: Dict[str, Any] = {}
    created_by = (doc.get("created_by") or "").strip().lower()
    creator_user = None

    if not doc.get("brand_admin_email") or not doc.get("zone_type"):
        if created_by:
            from .auth_crud import get_user_by_email
            creator_user = await get_user_by_email(created_by)

    if not doc.get("brand_admin_email"):
        if creator_user:
            creator_role = normalize_legacy_role(creator_user.get("role"))
            if creator_role == ROLE_BRAND_ADMIN:
                updates["brand_admin_email"] = creator_user["email"]
            else:
                updates["brand_admin_email"] = creator_user.get("brand_admin_email") or creator_user["email"]
        else:
            updates["brand_admin_email"] = created_by or None

    if doc.get("zone_type") != ZONE_TYPE_CANONICAL:
        updates["zone_type"] = ZONE_TYPE_CANONICAL

    if updates:
        db = get_database()
        await db.zones.update_one({"_id": doc["_id"]}, {"$set": updates})
        doc = {**doc, **updates}

    return _serialize(doc)


async def _serialize_many(cursor) -> List[Dict[str, Any]]:
    docs: List[Dict[str, Any]] = []
    async for doc in cursor:
        hydrated = await _hydrate_zone_defaults(doc)
        if hydrated:
            docs.append(hydrated)
    return docs


async def create_zone(
    name: str,
    created_by: str,
    brand_admin_email: str,
    zone_type: str,
    description: Optional[str] = None,
    color: str = "#3B82F6",
) -> Dict[str, Any]:
    db = get_database()
    now = datetime.now(timezone.utc)
    doc = {
        "name": name,
        "description": description,
        "color": color,
        "created_by": created_by,
        "brand_admin_email": (brand_admin_email or created_by).strip().lower(),
        "zone_type": ZONE_TYPE_CANONICAL,
        "created_at": now,
        "updated_at": now,
        "site_ids": [],
    }
    result = await db.zones.insert_one(doc)
    doc["_id"] = result.inserted_id
    return await _hydrate_zone_defaults(doc)


async def get_all_zones() -> List[Dict[str, Any]]:
    db = get_database()
    cursor = db.zones.find({}).sort("created_at", -1)
    return await _serialize_many(cursor)


async def get_all_zones_by_owner(owner_email: str) -> List[Dict[str, Any]]:
    """Return zones directly created by the given user."""
    db = get_database()
    cursor = db.zones.find({"created_by": owner_email}).sort("created_at", -1)
    return await _serialize_many(cursor)


async def get_brand_zones(
    brand_admin_email: str,
    zone_type: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Return zones within a brand scope."""
    db = get_database()
    query: Dict[str, Any] = {"brand_admin_email": (brand_admin_email or "").strip().lower()}
    cursor = db.zones.find(query).sort("created_at", -1)
    return await _serialize_many(cursor)


async def get_zones_by_ids(zone_ids: List[str]) -> List[Dict[str, Any]]:
    """Return zones matching the given IDs."""
    db = get_database()
    object_ids = []
    for zid in zone_ids:
        try:
            object_ids.append(ObjectId(zid))
        except Exception:
            pass
    if not object_ids:
        return []
    cursor = db.zones.find({"_id": {"$in": object_ids}}).sort("created_at", -1)
    return await _serialize_many(cursor)


async def get_zones_for_creator(email: str) -> List[Dict[str, Any]]:
    """Return zones created by this email."""
    db = get_database()
    cursor = db.zones.find({"created_by": email}).sort("created_at", -1)
    return await _serialize_many(cursor)


async def get_zone_by_id(zone_id: str) -> Optional[Dict[str, Any]]:
    db = get_database()
    try:
        doc = await db.zones.find_one({"_id": ObjectId(zone_id)})
    except Exception:
        return None
    return await _hydrate_zone_defaults(doc)


async def get_zone_by_name(name: str) -> Optional[Dict[str, Any]]:
    db = get_database()
    doc = await db.zones.find_one({"name": name})
    return await _hydrate_zone_defaults(doc)


async def find_zone_by_name_in_scope(
    name: str,
    brand_admin_email: str,
    zone_type: str,
    created_by: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    db = get_database()
    query: Dict[str, Any] = {
        "name": name,
        "brand_admin_email": (brand_admin_email or "").strip().lower(),
        "zone_type": ZONE_TYPE_CANONICAL,
    }
    doc = await db.zones.find_one(query)
    return await _hydrate_zone_defaults(doc)


async def update_zone(zone_id: str, updates: Dict[str, Any]) -> bool:
    db = get_database()
    updates["updated_at"] = datetime.now(timezone.utc)
    try:
        result = await db.zones.update_one(
            {"_id": ObjectId(zone_id)},
            {"$set": updates}
        )
    except Exception:
        return False
    return result.modified_count > 0


async def delete_zone(zone_id: str) -> bool:
    """Delete a zone document. Caller should also clean up zone_member_permissions."""
    db = get_database()
    try:
        result = await db.zones.delete_one({"_id": ObjectId(zone_id)})
    except Exception:
        return False
    return result.deleted_count > 0


async def set_zone_sites(zone_id: str, site_ids: List[str]) -> bool:
    """Replace the entire site list for a zone (used by drag-drop)."""
    db = get_database()
    try:
        result = await db.zones.update_one(
            {"_id": ObjectId(zone_id)},
            {"$set": {"site_ids": site_ids, "updated_at": datetime.now(timezone.utc)}}
        )
    except Exception:
        return False
    return result.matched_count > 0


async def remove_sites_from_zone(zone_id: str, site_ids: List[str]) -> bool:
    """Remove multiple site IDs from a zone's site list."""
    if not site_ids:
        return True
    db = get_database()
    try:
        result = await db.zones.update_one(
            {"_id": ObjectId(zone_id)},
            {
                "$pull": {"site_ids": {"$in": site_ids}},
                "$set": {"updated_at": datetime.now(timezone.utc)},
            }
        )
    except Exception:
        return False
    return result.matched_count > 0


async def add_sites_to_zone(zone_id: str, site_ids: List[str]) -> bool:
    """Add multiple site IDs to a zone's site_ids list without duplicates."""
    db = get_database()
    try:
        result = await db.zones.update_one(
            {"_id": ObjectId(zone_id)},
            {
                "$addToSet": {"site_ids": {"$each": site_ids}},
                "$set": {"updated_at": datetime.now(timezone.utc)}
            }
        )
    except Exception:
        return False
    return result.matched_count > 0


async def remove_site_from_zone(zone_id: str, site_id: str) -> bool:
    """Remove a single site from a zone's site_ids."""
    db = get_database()
    try:
        result = await db.zones.update_one(
            {"_id": ObjectId(zone_id)},
            {
                "$pull": {"site_ids": site_id},
                "$set": {"updated_at": datetime.now(timezone.utc)},
            }
        )
    except Exception:
        return False
    return result.modified_count > 0


async def get_site_ids_for_zones(zone_ids: List[str]) -> List[str]:
    """Return union of all site_ids across the specified zones."""
    db = get_database()
    object_ids = []
    for zid in zone_ids:
        try:
            object_ids.append(ObjectId(zid))
        except Exception:
            pass
    if not object_ids:
        return []
    
    cursor = db.zones.find({"_id": {"$in": object_ids}}, {"site_ids": 1})
    site_ids = set()
    async for doc in cursor:
        site_ids.update(doc.get("site_ids", []))
    return list(site_ids)
