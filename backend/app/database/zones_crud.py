"""MongoDB CRUD operations for the zones collection.

Note: Member operations have been moved to member_permissions_crud.py.
This module only handles zone CRUD and site_ids management.
"""
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from bson import ObjectId
from .connection import get_database


def _serialize(doc: Dict[str, Any]) -> Dict[str, Any]:
    """Convert ObjectId to string for JSON serialization."""
    if doc and "_id" in doc:
        doc["_id"] = str(doc["_id"])
    return doc


async def create_zone(name: str, created_by: str, description: Optional[str] = None, color: str = "#3B82F6") -> Dict[str, Any]:
    db = get_database()
    now = datetime.now(timezone.utc)
    doc = {
        "name": name,
        "description": description,
        "color": color,
        "created_by": created_by,
        "created_at": now,
        "updated_at": now,
        "site_ids": [],
    }
    result = await db.zones.insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return doc


async def get_all_zones() -> List[Dict[str, Any]]:
    db = get_database()
    cursor = db.zones.find({}).sort("created_at", -1)
    return [_serialize(z) async for z in cursor]


async def get_all_zones_by_owner(admin_email: str) -> List[Dict[str, Any]]:
    """Return all zones owned by a specific tenant admin (for tenant isolation)."""
    db = get_database()
    cursor = db.zones.find({"created_by": admin_email}).sort("created_at", -1)
    return [_serialize(z) async for z in cursor]


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
    return [_serialize(z) async for z in cursor]


async def get_zones_for_creator(email: str) -> List[Dict[str, Any]]:
    """Return zones created by this email."""
    db = get_database()
    cursor = db.zones.find({"created_by": email}).sort("created_at", -1)
    return [_serialize(z) async for z in cursor]


async def get_zone_by_id(zone_id: str) -> Optional[Dict[str, Any]]:
    db = get_database()
    try:
        doc = await db.zones.find_one({"_id": ObjectId(zone_id)})
    except Exception:
        return None
    return _serialize(doc) if doc else None


async def get_zone_by_name(name: str) -> Optional[Dict[str, Any]]:
    db = get_database()
    doc = await db.zones.find_one({"name": name})
    return _serialize(doc) if doc else None


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
