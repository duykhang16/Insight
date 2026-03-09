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
from typing import Any, Dict, List, Optional

from fastapi import HTTPException
from app.shared.aruba import aruba_service

# Endpoint fallback chain (mới → cũ)
_NETS_ENDPOINTS = [
    "/api/sites/{site_id}/networksSummary",
    "/api/v1/sites/{site_id}/networksSummary",
]
_GUEST_ENDPOINT = "/api/sites/{site_id}/guestPortalSettings"


class ConfigService:

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
            raw = nets_response.json()
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


config_service = ConfigService()
