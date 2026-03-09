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
    response = await aruba_service.call_api(
        method="GET",
        endpoint=f"/api/sites/{site_id}",
        aruba_token=master_token,
    )
    if response.status_code == 401:
        raise HTTPException(status_code=401, detail="Phiên làm việc Aruba đã hết hạn.")
    if response.status_code != 200:
        raise HTTPException(status_code=response.status_code, detail="Aruba API error.")

    return response.json()


@router.get("/sites/{site_id}/{sub_path:path}")
async def proxy_site_endpoint(
    site_id: str,
    sub_path: str,
    user: Dict[str, Any] = Depends(get_current_insight_user),
    master_token: str = Depends(require_master_token),
):
    """Generic proxy for any Aruba site sub-endpoint using master token."""
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
