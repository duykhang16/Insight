"""MongoDB CRUD operations for the templates collection.

Template stores network config blueprints (SSIDs, VLANs, policies).
Every site must belong to exactly 1 template.
Default "General" template has config_data=None.
"""
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from bson import ObjectId
from .connection import get_database

COLLECTION = "templates"


def _serialize(doc: Dict[str, Any]) -> Dict[str, Any]:
    """Convert ObjectId to string for JSON serialization."""
    if doc and "_id" in doc:
        doc["_id"] = str(doc["_id"])
    return doc


# ---------------------------------------------------------------------------
# Core CRUD
# ---------------------------------------------------------------------------

async def create_template(
    name: str,
    owner_id: str,
    description: Optional[str] = None,
    color: str = "#10B981",
    is_default: bool = False,
    zone_id: Optional[str] = None,
    config_data: Optional[Dict[str, Any]] = None,
    source_site_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Create a new template document."""
    db = get_database()
    now = datetime.now(timezone.utc)
    doc = {
        "name": name,
        "description": description or "",
        "color": color,
        "is_default": is_default,
        "owner_id": owner_id,
        "zone_id": zone_id,
        "site_ids": [],
        "config_data": config_data,
        "source_site_id": source_site_id,
        "config_version": 1 if config_data else 0,
        "config_updated_at": now if config_data else None,
        "created_at": now,
        "updated_at": now,
    }
    result = await db[COLLECTION].insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return doc


async def get_template_by_id(template_id: str, owner_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Get a template by ID, optionally filtered by owner."""
    db = get_database()
    query: Dict[str, Any] = {}
    try:
        query["_id"] = ObjectId(template_id)
    except Exception:
        return None
    if owner_id:
        query["owner_id"] = owner_id
    doc = await db[COLLECTION].find_one(query)
    return _serialize(doc) if doc else None


async def get_templates_by_owner(owner_id: str) -> List[Dict[str, Any]]:
    """List all templates for an owner, sorted by created_at desc."""
    db = get_database()
    cursor = db[COLLECTION].find({"owner_id": owner_id}).sort("created_at", -1)
    return [_serialize(doc) async for doc in cursor]


async def get_default_template(owner_id: str) -> Optional[Dict[str, Any]]:
    """Get the default (General) template for an owner."""
    db = get_database()
    doc = await db[COLLECTION].find_one({"owner_id": owner_id, "is_default": True})
    return _serialize(doc) if doc else None


async def get_template_by_name(name: str, owner_id: str) -> Optional[Dict[str, Any]]:
    """Find template by name within an owner's scope."""
    db = get_database()
    doc = await db[COLLECTION].find_one({"name": name, "owner_id": owner_id})
    return _serialize(doc) if doc else None


# ---------------------------------------------------------------------------
# Update operations
# ---------------------------------------------------------------------------

async def update_template(template_id: str, owner_id: str, updates: Dict[str, Any]) -> bool:
    """Update template metadata (name, description, color, zone_id)."""
    db = get_database()
    updates["updated_at"] = datetime.now(timezone.utc)
    try:
        result = await db[COLLECTION].update_one(
            {"_id": ObjectId(template_id), "owner_id": owner_id},
            {"$set": updates}
        )
    except Exception:
        return False
    return result.matched_count > 0


async def update_template_config(
    template_id: str,
    owner_id: str,
    config_data: Dict[str, Any],
    source_site_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Update template config_data and increment version."""
    db = get_database()
    now = datetime.now(timezone.utc)
    try:
        result = await db[COLLECTION].find_one_and_update(
            {"_id": ObjectId(template_id), "owner_id": owner_id},
            {
                "$set": {
                    "config_data": config_data,
                    "source_site_id": source_site_id,
                    "config_updated_at": now,
                    "updated_at": now,
                },
                "$inc": {"config_version": 1},
            },
            return_document=True,
        )
    except Exception:
        return None
    return _serialize(result) if result else None


# ---------------------------------------------------------------------------
# Site assignment
# ---------------------------------------------------------------------------

async def add_site_to_template(template_id: str, site_id: str) -> bool:
    """Add a site to a template's site_ids (idempotent)."""
    db = get_database()
    try:
        result = await db[COLLECTION].update_one(
            {"_id": ObjectId(template_id)},
            {
                "$addToSet": {"site_ids": site_id},
                "$set": {"updated_at": datetime.now(timezone.utc)},
            }
        )
    except Exception:
        return False
    return result.matched_count > 0


async def remove_site_from_template(template_id: str, site_id: str) -> bool:
    """Remove a site from a template's site_ids."""
    db = get_database()
    try:
        result = await db[COLLECTION].update_one(
            {"_id": ObjectId(template_id)},
            {
                "$pull": {"site_ids": site_id},
                "$set": {"updated_at": datetime.now(timezone.utc)},
            }
        )
    except Exception:
        return False
    return result.modified_count > 0


async def remove_site_from_all_templates(owner_id: str, site_id: str) -> int:
    """Remove a site from ALL templates of an owner (before re-assigning)."""
    db = get_database()
    result = await db[COLLECTION].update_many(
        {"owner_id": owner_id, "site_ids": site_id},
        {
            "$pull": {"site_ids": site_id},
            "$set": {"updated_at": datetime.now(timezone.utc)},
        }
    )
    return result.modified_count


async def set_template_sites(template_id: str, site_ids: List[str]) -> bool:
    """Replace the entire site list for a template."""
    db = get_database()
    try:
        result = await db[COLLECTION].update_one(
            {"_id": ObjectId(template_id)},
            {"$set": {"site_ids": site_ids, "updated_at": datetime.now(timezone.utc)}}
        )
    except Exception:
        return False
    return result.matched_count > 0


async def delete_template(template_id: str, owner_id: str) -> Optional[Dict[str, Any]]:
    """Delete a template. Refuses to delete the default (General) template.
    Returns the deleted doc (including site_ids) so the caller can reassign sites.
    """
    db = get_database()
    try:
        oid = ObjectId(template_id)
    except Exception:
        return None
    doc = await db[COLLECTION].find_one({"_id": oid, "owner_id": owner_id})
    if not doc:
        return None
    if doc.get("is_default"):
        return None  # never delete General
    await db[COLLECTION].delete_one({"_id": oid})
    return _serialize(doc)


# ---------------------------------------------------------------------------
# Site→Template mapping
# ---------------------------------------------------------------------------

async def get_site_template_map(owner_id: str) -> Dict[str, Dict[str, Any]]:
    """Return mapping: site_id → {id, name, color, is_default, has_config}."""
    db = get_database()
    cursor = db[COLLECTION].find({"owner_id": owner_id})
    result: Dict[str, Dict[str, Any]] = {}
    async for tpl in cursor:
        tpl_info = {
            "id": str(tpl["_id"]),
            "name": tpl.get("name", "Unknown"),
            "color": tpl.get("color", "#10B981"),
            "is_default": tpl.get("is_default", False),
            "has_config": tpl.get("config_data") is not None,
        }
        for site_id in tpl.get("site_ids", []):
            result[site_id] = tpl_info
    return result


# ---------------------------------------------------------------------------
# Default template management
# ---------------------------------------------------------------------------

async def ensure_default_template(owner_id: str) -> Dict[str, Any]:
    """Get or create the default 'General' template for an owner."""
    existing = await get_default_template(owner_id)
    if existing:
        return existing
    return await create_template(
        name="General",
        owner_id=owner_id,
        description="Template mặc định — site chưa được phân loại",
        color="#6B7280",
        is_default=True,
    )


# ---------------------------------------------------------------------------
# Index setup
# ---------------------------------------------------------------------------

async def ensure_indexes():
    """Create indexes for templates collection."""
    db = get_database()
    await db[COLLECTION].create_index(
        [("owner_id", 1), ("name", 1)],
        unique=True,
        name="idx_owner_name_unique"
    )
    await db[COLLECTION].create_index(
        [("owner_id", 1), ("is_default", 1)],
        name="idx_owner_default"
    )
