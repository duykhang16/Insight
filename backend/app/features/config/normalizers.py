"""
Config feature normalizers — transform raw Aruba API data into UI-ready format.
"""
import ipaddress
from typing import Any, Dict, List, Optional


def normalize_allow_list_client(client: Any) -> Optional[Dict[str, Any]]:
    if not isinstance(client, dict):
        return None

    client_id = str(client.get("clientId") or client.get("macAddress") or "").strip()
    mac_address = str(client.get("macAddress") or client_id).strip()
    client_name = str(client.get("clientName") or mac_address or client_id).strip()
    if not client_id or not mac_address:
        return None

    return {
        "clientId": client_id,
        "macAddress": mac_address,
        "ipAddress": str(client.get("ipAddress") or "").strip(),
        "clientName": client_name or client_id,
        "clientType": str(client.get("clientType") or "").strip(),
        "wiredNetworkIds": [str(value) for value in client.get("wiredNetworkIds", []) if value not in (None, "")] if isinstance(client.get("wiredNetworkIds"), list) else [],
        "connectionDurationInSeconds": int(client.get("connectionDurationInSeconds") or 0),
        "isWatchlisted": bool(client.get("isWatchlisted", False)),
    }


def normalize_allow_list(allow_list: Any) -> Dict[str, Any]:
    if not isinstance(allow_list, dict):
        return {
            "id": "",
            "allowListState": None,
            "maxEntityAllowedAllowLists": None,
            "isAllowListEnabled": False,
            "maxAllowedClients": None,
            "isExtendAllowListEnabled": False,
            "allowedClients": [],
            "availableClients": [],
        }

    allowed_clients = [
        normalized
        for normalized in (
            normalize_allow_list_client(client)
            for client in allow_list.get("allowedClients", [])
        )
        if normalized
    ] if isinstance(allow_list.get("allowedClients"), list) else []

    available_clients = [
        normalized
        for normalized in (
            normalize_allow_list_client(client)
            for client in allow_list.get("availableClients", [])
        )
        if normalized
    ] if isinstance(allow_list.get("availableClients"), list) else []

    return {
        "id": str(allow_list.get("id") or "").strip(),
        "allowListState": allow_list.get("allowListState"),
        "maxEntityAllowedAllowLists": allow_list.get("maxEntityAllowedAllowLists"),
        "isAllowListEnabled": bool(allow_list.get("isAllowListEnabled", False)),
        "maxAllowedClients": allow_list.get("maxAllowedClients"),
        "isExtendAllowListEnabled": bool(allow_list.get("isExtendAllowListEnabled", False)),
        "allowedClients": allowed_clients,
        "availableClients": available_clients,
    }


def find_wireless_network_in_wired_response(
    wired_response: Dict[str, Any],
    network_id: str,
) -> Optional[Dict[str, Any]]:
    for wired_network in wired_response.get("elements", []):
        if not isinstance(wired_network, dict):
            continue
        for wireless_network in wired_network.get("wirelessNetworks", []) or []:
            if not isinstance(wireless_network, dict):
                continue
            if str(wireless_network.get("id") or wireless_network.get("networkId") or "") == str(network_id):
                return wireless_network
    return None


def normalize_allowed_destinations(destinations: Any) -> List[str]:
    if not isinstance(destinations, list):
        return []

    normalized: List[str] = []
    for destination in destinations:
        value = ""
        if isinstance(destination, str):
            value = destination.strip()
        elif isinstance(destination, dict):
            value = str(
                destination.get("address")
                or destination.get("ipAddress")
                or destination.get("value")
                or ""
            ).strip()
        elif destination not in (None, ""):
            value = str(destination).strip()

        if value and value not in normalized:
            normalized.append(value)

    return normalized


def normalize_access_point(access_point: Any) -> Optional[Dict[str, Any]]:
    if isinstance(access_point, dict):
        ap_id = str(
            access_point.get("deviceId")
            or access_point.get("id")
            or access_point.get("serialNumber")
            or access_point.get("macAddress")
            or access_point.get("name")
            or ""
        )
        ap_name = (
            access_point.get("deviceName")
            or access_point.get("name")
            or access_point.get("hostname")
            or access_point.get("serialNumber")
            or ap_id
        )
        if not ap_id and not ap_name:
            return None

        enabled_radio_bands = access_point.get("enabledRadioBands")
        return {
            "id": ap_id or ap_name,
            "name": ap_name or ap_id,
            "deviceId": ap_id or ap_name,
            "deviceName": ap_name or ap_id,
            "deviceModel": access_point.get("deviceModel", ""),
            "radioBandMapping": access_point.get("radioBandMapping", ""),
            "enabledRadioBands": enabled_radio_bands if isinstance(enabled_radio_bands, list) else [],
            "isBoundToNetwork": bool(access_point.get("isBoundToNetwork", True)),
        }

    if access_point in (None, ""):
        return None

    value = str(access_point)
    return {
        "id": value,
        "name": value,
        "deviceId": value,
        "deviceName": value,
        "deviceModel": "",
        "radioBandMapping": "",
        "enabledRadioBands": [],
        "isBoundToNetwork": True,
    }


def normalize_individual_wireless_network(
    network: Dict[str, Any],
    allow_list: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    authentication = network.get("authentication", "psk")
    security = str(network.get("security", "wpa3")).lower()
    security_option = "wpa23_personal"
    if authentication == "psk" and security == "wpa2":
        security_option = "wpa2_personal"
    elif authentication == "eap" and security == "wpa2":
        security_option = "wpa2_enterprise"
    elif authentication == "eap" and security == "wpa3":
        security_option = "wpa23_enterprise"

    access_points = []
    for ap in network.get("accessPoints") or []:
        normalized_ap = normalize_access_point(ap)
        if normalized_ap:
            access_points.append(normalized_ap)

    is_access_restricted = bool(network.get("isAccessRestricted", False))
    is_specific_destinations_allowed = bool(
        is_access_restricted and network.get("isSpecificDestinationsAllowed", False)
    )
    allowed_destinations = (
        normalize_allowed_destinations(network.get("allowedDestinations"))
        if is_specific_destinations_allowed
        else []
    )
    normalized_allow_list = normalize_allow_list(
        allow_list if isinstance(allow_list, dict) else network.get("allowList")
    )

    return {
        "id": str(network.get("networkId") or network.get("id") or ""),
        "networkKind": "wireless",
        "displayName": network.get("networkName", "Unnamed SSID"),
        "label": f"{network.get('networkName', 'Unnamed SSID')} · Wireless",
        "networkName": network.get("networkName", "Unnamed SSID"),
        "isEnabled": network.get("isEnabled", True),
        "health": network.get("health", "good"),
        "state": "Active" if network.get("isEnabled", True) else "Disabled",
        "usage": network.get("type", "employee"),
        "authentication": authentication,
        "security": security,
        "securityOption": security_option,
        "wiredNetworkId": network.get("wiredNetworkId"),
        "ipAddressingMode": network.get("ipAddressingMode", "internal"),
        "dhcpScope": network.get("dhcpScope") if isinstance(network.get("dhcpScope"), dict) else {},
        "isAvailableOn24GHzRadioBand": network.get("isAvailableOn24GHzRadioBand", False),
        "isAvailableOn5GHzRadioBand": network.get("isAvailableOn5GHzRadioBand", False),
        "isAvailableOn6GHzRadioBand": network.get("isAvailableOn6GHzRadioBand", False),
        "isLegacy80211bRatesEnabled": network.get("isLegacy80211bRatesEnabled", False),
        "isSsidHidden": network.get("isSsidHidden", False),
        "preSharedKey": network.get("preSharedKey", ""),
        "isAccessRestricted": is_access_restricted,
        "isInternetAllowed": True,
        "isSpecificDestinationsAllowed": is_specific_destinations_allowed,
        "allowedDestinations": allowed_destinations,
        "allowList": normalized_allow_list,
        "accessPoints": access_points,
    }


def normalize_individual_wired_network(network: Dict[str, Any]) -> Dict[str, Any]:
    is_enabled = (
        network.get("networkActivationEffectivePolicy", {}).get("isActive")
        if isinstance(network.get("networkActivationEffectivePolicy"), dict)
        else None
    )
    if is_enabled is None:
        is_enabled = network.get("isEnabled", True)

    display_name = network.get("wiredNetworkName") or f"VLAN {network.get('vlanId', 'Unknown')}"
    return {
        "id": str(network.get("id") or network.get("networkId") or network.get("vlanId") or ""),
        "networkKind": "wired",
        "displayName": display_name,
        "label": f"{display_name} · Wired",
        "networkName": display_name,
        "isEnabled": is_enabled,
        "health": network.get("health", "good"),
        "state": "Active" if is_enabled else "Disabled",
        "usage": network.get("type", "employee"),
        "vlanId": network.get("vlanId"),
        "isIgmpSnoopingEnabled": bool(network.get("isIgmpSnoopingEnabled", False)),
        "isAccessRestricted": bool(network.get("isAccessRestricted", False)),
        "allowedDestinations": normalize_allowed_destinations(network.get("allowedDestinations")),
        "isDhcpArpProtectionEnabled": bool(
            network.get(
                "shouldApplyNetworkSecurityProtections",
                network.get("isDhcpArpProtectionEnabled", False),
            )
        ),
    }
