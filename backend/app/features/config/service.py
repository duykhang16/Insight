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
_WIRED_NETWORK_DELETE_ENDPOINT = "/api/sites/{site_id}/wiredNetworks/{vlan_id}"
_NETWORK_OVERVIEW_REFERER = "https://portal.instant-on.hpe.com/sites/{site_id}/networks/overview"
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

    def _normalize_individual_wireless_network(self, network: Dict[str, Any]) -> Dict[str, Any]:
        authentication = network.get("authentication", "psk")
        security = str(network.get("security", "wpa3")).lower()
        security_option = "wpa23_personal"
        if authentication == "psk" and security == "wpa2":
            security_option = "wpa2_personal"
        elif authentication == "eap" and security == "wpa2":
            security_option = "wpa2_enterprise"
        elif authentication == "eap" and security == "wpa3":
            security_option = "wpa23_enterprise"

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
            "isIgmpSnoopingEnabled": network.get("isIgmpSnoopingEnabled", True),
            "isDhcpArpProtectionEnabled": network.get("isDhcpArpProtectionEnabled", False),
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

        # --- Bước 3: Parse và chuẩn hoá networksSummary ---
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
            "networks":     networks,
            "guest_portal": guest_portal,
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
        site_config = await self.get_site_config(site_id, aruba_token)
        wired_response = await self._get_wired_networks_response(site_id, aruba_token)

        wireless_networks = [
            self._normalize_individual_wireless_network(network)
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
            "network": self._normalize_individual_wireless_network(response_payload),
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
            delete_target = target_network.get("vlanId")
            if delete_target in (None, ""):
                raise HTTPException(status_code=400, detail="Wired network VLAN id is missing.")
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
            "network": self._normalize_individual_wireless_network(response_payload),
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
            "network": self._normalize_individual_wireless_network(response_payload),
        }


config_service = ConfigService()
