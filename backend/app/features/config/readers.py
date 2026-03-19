"""
Config feature readers — fetch and read network data from Aruba API.
"""
import asyncio
from typing import Any, Dict, List, Optional

from fastapi import HTTPException
from app.shared.aruba import aruba_service
from app.features.config.constants import (
    NETS_ENDPOINTS,
    GUEST_ENDPOINT,
    WIRED_NETWORKS_ENDPOINT,
)
from app.features.config.normalizers import (
    normalize_allow_list,
    normalize_individual_wireless_network,
    normalize_individual_wired_network,
    find_wireless_network_in_wired_response,
)


async def get_networks_summary_response(
    site_id: str,
    aruba_token: str,
) -> Dict[str, Any]:
    nets_response = None
    for endpoint_tpl in NETS_ENDPOINTS:
        endpoint = endpoint_tpl.format(site_id=site_id)
        nets_response = await aruba_service.call_api(
            method="GET",
            endpoint=endpoint,
            aruba_token=aruba_token,
        )
        if nets_response.status_code == 200:
            break
        if nets_response.status_code in (401, 403):
            raise HTTPException(
                status_code=401,
                detail="Phiên làm việc Aruba đã hết hạn. Vui lòng làm mới token."
            )

    if nets_response is None or nets_response.status_code != 200:
        status = nets_response.status_code if nets_response else "N/A"
        raise HTTPException(
            status_code=502,
            detail=f"Không thể lấy cấu hình mạng từ Aruba (status {status})."
        )

    try:
        raw = nets_response.json()
        return raw if isinstance(raw, dict) else {"elements": raw}
    except Exception as exc:
        print(f"[CONFIG] Lỗi parse networksSummary: {exc}")
        raise HTTPException(status_code=502, detail="Lỗi parse dữ liệu mạng từ Aruba.")


async def get_wired_networks_response(
    site_id: str,
    aruba_token: str,
) -> Dict[str, Any]:
    response = await aruba_service.call_api(
        method="GET",
        endpoint=WIRED_NETWORKS_ENDPOINT.format(site_id=site_id),
        aruba_token=aruba_token,
    )
    if response.status_code in (401, 403):
        raise HTTPException(
            status_code=401,
            detail="Phiên làm việc Aruba đã hết hạn. Vui lòng làm mới token."
        )
    if response.status_code != 200:
        raise HTTPException(
            status_code=502,
            detail=f"Không thể lấy wired networks từ Aruba (status {response.status_code})."
        )
    try:
        return response.json()
    except Exception as exc:
        print(f"[CONFIG] Lỗi parse wiredNetworks: {exc}")
        raise HTTPException(status_code=502, detail="Lỗi parse dữ liệu wired networks từ Aruba.")


async def get_site_config(
    site_id: str,
    aruba_token: str,
) -> Dict[str, Any]:
    raw = await get_networks_summary_response(site_id, aruba_token)

    guest_portal: Optional[Dict] = None
    try:
        guest_response = await aruba_service.call_api(
            method="GET",
            endpoint=GUEST_ENDPOINT.format(site_id=site_id),
            aruba_token=aruba_token,
        )
        if guest_response.status_code == 200:
            guest_portal = guest_response.json()
    except Exception as exc:
        print(f"[CONFIG] Không lấy được guestPortalSettings: {exc}")

    wired_networks = None
    try:
        wired_response = await aruba_service.call_api(
            method="GET",
            endpoint=WIRED_NETWORKS_ENDPOINT.format(site_id=site_id),
            aruba_token=aruba_token,
        )
        if wired_response.status_code == 200:
            wired_networks = wired_response.json()
    except Exception as exc:
        print(f"[CONFIG] Không lấy được wiredNetworks: {exc}")

    try:
        raw_networks: list = (
            raw if isinstance(raw, list)
            else raw.get("elements", [])
        )
    except Exception as exc:
        print(f"[CONFIG] Lỗi parse networksSummary: {exc}")
        raise HTTPException(status_code=502, detail="Lỗi parse dữ liệu mạng từ Aruba.")

    networks: List[Dict[str, Any]] = []
    for net in raw_networks:
        if not isinstance(net, dict):
            continue

        normalised = dict(net)
        normalised.setdefault("id",         net.get("networkId"))
        normalised.setdefault("name",       net.get("networkName", "Unnamed"))
        normalised.setdefault("type",       net.get("type", ""))
        normalised.setdefault("vlanId",     net.get("vlanId"))
        normalised.setdefault("isEnabled",  net.get("isEnabled", True))
        normalised.setdefault("isWireless", net.get("isWireless", False))

        networks.append(normalised)

    return {
        "networks":        networks,
        "guest_portal":    guest_portal,
        "wired_networks":  wired_networks,
    }


async def get_site_ssids(
    site_id: str,
    aruba_token: str,
) -> List[Dict[str, Any]]:
    config = await get_site_config(site_id, aruba_token)
    ssids: List[Dict[str, Any]] = []
    for net in config["networks"]:
        if not net.get("isWireless"):
            continue
        ssids.append({
            "networkId":             net.get("networkId") or net.get("id"),
            "networkName":           net.get("networkName", "Unnamed SSID"),
            "security":              net.get("security", "UNKNOWN"),
            "isGuestPortalEnabled":  net.get("isGuestPortalEnabled", False),
        })
    return ssids


async def get_site_overview(
    site_id: str,
    aruba_token: str,
) -> Dict[str, Any]:
    config = await get_site_config(site_id, aruba_token)
    overview: List[Dict[str, Any]] = [
        {
            "id":         net.get("networkId") or net.get("id"),
            "name":       net.get("networkName", "Unnamed"),
            "type":       net.get("type", ""),
            "vlanId":     net.get("vlanId"),
            "isEnabled":  net.get("isEnabled", True),
            "isWireless": net.get("isWireless", False),
        }
        for net in config["networks"]
        if isinstance(net, dict)
    ]
    return {"status": "success", "networks": overview}


async def get_individual_networks(
    site_id: str,
    aruba_token: str,
) -> Dict[str, Any]:
    site_config, wired_response = await asyncio.gather(
        get_site_config(site_id, aruba_token),
        get_wired_networks_response(site_id, aruba_token),
    )

    allow_list_map: Dict[str, Dict[str, Any]] = {}
    for wired_network in wired_response.get("elements", []):
        if not isinstance(wired_network, dict):
            continue
        for wireless_network in wired_network.get("wirelessNetworks", []) or []:
            if not isinstance(wireless_network, dict):
                continue
            wireless_network_id = str(wireless_network.get("id") or wireless_network.get("networkId") or "")
            if not wireless_network_id:
                continue
            allow_list_map[wireless_network_id] = wireless_network.get("allowList")

    wireless_networks = [
        normalize_individual_wireless_network(
            network,
            allow_list=allow_list_map.get(str(network.get("networkId") or network.get("id") or "")),
        )
        for network in site_config["networks"]
        if isinstance(network, dict) and network.get("isWireless")
    ]

    wired_networks = [
        normalize_individual_wired_network(network)
        for network in wired_response.get("elements", [])
        if isinstance(network, dict)
    ]

    networks = sorted(
        wireless_networks + wired_networks,
        key=lambda network: str(network.get("displayName", "")).lower(),
    )

    return {
        "status": "success",
        "siteId": site_id,
        "networks": networks,
    }
