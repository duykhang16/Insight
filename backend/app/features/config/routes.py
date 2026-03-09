from fastapi import APIRouter, Depends
from typing import Dict, Any
from app.shared.auth_deps import get_current_insight_user, require_master_token
from app.features.config.service import config_service

router = APIRouter(prefix="/api/v1/config", tags=["Config"])


@router.get("/sites/{site_id}")
async def get_site_config(
    site_id: str,
    user: Dict[str, Any] = Depends(get_current_insight_user),
    master_token: str = Depends(require_master_token),
):
    return await config_service.get_site_config(site_id, master_token)


@router.get("/sites/{site_id}/ssids")
async def get_site_ssids(
    site_id: str,
    user: Dict[str, Any] = Depends(get_current_insight_user),
    master_token: str = Depends(require_master_token),
):
    return await config_service.get_site_ssids(site_id, master_token)


@router.get("/sites/{site_id}/overview")
async def get_site_overview(
    site_id: str,
    user: Dict[str, Any] = Depends(get_current_insight_user),
    master_token: str = Depends(require_master_token),
):
    return await config_service.get_site_overview(site_id, master_token)
