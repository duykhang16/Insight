from fastapi import APIRouter, HTTPException, Depends, Request
from typing import List, Dict, Any
from app.shared.auth_deps import get_current_insight_user
from . import service
from .schemas import TemplateCreateRequest, TemplateUpdateRequest, SiteTemplateAssignRequest, SiteTemplateUnassignRequest

router = APIRouter(prefix="/templates", tags=["templates"])


def _require_admin(user: Dict[str, Any]):
    if user.get("role") not in ["super_admin", "tenant_admin"]:
        raise HTTPException(status_code=403, detail="Only admins can manage templates.")


def _resolve_tenant_owner(user: Dict[str, Any]) -> str:
    """Resolve the tenant_admin email who owns templates.

    - tenant_admin → own email (they own the templates)
    - manager/viewer → parent_admin_id (the tenant_admin who created them)

    This ensures all users under the same tenant share templates.
    """
    role = user.get("role", "")
    if role == "tenant_admin":
        return user["email"]
    # manager/viewer: use parent_admin_id
    parent = user.get("parent_admin_id")
    if parent:
        return parent
    # Fallback: if no parent (shouldn't happen), use own email
    return user["email"]


@router.get("")
async def list_templates(request: Request):
    user = await get_current_insight_user(request)
    role = user.get("role", "")
    if role not in ["super_admin", "tenant_admin", "manager", "viewer"]:
        raise HTTPException(status_code=403, detail="Access denied")
    tenant_owner = _resolve_tenant_owner(user)
    return await service.list_templates(tenant_owner)


@router.post("", status_code=201)
async def create_template(payload: TemplateCreateRequest, request: Request):
    user = await get_current_insight_user(request)
    _require_admin(user)
    tenant_owner = _resolve_tenant_owner(user)
    tpl = await service.create_template(
        owner_id=tenant_owner,
        name=payload.name,
        description=payload.description,
        color=payload.color,
    )
    return {"id": str(tpl["_id"]), "name": tpl["name"], "message": "Template created"}


@router.get("/{template_id}")
async def get_template(template_id: str, request: Request):
    user = await get_current_insight_user(request)
    tenant_owner = _resolve_tenant_owner(user)
    tpl = await service.get_template(template_id, tenant_owner)
    if not tpl:
        raise HTTPException(status_code=404, detail="Template not found")
    return tpl


@router.put("/{template_id}")
async def update_template(template_id: str, payload: TemplateUpdateRequest, request: Request):
    user = await get_current_insight_user(request)
    _require_admin(user)
    tenant_owner = _resolve_tenant_owner(user)
    updates = payload.model_dump(exclude_none=True)
    tpl = await service.update_template(template_id, tenant_owner, updates)
    if not tpl:
        raise HTTPException(status_code=404, detail="Template not found")
    return {"id": tpl["id"], "name": tpl["name"], "message": "Template updated"}


@router.delete("/{template_id}")
async def delete_template(template_id: str, request: Request):
    user = await get_current_insight_user(request)
    _require_admin(user)
    tenant_owner = _resolve_tenant_owner(user)
    ok = await service.delete_template(template_id, tenant_owner)
    if not ok:
        raise HTTPException(status_code=404, detail="Template not found")
    return {"message": "Template deleted"}


@router.post("/assign")
async def assign_site_to_template(payload: SiteTemplateAssignRequest, request: Request):
    user = await get_current_insight_user(request)
    tenant_owner = _resolve_tenant_owner(user)
    try:
        await service.assign_site_to_template(tenant_owner, payload.site_id, payload.template_id)
        return {"message": "Site assigned to template"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/unassign")
async def unassign_site_from_template(payload: SiteTemplateUnassignRequest, request: Request):
    user = await get_current_insight_user(request)
    tenant_owner = _resolve_tenant_owner(user)
    ok = await service.unassign_site_from_template(tenant_owner, payload.site_id)
    if not ok:
        raise HTTPException(status_code=404, detail="No template assignment found for this site")
    return {"message": "Site returned to General"}


@router.get("/mapping/sites")
async def get_site_mapping(request: Request):
    user = await get_current_insight_user(request)
    tenant_owner = _resolve_tenant_owner(user)
    return await service.get_site_template_map(tenant_owner)
