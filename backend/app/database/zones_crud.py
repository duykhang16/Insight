"""MongoDB CRUD operations for the zones collection."""
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from bson import ObjectId
from .connection import get_database

VALID_ZONE_ROLES = {"admin", "operator", "viewer"}


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
        "members": [],
    }
    result = await db.zones.insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return doc


async def get_all_zones() -> List[Dict[str, Any]]:
    db = get_database()
    cursor = db.zones.find({}).sort("created_at", -1)
    return [_serialize(z) async for z in cursor]


async def get_zones_for_member(email: str) -> List[Dict[str, Any]]:
    """Return zones where the given email is a member."""
    db = get_database()
    cursor = db.zones.find({"members.email": email}).sort("created_at", -1)
    return [_serialize(z) async for z in cursor]


async def get_zones_for_tenant_admin(email: str) -> List[Dict[str, Any]]:
    """Return zones where email is a member OR the creator (created_by)."""
    db = get_database()
    cursor = db.zones.find({
        "$or": [
            {"members.email": email},
            {"created_by": email},
        ]
    }).sort("created_at", -1)
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


async def add_zone_member(zone_id: str, email: str, zone_role: str, assigned_by: str) -> bool:
    """Add a member to a zone. Upserts if already a member (updates role)."""
    db = get_database()
    now = datetime.now(timezone.utc)
    try:
        # Remove existing entry for this email first (upsert pattern)
        await db.zones.update_one(
            {"_id": ObjectId(zone_id)},
            {"$pull": {"members": {"email": email}}}
        )
        result = await db.zones.update_one(
            {"_id": ObjectId(zone_id)},
            {
                "$push": {"members": {
                    "email": email,
                    "zone_role": zone_role,
                    "assigned_by": assigned_by,
                    "assigned_at": now,
                }},
                "$set": {"updated_at": now},
            }
        )
    except Exception:
        return False
    return result.matched_count > 0


async def update_zone_member_role(zone_id: str, email: str, zone_role: str) -> bool:
    db = get_database()
    try:
        result = await db.zones.update_one(
            {"_id": ObjectId(zone_id), "members.email": email},
            {
                "$set": {
                    "members.$.zone_role": zone_role,
                    "updated_at": datetime.now(timezone.utc),
                }
            }
        )
    except Exception:
        return False
    return result.modified_count > 0


async def remove_zone_member(zone_id: str, email: str) -> bool:
    db = get_database()
    try:
        result = await db.zones.update_one(
            {"_id": ObjectId(zone_id)},
            {
                "$pull": {"members": {"email": email}},
                "$set": {"updated_at": datetime.now(timezone.utc)},
            }
        )
    except Exception:
        return False
    return result.matched_count > 0


async def get_zone_role_for_user(zone_id: str, email: str) -> Optional[str]:
    """Return zone_role for email in the given zone, or None if not a member."""
    db = get_database()
    try:
        doc = await db.zones.find_one(
            {"_id": ObjectId(zone_id), "members.email": email},
            {"members.$": 1}
        )
    except Exception:
        return None
    if not doc or not doc.get("members"):
        return None
    return doc["members"][0].get("zone_role")


async def get_all_member_emails_in_zone(zone_id: str) -> List[str]:
    """Return list of all member emails in a zone (for log filtering)."""
    zone = await get_zone_by_id(zone_id)
    if not zone:
        return []
    return [m["email"] for m in zone.get("members", [])]


async def get_site_ids_for_user_zones(email: str) -> List[str]:
    """Return union of all site_ids across zones where email is a member."""
    zones = await get_zones_for_member(email)
    site_ids: set = set()
    for z in zones:
        site_ids.update(z.get("site_ids", []))
    return list(site_ids)


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
