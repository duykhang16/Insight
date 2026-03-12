from fastapi import APIRouter, HTTPException, Depends, Request
from typing import List, Dict, Any
from app.shared.auth_deps import get_current_insight_user
from . import service
from .schemas import TemplateCreateRequest, TemplateUpdateRequest, SiteTemplateAssignRequest

router = APIRouter(prefix="/templates", tags=["templates"])


def _require_admin(user: Dict[str, Any]):
    if user.get("role") not in ["super_admin", "tenant_admin"]:
        raise HTTPException(status_code=403, detail="Chỉ admin mới có thể quản lý template.")


@router.get("")
async def list_templates(request: Request):
    user = await get_current_insight_user(request)
    if user.get("role") not in ["super_admin", "tenant_admin", "manager"]:
        raise HTTPException(status_code=403, detail="Access denied")
    return await service.list_templates(user["email"])


@router.post("", status_code=201)
async def create_template(payload: TemplateCreateRequest, request: Request):
    user = await get_current_insight_user(request)
    _require_admin(user)
    tpl = await service.create_template(
        owner_id=user["email"],
        name=payload.name,
        description=payload.description,
        color=payload.color,
    )
    return {"id": str(tpl["_id"]), "name": tpl["name"], "message": "Template created"}


@router.get("/{template_id}")
async def get_template(template_id: str, request: Request):
    user = await get_current_insight_user(request)
    tpl = await service.get_template(template_id, user["email"])
    if not tpl:
        raise HTTPException(status_code=404, detail="Template not found")
    return tpl


@router.put("/{template_id}")
async def update_template(template_id: str, payload: TemplateUpdateRequest, request: Request):
    user = await get_current_insight_user(request)
    _require_admin(user)
    updates = payload.model_dump(exclude_none=True)
    tpl = await service.update_template(template_id, user["email"], updates)
    if not tpl:
        raise HTTPException(status_code=404, detail="Template not found")
    return {"id": tpl["id"], "name": tpl["name"], "message": "Template updated"}


@router.delete("/{template_id}")
async def delete_template(template_id: str, request: Request):
    user = await get_current_insight_user(request)
    _require_admin(user)
    ok = await service.delete_template(template_id, user["email"])
    if not ok:
        raise HTTPException(status_code=404, detail="Template not found")
    return {"message": "Template deleted"}


@router.post("/assign")
async def assign_site_to_template(payload: SiteTemplateAssignRequest, request: Request):
    user = await get_current_insight_user(request)
    try:
        await service.assign_site_to_template(user["email"], payload.site_id, payload.template_id)
        return {"message": "Site assigned to template"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/mapping/sites")
async def get_site_mapping(request: Request):
    user = await get_current_insight_user(request)
    return await service.get_site_template_map(user["email"])
