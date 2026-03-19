"""
Config feature validators — IP validation, payload sanitization, update builders.
"""
import ipaddress
from typing import Any, Dict, List

from app.features.config.constants import NETWORK_UPDATE_RESTRICTED_KEYS
from app.features.config.normalizers import normalize_access_point, normalize_allowed_destinations


def is_valid_ipv4_address(value: str) -> bool:
    try:
        ipaddress.IPv4Address(value)
        return True
    except Exception:
        return False


def sanitize_network_update_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    clean_payload = dict(payload)
    for key in NETWORK_UPDATE_RESTRICTED_KEYS:
        clean_payload.pop(key, None)
    return clean_payload


def build_access_point_update_payload(access_points: Any) -> List[Dict[str, Any]]:
    if not isinstance(access_points, list):
        return []

    payload: List[Dict[str, Any]] = []
    for ap in access_points:
        normalized = normalize_access_point(ap)
        if not normalized:
            continue

        payload.append({
            "deviceId": normalized["deviceId"],
            "deviceName": normalized["deviceName"],
            "deviceModel": normalized.get("deviceModel", ""),
            "radioBandMapping": normalized.get("radioBandMapping", ""),
            "enabledRadioBands": normalized.get("enabledRadioBands", []),
            "isBoundToNetwork": bool(normalized.get("isBoundToNetwork", True)),
        })

    return payload


def build_wired_network_update_payload(target_network: Dict[str, Any]) -> Dict[str, Any]:
    raw_ip_routing_config = target_network.get("ipRoutingConfig")
    is_static_ip_routing = bool(
        raw_ip_routing_config.get("isStatic", False)
        if isinstance(raw_ip_routing_config, dict)
        else False
    )
    is_access_restricted = bool(target_network.get("isAccessRestricted", False))
    is_specific_destinations_allowed = bool(
        is_access_restricted and target_network.get("isSpecificDestinationsAllowed", False)
    )
    allowed_destinations = (
        normalize_allowed_destinations(target_network.get("allowedDestinations"))
        if is_specific_destinations_allowed
        else []
    )
    ip_routing_config = {
        "isStatic": is_static_ip_routing,
    }
    if is_static_ip_routing and isinstance(raw_ip_routing_config, dict):
        if raw_ip_routing_config.get("staticIpAddress") not in (None, ""):
            ip_routing_config["staticIpAddress"] = raw_ip_routing_config.get("staticIpAddress")
        if raw_ip_routing_config.get("staticSubnetMask") not in (None, ""):
            ip_routing_config["staticSubnetMask"] = raw_ip_routing_config.get("staticSubnetMask")

    device_port_mappings: List[Dict[str, Any]] = []
    for device_mapping in target_network.get("devicePortMappings", []) if isinstance(target_network.get("devicePortMappings"), list) else []:
        if not isinstance(device_mapping, dict):
            continue

        next_device_mapping: Dict[str, Any] = {
            "deviceId": device_mapping.get("deviceId"),
            "portMappings": [],
            "trunkMappings": [],
        }

        for port_mapping in device_mapping.get("portMappings", []) if isinstance(device_mapping.get("portMappings"), list) else []:
            if not isinstance(port_mapping, dict):
                continue
            port_number = port_mapping.get("portNumber")
            mapping_value = port_mapping.get("mapping")
            if port_number in (None, "") or mapping_value in (None, ""):
                continue
            next_device_mapping["portMappings"].append({
                "portNumber": port_number,
                "mapping": mapping_value,
            })

        for trunk_mapping in device_mapping.get("trunkMappings", []) if isinstance(device_mapping.get("trunkMappings"), list) else []:
            if not isinstance(trunk_mapping, dict):
                continue
            trunk_number = trunk_mapping.get("trunkNumber")
            mapping_value = trunk_mapping.get("mapping")
            if trunk_number in (None, "") or mapping_value in (None, ""):
                continue
            next_device_mapping["trunkMappings"].append({
                "trunkNumber": trunk_number,
                "mapping": mapping_value,
            })

        if next_device_mapping.get("deviceId") in (None, ""):
            continue
        device_port_mappings.append(next_device_mapping)

    return {
        "wiredNetworkName": target_network.get("wiredNetworkName") or f"VLAN {target_network.get('vlanId', '')}".strip(),
        "isEnabled": bool(target_network.get("isEnabled", True)),
        "type": str(target_network.get("type") or "employee"),
        "shouldApplyNetworkSecurityProtections": bool(target_network.get("shouldApplyNetworkSecurityProtections", False)),
        "vlanId": target_network.get("vlanId"),
        "useDhcpScope": bool(target_network.get("useDhcpScope", False)),
        "isAccessRestricted": is_access_restricted,
        "isInternetAllowed": True if not is_access_restricted else bool(target_network.get("isInternetAllowed", True)),
        "isIntraSubnetTrafficAllowed": bool(
            is_access_restricted and target_network.get("isIntraSubnetTrafficAllowed", False)
        ),
        "isSpecificDestinationsAllowed": is_specific_destinations_allowed,
        "allowedDestinations": allowed_destinations,
        "isIpRoutingEnabled": bool(target_network.get("isIpRoutingEnabled", False)),
        "ipRoutingConfig": ip_routing_config,
        "devicePortMappings": device_port_mappings,
        "isGuestPortalEnabled": bool(target_network.get("isGuestPortalEnabled", False)),
        "isIgmpSnoopingEnabled": bool(target_network.get("isIgmpSnoopingEnabled", False)),
    }
