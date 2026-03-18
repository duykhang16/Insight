from typing import List, Dict, Any, Optional
from datetime import datetime, timezone
from bson import ObjectId
from app.database.connection import get_database


async def list_templates(owner_id: str) -> List[Dict[str, Any]]:
    """Return list of templates (empty labels) for an owner."""
    db = get_database()
    cursor = db.templates.find({"owner_id": owner_id}).sort("created_at", -1)
    templates = []
    async for doc in cursor:
        templates.append({
            "id": str(doc["_id"]),
            "name": doc["name"],
            "description": doc.get("description") or "",
            "color": doc.get("color", "#10B981"),
            "owner_id": doc["owner_id"],
            "created_at": doc["created_at"].isoformat() if doc.get("created_at") else None,
            "updated_at": doc["updated_at"].isoformat() if doc.get("updated_at") else None,
        })
    return templates


async def create_template(owner_id: str, name: str, description: str = None, color: str = "#10B981") -> Dict[str, Any]:
    """Create an empty template — stores name, color, and owner only."""
    db = get_database()
    now = datetime.now(timezone.utc)
    doc = {
        "name": name,
        "description": description or "",
        "color": color,
        "owner_id": owner_id,
        "created_at": now,
        "updated_at": now,
    }
    res = await db.templates.insert_one(doc)
    doc["_id"] = str(res.inserted_id)
    return doc


async def get_template(template_id: str, owner_id: str) -> Optional[Dict[str, Any]]:
    db = get_database()
    try:
        doc = await db.templates.find_one({"_id": ObjectId(template_id), "owner_id": owner_id})
        if doc:
            doc["id"] = str(doc.pop("_id"))
        return doc
    except Exception:
        return None


async def update_template(template_id: str, owner_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    db = get_database()
    updates["updated_at"] = datetime.now(timezone.utc)
    try:
        res = await db.templates.find_one_and_update(
            {"_id": ObjectId(template_id), "owner_id": owner_id},
            {"$set": updates},
            return_document=True
        )
        if res:
            res["id"] = str(res.pop("_id"))
        return res
    except Exception:
        return None


async def delete_template(template_id: str, owner_id: str) -> bool:
    db = get_database()
    try:
        res = await db.templates.delete_one({"_id": ObjectId(template_id), "owner_id": owner_id})
        if res.deleted_count > 0:
            # Also delete site → template links
            await db.site_template_links.delete_many({"template_id": template_id})
            return True
        return False
    except Exception:
        return False


async def assign_site_to_template(owner_id: str, site_id: str, template_id: str) -> None:
    """Assign site_id to a template. Called after Full Clone succeeds."""
    db = get_database()
    # Check template exists and belongs to owner
    try:
        tpl = await db.templates.find_one({"_id": ObjectId(template_id), "owner_id": owner_id})
    except Exception:
        tpl = None
    if not tpl:
        raise ValueError(f"Template '{template_id}' not found or access denied.")

    await db.site_template_links.update_one(
        {"site_id": site_id, "owner_id": owner_id},
        {"$set": {
            "template_id": template_id,
            "template_name": tpl["name"],      # Store name for quick display, no join needed
            "template_color": tpl.get("color", "#10B981"),
            "assigned_at": datetime.now(timezone.utc)
        }},
        upsert=True
    )


async def get_site_template_map(owner_id: str) -> Dict[str, Dict[str, Any]]:
    """
    Return mapping: site_id → { id, name, color }
    Called by overview service to attach badges to each site.
    """
    db = get_database()
    cursor = db.site_template_links.find({"owner_id": owner_id})
    result: Dict[str, Dict[str, Any]] = {}
    async for link in cursor:
        result[link["site_id"]] = {
            "id": link["template_id"],
            "name": link.get("template_name", "Unknown"),
            "color": link.get("template_color", "#10B981"),
        }
    return result


async def unassign_site_from_template(owner_id: str, site_id: str) -> bool:
    """Remove template assignment from a site (return to General)."""
    db = get_database()
    res = await db.site_template_links.delete_one({
        "site_id": site_id,
        "owner_id": owner_id,
    })
    return res.deleted_count > 0
