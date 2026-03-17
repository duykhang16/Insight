"""
Dịch vụ Overview — lấy danh sách site trực tiếp từ Aruba API.

Kiến trúc Stateless (stateless_architecture.md):
  - TUYỆT ĐỐI không cache site hay token xuống database.
  - Role Aruba (userRoleOnSite) được map theo thời gian thực (Live Mapping).
  - insight_app_role lấy từ DB insight (Track 1), chỉ tra một lần mỗi request.
  - 401/403 từ Aruba → raise HTTPException(401) để frontend interceptor kích hoạt /refresh.
"""
from typing import List, Dict, Any
import re

from fastapi import HTTPException
from app.shared.aruba import aruba_service

# Map Aruba role verbatim → shorthand nội bộ
_ARUBA_ROLE_MAP: Dict[str, str] = {
    "administrator": "admin",
    "operator":      "op",
    "viewer":        "view",
    "guest":         "guest",
}

# Các endpoint Aruba cần thử theo thứ tự (mới → cũ)
_SITES_ENDPOINTS = ["/api/sites", "/api/v1/sites"]


class OverviewService:

    async def get_live_sites(
        self,
        aruba_token: str,
        caller_email: str = ""
    ) -> List[Dict[str, Any]]:
        """
        Lấy danh sách site từ Aruba API và map role theo thời gian thực.

        Args:
            aruba_token:   Bearer token do trình duyệt gửi lên.
            caller_email:  Email người dùng (từ header X-Insight-User) để tra
                           insight_app_role từ DB (Track 1).

        Returns:
            Danh sách site đã chuẩn hoá; raise HTTPException(401) nếu token hết hạn.
        """
        # --- Bước 1: Gọi Aruba API, thử từng endpoint ---
        response = None
        for endpoint in _SITES_ENDPOINTS:
            response = await aruba_service.call_api(
                method="GET",
                endpoint=endpoint,
                aruba_token=aruba_token,
                use_master_auto=True
            )
            if response.status_code == 200:
                break
            if response.status_code in (401, 403):
                # Token hết hạn — báo ngay, không thử endpoint tiếp theo
                raise HTTPException(
                    status_code=401,
                    detail="Phiên làm việc Aruba đã hết hạn. Vui lòng làm mới token."
                )

        if response is None or response.status_code != 200:
            print(f"[OVERVIEW] Aruba API trả về lỗi: {response.status_code if response else 'no response'}")
            return []

        # --- Bước 2: Tra insight_app_role một lần (Track 1) ---
        insight_app_role = "guest"
        if caller_email:
            from app.database.auth_crud import get_user_by_email
            user = await get_user_by_email(caller_email)
            if user:
                insight_app_role = user.get("role", "guest")

        # --- Bước 3: Parse JSON và map role theo thời gian thực ---
        try:
            data = response.json()
            raw_elements: list = data if isinstance(data, list) else data.get("elements", [])

            sites: List[Dict[str, Any]] = []
            for node in raw_elements:
                aruba_role_raw: str = (node.get("userRoleOnSite") or node.get("role") or "").strip()
                raw_role: str = aruba_role_raw.lower()
                
                # Robust role mapping
                mapped_role = "view"
                if raw_role.startswith("admin"): mapped_role = "admin"
                elif raw_role.startswith("op"): mapped_role = "op"
                elif raw_role.startswith("view"): mapped_role = "view"
                elif raw_role.startswith("guest"): mapped_role = "guest"

                # Enriched fields for Sites Grid UI
                health_score_node = node.get("currentHealthScore") or {}
                health_score = health_score_node.get("score") if isinstance(health_score_node, dict) else None
                
                alerts_node = node.get("activeAlertsCounters") or {}
                alerts_count = 0
                if isinstance(alerts_node, dict):
                    # Sum all alert severities
                    alerts_count = sum(v for v in alerts_node.values() if isinstance(v, (int, float)))

                sites.append({
                    "id":                    node.get("id") or node.get("siteId") or node.get("site_id"),
                    "siteId":                node.get("id") or node.get("siteId") or node.get("site_id"),
                    "siteName":              node.get("name") or node.get("siteName") or node.get("site_name", "Unknown"),
                    "role":                  mapped_role,
                    "aruba_role_raw":        aruba_role_raw if aruba_role_raw else "unknown",
                    "insight_app_role":      insight_app_role,
                    "status":                node.get("status", "up"),
                    "healthScore":           health_score,
                    "alertsCount":           alerts_count,
                    "alertsDetail":          alerts_node,
                    "healthScoreTrend":      node.get("healthScoreTrend", "stable"),
                    "historyDurationSeconds": node.get("historyDurationSeconds", 86400),
                })

            # --- Bước 4: Zone filter — non-global-admin chỉ thấy sites trong zones của mình ---
            from app.config import SUPER_ADMIN_EMAILS
            from app.database.member_permissions_crud import get_effective_site_ids_for_user

            is_global_admin = insight_app_role in ("super_admin", "tenant_admin") or (caller_email in SUPER_ADMIN_EMAILS)
            if not is_global_admin and caller_email:
                allowed_ids = await get_effective_site_ids_for_user(caller_email)
                allowed_set = set(allowed_ids)
                sites = [s for s in sites if s.get("siteId") in allowed_set]

            # --- Bước 5: Template Enrichment (using templates.site_ids) ---
            if caller_email:
                try:
                    from app.features.templates.service import get_site_template_map
                    template_map = await get_site_template_map(caller_email)
                    for site in sites:
                        sid = site.get("siteId")
                        if sid in template_map:
                            site["template"] = template_map[sid]
                        else:
                            site["template"] = None
                except Exception as e:
                    print(f"[OVERVIEW] Template enrichment failed: {e}")

            return sites


        except Exception as exc:
            print(f"[OVERVIEW] Lỗi parse response: {exc}")
            return []

    # ─── Helpers ────────────────────────────────────────────────────────

    async def _call_aruba(self, method: str, endpoint: str, aruba_token: str):
        """Gọi Aruba API, raise 401 nếu token hết hạn."""
        response = await aruba_service.call_api(
            method=method, endpoint=endpoint, aruba_token=aruba_token,
        )
        if response.status_code in (401, 403):
            raise HTTPException(status_code=401, detail="Phiên làm việc Aruba đã hết hạn.")
        if response.status_code != 200:
            raise HTTPException(status_code=response.status_code, detail="Aruba API error.")
        return response.json()

    @staticmethod
    def _extract_elements(data) -> list:
        """Trích list elements từ response Aruba (hỗ trợ nhiều format)."""
        if isinstance(data, list):
            return data
        if isinstance(data, dict):
            return data.get("elements", data.get("clients", data.get("alerts", data.get("devices", []))))
        return []

    # ─── 1. Site Detail ─────────────────────────────────────────────────

    async def get_site_detail(self, site_id: str, aruba_token: str) -> Dict[str, Any]:
        """
        Trả về thông tin cơ bản của site, đã chuẩn hoá cho header UI.
        """
        raw = await self._call_aruba("GET", f"/api/sites/{site_id}", aruba_token)
        return {
            "id":       raw.get("id") or raw.get("siteId") or site_id,
            "name":     raw.get("name") or raw.get("siteName", "Unknown"),
            "status":   raw.get("status", "up"),
            "health":   raw.get("health"),
            "address":  raw.get("address"),
            "country":  raw.get("country"),
            "timezone": raw.get("timezone"),
        }

    # ─── 2. Site Dashboard ──────────────────────────────────────────────

    async def get_site_dashboard(self, site_id: str, aruba_token: str) -> Dict[str, Any]:
        """
        Trả về dashboard metrics đã flatten — FE không cần đào nested paths.
        Bao gồm: healthScore, alerts summary, clients summary, networks summary,
        devices summary, và applications data.
        """
        raw = await self._call_aruba("GET", f"/api/sites/{site_id}/dashboard", aruba_token)

        # -- Health --
        health_overview = raw.get("healthOverview") or {}
        current_score = health_overview.get("currentScore") or {}

        # -- Alerts --
        alerts_overview = raw.get("alertsOverview") or {}
        major = alerts_overview.get("activeMajorAlertsCount", 0)
        minor = alerts_overview.get("activeMinorAlertsCount", 0)
        info  = alerts_overview.get("activeInfoAlertsCount", 0)

        # -- Clients --
        clients_overview = raw.get("clientsOverview") or {}
        total_client = clients_overview.get("totalClient") or {}
        wired_client = clients_overview.get("wiredClient") or {}
        wireless_client = clients_overview.get("wirelessClient") or {}

        # -- Networks --
        networks_overview = raw.get("networksOverview") or {}
        wireless_nets  = networks_overview.get("wirelessNetworks") or 0
        wired_nets     = networks_overview.get("wiredNetworks") or 0
        vpn_nets       = networks_overview.get("vpnNetworks") or 0
        inactive_wireless = networks_overview.get("inactiveWirelessNetworks") or 0
        inactive_wired    = networks_overview.get("inactiveWiredNetworks") or 0
        total_nets     = wireless_nets + wired_nets + vpn_nets
        active_nets    = total_nets - inactive_wireless - inactive_wired

        # -- Devices --
        devices_overview = raw.get("devicesOverview") or {}
        device_types = ["accessPoints", "switches", "stacks", "wifiRouters", "gateways"]
        online_devices = 0
        total_devices  = 0
        for dt in device_types:
            section = devices_overview.get(dt) or {}
            online_devices += section.get("online", 0)
            total_devices  += section.get("total", 0)

        # -- Applications --
        apps_overview = raw.get("applicationsOverview") or {}
        apps_total = apps_overview.get("applicationsTotal") or {}
        grand_up   = apps_total.get("upstreamDataTransferredInBytes") or apps_total.get("upstreamDataTransferredDuringLast24HoursInBytes", 0)
        grand_down = apps_total.get("downstreamDataTransferredInBytes") or apps_total.get("downstreamDataTransferredDuringLast24HoursInBytes", 0)
        raw_categories = apps_total.get("transferredDataByCategory") or []

        app_categories = []
        grand_total = grand_up + grand_down
        for cat in raw_categories:
            slug = cat.get("applicationCategory") or cat.get("applicationCategoryName", "unknown")
            up   = cat.get("upstreamDataTransferredInBytes") or cat.get("upstreamDataTransferredDuringLast24HoursInBytes", 0)
            down = cat.get("downstreamDataTransferredInBytes") or cat.get("downstreamDataTransferredDuringLast24HoursInBytes", 0)
            usage = up + down
            app_categories.append({
                "id":         slug,
                "usage":      usage,
                "percentage": round((usage / grand_total * 100), 1) if grand_total > 0 else 0,
            })
        app_categories.sort(key=lambda x: x["usage"], reverse=True)

        return {
            "siteId": site_id,
            "healthScore":       current_score.get("score"),
            "healthConditions":  current_score.get("conditionsCount", 0),
            "alerts": {
                "major": major,
                "minor": minor,
                "info":  info,
                "total": major + minor + info,
            },
            "clients": {
                "total":    total_client.get("total", 0),
                "good":     total_client.get("goodCount", 0),
                "fair":     total_client.get("fairCount", 0),
                "poor":     total_client.get("poorCount", 0),
                "wired":    wired_client.get("total", 0),
                "wireless": wireless_client.get("total", 0),
            },
            "networks": {
                "total":           total_nets,
                "active":          active_nets,
                "inactive":        inactive_wireless + inactive_wired,
                "wireless":        wireless_nets,
                "wired":           wired_nets,
                "vpn":             vpn_nets,
                "inactiveWireless": inactive_wireless,
                "inactiveWired":    inactive_wired,
            },
            "devices": {
                "online":  online_devices,
                "total":   total_devices,
                "offline": max(0, total_devices - online_devices),
            },
            "applications": {
                "totalUsage":  grand_total,
                "categories":  app_categories,
            },
        }

    # ─── 3. Site Health ─────────────────────────────────────────────────

    async def get_site_health(self, site_id: str, aruba_token: str) -> Dict[str, Any]:
        """
        Trả về health data đã chuẩn hoá: currentScore, counters, và history timeline.
        FE không cần đào h.health.healthScore.score.
        """
        raw = await self._call_aruba("GET", f"/api/sites/{site_id}/health", aruba_token)

        def _extract_conditions(health_node: dict) -> list:
            """Flatten conditions từ clients/networks/devices."""
            conditions = []
            for section_key in ("clients", "networks", "devices"):
                section = health_node.get(section_key) or {}
                for c in (section.get("conditions") or []):
                    conditions.append({
                        "condition":  c.get("condition", ""),
                        "severity":   c.get("conditionSeverity") or c.get("severity", "none"),
                        "sourceType": section_key.rstrip("s").capitalize(),
                        "name":       c.get("name") or c.get("id", ""),
                    })
            return conditions

        def _extract_counters(health_node: dict) -> Dict[str, Dict[str, int]]:
            """Extract counters for clients/networks/devices."""
            result = {}
            for section_key in ("clients", "networks", "devices"):
                section = health_node.get(section_key) or {}
                counters = section.get("counters") or {}
                result[section_key] = {
                    "good": counters.get("goodCount", 0),
                    "fair": counters.get("fairCount", 0),
                    "poor": counters.get("poorCount", 0),
                    "none": counters.get("noneCount", 0),
                }
            return result

        # Current health
        current_health = raw.get("currentHealth") or {}
        current_score_node = current_health.get("healthScore") or {}
        current_score = current_score_node.get("score")

        # Historical health — sorted ascending
        raw_history = raw.get("historicalHealths") or []
        raw_history.sort(key=lambda h: h.get("sampleTime", 0))

        history = []
        for h in raw_history:
            h_health = h.get("health") or {}
            h_score_node = h_health.get("healthScore") or {}
            conditions = _extract_conditions(h_health)
            major_count = sum(1 for c in conditions if c["severity"].lower() in ("major", "poor"))
            minor_count = sum(1 for c in conditions if c["severity"].lower() in ("minor", "fair"))

            history.append({
                "sampleTime":     h.get("sampleTime"),
                "score":          h_score_node.get("score", 0),
                "scoreSeverity":  h_score_node.get("scoreSeverity", "none"),
                "conditions":     conditions,
                "conditionCount": len(conditions),
                "majorCount":     major_count,
                "minorCount":     minor_count,
                "counters":       _extract_counters(h_health),
            })

        return {
            "currentScore":      current_score,
            "currentConditions": _extract_conditions(current_health),
            "counters":          _extract_counters(current_health),
            "history":           history,
        }

    # ─── 4. Site Alerts ─────────────────────────────────────────────────

    async def get_site_alerts(self, site_id: str, aruba_token: str) -> List[Dict[str, Any]]:
        """
        Trả về list alerts đã chuẩn hoá — FE không cần thử elements/alerts/array.
        """
        raw = await self._call_aruba("GET", f"/api/sites/{site_id}/alerts", aruba_token)
        elements = self._extract_elements(raw)

        alerts = []
        for a in elements:
            if not isinstance(a, dict):
                continue
            props = a.get("alertTypeProperties") or {}
            target = (
                props.get("clientName") or props.get("deviceName") or
                props.get("apName") or props.get("switchName") or
                props.get("gatewayName") or
                a.get("deviceName") or a.get("apName") or
                a.get("switchName") or a.get("siteName")
            )
            alerts.append({
                "id":          a.get("id"),
                "type":        a.get("type"),
                "severity":    a.get("severity"),
                "description": a.get("description"),
                "raisedTime":  a.get("raisedTime"),
                "clearedTime": a.get("clearedTime"),
                "secondsSinceRaised": a.get("numberOfSecondsSinceRaised"),
                "target":      target,
                "siteName":    a.get("siteName"),
            })

        # Sort: active first, then by raisedTime desc
        alerts.sort(key=lambda x: (0 if x["clearedTime"] is None else 1, -(x.get("raisedTime") or 0)))
        return alerts

    async def get_alert_notification(self, site_id: str, user_email: str, aruba_token: str, hours: int = 24) -> Dict[str, Any]:
        """
        Returns alert notification data for a site:
        - total alerts in the last N hours
        - unread count (alerts raised after user's last read timestamp)
        """
        import time
        from app.database.connection import get_database

        db = get_database()
        now_epoch = int(time.time())
        cutoff_epoch = now_epoch - (hours * 3600)

        # Fetch all alerts from Aruba
        all_alerts = await self.get_site_alerts(site_id, aruba_token)

        # Filter: active alerts (no clearedTime) raised in the last N hours
        recent_alerts = []
        for a in all_alerts:
            raised = a.get("raisedTime")
            if raised and raised >= cutoff_epoch:
                recent_alerts.append(a)

        # Get user's last read timestamp for this site
        read_doc = await db.alert_reads.find_one({"user_email": user_email, "site_id": site_id})
        last_read_at = read_doc.get("last_read_at", 0) if read_doc else 0

        # Count unread = alerts raised after last_read_at
        unread = 0
        for a in recent_alerts:
            raised = a.get("raisedTime", 0)
            if raised > last_read_at:
                unread += 1

        return {
            "total_recent": len(recent_alerts),
            "unread": unread,
            "last_read_at": last_read_at,
            "hours": hours,
        }

    async def mark_alerts_read(self, site_id: str, user_email: str) -> Dict[str, Any]:
        """Mark alerts as read for a user on a specific site."""
        import time
        from app.database.connection import get_database

        db = get_database()
        now_epoch = int(time.time())

        await db.alert_reads.update_one(
            {"user_email": user_email, "site_id": site_id},
            {"$set": {"last_read_at": now_epoch, "user_email": user_email, "site_id": site_id}},
            upsert=True
        )
        return {"status": "ok", "last_read_at": now_epoch}

    # ─── 5. Site Clients ────────────────────────────────────────────────

    async def get_site_clients(self, site_id: str, aruba_token: str) -> List[Dict[str, Any]]:
        """
        Lấy danh sách clients đã flatten — FE không cần đào nested structure.
        Thử nhiều Aruba sub-paths (clients, clientSummary, dashboard).
        """
        trials = [
            f"/api/sites/{site_id}/clients",
            f"/api/v1/sites/{site_id}/clients",
            f"/api/sites/{site_id}/clientSummary",
            f"/api/sites/{site_id}/clientsSummary",
        ]

        raw_data = None
        for endpoint in trials:
            try:
                response = await aruba_service.call_api("GET", endpoint, aruba_token=aruba_token)
                if response.status_code == 200:
                    raw_data = response.json()
                    break
                if response.status_code in (401, 403):
                    raise HTTPException(status_code=401, detail="Phiên làm việc Aruba đã hết hạn.")
            except HTTPException:
                raise
            except Exception:
                continue

        if raw_data is None:
            raise HTTPException(status_code=404, detail="Could not find clients endpoint for this site.")

        elements = self._extract_elements(raw_data)
        # Also check clientsOverview.clients
        if not elements and isinstance(raw_data, dict):
            elements = (raw_data.get("clientsOverview") or {}).get("clients", [])

        clients = []
        for item in elements:
            if not isinstance(item, dict):
                continue

            # Name resolution
            name = item.get("name")
            host = item.get("hostName")
            mac  = item.get("macAddress", "")
            display_name = name if (name and name != mac) else (host or mac)

            # Network resolution (deep search)
            network = (
                item.get("wirelessNetworkName") or
                item.get("wiredNetworkName") or
                self._deep_get(item, "connectedToPorts", 0, "accessedWiredNetworks", 0, "networkName") or
                (f"VLAN {item['vlanId']}" if item.get("vlanId") else "")
            )

            # Device resolution
            device_name = (
                item.get("apName") or item.get("switchName") or
                item.get("associatedToDeviceName") or item.get("associatedDeviceName") or
                self._deep_get(item, "connectedToPorts", 0, "deviceName") or
                item.get("deviceName", "")
            )
            # Avoid device name = client name
            if device_name == display_name:
                device_name = item.get("apName") or item.get("switchName") or item.get("associatedDeviceName", "")

            # Interface resolution
            is_wired = (item.get("clientType") or "").lower() == "wired"
            if is_wired:
                port = (
                    item.get("portNumber") or item.get("portId") or
                    self._deep_get(item, "connectedToPorts", 0, "portNumber") or ""
                )
                interface = f"Port {port}" if port else ""
            else:
                band = item.get("wirelessBand") or item.get("radioBand", "")
                interface = band.lower().replace("ghz", " GHz") if band else ""

            # Usage
            down = item.get("downstreamDataTransferredInBytes", 0)
            up   = item.get("upstreamDataTransferredInBytes", 0)

            clients.append({
                "id":                item.get("id") or mac,
                "name":              display_name,
                "macAddress":        mac,
                "ipAddress":         item.get("ipAddress") or item.get("reservedIpAddress", ""),
                "health":            item.get("health", ""),
                "status":            item.get("status", ""),
                "clientType":        item.get("clientType", ""),
                "network":           network,
                "device":            device_name,
                "devicePartNumber":  item.get("associatedDevicePartNumber", ""),
                "interface":         interface,
                "durationSeconds":   item.get("stateDurationInSeconds") or item.get("connectionDurationInSeconds", 0),
                "usageDown":         down,
                "usageUp":           up,
                "usageTotal":        down + up,
            })

        return clients

    @staticmethod
    def _deep_get(d: dict, *keys):
        """Safely traverse nested dict/list: _deep_get(d, 'a', 0, 'b')."""
        for key in keys:
            if d is None:
                return None
            if isinstance(key, int):
                if isinstance(d, list) and len(d) > key:
                    d = d[key]
                else:
                    return None
            elif isinstance(d, dict):
                d = d.get(key)
            else:
                return None
        return d

    # ─── 6. Site Networks (wiredNetworks) ───────────────────────────────

    async def get_site_networks(self, site_id: str, aruba_token: str) -> Dict[str, Any]:
        """
        Lấy và flatten wiredNetworks + SSIDs — FE không cần dataProcessor.js.
        """
        raw = await self._call_aruba("GET", f"/api/sites/{site_id}/wiredNetworks", aruba_token)
        elements = raw.get("elements", []) if isinstance(raw, dict) else (raw if isinstance(raw, list) else [])

        wired_rows = []
        wireless_rows = []

        for wired in elements:
            if not isinstance(wired, dict):
                continue
            ssids = wired.get("wirelessNetworks") or []
            wired_active = self._resolve_active(wired)

            # Process SSIDs first (needed for client count)
            ssid_list = []
            wireless_client_total = 0
            for ssid in ssids:
                if not isinstance(ssid, dict):
                    continue
                ssid_active = self._resolve_active(ssid)
                ssid_clients = ssid.get("wirelessClientsCount", 0)
                wireless_client_total += ssid_clients

                band = self._build_band_label(ssid)
                usage_24h = self._calc_app_usage(ssid.get("applicationCategoryUsage"))

                ssid_item = {
                    "id":        ssid.get("id"),
                    "name":      ssid.get("networkName") or ssid.get("name", "—"),
                    "isEnabled": ssid_active,
                    "health":    ssid.get("health"),
                    "usage":     ssid.get("type") or wired.get("type", "employee"),
                    "vlanId":    ssid.get("vlanId") or wired.get("vlanId"),
                    "band":      band,
                    "security":  ssid.get("security"),
                    "usage24h":  usage_24h,
                    "clients":   ssid_clients,
                }
                ssid_list.append(ssid_item)
                wireless_rows.append({**ssid_item, "rowType": "wireless"})

            wired_rows.append({
                "id":        wired.get("id"),
                "rowType":   "wired",
                "name":      wired.get("wiredNetworkName") or f"VLAN {wired.get('vlanId', '—')}",
                "isEnabled": wired_active,
                "health":    wired.get("health"),
                "usage":     wired.get("type", "employee"),
                "vlanId":    wired.get("vlanId"),
                "band":      "—",
                "usage24h":  None,
                "clients":   (wired.get("wiredClientsCount", 0) + wireless_client_total),
                "ssids":     ssid_list,
            })

        return {
            "wired":    wired_rows,
            "wireless": wireless_rows,
            "stats": {
                "wiredCount":          len(wired_rows),
                "wirelessCount":       len(wireless_rows),
                "wiredActive":         sum(1 for r in wired_rows if r["isEnabled"]),
                "wirelessActive":      sum(1 for r in wireless_rows if r["isEnabled"]),
                "wiredInactive":       sum(1 for r in wired_rows if not r["isEnabled"]),
                "wirelessInactive":    sum(1 for r in wireless_rows if not r["isEnabled"]),
                "totalClients":        sum(r["clients"] for r in wired_rows),
            },
        }

    @staticmethod
    def _resolve_active(obj: dict) -> bool:
        """Real-time activation: policy > isEnabled."""
        policy = obj.get("networkActivationEffectivePolicy")
        if policy is not None:
            return policy.get("isActive", False) is True
        return obj.get("isEnabled", True) is True

    @staticmethod
    def _build_band_label(ssid: dict) -> str:
        bands = []
        if ssid.get("isAvailableOn24GHzRadioBand"): bands.append("2.4 GHz")
        if ssid.get("isAvailableOn5GHzRadioBand"):  bands.append("5 GHz")
        if ssid.get("isAvailableOn6GHzRadioBand"):  bands.append("6 GHz")
        return ", ".join(bands) if bands else "—"

    @staticmethod
    def _calc_app_usage(app_usage: list) -> int | None:
        if not isinstance(app_usage, list) or len(app_usage) == 0:
            return None
        return sum(
            (e.get("downstreamDataTransferredInBytes", 0) + e.get("upstreamDataTransferredInBytes", 0))
            for e in app_usage
        )

    # ─── 7. Site Inventory ──────────────────────────────────────────────

    async def get_site_inventory(self, site_id: str, aruba_token: str) -> List[Dict[str, Any]]:
        """
        Lấy danh sách devices đã chuẩn hoá — FE không cần extractDevices/getClientCount.
        """
        raw = await self._call_aruba("GET", f"/api/sites/{site_id}/inventory", aruba_token)
        elements = self._extract_elements(raw)

        devices = []
        for item in elements:
            if not isinstance(item, dict):
                continue
            device_type = (item.get("deviceType") or "").lower()
            is_ap = device_type == "accesspoint"
            status_raw = (item.get("status") or item.get("state", "")).lower()
            is_up = status_raw == "up"
            health = (item.get("health") or ("good" if is_up else "poor")).lower()

            # Client count
            if is_ap:
                radios = item.get("radios") or []
                if radios:
                    client_count = sum(r.get("wirelessClientsCount", 0) for r in radios)
                else:
                    client_count = item.get("connectedClients", 0)
            else:
                client_count = (
                    item.get("groupedWiredClientsCount") or
                    item.get("wiredClientsCount") or
                    item.get("connectedClients", 0)
                )

            # Radio bands (AP only)
            radio_bands = None
            if is_ap:
                bands = []
                for r in (item.get("radios") or []):
                    band = r.get("wirelessBand") or r.get("band", "")
                    cleaned = re.sub(r'(\d+\.?\d*)ghz', r'\1G', band, flags=re.IGNORECASE)
                    if cleaned:
                        bands.append(cleaned)
                radio_bands = " / ".join(bands) if bands else None

            devices.append({
                "id":            item.get("id") or item.get("macAddress", ""),
                "name":          item.get("name") or item.get("defaultName") or item.get("macAddress", "—"),
                "macAddress":    item.get("macAddress", ""),
                "ipAddress":     item.get("ipAddress", ""),
                "status":        "up" if is_up else "down",
                "health":        health,
                "isUp":          is_up,
                "deviceType":    item.get("deviceType", ""),
                "model":         item.get("model", ""),
                "uptimeSeconds": item.get("uptimeInSeconds", 0),
                "clientCount":   client_count,
                "radioBands":    radio_bands,
            })

        return devices


overview_service = OverviewService()
