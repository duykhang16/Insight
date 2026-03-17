"""Business logic for template management.

Templates are config blueprints (SSIDs, networks, policies, guest portal).
Two creation workflows:
  ① Extract: Read config from a source site via Aruba API → save as template
  ② Create: Manually input config → save as template blueprint

Templates are NOT immediately applied to sites — they stay in DB ready to use.
"""
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone

from app.database import templates_crud as crud
from app.features.config.service import config_service


def _fmt_dt(dt) -> str:
    if dt is None:
        return ""
    if hasattr(dt, "isoformat"):
        return dt.isoformat()
    return str(dt)


def _build_response(doc: Dict[str, Any]) -> Dict[str, Any]:
    """Convert a raw MongoDB template doc to API response format."""
    site_ids = doc.get("site_ids", [])
    return {
        "id": str(doc.get("_id", doc.get("id", ""))),
        "name": doc["name"],
        "description": doc.get("description") or "",
        "color": doc.get("color", "#10B981"),
        "is_default": doc.get("is_default", False),
        "owner_id": doc["owner_id"],
        "zone_id": doc.get("zone_id"),
        "site_ids": site_ids,
        "site_count": len(site_ids),
        "has_config": doc.get("config_data") is not None,
        "source_site_id": doc.get("source_site_id"),
        "config_version": doc.get("config_version", 0),
        "config_updated_at": _fmt_dt(doc.get("config_updated_at")),
        "created_at": _fmt_dt(doc.get("created_at")),
        "updated_at": _fmt_dt(doc.get("updated_at")),
    }


# ── List / Get ──────────────────────────────────────────────────────────────

async def list_templates(owner_id: str) -> List[Dict[str, Any]]:
    """Trả về danh sách templates theo owner (bao gồm General)."""
    # Ensure default template exists
    await crud.ensure_default_template(owner_id)
    docs = await crud.get_templates_by_owner(owner_id)
    return [_build_response(doc) for doc in docs]


async def get_template(template_id: str, owner_id: str) -> Optional[Dict[str, Any]]:
    doc = await crud.get_template_by_id(template_id, owner_id)
    if not doc:
        return None
    return _build_response(doc)


async def get_template_config(template_id: str, owner_id: str) -> Optional[Dict[str, Any]]:
    """Get the config_data of a template."""
    doc = await crud.get_template_by_id(template_id, owner_id)
    if not doc:
        return None
    return {
        "id": str(doc.get("_id", doc.get("id", ""))),
        "name": doc["name"],
        "config_data": doc.get("config_data"),
        "config_version": doc.get("config_version", 0),
        "config_updated_at": _fmt_dt(doc.get("config_updated_at")),
        "source_site_id": doc.get("source_site_id"),
    }


# ── ② Create (manual) ──────────────────────────────────────────────────────

async def create_template(
    owner_id: str,
    name: str,
    description: Optional[str] = None,
    color: str = "#10B981",
    zone_id: Optional[str] = None,
    config_data: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Tạo template — blueprint sẵn sàng trong DB, chưa áp cho site nào."""
    # Check unique name
    existing = await crud.get_template_by_name(name, owner_id)
    if existing:
        raise ValueError(f"Template '{name}' đã tồn tại.")

    doc = await crud.create_template(
        name=name,
        owner_id=owner_id,
        description=description,
        color=color,
        zone_id=zone_id,
        config_data=config_data,
    )
    return _build_response(doc)


# ── ① Extract (from site) ──────────────────────────────────────────────────

async def extract_template(
    owner_id: str,
    source_site_id: str,
    name: str,
    aruba_token: str,
    description: Optional[str] = None,
    color: str = "#10B981",
    zone_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Trích xuất config từ site Aruba → lưu full raw response thành template.

    Gọi Aruba API: networksSummary + guestPortalSettings
    → Lưu TOÀN BỘ response (bao gồm password, advanced settings)
    → Đảm bảo push lại được cho site khác.
    """
    # Check unique name
    existing = await crud.get_template_by_name(name, owner_id)
    if existing:
        raise ValueError(f"Template '{name}' đã tồn tại.")

    # Fetch full raw config from Aruba (giữ nguyên 100%, không clean)
    config_data = await config_service.get_site_config(source_site_id, aruba_token)

    doc = await crud.create_template(
        name=name,
        owner_id=owner_id,
        description=description or f"Trích xuất từ site {source_site_id}",
        color=color,
        zone_id=zone_id,
        config_data=config_data,
        source_site_id=source_site_id,
    )
    return _build_response(doc)


async def get_template_config_for_cloner(template_id: str, owner_id: str) -> Optional[Dict[str, Any]]:
    """Get raw config_data from template — format compatible with Cloner's apply_config_to_site.

    Returns the full config dict {networks: [...], guest_portal: {...}}
    exactly as Aruba API returned it, ready to be pushed.
    """
    doc = await crud.get_template_by_id(template_id, owner_id)
    if not doc:
        return None
    return doc.get("config_data")


# ── Update ──────────────────────────────────────────────────────────────────

async def update_template(
    template_id: str,
    owner_id: str,
    updates: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    """Update template metadata (name, description, color, zone_id)."""
    if "name" in updates:
        existing = await crud.get_template_by_name(updates["name"], owner_id)
        if existing and str(existing["_id"]) != template_id:
            raise ValueError(f"Template '{updates['name']}' đã tồn tại.")

    ok = await crud.update_template(template_id, owner_id, updates)
    if not ok:
        return None
    return await get_template(template_id, owner_id)


async def update_template_config(
    template_id: str,
    owner_id: str,
    config_data: Dict[str, Any],
    source_site_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Update config_data of a template (② manual update or re-extract)."""
    doc = await crud.update_template_config(
        template_id, owner_id, config_data, source_site_id
    )
    if not doc:
        return None
    return _build_response(doc)


async def re_extract_config(
    template_id: str,
    owner_id: str,
    source_site_id: str,
    aruba_token: str,
) -> Optional[Dict[str, Any]]:
    """Re-extract config from a site into an existing template (full raw)."""
    config_data = await config_service.get_site_config(source_site_id, aruba_token)
    return await update_template_config(
        template_id, owner_id, config_data, source_site_id
    )


# ── Delete (disabled by design — templates cannot be deleted) ───────────────
# async def delete_template(...) → intentionally NOT implemented


# ── Site assignment ─────────────────────────────────────────────────────────

async def assign_site_to_template(owner_id: str, site_id: str, template_id: str) -> None:
    """Gán site vào template. 1 site → max 1 template.

    - Removes site from any existing template first
    - Then adds site to the target template
    """
    tpl = await crud.get_template_by_id(template_id, owner_id)
    if not tpl:
        raise ValueError(f"Template '{template_id}' not found or access denied.")

    # Remove from all other templates first
    await crud.remove_site_from_all_templates(owner_id, site_id)
    # Add to target
    await crud.add_site_to_template(template_id, site_id)


async def remove_site_from_template(owner_id: str, site_id: str, template_id: str) -> bool:
    """Remove site from template → site goes back to General."""
    ok = await crud.remove_site_from_template(template_id, site_id)
    if ok:
        # Move to default template
        default = await crud.ensure_default_template(owner_id)
        await crud.add_site_to_template(str(default["_id"]), site_id)
    return ok


async def get_site_template_map(owner_id: str) -> Dict[str, Dict[str, Any]]:
    """Trả về mapping: site_id → {id, name, color, is_default, has_config}."""
    return await crud.get_site_template_map(owner_id)
