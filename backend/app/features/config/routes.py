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


@router.get("/sites/{site_id}/individual/networks")
async def get_individual_networks(
    site_id: str,
    user: Dict[str, Any] = Depends(get_current_insight_user),
    master_token: str = Depends(require_master_token),
):
    return await config_service.get_individual_networks(site_id, master_token)


@router.put("/sites/{site_id}/individual/networks/{network_id}/overview")
async def update_individual_network_overview(
    site_id: str,
    network_id: str,
    payload: Dict[str, Any],
    user: Dict[str, Any] = Depends(get_current_insight_user),
    master_token: str = Depends(require_master_token),
):
    return await config_service.update_individual_network_overview(site_id, network_id, payload, master_token)


@router.delete("/sites/{site_id}/individual/networks/{network_id}")
async def delete_individual_network(
    site_id: str,
    network_id: str,
    user: Dict[str, Any] = Depends(get_current_insight_user),
    master_token: str = Depends(require_master_token),
):
    return await config_service.delete_individual_network(site_id, network_id, master_token)


@router.put("/sites/{site_id}/individual/networks/{network_id}/ip-assignment")
async def update_individual_wireless_ip_assignment(
    site_id: str,
    network_id: str,
    payload: Dict[str, Any],
    user: Dict[str, Any] = Depends(get_current_insight_user),
    master_token: str = Depends(require_master_token),
):
    return await config_service.update_individual_wireless_ip_assignment(site_id, network_id, payload, master_token)


@router.put("/sites/{site_id}/individual/networks/{network_id}/network-assignment")
async def update_individual_wireless_network_assignment(
    site_id: str,
    network_id: str,
    payload: Dict[str, Any],
    user: Dict[str, Any] = Depends(get_current_insight_user),
    master_token: str = Depends(require_master_token),
):
    return await config_service.update_individual_wireless_network_assignment(site_id, network_id, payload, master_token)


@router.put("/sites/{site_id}/individual/networks/{network_id}/access-control")
async def update_individual_network_access_control(
    site_id: str,
    network_id: str,
    payload: Dict[str, Any],
    user: Dict[str, Any] = Depends(get_current_insight_user),
    master_token: str = Depends(require_master_token),
):
    return await config_service.update_individual_network_access_control(site_id, network_id, payload, master_token)


@router.get("/sites/{site_id}/individual/networks/{network_id}/specific-clients")
async def get_individual_wireless_specific_clients(
    site_id: str,
    network_id: str,
    user: Dict[str, Any] = Depends(get_current_insight_user),
    master_token: str = Depends(require_master_token),
):
    return await config_service.get_individual_wireless_specific_clients(site_id, network_id, master_token)


@router.put("/sites/{site_id}/individual/networks/{network_id}/specific-clients/extend")
async def set_individual_wireless_specific_clients_extend(
    site_id: str,
    network_id: str,
    payload: Dict[str, Any],
    user: Dict[str, Any] = Depends(get_current_insight_user),
    master_token: str = Depends(require_master_token),
):
    return await config_service.set_individual_wireless_specific_clients_extend(site_id, network_id, payload, master_token)


@router.post("/sites/{site_id}/individual/networks/{network_id}/specific-clients/add")
async def add_individual_wireless_specific_clients(
    site_id: str,
    network_id: str,
    payload: Dict[str, Any],
    user: Dict[str, Any] = Depends(get_current_insight_user),
    master_token: str = Depends(require_master_token),
):
    return await config_service.add_individual_wireless_specific_clients(site_id, network_id, payload, master_token)
