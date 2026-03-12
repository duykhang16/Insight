from fastapi import APIRouter, HTTPException, Depends
from typing import Dict, Any
from app.shared.auth_deps import get_current_insight_user, require_master_token
from app.features.overview.service import overview_service
from app.shared.aruba import aruba_service

router = APIRouter(prefix="/api/v1/overview", tags=["Overview"])


@router.get("/sites")
async def get_live_sites(
    user: Dict[str, Any] = Depends(get_current_insight_user),
    master_token: str = Depends(require_master_token),
):
    sites = await overview_service.get_live_sites(master_token, user["email"])
    return {"status": "success", "sites": sites}


@router.get("/sites/{site_id}")
async def get_site_detail(
    site_id: str,
    user: Dict[str, Any] = Depends(get_current_insight_user),
    master_token: str = Depends(require_master_token),
):
    """Site detail — BE map, trả schema chuẩn."""
    return await overview_service.get_site_detail(site_id, master_token)


@router.get("/sites/{site_id}/dashboard")
async def get_site_dashboard(
    site_id: str,
    user: Dict[str, Any] = Depends(get_current_insight_user),
    master_token: str = Depends(require_master_token),
):
    """Dashboard metrics — BE map, trả schema flatten."""
    return await overview_service.get_site_dashboard(site_id, master_token)


@router.get("/sites/{site_id}/health")
async def get_site_health(
    site_id: str,
    user: Dict[str, Any] = Depends(get_current_insight_user),
    master_token: str = Depends(require_master_token),
):
    """Health data — BE map, trả currentScore + history."""
    return await overview_service.get_site_health(site_id, master_token)


@router.get("/sites/{site_id}/alerts")
async def get_site_alerts(
    site_id: str,
    user: Dict[str, Any] = Depends(get_current_insight_user),
    master_token: str = Depends(require_master_token),
):
    """Alerts — BE map, trả list chuẩn."""
    return await overview_service.get_site_alerts(site_id, master_token)


@router.get("/sites/{site_id}/clients")
async def get_site_clients(
    site_id: str,
    user: Dict[str, Any] = Depends(get_current_insight_user),
    master_token: str = Depends(require_master_token),
):
    """Clients — BE map, trả flat schema."""
    return await overview_service.get_site_clients(site_id, master_token)


@router.get("/sites/{site_id}/wiredNetworks")
async def get_site_networks(
    site_id: str,
    user: Dict[str, Any] = Depends(get_current_insight_user),
    master_token: str = Depends(require_master_token),
):
    """Networks — BE map, trả wired + wireless rows."""
    return await overview_service.get_site_networks(site_id, master_token)


@router.get("/sites/{site_id}/inventory")
async def get_site_inventory(
    site_id: str,
    user: Dict[str, Any] = Depends(get_current_insight_user),
    master_token: str = Depends(require_master_token),
):
    """Inventory — BE map, trả flat devices."""
    return await overview_service.get_site_inventory(site_id, master_token)


@router.get("/sites/{site_id}/{sub_path:path}")
async def proxy_site_endpoint(
    site_id: str,
    sub_path: str,
    user: Dict[str, Any] = Depends(get_current_insight_user),
    master_token: str = Depends(require_master_token),
):
    """Catch-all proxy cho các sub-endpoint chưa migrate."""
    response = await aruba_service.call_api(
        method="GET",
        endpoint=f"/api/sites/{site_id}/{sub_path}",
        aruba_token=master_token,
    )
    if response.status_code == 401:
        raise HTTPException(status_code=401, detail="Phiên làm việc Aruba đã hết hạn.")
    if response.status_code != 200:
        raise HTTPException(status_code=response.status_code, detail="Aruba API error.")

    return response.json()
