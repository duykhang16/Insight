"""Template management API routes.

Workflows:
  ① POST /templates/extract  — Trích xuất config từ site Aruba → tạo template
  ② POST /templates          — Tạo template thủ công (có hoặc không config_data)

Additional:
  GET    /templates                       — List all templates (bao gồm General)
  GET    /templates/{id}                  — Chi tiết template
  GET    /templates/{id}/config           — Lấy config_data của template
  PUT    /templates/{id}                  — Update metadata (name, color, ...)
  PUT    /templates/{id}/config           — Update config_data
  PUT    /templates/{id}/re-extract       — Re-extract config từ site
  POST   /templates/assign               — Gán site → template
  POST   /templates/remove-site          — Gỡ site khỏi template → về General
  GET    /templates/mapping/sites         — Map site_id → template info
"""
from fastapi import APIRouter, HTTPException, Depends, Request
from typing import List, Dict, Any
from app.shared.auth_deps import get_current_insight_user, require_master_token
from . import service
from .schemas import (
    TemplateCreateRequest,
    TemplateUpdateRequest,
    TemplateConfigUpdateRequest,
    TemplateExtractRequest,
    SiteTemplateAssignRequest,
    SiteTemplateRemoveRequest,
)

router = APIRouter(prefix="/templates", tags=["templates"])


def _require_admin(user: Dict[str, Any]):
    if user.get("role") not in ["super_admin", "tenant_admin"]:
        raise HTTPException(status_code=403, detail="Chỉ admin mới có thể quản lý template.")


# ── List / Get ──────────────────────────────────────────────────────────────

@router.get("")
async def list_templates(request: Request):
    user = await get_current_insight_user(request)
    return await service.list_templates(user["email"])


@router.get("/mapping/sites")
async def get_site_mapping(request: Request):
    user = await get_current_insight_user(request)
    return await service.get_site_template_map(user["email"])


@router.get("/{template_id}")
async def get_template(template_id: str, request: Request):
    user = await get_current_insight_user(request)
    tpl = await service.get_template(template_id, user["email"])
    if not tpl:
        raise HTTPException(status_code=404, detail="Template not found")
    return tpl


@router.get("/{template_id}/config")
async def get_template_config(template_id: str, request: Request):
    """Lấy config_data chi tiết của template."""
    user = await get_current_insight_user(request)
    result = await service.get_template_config(template_id, user["email"])
    if not result:
        raise HTTPException(status_code=404, detail="Template not found")
    return result


# ── ② Create (manual) ──────────────────────────────────────────────────────

@router.post("", status_code=201)
async def create_template(payload: TemplateCreateRequest, request: Request):
    """Tạo template mới — blueprint sẵn sàng trong DB, chưa áp cho site nào."""
    user = await get_current_insight_user(request)
    _require_admin(user)
    try:
        tpl = await service.create_template(
            owner_id=user["email"],
            name=payload.name,
            description=payload.description,
            color=payload.color,
            zone_id=payload.zone_id,
            config_data=payload.config_data,
        )
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    return tpl


# ── ① Extract (from site) ──────────────────────────────────────────────────

@router.post("/extract", status_code=201)
async def extract_template(
    payload: TemplateExtractRequest,
    request: Request,
    master_token: str = Depends(require_master_token),
):
    """Trích xuất config từ site Aruba → tạo template mới."""
    user = await get_current_insight_user(request)
    _require_admin(user)
    try:
        tpl = await service.extract_template(
            owner_id=user["email"],
            source_site_id=payload.source_site_id,
            name=payload.name,
            aruba_token=master_token,
            description=payload.description,
            color=payload.color,
            zone_id=payload.zone_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    return tpl


# ── Update ──────────────────────────────────────────────────────────────────

@router.put("/{template_id}")
async def update_template(template_id: str, payload: TemplateUpdateRequest, request: Request):
    user = await get_current_insight_user(request)
    _require_admin(user)
    updates = payload.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="Không có trường nào để cập nhật.")
    try:
        tpl = await service.update_template(template_id, user["email"], updates)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    if not tpl:
        raise HTTPException(status_code=404, detail="Template not found")
    return tpl


@router.put("/{template_id}/config")
async def update_template_config(
    template_id: str,
    payload: TemplateConfigUpdateRequest,
    request: Request,
):
    """Update config_data trực tiếp (workflow ② update)."""
    user = await get_current_insight_user(request)
    _require_admin(user)
    tpl = await service.update_template_config(
        template_id, user["email"], payload.config_data
    )
    if not tpl:
        raise HTTPException(status_code=404, detail="Template not found")
    return tpl


@router.put("/{template_id}/re-extract")
async def re_extract_config(
    template_id: str,
    request: Request,
    source_site_id: str,
    master_token: str = Depends(require_master_token),
):
    """Re-extract config từ site Aruba vào template đã tồn tại."""
    user = await get_current_insight_user(request)
    _require_admin(user)
    tpl = await service.re_extract_config(
        template_id, user["email"], source_site_id, master_token
    )
    if not tpl:
        raise HTTPException(status_code=404, detail="Template not found")
    return tpl


# ── Delete ────────────────────────────────────────────────────────────────

@router.delete("/{template_id}")
async def delete_template(template_id: str, request: Request):
    """Delete a template. All its sites are moved back to General."""
    user = await get_current_insight_user(request)
    try:
        result = await service.delete_template(template_id, user["email"])
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── Site assignment ────────────────────────────────────────────────────────

@router.post("/assign")
async def assign_site_to_template(payload: SiteTemplateAssignRequest, request: Request):
    user = await get_current_insight_user(request)
    try:
        await service.assign_site_to_template(user["email"], payload.site_id, payload.template_id)
        return {"message": "Site assigned to template"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/remove-site")
async def remove_site_from_template(payload: SiteTemplateRemoveRequest, request: Request):
    """Gỡ site khỏi template → site tự động về General."""
    user = await get_current_insight_user(request)
    ok = await service.remove_site_from_template(user["email"], payload.site_id, payload.template_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Template not found or site not assigned")
    return {"message": "Site removed from template → moved to General"}
