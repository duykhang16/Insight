from fastapi import APIRouter, HTTPException, Body, Request, Depends
from typing import List, Dict, Any
from app.shared.auth_deps import get_current_insight_user, require_master_token
from app.features.cloner.service import (
    get_live_account_sites,
    fetch_site_config_live,
    fetch_site_config,
    apply_config_to_site,
    apply_config_live,
    get_site_ssids,
    sync_ssids_passwords,
    sync_ssids_create
)
from app.features.cloner import service as cloner_service
from pydantic import BaseModel, Field

class BatchDeleteRequest(BaseModel):
    target_zone_ids: List[str] = Field(default_factory=list)
    target_site_ids: List[str] = Field(default_factory=list)

class BatchProvisionRequest(BaseModel):
    source_site_id: str
    clone_count: int
    prefix: str
    regulatory_domain: str
    timezone_iana: str
    configured_location: dict
    target_zone_ids: List[str] = Field(default_factory=list)

router = APIRouter(prefix="/api/v1/cloner", tags=["Site Cloner"])


async def _get_zone_filtered_sites(email: str, all_sites: List[Dict]) -> List[Dict]:
    from app.database.zones_crud import get_site_ids_for_user_zones
    allowed_site_ids = await get_site_ids_for_user_zones(email)
    if not allowed_site_ids:
        return []
    allowed_set = set(allowed_site_ids)
    return [s for s in all_sites if s.get("siteId") in allowed_set]


def _require_manager_or_higher(user: Dict[str, Any]):
    """Block viewer from write operations (Full Clone, Smart Sync).

    Allowed roles: super_admin, tenant_admin, manager.
    Raises 403 for viewer.
    """
    role = user.get("role", "")
    if role == "viewer":
        raise HTTPException(
            status_code=403,
            detail="Viewer không có quyền thực hiện thao tác cấu hình. Yêu cầu quyền Manager trở lên."
        )


async def _require_zone_admin_or_higher(user: Dict[str, Any]):
    """Block manager/viewer from destructive batch operations unless they are zone admin.

    Passes for: super_admin, tenant_admin, or manager/viewer with zone_role='admin'.
    Raises 403 for manager/viewer without any zone admin assignment.
    """
    role = user.get("role", "")
    if role in ("super_admin", "tenant_admin"):
        return
    from app.database.zones_crud import get_zones_for_member
    zones = await get_zones_for_member(user["email"])
    is_zone_admin = any(
        m.get("zone_role") == "admin"
        for z in zones
        for m in z.get("members", [])
        if m.get("email") == user["email"]
    )
    if not is_zone_admin:
        raise HTTPException(
            status_code=403,
            detail="Thao tác này yêu cầu quyền Zone Admin trở lên."
        )


@router.get("/live-sites")
async def list_live_sites(
    user: Dict[str, Any] = Depends(get_current_insight_user),
    master_token: str = Depends(require_master_token),
):
    from app.shared.auth_deps import is_admin_role
    all_sites = await get_live_account_sites(master_token)
    if not is_admin_role(user):
        all_sites = await _get_zone_filtered_sites(user["email"], all_sites)
    return all_sites


@router.get("/target-sites")
async def list_target_sites(
    user: Dict[str, Any] = Depends(get_current_insight_user),
    master_token: str = Depends(require_master_token),
):
    from app.shared.auth_deps import is_admin_role
    all_sites = await get_live_account_sites(master_token)
    if not is_admin_role(user):
        all_sites = await _get_zone_filtered_sites(user["email"], all_sites)
    return all_sites


@router.post("/preview")
async def preview_clone(
    site_id: str = Body(..., embed=True),
    source: str = Body("captured", embed=True),
    user: Dict[str, Any] = Depends(get_current_insight_user),
    master_token: str = Depends(require_master_token),
):
    if source == "live":
        config = await fetch_site_config_live(site_id, master_token)
    else:
        config = await fetch_site_config(site_id)

    if not config or "error" in config:
        raise HTTPException(status_code=404, detail=config.get("error") if config else "Source config not found")

    ops = await apply_config_to_site("preview-only", config)
    return {"site_id": site_id, "source": source, "operations": ops}


@router.post("/apply")
async def execute_clone(
    target_site_ids: List[str] = Body(None),
    target_site_id: str = Body(None),
    operations: List[Dict[str, Any]] = Body(...),
    user: Dict[str, Any] = Depends(get_current_insight_user),
    master_token: str = Depends(require_master_token),
):
    _require_manager_or_higher(user)
    import asyncio
    site_ids = target_site_ids or ([target_site_id] if target_site_id else [])
    if not site_ids:
        raise HTTPException(status_code=400, detail="No target site IDs provided.")

    execution_results = []
    for sid in site_ids:
        res = await apply_config_live(sid, operations, master_token)
        execution_results.append(res)
        await asyncio.sleep(2.0)

    batch_report = {sid: result for sid, result in zip(site_ids, execution_results)}
    return {"status": "success", "results": batch_report}


@router.get("/sites/{site_id}/ssids")
async def fetch_site_ssids_api(
    site_id: str,
    user: Dict[str, Any] = Depends(get_current_insight_user),
    master_token: str = Depends(require_master_token),
):
    return await get_site_ssids(site_id, master_token)


@router.post("/sync-password")
async def execute_password_sync(
    source_network_name: str = Body(...),
    new_password: str = Body(...),
    target_zone_ids: List[str] = Body([]),
    target_site_ids: List[str] = Body([]),
    user: Dict[str, Any] = Depends(get_current_insight_user),
    master_token: str = Depends(require_master_token),
):
    _require_manager_or_higher(user)
    if not target_zone_ids and not target_site_ids:
        raise HTTPException(status_code=400, detail="No target zones or sites provided.")
        
    from app.features.zones.service import resolve_sites_from_groups
    resolved_sites = await resolve_sites_from_groups(target_zone_ids) if target_zone_ids else []
    
    final_site_ids = list(set(resolved_sites + target_site_ids))
    if not final_site_ids:
        raise HTTPException(status_code=400, detail="Resolved 0 sites from the provided inputs.")
        
    results = await sync_ssids_passwords(source_network_name, new_password, final_site_ids, master_token)
    return {"status": "success", "results": results}


@router.post("/sync-config")
async def execute_config_sync(
    source_site_id: str = Body(...),
    source_network_name: str = Body(...),
    target_zone_ids: List[str] = Body([]),
    target_site_ids: List[str] = Body([]),
    user: Dict[str, Any] = Depends(get_current_insight_user),
    master_token: str = Depends(require_master_token),
):
    _require_manager_or_higher(user)
    if not target_zone_ids and not target_site_ids:
        raise HTTPException(status_code=400, detail="No target zones or sites provided.")
        
    from app.features.zones.service import resolve_sites_from_groups
    resolved_sites = await resolve_sites_from_groups(target_zone_ids) if target_zone_ids else []
    
    final_site_ids = list(set(resolved_sites + target_site_ids))
    if not final_site_ids:
        raise HTTPException(status_code=400, detail="Resolved 0 sites from the provided inputs.")
        
    results = await cloner_service.sync_ssids_config(source_site_id, source_network_name, final_site_ids, master_token)
    return {"status": "success", "results": results}


@router.post("/sync-delete")
async def execute_delete_sync(
    source_network_name: str = Body(...),
    target_zone_ids: List[str] = Body([]),
    target_site_ids: List[str] = Body([]),
    user: Dict[str, Any] = Depends(get_current_insight_user),
    master_token: str = Depends(require_master_token),
):
    _require_manager_or_higher(user)
    if not target_zone_ids and not target_site_ids:
        raise HTTPException(status_code=400, detail="No target zones or sites provided.")
        
    from app.features.zones.service import resolve_sites_from_groups
    resolved_sites = await resolve_sites_from_groups(target_zone_ids) if target_zone_ids else []
    
    final_site_ids = list(set(resolved_sites + target_site_ids))
    if not final_site_ids:
        raise HTTPException(status_code=400, detail="Resolved 0 sites from the provided inputs.")
        
    results = await cloner_service.sync_ssids_delete(source_network_name, final_site_ids, master_token)
    return {"status": "success", "results": results}


@router.post("/sync-create")
async def execute_create_sync(
    network_name: str = Body(...),
    network_type: str = Body(...),
    security: str = Body(...),
    password: str = Body(""),
    is_hidden: bool = Body(False),
    is_wifi6_enabled: bool = Body(True),
    band_24: bool = Body(True),
    band_5: bool = Body(True),
    band_6: bool = Body(True),
    client_isolation: bool = Body(False),
    vlan_id: int = Body(None),
    target_zone_ids: List[str] = Body([]),
    target_site_ids: List[str] = Body([]),
    user: Dict[str, Any] = Depends(get_current_insight_user),
    master_token: str = Depends(require_master_token),
):
    _require_manager_or_higher(user)
    if not target_zone_ids and not target_site_ids:
        raise HTTPException(status_code=400, detail="No target zones or sites provided.")
    
    from app.features.zones.service import resolve_sites_from_groups
    resolved_sites = await resolve_sites_from_groups(target_zone_ids) if target_zone_ids else []
    
    final_site_ids = list(set(resolved_sites + target_site_ids))
    if not final_site_ids:
        raise HTTPException(status_code=400, detail="Resolved 0 sites from the provided inputs.")

    advanced_options = {
        "is_hidden": is_hidden,
        "is_wifi6_enabled": is_wifi6_enabled,
        "band_24": band_24,
        "band_5": band_5,
        "band_6": band_6,
        "client_isolation": client_isolation,
        "vlan_id": vlan_id,
    }
    results = await cloner_service.sync_ssids_create(
        network_name, network_type, security, password, advanced_options, final_site_ids, master_token
    )
    return {"status": "success", "results": results}


@router.get("/site-overview/{site_id}")
async def get_site_overview(
    site_id: str,
    user: Dict[str, Any] = Depends(get_current_insight_user),
    master_token: str = Depends(require_master_token),
):
    try:
        config = await cloner_service.fetch_site_config_live(site_id, master_token)
        if "error" in config:
            raise HTTPException(status_code=400, detail=config["error"])

        networks = config.get("networks", [])
        if isinstance(networks, dict):
            networks = networks.get("elements", [])

        network_details = [
            {
                "id": net.get("id"),
                "name": net.get("networkName", "Unnamed Network"),
                "type": net.get("type", "UNKNOWN"),
                "isWireless": net.get("isWireless", False),
                "vlanId": net.get("vlanId"),
                "isEnabled": net.get("isEnabled", True),
            }
            for net in networks
        ]
        return {"status": "success", "networks": network_details}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/batch-account-access/precheck")
async def execute_batch_admin_precheck(
    email: str = Body(...),
    target_zone_ids: List[str] = Body([]),
    target_site_ids: List[str] = Body([]),
    user: Dict[str, Any] = Depends(get_current_insight_user),
    master_token: str = Depends(require_master_token),
):
    if not target_zone_ids and not target_site_ids:
        raise HTTPException(status_code=400, detail="No target zones or sites provided.")
    
    from app.features.zones.service import resolve_sites_from_groups
    resolved_sites = await resolve_sites_from_groups(target_zone_ids) if target_zone_ids else []
    
    final_site_ids = list(set(resolved_sites + target_site_ids))
    if not final_site_ids:
        raise HTTPException(status_code=400, detail="Resolved 0 sites.")

    existing_sites = await cloner_service.batch_account_precheck(email, final_site_ids, master_token)
    return {"status": "success", "existing_sites": existing_sites}


@router.post("/batch-account-access")
async def execute_batch_admin_access(
    action_type: str = Body(...), # "add" or "remove"
    email: str = Body(...),
    roleOnSite: str = Body(None),
    target_zone_ids: List[str] = Body([]),
    target_site_ids: List[str] = Body([]),
    exclude_site_ids: List[str] = Body([]),
    user: Dict[str, Any] = Depends(get_current_insight_user),
    master_token: str = Depends(require_master_token),
):
    await _require_zone_admin_or_higher(user)
    if not target_zone_ids and not target_site_ids:
        raise HTTPException(status_code=400, detail="No target zones or sites provided.")
    
    from app.features.zones.service import resolve_sites_from_groups
    resolved_sites = await resolve_sites_from_groups(target_zone_ids) if target_zone_ids else []
    
    # Merge and deduplicate
    final_site_ids = list(set(resolved_sites + target_site_ids))
    
    if exclude_site_ids:
        final_site_ids = [s for s in final_site_ids if s not in exclude_site_ids]
    
    if not final_site_ids:
        raise HTTPException(status_code=400, detail="Resolved 0 sites after exclusion.")

    results = await cloner_service.batch_account_access(action_type, email, roleOnSite, final_site_ids, master_token, actor_email=user["email"])
    return {"status": "success", "results": results}

@router.post("/batch-site-delete")
async def execute_batch_site_delete(
    payload: BatchDeleteRequest,
    user: Dict[str, Any] = Depends(get_current_insight_user),
    master_token: str = Depends(require_master_token),
):
    await _require_zone_admin_or_higher(user)
    target_zone_ids = payload.target_zone_ids
    target_site_ids = payload.target_site_ids
    if not target_zone_ids and not target_site_ids:
        raise HTTPException(status_code=400, detail="No target zones or sites provided.")
    
    from app.features.zones.service import resolve_sites_from_groups
    resolved_sites = await resolve_sites_from_groups(target_zone_ids) if target_zone_ids else []
    
    # Merge and deduplicate
    final_site_ids = list(set(resolved_sites + target_site_ids))
    
    if not final_site_ids:
        raise HTTPException(status_code=400, detail="Resolved 0 sites from the provided inputs.")

    results = await cloner_service.batch_site_delete(final_site_ids, master_token, actor_email=user["email"])
    return {"status": "success", "results": results}

@router.post("/batch-site-provision")
async def execute_batch_provision_sites(
    payload: BatchProvisionRequest,
    user: Dict[str, Any] = Depends(get_current_insight_user),
    master_token: str = Depends(require_master_token),
):
    await _require_zone_admin_or_higher(user)
    if payload.clone_count < 1 or payload.clone_count > 50:
        raise HTTPException(status_code=400, detail="Clone count must be between 1 and 50.")
        
    results = await cloner_service.batch_site_provision(
        source_site_id=payload.source_site_id,
        clone_count=payload.clone_count,
        prefix=payload.prefix,
        regulatory_domain=payload.regulatory_domain,
        timezone_iana=payload.timezone_iana,
        configured_location=payload.configured_location,
        target_zone_ids=payload.target_zone_ids,
        master_token=master_token,
        actor_email=user["email"]
    )
    return {"status": "success", "results": results}

