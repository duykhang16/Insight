"""
Config feature writers — update, delete, and modify network configurations via Aruba API.
"""
import asyncio
from typing import Any, Dict, List

from fastapi import HTTPException
from app.shared.aruba import aruba_service
from app.features.config.constants import (
    SUPPORTED_NETMASKS,
    NETWORK_UPDATE_ENDPOINT,
    EXTEND_ALLOW_LIST_ENDPOINT,
    WIRED_NETWORK_DELETE_ENDPOINT,
    WIRED_NETWORK_UPDATE_ENDPOINT,
    NETWORK_OVERVIEW_REFERER,
    WIRED_NETWORK_DETAIL_REFERER,
)
from app.features.config.normalizers import (
    normalize_allow_list,
    normalize_allowed_destinations,
    normalize_individual_wireless_network,
    normalize_individual_wired_network,
    find_wireless_network_in_wired_response,
)
from app.features.config.validators import (
    is_valid_ipv4_address,
    sanitize_network_update_payload,
    build_access_point_update_payload,
    build_wired_network_update_payload,
)
from app.features.config.readers import (
    get_networks_summary_response,
    get_wired_networks_response,
    get_individual_networks,
)


async def _build_updated_wired_network_response(
    site_id: str,
    network_id: str,
    vlan_id: Any,
    response_payload: Dict[str, Any],
    aruba_token: str,
) -> Dict[str, Any]:
    wired_response = await get_wired_networks_response(site_id, aruba_token)
    response_id = str(response_payload.get("id") or "").strip()
    response_vlan_id = response_payload.get("vlanId", vlan_id)

    wired_network = next(
        (
            network
            for network in wired_response.get("elements", [])
            if isinstance(network, dict)
            and (
                (response_id and str(network.get("id") or network.get("networkId") or "") == response_id)
                or str(network.get("id") or network.get("networkId") or "") == str(network_id)
                or str(network.get("vlanId") or "") == str(response_vlan_id)
            )
        ),
        None,
    )
    return normalize_individual_wired_network(
        wired_network if isinstance(wired_network, dict) else response_payload
    )


async def _build_updated_wireless_network_response(
    site_id: str,
    network_id: str,
    response_payload: Dict[str, Any],
    aruba_token: str,
) -> Dict[str, Any]:
    wired_response = await get_wired_networks_response(site_id, aruba_token)
    wireless_network = find_wireless_network_in_wired_response(wired_response, network_id)
    response_allow_list = response_payload.get("allowList") if isinstance(response_payload.get("allowList"), dict) else None
    wired_allow_list = wireless_network.get("allowList") if isinstance(wireless_network, dict) else None
    merged_allow_list = None
    if isinstance(wired_allow_list, dict) or isinstance(response_allow_list, dict):
        merged_allow_list = {
            **(wired_allow_list if isinstance(wired_allow_list, dict) else {}),
            **(response_allow_list if isinstance(response_allow_list, dict) else {}),
        }
    return normalize_individual_wireless_network(
        response_payload,
        allow_list=merged_allow_list,
    )


async def update_individual_network_overview(
    site_id: str,
    network_id: str,
    updates: Dict[str, Any],
    aruba_token: str,
) -> Dict[str, Any]:
    individual = await get_individual_networks(site_id, aruba_token)
    target_network = next(
        (
            network
            for network in individual.get("networks", [])
            if str(network.get("id") or "") == str(network_id)
        ),
        None,
    )
    if not target_network:
        raise HTTPException(status_code=404, detail="Network not found.")

    if target_network.get("networkKind") == "wired":
        return await update_individual_wired_overview(site_id, network_id, updates, aruba_token)
    return await update_individual_wireless_overview(site_id, network_id, updates, aruba_token)


async def update_individual_network_access_control(
    site_id: str,
    network_id: str,
    updates: Dict[str, Any],
    aruba_token: str,
) -> Dict[str, Any]:
    individual = await get_individual_networks(site_id, aruba_token)
    target_network = next(
        (
            network
            for network in individual.get("networks", [])
            if str(network.get("id") or "") == str(network_id)
        ),
        None,
    )
    if not target_network:
        raise HTTPException(status_code=404, detail="Network not found.")

    if target_network.get("networkKind") == "wired":
        return await update_individual_wired_access_control(site_id, network_id, updates, aruba_token)
    return await update_individual_wireless_access_control(site_id, network_id, updates, aruba_token)


async def update_individual_wireless_overview(
    site_id: str,
    network_id: str,
    updates: Dict[str, Any],
    aruba_token: str,
) -> Dict[str, Any]:
    raw_networks = await get_networks_summary_response(site_id, aruba_token)
    networks = raw_networks.get("elements", [])

    target_network = next(
        (
            network
            for network in networks
            if isinstance(network, dict)
            and network.get("isWireless")
            and str(network.get("networkId") or network.get("id") or "") == str(network_id)
        ),
        None,
    )
    if not target_network:
        raise HTTPException(status_code=404, detail="Wireless network not found.")

    network_name = str(updates.get("networkName") or "").strip()
    if not network_name:
        raise HTTPException(status_code=400, detail="Network name is required.")

    pre_shared_key = str(updates.get("preSharedKey") or "")
    if len(pre_shared_key) < 8:
        raise HTTPException(status_code=400, detail="PSK password must be at least 8 characters.")

    authentication = str(updates.get("authentication") or target_network.get("authentication") or "psk").lower()
    security = str(updates.get("security") or target_network.get("security") or "wpa3").lower()
    if authentication not in {"psk", "eap"}:
        raise HTTPException(status_code=400, detail="Unsupported authentication mode.")
    if security not in {"wpa2", "wpa3"}:
        raise HTTPException(status_code=400, detail="Unsupported security protocol.")

    update_payload = sanitize_network_update_payload(target_network)
    update_payload.update({
        "networkName": network_name,
        "isEnabled": bool(updates.get("isEnabled", target_network.get("isEnabled", True))),
        "isSsidHidden": bool(updates.get("isSsidHidden", target_network.get("isSsidHidden", False))),
        "authentication": authentication,
        "security": security,
        "preSharedKey": pre_shared_key,
    })

    response = await aruba_service.call_api(
        method="PUT",
        endpoint=NETWORK_UPDATE_ENDPOINT.format(site_id=site_id, network_id=network_id),
        aruba_token=aruba_token,
        json_data=update_payload,
        headers={
            "Referer": NETWORK_OVERVIEW_REFERER.format(site_id=site_id),
        },
    )
    if response.status_code in (401, 403):
        raise HTTPException(
            status_code=401,
            detail="Phiên làm việc Aruba đã hết hạn. Vui lòng làm mới token."
        )
    if response.status_code not in (200, 204):
        raise HTTPException(
            status_code=502,
            detail=f"Không thể cập nhật wireless overview trên Aruba (status {response.status_code})."
        )

    try:
        response_payload = response.json() if response.status_code != 204 else update_payload
    except Exception:
        response_payload = update_payload

    return {
        "status": "success",
        "message": "Wireless overview updated successfully.",
        "network": await _build_updated_wireless_network_response(
            site_id, network_id, response_payload, aruba_token,
        ),
    }


async def update_individual_wired_overview(
    site_id: str,
    network_id: str,
    updates: Dict[str, Any],
    aruba_token: str,
) -> Dict[str, Any]:
    wired_response = await get_wired_networks_response(site_id, aruba_token)
    target_network = next(
        (
            network
            for network in wired_response.get("elements", [])
            if isinstance(network, dict)
            and str(network.get("id") or network.get("networkId") or network.get("vlanId") or "") == str(network_id)
        ),
        None,
    )
    if not target_network:
        raise HTTPException(status_code=404, detail="Wired network not found.")

    wired_network_name = str(
        updates.get("wiredNetworkName")
        or updates.get("networkName")
        or ""
    ).strip()
    if not wired_network_name:
        raise HTTPException(status_code=400, detail="Network name is required.")

    raw_vlan_id = updates.get("vlanId", target_network.get("vlanId"))
    try:
        vlan_id = int(str(raw_vlan_id).strip())
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="VLAN must be a valid integer.")
    if vlan_id < 1 or vlan_id > 4094:
        raise HTTPException(status_code=400, detail="VLAN must be between 1 and 4094.")

    update_payload = build_wired_network_update_payload(target_network)
    update_payload.update({
        "wiredNetworkName": wired_network_name,
        "isEnabled": bool(updates.get("isEnabled", target_network.get("isEnabled", True))),
        "vlanId": vlan_id,
        "isIgmpSnoopingEnabled": bool(updates.get("isIgmpSnoopingEnabled", target_network.get("isIgmpSnoopingEnabled", False))),
        "shouldApplyNetworkSecurityProtections": bool(
            updates.get(
                "shouldApplyNetworkSecurityProtections",
                updates.get("isDhcpArpProtectionEnabled", target_network.get("shouldApplyNetworkSecurityProtections", False)),
            )
        ),
    })

    current_wired_network_id = target_network.get("id") or target_network.get("networkId") or network_id
    if current_wired_network_id in (None, ""):
        raise HTTPException(status_code=400, detail="Wired network id is missing.")

    response = await aruba_service.call_api(
        method="PUT",
        endpoint=WIRED_NETWORK_UPDATE_ENDPOINT.format(site_id=site_id, vlan_id=current_wired_network_id),
        aruba_token=aruba_token,
        json_data=update_payload,
        headers={
            "Origin": "https://portal.instant-on.hpe.com",
            "Referer": WIRED_NETWORK_DETAIL_REFERER.format(
                site_id=site_id,
                network_id=current_wired_network_id,
            ),
        },
    )
    if response.status_code in (401, 403):
        raise HTTPException(
            status_code=401,
            detail="Phiên làm việc Aruba đã hết hạn. Vui lòng làm mới token."
    )
    if response.status_code not in (200, 204):
        try:
            response_text = response.text
        except Exception:
            response_text = ""
        print(
            "[CONFIG] Aruba rejected wired overview update:",
            {
                "site_id": site_id,
                "network_id": network_id,
                "endpoint_wired_network_id": current_wired_network_id,
                "status": response.status_code,
                "payload": update_payload,
                "response": response_text[:1000],
            },
        )
        raise HTTPException(
            status_code=502,
            detail=f"Không thể cập nhật wired overview trên Aruba (status {response.status_code})."
        )

    try:
        response_payload = response.json() if response.status_code != 204 else update_payload
    except Exception:
        response_payload = update_payload

    return {
        "status": "success",
        "message": "Wired overview updated successfully.",
        "network": await _build_updated_wired_network_response(
            site_id, network_id, vlan_id, response_payload, aruba_token,
        ),
    }


async def update_individual_wired_access_control(
    site_id: str,
    network_id: str,
    updates: Dict[str, Any],
    aruba_token: str,
) -> Dict[str, Any]:
    wired_response = await get_wired_networks_response(site_id, aruba_token)
    target_network = next(
        (
            network
            for network in wired_response.get("elements", [])
            if isinstance(network, dict)
            and str(network.get("id") or network.get("networkId") or network.get("vlanId") or "") == str(network_id)
        ),
        None,
    )
    if not target_network:
        raise HTTPException(status_code=404, detail="Wired network not found.")

    is_access_restricted = bool(updates.get("isAccessRestricted", target_network.get("isAccessRestricted", False)))
    allowed_destinations = normalize_allowed_destinations(updates.get("allowedDestinations"))

    if is_access_restricted:
        if not allowed_destinations:
            raise HTTPException(status_code=400, detail="At least one allowed destination is required.")
        invalid_destinations = [
            destination for destination in allowed_destinations
            if not is_valid_ipv4_address(destination)
        ]
        if invalid_destinations:
            raise HTTPException(status_code=400, detail="Allowed destinations must be valid IPv4 addresses.")
    else:
        allowed_destinations = []

    update_payload = build_wired_network_update_payload(target_network)
    update_payload.update({
        "isAccessRestricted": is_access_restricted,
        "isInternetAllowed": True,
        "isIntraSubnetTrafficAllowed": False,
        "isSpecificDestinationsAllowed": is_access_restricted,
        "allowedDestinations": allowed_destinations,
    })

    current_wired_network_id = target_network.get("id") or target_network.get("networkId") or network_id
    if current_wired_network_id in (None, ""):
        raise HTTPException(status_code=400, detail="Wired network id is missing.")

    response = await aruba_service.call_api(
        method="PUT",
        endpoint=WIRED_NETWORK_UPDATE_ENDPOINT.format(site_id=site_id, vlan_id=current_wired_network_id),
        aruba_token=aruba_token,
        json_data=update_payload,
        headers={
            "Origin": "https://portal.instant-on.hpe.com",
            "Referer": WIRED_NETWORK_DETAIL_REFERER.format(
                site_id=site_id,
                network_id=current_wired_network_id,
            ),
        },
    )
    if response.status_code in (401, 403):
        raise HTTPException(
            status_code=401,
            detail="Phiên làm việc Aruba đã hết hạn. Vui lòng làm mới token."
        )
    if response.status_code not in (200, 204):
        raise HTTPException(
            status_code=502,
            detail=f"Không thể cập nhật wired access control trên Aruba (status {response.status_code})."
        )

    try:
        response_payload = response.json() if response.status_code != 204 else update_payload
    except Exception:
        response_payload = update_payload

    return {
        "status": "success",
        "message": "Wired access control updated successfully.",
        "network": await _build_updated_wired_network_response(
            site_id, network_id, target_network.get("vlanId"), response_payload, aruba_token,
        ),
    }


async def delete_individual_network(
    site_id: str,
    network_id: str,
    aruba_token: str,
) -> Dict[str, Any]:
    individual = await get_individual_networks(site_id, aruba_token)
    target_network = next(
        (
            network
            for network in individual.get("networks", [])
            if str(network.get("id") or "") == str(network_id)
        ),
        None,
    )
    if not target_network:
        raise HTTPException(status_code=404, detail="Network not found.")

    if target_network.get("networkKind") == "wired":
        delete_target = target_network.get("id") or target_network.get("networkId") or network_id
        if delete_target in (None, ""):
            raise HTTPException(status_code=400, detail="Wired network id is missing.")
        endpoint = WIRED_NETWORK_DELETE_ENDPOINT.format(site_id=site_id, vlan_id=delete_target)
    else:
        endpoint = NETWORK_UPDATE_ENDPOINT.format(site_id=site_id, network_id=network_id)

    response = await aruba_service.call_api(
        method="DELETE",
        endpoint=endpoint,
        aruba_token=aruba_token,
        headers={
            "Referer": NETWORK_OVERVIEW_REFERER.format(site_id=site_id),
        },
    )
    if response.status_code in (401, 403):
        raise HTTPException(
            status_code=401,
            detail="Phiên làm việc Aruba đã hết hạn. Vui lòng làm mới token."
        )
    if response.status_code not in (200, 204):
        raise HTTPException(
            status_code=502,
            detail=f"Không thể xoá network trên Aruba (status {response.status_code})."
        )

    return {
        "status": "success",
        "message": f"Deleted {target_network.get('displayName', 'network')}.",
        "deletedNetwork": {
            "id": str(target_network.get("id") or ""),
            "networkKind": target_network.get("networkKind"),
            "displayName": target_network.get("displayName"),
        },
    }


async def update_individual_wireless_ip_assignment(
    site_id: str,
    network_id: str,
    updates: Dict[str, Any],
    aruba_token: str,
) -> Dict[str, Any]:
    raw_networks = await get_networks_summary_response(site_id, aruba_token)
    networks = raw_networks.get("elements", [])

    target_network = next(
        (
            network
            for network in networks
            if isinstance(network, dict)
            and network.get("isWireless")
            and str(network.get("networkId") or network.get("id") or "") == str(network_id)
        ),
        None,
    )
    if not target_network:
        raise HTTPException(status_code=404, detail="Wireless network not found.")

    ip_addressing_mode = str(updates.get("ipAddressingMode") or target_network.get("ipAddressingMode") or "internal").strip().lower()
    if ip_addressing_mode not in {"internal", "external"}:
        raise HTTPException(status_code=400, detail="Unsupported IP addressing mode.")

    update_payload = sanitize_network_update_payload(target_network)
    dhcp_scope = dict(target_network.get("dhcpScope") or {})
    dns_scope = dict(dhcp_scope.get("dns") or {})

    if ip_addressing_mode != "internal":
        wired_network_id = str(updates.get("wiredNetworkId") or "").strip()
        if not wired_network_id:
            raise HTTPException(status_code=400, detail="Wired network selection is required.")

        update_payload.update({
            "ipAddressingMode": ip_addressing_mode,
            "wiredNetworkId": wired_network_id,
        })
    else:
        network_address = str(updates.get("networkAddress") or "").strip()
        subnet_mask = str(updates.get("subnetMask") or "").strip()
        dns_mode = str(updates.get("dnsServerAssignationMode") or "automatic").strip().lower()
        primary_dns = str(updates.get("primaryDnsServer") or "").strip()
        secondary_dns = str(updates.get("secondaryDnsServer") or "").strip()

        if not is_valid_ipv4_address(network_address):
            raise HTTPException(status_code=400, detail="Network address must be a valid IPv4 address.")
        if subnet_mask not in SUPPORTED_NETMASKS:
            raise HTTPException(status_code=400, detail="Unsupported subnet mask.")
        if dns_mode not in {"automatic", "static"}:
            raise HTTPException(status_code=400, detail="Unsupported DNS mode.")

        dns_scope["kind"] = dns_scope.get("kind") or "dns"
        dns_scope["dnsServerAssignationMode"] = dns_mode

        if dns_mode == "static":
            if not primary_dns:
                raise HTTPException(status_code=400, detail="Primary DNS Server is required.")
            if not is_valid_ipv4_address(primary_dns):
                raise HTTPException(status_code=400, detail="Primary DNS Server must be a valid IPv4 address.")

            if secondary_dns:
                if not is_valid_ipv4_address(secondary_dns):
                    raise HTTPException(status_code=400, detail="Secondary DNS Server must be a valid IPv4 address.")

            dns_scope["primaryDnsServer"] = primary_dns
            if secondary_dns:
                dns_scope["secondaryDnsServer"] = secondary_dns
            else:
                dns_scope.pop("secondaryDnsServer", None)
        else:
            dns_scope.pop("primaryDnsServer", None)
            dns_scope.pop("secondaryDnsServer", None)

        dhcp_scope["network"] = network_address
        dhcp_scope["netmask"] = subnet_mask
        dhcp_scope["dns"] = dns_scope

        update_payload.update({
            "ipAddressingMode": ip_addressing_mode,
            "dhcpScope": dhcp_scope,
            "wiredNetworkId": None,
        })

    response = await aruba_service.call_api(
        method="PUT",
        endpoint=NETWORK_UPDATE_ENDPOINT.format(site_id=site_id, network_id=network_id),
        aruba_token=aruba_token,
        json_data=update_payload,
        headers={
            "Referer": NETWORK_OVERVIEW_REFERER.format(site_id=site_id),
        },
    )
    if response.status_code in (401, 403):
        raise HTTPException(
            status_code=401,
            detail="Phiên làm việc Aruba đã hết hạn. Vui lòng làm mới token."
        )
    if response.status_code not in (200, 204):
        raise HTTPException(
            status_code=502,
            detail=f"Không thể cập nhật IP assignment trên Aruba (status {response.status_code})."
        )

    try:
        response_payload = response.json() if response.status_code != 204 else update_payload
    except Exception:
        response_payload = update_payload

    return {
        "status": "success",
        "message": "Wireless IP Assignment updated successfully.",
        "network": await _build_updated_wireless_network_response(
            site_id, network_id, response_payload, aruba_token,
        ),
    }


async def update_individual_wireless_network_assignment(
    site_id: str,
    network_id: str,
    updates: Dict[str, Any],
    aruba_token: str,
) -> Dict[str, Any]:
    raw_networks = await get_networks_summary_response(site_id, aruba_token)
    networks = raw_networks.get("elements", [])

    target_network = next(
        (
            network
            for network in networks
            if isinstance(network, dict)
            and network.get("isWireless")
            and str(network.get("networkId") or network.get("id") or "") == str(network_id)
        ),
        None,
    )
    if not target_network:
        raise HTTPException(status_code=404, detail="Wireless network not found.")

    update_payload = sanitize_network_update_payload(target_network)
    update_payload.update({
        "isAvailableOn24GHzRadioBand": bool(updates.get("isAvailableOn24GHzRadioBand", target_network.get("isAvailableOn24GHzRadioBand", False))),
        "isAvailableOn5GHzRadioBand": bool(updates.get("isAvailableOn5GHzRadioBand", target_network.get("isAvailableOn5GHzRadioBand", False))),
        "isAvailableOn6GHzRadioBand": bool(updates.get("isAvailableOn6GHzRadioBand", target_network.get("isAvailableOn6GHzRadioBand", False))),
        "isLegacy80211bRatesEnabled": bool(updates.get("isLegacy80211bRatesEnabled", target_network.get("isLegacy80211bRatesEnabled", False))),
    })
    if "accessPoints" in updates:
        update_payload["accessPoints"] = build_access_point_update_payload(updates.get("accessPoints"))

    response = await aruba_service.call_api(
        method="PUT",
        endpoint=NETWORK_UPDATE_ENDPOINT.format(site_id=site_id, network_id=network_id),
        aruba_token=aruba_token,
        json_data=update_payload,
        headers={
            "Referer": NETWORK_OVERVIEW_REFERER.format(site_id=site_id),
        },
    )
    if response.status_code in (401, 403):
        raise HTTPException(
            status_code=401,
            detail="Phiên làm việc Aruba đã hết hạn. Vui lòng làm mới token."
        )
    if response.status_code not in (200, 204):
        raise HTTPException(
            status_code=502,
            detail=f"Không thể cập nhật network assignment trên Aruba (status {response.status_code})."
        )

    try:
        response_payload = response.json() if response.status_code != 204 else update_payload
    except Exception:
        response_payload = update_payload

    return {
        "status": "success",
        "message": "Wireless Network Assignment updated successfully.",
        "network": await _build_updated_wireless_network_response(
            site_id, network_id, response_payload, aruba_token,
        ),
    }


async def update_individual_wireless_access_control(
    site_id: str,
    network_id: str,
    updates: Dict[str, Any],
    aruba_token: str,
) -> Dict[str, Any]:
    raw_networks, wired_response = await asyncio.gather(
        get_networks_summary_response(site_id, aruba_token),
        get_wired_networks_response(site_id, aruba_token),
    )
    networks = raw_networks.get("elements", [])

    target_network = next(
        (
            network
            for network in networks
            if isinstance(network, dict)
            and network.get("isWireless")
            and str(network.get("networkId") or network.get("id") or "") == str(network_id)
        ),
        None,
    )
    if not target_network:
        raise HTTPException(status_code=404, detail="Wireless network not found.")

    current_wireless_network = find_wireless_network_in_wired_response(wired_response, network_id)
    current_allow_list = normalize_allow_list(
        current_wireless_network.get("allowList") if isinstance(current_wireless_network, dict) else None
    )
    allow_list_updates = updates.get("allowList")
    if allow_list_updates is not None and not isinstance(allow_list_updates, dict):
        raise HTTPException(status_code=400, detail="allowList must be an object.")

    if isinstance(allow_list_updates, dict) and "isAllowListEnabled" in allow_list_updates:
        is_specific_clients_enabled = bool(allow_list_updates.get("isAllowListEnabled"))
    else:
        is_specific_clients_enabled = bool(
            updates.get(
                "isSpecificClientsEnabled",
                current_allow_list.get("isAllowListEnabled", False),
            )
        )

    raw_allowed_client_mac_addresses = None
    if isinstance(allow_list_updates, dict) and "allowedClients" in allow_list_updates:
        raw_allowed_clients = allow_list_updates.get("allowedClients")
        if not isinstance(raw_allowed_clients, list):
            raise HTTPException(status_code=400, detail="allowList.allowedClients must be a list.")
        raw_allowed_client_mac_addresses = []
        for item in raw_allowed_clients:
            mac_value = item.get("macAddress") if isinstance(item, dict) else item
            raw_allowed_client_mac_addresses.append(mac_value)
    else:
        raw_allowed_client_mac_addresses = updates.get("allowedClientMacAddresses")

    allowed_client_mac_addresses: List[str] = []
    if raw_allowed_client_mac_addresses is not None:
        if not isinstance(raw_allowed_client_mac_addresses, list):
            raise HTTPException(status_code=400, detail="allowedClientMacAddresses must be a list.")
        for value in raw_allowed_client_mac_addresses:
            mac_address = str(value or "").strip().lower()
            if mac_address and mac_address not in allowed_client_mac_addresses:
                allowed_client_mac_addresses.append(mac_address)

    current_allowed_client_mac_addresses = [
        str(client.get("macAddress") or "").strip().lower()
        for client in current_allow_list.get("allowedClients", [])
        if isinstance(client, dict) and str(client.get("macAddress") or "").strip()
    ]
    added_client_mac_addresses = [
        mac_address
        for mac_address in allowed_client_mac_addresses
        if mac_address not in current_allowed_client_mac_addresses
    ] if raw_allowed_client_mac_addresses is not None else []
    removed_client_mac_addresses = [
        mac_address
        for mac_address in current_allowed_client_mac_addresses
        if mac_address not in allowed_client_mac_addresses
    ] if raw_allowed_client_mac_addresses is not None else []

    remaining_allowed_clients = [
        client
        for client in current_allow_list.get("allowedClients", [])
        if str(client.get("macAddress") or "").strip().lower() not in removed_client_mac_addresses
    ]
    effective_allowed_client_mac_addresses = (
        allowed_client_mac_addresses
        if raw_allowed_client_mac_addresses is not None
        else current_allowed_client_mac_addresses
    )
    if is_specific_clients_enabled and not effective_allowed_client_mac_addresses:
        raise HTTPException(status_code=400, detail="At least one allowed client is required.")

    is_access_restricted = bool(updates.get("isAccessRestricted", target_network.get("isAccessRestricted", False)))
    if is_specific_clients_enabled:
        is_access_restricted = True
    is_specific_destinations_allowed = bool(
        is_access_restricted and updates.get("isSpecificDestinationsAllowed", target_network.get("isSpecificDestinationsAllowed", False))
    )
    allowed_destinations = normalize_allowed_destinations(updates.get("allowedDestinations"))

    if is_specific_destinations_allowed:
        if not allowed_destinations:
            raise HTTPException(status_code=400, detail="At least one allowed destination is required.")
        invalid_destinations = [
            destination for destination in allowed_destinations
            if not is_valid_ipv4_address(destination)
        ]
        if invalid_destinations:
            raise HTTPException(status_code=400, detail="Allowed destinations must be valid IPv4 addresses.")
    else:
        allowed_destinations = []

    update_payload = sanitize_network_update_payload(target_network)
    update_payload.update({
        "isAccessRestricted": is_access_restricted,
        "isInternetAllowed": True,
        "isSpecificDestinationsAllowed": is_specific_destinations_allowed,
        "allowedDestinations": allowed_destinations,
    })

    allow_list_id = str(
        (
            allow_list_updates.get("id")
            if isinstance(allow_list_updates, dict)
            else updates.get("allowListId")
        )
        or current_allow_list.get("id")
        or ""
    ).strip()
    if allow_list_id:
        update_payload["allowList"] = {
            "id": allow_list_id,
            "isAllowListEnabled": is_specific_clients_enabled,
            "isExtendAllowListEnabled": False,
        }
    elif "allowList" in updates or "isSpecificClientsEnabled" in updates:
        raise HTTPException(status_code=400, detail="Allow-list id is required.")

    if removed_client_mac_addresses:
        remove_response = await aruba_service.call_api(
            method="POST",
            endpoint=f"{EXTEND_ALLOW_LIST_ENDPOINT.format(site_id=site_id, network_id=network_id)}?action=removeFromAllowList",
            aruba_token=aruba_token,
            json_data={
                "macAddresses": removed_client_mac_addresses,
            },
            headers={
                "Referer": NETWORK_OVERVIEW_REFERER.format(site_id=site_id),
            },
        )
        if remove_response.status_code in (401, 403):
            raise HTTPException(
                status_code=401,
                detail="Phiên làm việc Aruba đã hết hạn. Vui lòng làm mới token."
            )
        if remove_response.status_code not in (200, 201, 204):
            raise HTTPException(
                status_code=502,
                detail=f"Không thể xóa clients khỏi allow list trên Aruba (status {remove_response.status_code})."
            )

    if added_client_mac_addresses:
        add_response = await aruba_service.call_api(
            method="POST",
            endpoint=f"{EXTEND_ALLOW_LIST_ENDPOINT.format(site_id=site_id, network_id=network_id)}?action=addToAllowList",
            aruba_token=aruba_token,
            json_data={
                "macAddresses": added_client_mac_addresses,
            },
            headers={
                "Referer": NETWORK_OVERVIEW_REFERER.format(site_id=site_id),
            },
        )
        if add_response.status_code in (401, 403):
            raise HTTPException(
                status_code=401,
                detail="Phiên làm việc Aruba đã hết hạn. Vui lòng làm mới token."
            )
        if add_response.status_code not in (200, 201, 204):
            raise HTTPException(
                status_code=502,
                detail=f"Không thể thêm clients vào allow list trên Aruba (status {add_response.status_code})."
            )

    if allow_list_id:
        close_extend_response = await aruba_service.call_api(
            method="PUT",
            endpoint=EXTEND_ALLOW_LIST_ENDPOINT.format(site_id=site_id, network_id=network_id),
            aruba_token=aruba_token,
            json_data={
                "id": allow_list_id,
                "isAllowListEnabled": is_specific_clients_enabled,
                "isExtendAllowListEnabled": False,
            },
            headers={
                "Referer": NETWORK_OVERVIEW_REFERER.format(site_id=site_id),
            },
        )
        if close_extend_response.status_code in (401, 403):
            raise HTTPException(
                status_code=401,
                detail="Phiên làm việc Aruba đã hết hạn. Vui lòng làm mới token."
            )
        if close_extend_response.status_code not in (200, 204):
            raise HTTPException(
                status_code=502,
                detail=f"Không thể cập nhật allow-list extension trên Aruba (status {close_extend_response.status_code})."
            )

    response = await aruba_service.call_api(
        method="PUT",
        endpoint=NETWORK_UPDATE_ENDPOINT.format(site_id=site_id, network_id=network_id),
        aruba_token=aruba_token,
        json_data=update_payload,
        headers={
            "Referer": NETWORK_OVERVIEW_REFERER.format(site_id=site_id),
        },
    )
    if response.status_code in (401, 403):
        raise HTTPException(
            status_code=401,
            detail="Phiên làm việc Aruba đã hết hạn. Vui lòng làm mới token."
        )
    if response.status_code not in (200, 204):
        raise HTTPException(
            status_code=502,
            detail=f"Không thể cập nhật access control trên Aruba (status {response.status_code})."
        )

    try:
        response_payload = response.json() if response.status_code != 204 else update_payload
    except Exception:
        response_payload = update_payload

    return {
        "status": "success",
        "message": "Wireless Access Control updated successfully.",
        "network": await _build_updated_wireless_network_response(
            site_id, network_id, response_payload, aruba_token,
        ),
    }


async def get_individual_wireless_specific_clients(
    site_id: str,
    network_id: str,
    aruba_token: str,
) -> Dict[str, Any]:
    wired_response = await get_wired_networks_response(site_id, aruba_token)
    wireless_network = find_wireless_network_in_wired_response(wired_response, network_id)
    if not wireless_network:
        raise HTTPException(status_code=404, detail="Wireless network allow list not found.")

    return {
        "status": "success",
        "siteId": site_id,
        "networkId": str(network_id),
        "networkName": wireless_network.get("networkName") or wireless_network.get("name") or "Unnamed SSID",
        "allowList": normalize_allow_list(wireless_network.get("allowList")),
    }


async def set_individual_wireless_specific_clients_extend(
    site_id: str,
    network_id: str,
    updates: Dict[str, Any],
    aruba_token: str,
) -> Dict[str, Any]:
    current_state = await get_individual_wireless_specific_clients(site_id, network_id, aruba_token)
    current_allow_list = current_state.get("allowList", {})
    allow_list_id = str(updates.get("id") or current_allow_list.get("id") or "").strip()
    if not allow_list_id:
        raise HTTPException(status_code=400, detail="Allow-list id is required.")

    payload = {
        "id": allow_list_id,
        "isAllowListEnabled": bool(updates.get("isAllowListEnabled", current_allow_list.get("isAllowListEnabled", False))),
        "isExtendAllowListEnabled": bool(updates.get("isExtendAllowListEnabled", current_allow_list.get("isExtendAllowListEnabled", False))),
    }

    response = await aruba_service.call_api(
        method="PUT",
        endpoint=EXTEND_ALLOW_LIST_ENDPOINT.format(site_id=site_id, network_id=network_id),
        aruba_token=aruba_token,
        json_data=payload,
        headers={
            "Referer": NETWORK_OVERVIEW_REFERER.format(site_id=site_id),
        },
    )
    if response.status_code in (401, 403):
        raise HTTPException(
            status_code=401,
            detail="Phiên làm việc Aruba đã hết hạn. Vui lòng làm mới token."
        )
    if response.status_code not in (200, 204):
        raise HTTPException(
            status_code=502,
            detail=f"Không thể cập nhật allow-list extension trên Aruba (status {response.status_code})."
        )

    refreshed_state = await get_individual_wireless_specific_clients(site_id, network_id, aruba_token)
    return {
        "status": "success",
        "message": "Wireless Specific Clients state updated successfully.",
        **refreshed_state,
    }


async def add_individual_wireless_specific_clients(
    site_id: str,
    network_id: str,
    updates: Dict[str, Any],
    aruba_token: str,
) -> Dict[str, Any]:
    current_state = await get_individual_wireless_specific_clients(site_id, network_id, aruba_token)
    allow_list = current_state.get("allowList", {})

    raw_mac_addresses = updates.get("macAddresses")
    if not isinstance(raw_mac_addresses, list):
        raise HTTPException(status_code=400, detail="macAddresses must be a list.")

    mac_addresses: List[str] = []
    for value in raw_mac_addresses:
        mac_address = str(value or "").strip().lower()
        if mac_address and mac_address not in mac_addresses:
            mac_addresses.append(mac_address)

    if not mac_addresses:
        raise HTTPException(status_code=400, detail="At least one client is required.")

    max_allowed_clients = allow_list.get("maxAllowedClients")
    existing_allowed_clients = allow_list.get("allowedClients", [])
    existing_allowed_mac_addresses = {
        str(client.get("macAddress") or "").strip().lower()
        for client in existing_allowed_clients
        if isinstance(client, dict) and str(client.get("macAddress") or "").strip()
    }
    mac_addresses = [
        mac_address for mac_address in mac_addresses
        if mac_address not in existing_allowed_mac_addresses
    ]
    if not mac_addresses:
        raise HTTPException(status_code=400, detail="Selected clients are already in the allow list.")
    if isinstance(max_allowed_clients, int) and max_allowed_clients > 0:
        if len(existing_allowed_clients) + len(mac_addresses) > max_allowed_clients:
            raise HTTPException(status_code=400, detail="Selected clients exceed the Aruba allow-list limit.")

    response = await aruba_service.call_api(
        method="POST",
        endpoint=f"{EXTEND_ALLOW_LIST_ENDPOINT.format(site_id=site_id, network_id=network_id)}?action=addToAllowList",
        aruba_token=aruba_token,
        json_data={
            "macAddresses": mac_addresses,
        },
        headers={
            "Referer": NETWORK_OVERVIEW_REFERER.format(site_id=site_id),
        },
    )
    if response.status_code in (401, 403):
        raise HTTPException(
            status_code=401,
            detail="Phiên làm việc Aruba đã hết hạn. Vui lòng làm mới token."
        )
    if response.status_code not in (200, 201, 204):
        raise HTTPException(
            status_code=502,
            detail=f"Không thể thêm clients vào allow list trên Aruba (status {response.status_code})."
        )

    refreshed_state = await get_individual_wireless_specific_clients(site_id, network_id, aruba_token)
    return {
        "status": "success",
        "message": "Wireless Specific Clients added successfully.",
        **refreshed_state,
    }
