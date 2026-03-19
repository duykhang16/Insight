"""
Dịch vụ Config — lấy cấu hình site trực tiếp từ Aruba API.

Kiến trúc Stateless (stateless_architecture.md):
  - Dữ liệu LUÔN lấy từ Aruba API qua token của trình duyệt, không bao giờ từ DB.
  - 401/403 từ Aruba → raise HTTPException(401) để frontend interceptor kích hoạt /refresh.

Mapping JSON keys ↔ UI labels (đảm bảo 100% alignment):
  Nguồn: Aruba /api/sites/{site_id}/networksSummary
  ┌─────────────────────────┬──────────────────────────────────────────────┐
  │ UI key (SmartSync /     │ Aruba key (networksSummary)                  │
  │ FullClone)              │                                              │
  ├─────────────────────────┼──────────────────────────────────────────────┤
  │ net.id                  │ networkId                                    │
  │ net.name                │ networkName                                  │
  │ net.type                │ type  (e.g. "EMPLOYEE", "GUEST")             │
  │ net.vlanId              │ vlanId                                       │
  │ net.isEnabled           │ isEnabled                                    │
  │ net.isWireless          │ isWireless                                   │
  │ ssid.networkId          │ networkId                                    │
  │ ssid.networkName        │ networkName  (wireless filter)               │
  │ ssid.security           │ security                                     │
  │ ssid.isGuestPortalEnabl │ isGuestPortalEnabled                         │
  │ guest_portal (config)   │ /api/sites/{id}/guestPortalSettings (raw)   │
  └─────────────────────────┴──────────────────────────────────────────────┘
"""
import asyncio
import ipaddress
from typing import Any, Dict, List, Optional

from fastapi import HTTPException
from app.shared.aruba import aruba_service

# Endpoint fallback chain (mới → cũ)
_NETS_ENDPOINTS = [
    "/api/sites/{site_id}/networksSummary",
    "/api/v1/sites/{site_id}/networksSummary",
]
_GUEST_ENDPOINT = "/api/sites/{site_id}/guestPortalSettings"
_WIRED_NETWORKS_ENDPOINT = "/api/sites/{site_id}/wiredNetworks"
_NETWORK_UPDATE_ENDPOINT = "/api/sites/{site_id}/networksSummary/{network_id}"
_EXTEND_ALLOW_LIST_ENDPOINT = "/api/sites/{site_id}/extendWirelessNetworkAllowList/{network_id}"
_WIRED_NETWORK_DELETE_ENDPOINT = "/api/sites/{site_id}/wiredNetworks/{vlan_id}"
_WIRED_NETWORK_UPDATE_ENDPOINT = "/api/sites/{site_id}/wiredNetworks/{vlan_id}"
_NETWORK_OVERVIEW_REFERER = "https://portal.instant-on.hpe.com/sites/{site_id}/networks/overview"
_WIRED_NETWORK_DETAIL_REFERER = "https://portal.instant-on.hpe.com/sites/{site_id}/networks/{network_id}/wired/overview"
_SUPPORTED_NETMASKS = {"255.255.255.0", "255.255.0.0", "255.0.0.0"}
_NETWORK_UPDATE_RESTRICTED_KEYS = {
    "networkId",
    "siteId",
    "id",
    "kind",
    "wiredNetworkId",
    "accessPoints",
    "allowList",
}


class ConfigService:
    async def _build_updated_wired_network_response(
        self,
        site_id: str,
        network_id: str,
        vlan_id: Any,
        response_payload: Dict[str, Any],
        aruba_token: str,
    ) -> Dict[str, Any]:
        wired_response = await self._get_wired_networks_response(site_id, aruba_token)
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
        return self._normalize_individual_wired_network(
            wired_network if isinstance(wired_network, dict) else response_payload
        )

    async def _build_updated_wireless_network_response(
        self,
        site_id: str,
        network_id: str,
        response_payload: Dict[str, Any],
        aruba_token: str,
    ) -> Dict[str, Any]:
        wired_response = await self._get_wired_networks_response(site_id, aruba_token)
        wireless_network = self._find_wireless_network_in_wired_response(wired_response, network_id)
        response_allow_list = response_payload.get("allowList") if isinstance(response_payload.get("allowList"), dict) else None
        wired_allow_list = wireless_network.get("allowList") if isinstance(wireless_network, dict) else None
        merged_allow_list = None
        if isinstance(wired_allow_list, dict) or isinstance(response_allow_list, dict):
            merged_allow_list = {
                **(wired_allow_list if isinstance(wired_allow_list, dict) else {}),
                **(response_allow_list if isinstance(response_allow_list, dict) else {}),
            }
        return self._normalize_individual_wireless_network(
            response_payload,
            allow_list=merged_allow_list,
        )

    def _normalize_allow_list_client(self, client: Any) -> Optional[Dict[str, Any]]:
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

    def _normalize_allow_list(self, allow_list: Any) -> Dict[str, Any]:
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
                self._normalize_allow_list_client(client)
                for client in allow_list.get("allowedClients", [])
            )
            if normalized
        ] if isinstance(allow_list.get("allowedClients"), list) else []

        available_clients = [
            normalized
            for normalized in (
                self._normalize_allow_list_client(client)
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

    def _find_wireless_network_in_wired_response(
        self,
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

    def _normalize_allowed_destinations(self, destinations: Any) -> List[str]:
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


    def _normalize_access_point(self, access_point: Any) -> Optional[Dict[str, Any]]:
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

    def _build_access_point_update_payload(self, access_points: Any) -> List[Dict[str, Any]]:
        if not isinstance(access_points, list):
            return []

        payload: List[Dict[str, Any]] = []
        for access_point in access_points:
            normalized = self._normalize_access_point(access_point)
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

    def _is_valid_ipv4_address(self, value: str) -> bool:
        try:
            ipaddress.IPv4Address(value)
            return True
        except Exception:
            return False

    async def _get_networks_summary_response(
        self,
        site_id: str,
        aruba_token: str,
    ) -> Dict[str, Any]:
        nets_response = None
        for endpoint_tpl in _NETS_ENDPOINTS:
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

    async def _get_wired_networks_response(
        self,
        site_id: str,
        aruba_token: str,
    ) -> Dict[str, Any]:
        response = await aruba_service.call_api(
            method="GET",
            endpoint=_WIRED_NETWORKS_ENDPOINT.format(site_id=site_id),
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

    def _normalize_individual_wireless_network(
        self,
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
        for access_point in network.get("accessPoints") or []:
            normalized_access_point = self._normalize_access_point(access_point)
            if normalized_access_point:
                access_points.append(normalized_access_point)

        is_access_restricted = bool(network.get("isAccessRestricted", False))
        is_specific_destinations_allowed = bool(
            is_access_restricted and network.get("isSpecificDestinationsAllowed", False)
        )
        allowed_destinations = (
            self._normalize_allowed_destinations(network.get("allowedDestinations"))
            if is_specific_destinations_allowed
            else []
        )
        normalized_allow_list = self._normalize_allow_list(
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

    def _normalize_individual_wired_network(self, network: Dict[str, Any]) -> Dict[str, Any]:
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
            "allowedDestinations": self._normalize_allowed_destinations(network.get("allowedDestinations")),
            "isDhcpArpProtectionEnabled": bool(
                network.get(
                    "shouldApplyNetworkSecurityProtections",
                    network.get("isDhcpArpProtectionEnabled", False),
                )
            ),
        }

    def _build_wired_network_update_payload(self, target_network: Dict[str, Any]) -> Dict[str, Any]:
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
            self._normalize_allowed_destinations(target_network.get("allowedDestinations"))
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

    def _sanitize_network_update_payload(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        clean_payload = dict(payload)
        for key in _NETWORK_UPDATE_RESTRICTED_KEYS:
            clean_payload.pop(key, None)
        return clean_payload

    async def get_site_config(
        self,
        site_id: str,
        aruba_token: str,
    ) -> Dict[str, Any]:
        """
        Lấy toàn bộ cấu hình mạng của một site trực tiếp từ Aruba API.

        Trả về dict gồm:
          - networks: list[dict] — tất cả mạng (wired + wireless), với keys khớp UI.
          - guest_portal: dict | None — cài đặt Guest Portal của site.

        Raise HTTPException(401) nếu token hết hạn.
        """
        # --- Bước 1: Lấy networksSummary ---
        raw = await self._get_networks_summary_response(site_id, aruba_token)

        # --- Bước 2: Lấy guestPortalSettings (lỗi không chặn) ---
        guest_portal: Optional[Dict] = None
        try:
            guest_response = await aruba_service.call_api(
                method="GET",
                endpoint=_GUEST_ENDPOINT.format(site_id=site_id),
                aruba_token=aruba_token,
            )
            if guest_response.status_code == 200:
                guest_portal = guest_response.json()
        except Exception as exc:
            print(f"[CONFIG] Không lấy được guestPortalSettings: {exc}")

        # --- Bước 3a: Lấy wiredNetworks (cấu hình VLAN, wired policies) ---
        wired_networks = None
        try:
            wired_response = await aruba_service.call_api(
                method="GET",
                endpoint=_WIRED_ENDPOINT.format(site_id=site_id),
                aruba_token=aruba_token,
            )
            if wired_response.status_code == 200:
                wired_networks = wired_response.json()
        except Exception as exc:
            print(f"[CONFIG] Không lấy được wiredNetworks: {exc}")

        # --- Bước 4: Parse và chuẩn hoá networksSummary ---
        try:
            # Aruba có thể trả về list thẳng hoặc {"elements": [...]}
            raw_networks: list = (
                raw if isinstance(raw, list)
                else raw.get("elements", [])
            )
        except Exception as exc:
            print(f"[CONFIG] Lỗi parse networksSummary: {exc}")
            raise HTTPException(status_code=502, detail="Lỗi parse dữ liệu mạng từ Aruba.")

        # Chuẩn hoá từng network — giữ nguyên TẤT CẢ fields của Aruba,
        # chỉ đảm bảo các keys mà UI cần luôn hiện diện.
        networks: List[Dict[str, Any]] = []
        for net in raw_networks:
            if not isinstance(net, dict):
                continue

            # Đảm bảo các keys UI đọc trực tiếp luôn có mặt với giá trị mặc định
            # (SmartSync đọc: net.id, net.name, net.type, net.vlanId, net.isEnabled, net.isWireless)
            normalised = dict(net)  # giữ toàn bộ fields gốc từ Aruba
            normalised.setdefault("id",         net.get("networkId"))   # net.id  → SmartSync table key
            normalised.setdefault("name",       net.get("networkName", "Unnamed"))  # net.name
            normalised.setdefault("type",       net.get("type", ""))                # net.type
            normalised.setdefault("vlanId",     net.get("vlanId"))                  # net.vlanId
            normalised.setdefault("isEnabled",  net.get("isEnabled", True))         # net.isEnabled
            normalised.setdefault("isWireless", net.get("isWireless", False))       # net.isWireless

            networks.append(normalised)

        return {
            "networks":        networks,
            "guest_portal":    guest_portal,
            "wired_networks":  wired_networks,
        }

    async def get_site_ssids(
        self,
        site_id: str,
        aruba_token: str,
    ) -> List[Dict[str, Any]]:
        """
        Lọc chỉ các mạng wireless và trả về list SSID.

        Các keys được SmartSync đọc trực tiếp:
          ssid.networkId, ssid.networkName, ssid.security, ssid.isGuestPortalEnabled
        """
        config = await self.get_site_config(site_id, aruba_token)
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
        self,
        site_id: str,
        aruba_token: str,
    ) -> Dict[str, Any]:
        """
        Trả về danh sách tóm tắt mạng cho bảng SmartSync (site-overview).

        Mỗi phần tử gồm: id, name, type, vlanId, isEnabled, isWireless.
        (Khớp trực tiếp với SmartSync line 723-739: net.id, net.name, net.type,
        net.vlanId, net.isEnabled, net.isWireless)
        """
        config = await self.get_site_config(site_id, aruba_token)
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
        self,
        site_id: str,
        aruba_token: str,
    ) -> Dict[str, Any]:
        site_config, wired_response = await asyncio.gather(
            self.get_site_config(site_id, aruba_token),
            self._get_wired_networks_response(site_id, aruba_token),
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
            self._normalize_individual_wireless_network(
                network,
                allow_list=allow_list_map.get(str(network.get("networkId") or network.get("id") or "")),
            )
            for network in site_config["networks"]
            if isinstance(network, dict) and network.get("isWireless")
        ]

        wired_networks = [
            self._normalize_individual_wired_network(network)
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

    async def update_individual_network_overview(
        self,
        site_id: str,
        network_id: str,
        updates: Dict[str, Any],
        aruba_token: str,
    ) -> Dict[str, Any]:
        individual_networks = await self.get_individual_networks(site_id, aruba_token)
        target_network = next(
            (
                network
                for network in individual_networks.get("networks", [])
                if str(network.get("id") or "") == str(network_id)
            ),
            None,
        )
        if not target_network:
            raise HTTPException(status_code=404, detail="Network not found.")

        if target_network.get("networkKind") == "wired":
            return await self.update_individual_wired_overview(site_id, network_id, updates, aruba_token)
        return await self.update_individual_wireless_overview(site_id, network_id, updates, aruba_token)

    async def update_individual_network_access_control(
        self,
        site_id: str,
        network_id: str,
        updates: Dict[str, Any],
        aruba_token: str,
    ) -> Dict[str, Any]:
        individual_networks = await self.get_individual_networks(site_id, aruba_token)
        target_network = next(
            (
                network
                for network in individual_networks.get("networks", [])
                if str(network.get("id") or "") == str(network_id)
            ),
            None,
        )
        if not target_network:
            raise HTTPException(status_code=404, detail="Network not found.")

        if target_network.get("networkKind") == "wired":
            return await self.update_individual_wired_access_control(site_id, network_id, updates, aruba_token)
        return await self.update_individual_wireless_access_control(site_id, network_id, updates, aruba_token)

    async def update_individual_wireless_overview(
        self,
        site_id: str,
        network_id: str,
        updates: Dict[str, Any],
        aruba_token: str,
    ) -> Dict[str, Any]:
        raw_networks = await self._get_networks_summary_response(site_id, aruba_token)
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
            raise HTTPException(status_code=400, detail="Unsupported security mode.")

        update_payload = self._sanitize_network_update_payload(target_network)
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
            endpoint=_NETWORK_UPDATE_ENDPOINT.format(site_id=site_id, network_id=network_id),
            aruba_token=aruba_token,
            json_data=update_payload,
            headers={
                "Referer": _NETWORK_OVERVIEW_REFERER.format(site_id=site_id),
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
            "network": await self._build_updated_wireless_network_response(
                site_id,
                network_id,
                response_payload,
                aruba_token,
            ),
        }

    async def update_individual_wired_overview(
        self,
        site_id: str,
        network_id: str,
        updates: Dict[str, Any],
        aruba_token: str,
    ) -> Dict[str, Any]:
        wired_response = await self._get_wired_networks_response(site_id, aruba_token)
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

        update_payload = self._build_wired_network_update_payload(target_network)
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
            endpoint=_WIRED_NETWORK_UPDATE_ENDPOINT.format(site_id=site_id, vlan_id=current_wired_network_id),
            aruba_token=aruba_token,
            json_data=update_payload,
            headers={
                "Origin": "https://portal.instant-on.hpe.com",
                "Referer": _WIRED_NETWORK_DETAIL_REFERER.format(
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
            "network": await self._build_updated_wired_network_response(
                site_id,
                network_id,
                vlan_id,
                response_payload,
                aruba_token,
            ),
        }

    async def update_individual_wired_access_control(
        self,
        site_id: str,
        network_id: str,
        updates: Dict[str, Any],
        aruba_token: str,
    ) -> Dict[str, Any]:
        wired_response = await self._get_wired_networks_response(site_id, aruba_token)
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
        allowed_destinations = self._normalize_allowed_destinations(updates.get("allowedDestinations"))

        if is_access_restricted:
            if not allowed_destinations:
                raise HTTPException(status_code=400, detail="At least one allowed destination is required.")
            invalid_destinations = [
                destination for destination in allowed_destinations
                if not self._is_valid_ipv4_address(destination)
            ]
            if invalid_destinations:
                raise HTTPException(status_code=400, detail="Allowed destinations must be valid IPv4 addresses.")
        else:
            allowed_destinations = []

        update_payload = self._build_wired_network_update_payload(target_network)
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
            endpoint=_WIRED_NETWORK_UPDATE_ENDPOINT.format(site_id=site_id, vlan_id=current_wired_network_id),
            aruba_token=aruba_token,
            json_data=update_payload,
            headers={
                "Origin": "https://portal.instant-on.hpe.com",
                "Referer": _WIRED_NETWORK_DETAIL_REFERER.format(
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
            "network": await self._build_updated_wired_network_response(
                site_id,
                network_id,
                target_network.get("vlanId"),
                response_payload,
                aruba_token,
            ),
        }

    async def delete_individual_network(
        self,
        site_id: str,
        network_id: str,
        aruba_token: str,
    ) -> Dict[str, Any]:
        individual_networks = await self.get_individual_networks(site_id, aruba_token)
        target_network = next(
            (
                network
                for network in individual_networks.get("networks", [])
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
            endpoint = _WIRED_NETWORK_DELETE_ENDPOINT.format(site_id=site_id, vlan_id=delete_target)
        else:
            endpoint = _NETWORK_UPDATE_ENDPOINT.format(site_id=site_id, network_id=network_id)

        response = await aruba_service.call_api(
            method="DELETE",
            endpoint=endpoint,
            aruba_token=aruba_token,
            headers={
                "Referer": _NETWORK_OVERVIEW_REFERER.format(site_id=site_id),
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
        self,
        site_id: str,
        network_id: str,
        updates: Dict[str, Any],
        aruba_token: str,
    ) -> Dict[str, Any]:
        raw_networks = await self._get_networks_summary_response(site_id, aruba_token)
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

        update_payload = self._sanitize_network_update_payload(target_network)
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

            if not self._is_valid_ipv4_address(network_address):
                raise HTTPException(status_code=400, detail="Network address must be a valid IPv4 address.")
            if subnet_mask not in _SUPPORTED_NETMASKS:
                raise HTTPException(status_code=400, detail="Unsupported subnet mask.")
            if dns_mode not in {"automatic", "static"}:
                raise HTTPException(status_code=400, detail="Unsupported DNS mode.")

            dns_scope["kind"] = dns_scope.get("kind") or "dns"
            dns_scope["dnsServerAssignationMode"] = dns_mode

            if dns_mode == "static":
                if not primary_dns:
                    raise HTTPException(status_code=400, detail="Primary DNS Server is required.")
                if not self._is_valid_ipv4_address(primary_dns):
                    raise HTTPException(status_code=400, detail="Primary DNS Server must be a valid IPv4 address.")

                if secondary_dns:
                    if not self._is_valid_ipv4_address(secondary_dns):
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
            endpoint=_NETWORK_UPDATE_ENDPOINT.format(site_id=site_id, network_id=network_id),
            aruba_token=aruba_token,
            json_data=update_payload,
            headers={
                "Referer": _NETWORK_OVERVIEW_REFERER.format(site_id=site_id),
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
            "network": await self._build_updated_wireless_network_response(
                site_id,
                network_id,
                response_payload,
                aruba_token,
            ),
        }

    async def update_individual_wireless_network_assignment(
        self,
        site_id: str,
        network_id: str,
        updates: Dict[str, Any],
        aruba_token: str,
    ) -> Dict[str, Any]:
        raw_networks = await self._get_networks_summary_response(site_id, aruba_token)
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

        update_payload = self._sanitize_network_update_payload(target_network)
        update_payload.update({
            "isAvailableOn24GHzRadioBand": bool(updates.get("isAvailableOn24GHzRadioBand", target_network.get("isAvailableOn24GHzRadioBand", False))),
            "isAvailableOn5GHzRadioBand": bool(updates.get("isAvailableOn5GHzRadioBand", target_network.get("isAvailableOn5GHzRadioBand", False))),
            "isAvailableOn6GHzRadioBand": bool(updates.get("isAvailableOn6GHzRadioBand", target_network.get("isAvailableOn6GHzRadioBand", False))),
            "isLegacy80211bRatesEnabled": bool(updates.get("isLegacy80211bRatesEnabled", target_network.get("isLegacy80211bRatesEnabled", False))),
        })
        if "accessPoints" in updates:
            update_payload["accessPoints"] = self._build_access_point_update_payload(updates.get("accessPoints"))

        response = await aruba_service.call_api(
            method="PUT",
            endpoint=_NETWORK_UPDATE_ENDPOINT.format(site_id=site_id, network_id=network_id),
            aruba_token=aruba_token,
            json_data=update_payload,
            headers={
                "Referer": _NETWORK_OVERVIEW_REFERER.format(site_id=site_id),
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
            "network": await self._build_updated_wireless_network_response(
                site_id,
                network_id,
                response_payload,
                aruba_token,
            ),
        }

    async def update_individual_wireless_access_control(
        self,
        site_id: str,
        network_id: str,
        updates: Dict[str, Any],
        aruba_token: str,
    ) -> Dict[str, Any]:
        raw_networks, wired_response = await asyncio.gather(
            self._get_networks_summary_response(site_id, aruba_token),
            self._get_wired_networks_response(site_id, aruba_token),
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

        current_wireless_network = self._find_wireless_network_in_wired_response(wired_response, network_id)
        current_allow_list = self._normalize_allow_list(
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
        allowed_destinations = self._normalize_allowed_destinations(updates.get("allowedDestinations"))

        if is_specific_destinations_allowed:
            if not allowed_destinations:
                raise HTTPException(status_code=400, detail="At least one allowed destination is required.")
            invalid_destinations = [
                destination for destination in allowed_destinations
                if not self._is_valid_ipv4_address(destination)
            ]
            if invalid_destinations:
                raise HTTPException(status_code=400, detail="Allowed destinations must be valid IPv4 addresses.")
        else:
            allowed_destinations = []

        update_payload = self._sanitize_network_update_payload(target_network)
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
                endpoint=f"{_EXTEND_ALLOW_LIST_ENDPOINT.format(site_id=site_id, network_id=network_id)}?action=removeFromAllowList",
                aruba_token=aruba_token,
                json_data={
                    "macAddresses": removed_client_mac_addresses,
                },
                headers={
                    "Referer": _NETWORK_OVERVIEW_REFERER.format(site_id=site_id),
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
                endpoint=f"{_EXTEND_ALLOW_LIST_ENDPOINT.format(site_id=site_id, network_id=network_id)}?action=addToAllowList",
                aruba_token=aruba_token,
                json_data={
                    "macAddresses": added_client_mac_addresses,
                },
                headers={
                    "Referer": _NETWORK_OVERVIEW_REFERER.format(site_id=site_id),
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
                endpoint=_EXTEND_ALLOW_LIST_ENDPOINT.format(site_id=site_id, network_id=network_id),
                aruba_token=aruba_token,
                json_data={
                    "id": allow_list_id,
                    "isAllowListEnabled": is_specific_clients_enabled,
                    "isExtendAllowListEnabled": False,
                },
                headers={
                    "Referer": _NETWORK_OVERVIEW_REFERER.format(site_id=site_id),
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
            endpoint=_NETWORK_UPDATE_ENDPOINT.format(site_id=site_id, network_id=network_id),
            aruba_token=aruba_token,
            json_data=update_payload,
            headers={
                "Referer": _NETWORK_OVERVIEW_REFERER.format(site_id=site_id),
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
            "network": await self._build_updated_wireless_network_response(
                site_id,
                network_id,
                response_payload,
                aruba_token,
            ),
        }

    async def get_individual_wireless_specific_clients(
        self,
        site_id: str,
        network_id: str,
        aruba_token: str,
    ) -> Dict[str, Any]:
        wired_response = await self._get_wired_networks_response(site_id, aruba_token)
        wireless_network = self._find_wireless_network_in_wired_response(wired_response, network_id)
        if not wireless_network:
            raise HTTPException(status_code=404, detail="Wireless network allow list not found.")

        return {
            "status": "success",
            "siteId": site_id,
            "networkId": str(network_id),
            "networkName": wireless_network.get("networkName") or wireless_network.get("name") or "Unnamed SSID",
            "allowList": self._normalize_allow_list(wireless_network.get("allowList")),
        }

    async def set_individual_wireless_specific_clients_extend(
        self,
        site_id: str,
        network_id: str,
        updates: Dict[str, Any],
        aruba_token: str,
    ) -> Dict[str, Any]:
        current_state = await self.get_individual_wireless_specific_clients(site_id, network_id, aruba_token)
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
            endpoint=_EXTEND_ALLOW_LIST_ENDPOINT.format(site_id=site_id, network_id=network_id),
            aruba_token=aruba_token,
            json_data=payload,
            headers={
                "Referer": _NETWORK_OVERVIEW_REFERER.format(site_id=site_id),
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

        refreshed_state = await self.get_individual_wireless_specific_clients(site_id, network_id, aruba_token)
        return {
            "status": "success",
            "message": "Wireless Specific Clients state updated successfully.",
            **refreshed_state,
        }

    async def add_individual_wireless_specific_clients(
        self,
        site_id: str,
        network_id: str,
        updates: Dict[str, Any],
        aruba_token: str,
    ) -> Dict[str, Any]:
        current_state = await self.get_individual_wireless_specific_clients(site_id, network_id, aruba_token)
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
            endpoint=f"{_EXTEND_ALLOW_LIST_ENDPOINT.format(site_id=site_id, network_id=network_id)}?action=addToAllowList",
            aruba_token=aruba_token,
            json_data={
                "macAddresses": mac_addresses,
            },
            headers={
                "Referer": _NETWORK_OVERVIEW_REFERER.format(site_id=site_id),
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

        refreshed_state = await self.get_individual_wireless_specific_clients(site_id, network_id, aruba_token)
        return {
            "status": "success",
            "message": "Wireless Specific Clients added successfully.",
            **refreshed_state,
        }


config_service = ConfigService()
