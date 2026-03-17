import httpx
import json
import asyncio
from typing import List, Dict, Any, Optional
from datetime import datetime
from app.database.connection import get_database

async def get_live_account_sites(aruba_token: str) -> List[Dict[str, Any]]:
    """Fetch all live sites for the provided token."""
    print("!!! DEBUG: GET_LIVE_ACCOUNT_SITES CALLED !!!")
    from app.shared.aruba import aruba_service
    try:
        # Use the service singleton which has smarter header spoofing
        res = await aruba_service.call_api(
            method="GET",
            endpoint="/api/sites",
            aruba_token=aruba_token,
            use_master_auto=True
        )

        if res.status_code in [401, 403]:
            # Try v1 if legacy fails
            res = await aruba_service.call_api(
                method="GET",
                endpoint="/api/v1/sites",
                aruba_token=aruba_token,
                use_master_auto=True
            )

        if res.status_code in [401, 403]:
            print(f"[CLONER] Live sites fetch received {res.status_code}: {res.text[:200]}")
            from fastapi import HTTPException
            raise HTTPException(status_code=401, detail="Phiên làm việc Aruba đã hết hạn.")

        if res.status_code == 200:
            data = res.json()
            raw_elements = data if isinstance(data, list) else data.get("elements", [])

            # Standardize fields: 'id' -> 'siteId', 'name' -> 'siteName'
            standard_sites = []
            for s in raw_elements:
                role_raw = (s.get("role") or s.get("userRoleOnSite") or "").strip().lower()
                standard_sites.append({
                    "id": s.get("id") or s.get("siteId") or s.get("site_id"),
                    "siteId": s.get("id") or s.get("siteId") or s.get("site_id"),
                    "siteName": s.get("name") or s.get("siteName") or s.get("site_name", "Unknown Site"),
                    "role": "admin" if role_raw.startswith("admin") else ("op" if role_raw.startswith("op") else ("view" if role_raw.startswith("view") else "view"))
                })
            return standard_sites
    except Exception as e:
        from fastapi import HTTPException
        print(f"[CLONER] Failed to fetch live sites: {e}")
        if isinstance(e, HTTPException):
            raise e
    return []

async def fetch_site_config_live(site_id: str, aruba_token: str) -> Dict[str, Any]:
    """Fetch live wired/wireless configuration for a site using the provided token."""
    from app.shared.aruba import aruba_service
    try:
        # Fetch networks
        res_nets = await aruba_service.call_api(
            method="GET",
            endpoint=f"/api/sites/{site_id}/networksSummary",
            aruba_token=aruba_token,
            use_master_auto=True
        )

        if res_nets.status_code in [401, 403]:
            # Try v1 fallback
            res_nets = await aruba_service.call_api(
                method="GET",
                endpoint=f"/api/v1/sites/{site_id}/networksSummary",
                aruba_token=aruba_token,
                use_master_auto=True
            )

        if res_nets.status_code in [401, 403]:
            print(f"[CLONER] Live config fetch received {res_nets.status_code}")
            from fastapi import HTTPException
            raise HTTPException(status_code=401, detail="Phiên làm việc Aruba đã hết hạn.")

        # Fetch guest portal settings (site-level)
        res_guest = await aruba_service.call_api(
            method="GET",
            endpoint=f"/api/sites/{site_id}/guestPortalSettings",
            aruba_token=aruba_token,
            use_master_auto=True
        )

        # Fetch wired networks (VLANs, wired policies)
        res_wired = await aruba_service.call_api(
            method="GET",
            endpoint=f"/api/sites/{site_id}/wiredNetworks",
            aruba_token=aruba_token,
            use_master_auto=True
        )

        # Safe JSON parsing
        nets_data = []
        if res_nets.status_code == 200:
            try:
                nets_data = res_nets.json()
            except Exception:
                print(f"[CLONER] Failed to parse networks JSON: {res_nets.text[:100]}")

        guest_data = None
        if res_guest.status_code == 200:
            try:
                guest_data = res_guest.json()
            except Exception:
                print(f"[CLONER] Failed to parse guest portal JSON: {res_guest.text[:100]}")

        wired_data = None
        if res_wired.status_code == 200:
            try:
                wired_data = res_wired.json()
            except Exception:
                print(f"[CLONER] Failed to parse wiredNetworks JSON: {res_wired.text[:100]}")

        config = {
            "networks": nets_data,
            "guest_portal": guest_data,
            "wired_networks": wired_data,
        }

        if not config["networks"] and res_nets.status_code != 200:
            return {"error": f"Live fetch failed with status {res_nets.status_code}. Details: {res_nets.text[:100]}"}

        return config
    except Exception as e:
        print(f"[CLONER] Fetch config exception: {str(e)}")
        return {"error": f"Live fetch exception: {str(e)}"}

async def get_captured_sites() -> List[Dict[str, Any]]:
    """Extract unique site IDs and names from raw logs using multiple patterns."""
    db = get_database()
    import re

    # Pattern 1: Direct sites list (/api/v1/sites or /api/v1/customers/.../sites)
    cursor = db.raw_logs.find(
        {"url": {"$regex": "api/v1/.*sites"}},
        {"response_body": 1, "timestamp": 1, "url": 1}
    ).sort("timestamp", -1)

    sites = {}
    async for doc in cursor:
        body = doc.get("response_body")
        if not body or not isinstance(body, dict): continue
        # Handle { "elements": [...] } or direct list
        elements = body.get("elements", []) if isinstance(body.get("elements"), list) else ([body] if body.get("siteId") else [])
        for s in elements:
            s_id = s.get("siteId")
            if s_id and s_id not in sites:
                sites[s_id] = {
                    "siteId": s_id,
                    "siteName": s.get("siteName", "Unknown Site"),
                    "captured_at": doc.get("timestamp")
                }

    # Pattern 2: Extract Site ID from URLs (e.g. .../sites/{siteId}/dashboard)
    cursor_url = db.raw_logs.find(
        {"url": {"$regex": "/sites/[a-f0-9-]{36}"}},
        {"url": 1, "timestamp": 1}
    ).sort("timestamp", -1).limit(200)

    async for doc in cursor_url:
        match = re.search(r"sites/([a-f0-9-]{36})", doc["url"])
        if match:
            s_id = match.group(1)
            if s_id not in sites:
                sites[s_id] = {
                    "siteId": s_id,
                    "siteName": f"Site {s_id[:8]}",
                    "captured_at": doc.get("timestamp")
                }

    return sorted(list(sites.values()), key=lambda x: x["captured_at"], reverse=True)

async def fetch_site_config(site_id: str) -> Dict[str, Any]:
    """Retrieve the latest captured wired/wireless config for a site."""
    db = get_database()
    # Flexible match for networksSummary or wiredNetworks anywhere in URL
    cursor = db.raw_logs.find({
        "url": {"$regex": f"sites/{site_id}/(networksSummary|wiredNetworks)"},
        "method": "GET",
        "status_code": 200
    }).sort("timestamp", -1).limit(1)

    log = await cursor.to_list(length=1)
    if not log:
        return {"error": "No configuration found for this site ID in logs."}

    return log[0].get("response_body", {})

async def apply_config_to_site(target_site_id: str, config: Dict[str, Any]):
    """
    Transform source config into a list of operations for the preview.
    Preserves advanced settings like schedules, bandwidth limits, and authentication.
    """
    operations = []

    # 1. Normalize input to a list of network objects and extract guest portal
    raw_networks = []
    guest_portal = None

    if isinstance(config, dict):
        if "networks" in config:
            nets_part = config["networks"]
            # Handle { "networks": { "elements": [...] } } or { "networks": [...] }
            if isinstance(nets_part, dict):
                raw_networks = nets_part.get("elements", [nets_part])
            elif isinstance(nets_part, list):
                raw_networks = nets_part
            else:
                raw_networks = [nets_part]

            guest_portal = config.get("guest_portal")
        elif "elements" in config:
            raw_networks = config["elements"]
        else:
            raw_networks = [config]
    elif isinstance(config, list):
        raw_networks = config

    # Add Networks
    for net in raw_networks:
        # Check if it's a wired network with nested wireless (common in older API logs)
        nested_wireless = net.pop("wirelessNetworks", []) if isinstance(net, dict) else []

        # Prepare standard payload
        # We strip site/network IDs but keep everything else (schedules, auth, limits, ap bindings)
        # Note: accessPoints might have site-specific deviceIds, but user wants 'full' config.
        # We'll keep them for now as they might be needed for binding logic.
        clean_payload = {k: v for k, v in net.items() if k not in ["networkId", "siteId", "kind"]}

        is_wireless = net.get("isWireless", False)
        net_type = "WIRELESS_NETWORK" if is_wireless else "WIRED_NETWORK"

        # Embed Guest Portal data if applicable
        if net.get("isGuestPortalEnabled") and guest_portal:
            clean_payload["_guest_portal_settings"] = guest_portal

        operations.append({
            "type": net_type,
            "name": net.get("networkName") or ("SSID" if is_wireless else "Wired Network"),
            "original_id": net.get("networkId"),
            "payload": clean_payload
        })

        # Add nested wireless if they exist
        for wifi in nested_wireless:
            clean_wifi_payload = {k: v for k, v in wifi.items() if k not in ["networkId", "siteId", "kind"]}
            if "isWireless" not in clean_wifi_payload:
                clean_wifi_payload["isWireless"] = True

            if wifi.get("isGuestPortalEnabled") and guest_portal:
                clean_wifi_payload["_guest_portal_settings"] = guest_portal

            operations.append({
                "type": "WIRELESS_NETWORK",
                "name": wifi.get("networkName") or "SSID",
                "original_id": wifi.get("networkId"),
                "payload": clean_wifi_payload,
            })

    # We no longer add GUEST_PORTAL as a separate operation in the preview list
    # The frontend will just see SSIDs, and when applied, the backend will process the embedded guest settings


    return operations

async def apply_config_live(target_site_id: str, operations: List[Dict[str, Any]], aruba_token: str) -> List[Dict[str, Any]]:
    """Push configuration using the provided token."""
    headers = {
        "Authorization": f"Bearer {aruba_token}",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "en-us",
        "X-ION-API-VERSION": "22",
        "X-ION-CLIENT-TYPE": "InstantOn",
        "X-ION-CLIENT-PLATFORM": "web",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
        "Referer": f"https://portal.instant-on.hpe.com/sites/{target_site_id}/networks/overview",
        "Content-Type": "application/json"
    }

    results = []

    # Pre-flight Permission Check
    async with httpx.AsyncClient(verify=False) as client:
        try:
            site_check_url = f"https://portal.instant-on.hpe.com/api/sites/{target_site_id}"
            res_check = await client.get(site_check_url, headers=headers, timeout=10.0)

            if res_check.status_code == 200:
                site_data = res_check.json()
                role = (site_data.get("userRoleOnSite") or "").lower()
                if role not in ["administrator", "operator"]:
                    print(f"[CLONER] Permission check failed. Role '{role}' is not 'administrator' or 'operator' for site {target_site_id}")
                    return [{"status": "error", "message": f"Pre-flight check failed: You do not have 'administrator' or 'operator' role on this site (Current role is '{role}'). Clone blocked."}]
            else:
                print(f"[CLONER] Warning: Failed to verify site permissions ({res_check.status_code}). Proceeding anyway.")
        except Exception as e:
            print(f"[CLONER] Exception during permission check: {str(e)}")

    # We will collect the guest portal settings from any SSID that has it embedded,
    # and execute it once at the end.
    guest_portal_settings = None

    async with httpx.AsyncClient(verify=False) as client:
        base_url = f"https://portal.instant-on.hpe.com/api/sites/{target_site_id}/networksSummary"

        # Pre-check: Fetch existing networks on target site to detect duplicates
        existing_network_names = set()
        try:
            res_existing = await client.get(base_url, headers=headers, timeout=15.0)
            if res_existing.status_code == 200:
                existing_data = res_existing.json()
                existing_nets = existing_data.get("elements", []) if isinstance(existing_data, dict) else (existing_data if isinstance(existing_data, list) else [])
                existing_network_names = {n.get("networkName", "").lower() for n in existing_nets if isinstance(n, dict) and n.get("networkName")}
                print(f"[CLONER] Target site has {len(existing_network_names)} existing networks: {existing_network_names}")
        except Exception as e:
            print(f"[CLONER] Warning: Could not pre-check target networks: {e}")

        for op in operations:
            try:
                full_payload = op.get("payload", {})

                # Check for embedded guest portal settings
                if "_guest_portal_settings" in full_payload:
                    guest_portal_settings = full_payload.pop("_guest_portal_settings")

                # Duplicate check: Skip if network name already exists on target
                op_name = op.get("name", "")
                if op_name.lower() in existing_network_names:
                    results.append({
                        "name": op_name,
                        "type": op["type"],
                        "status": "SKIPPED (DUPLICATE)",
                        "detail": f"Network '{op_name}' already exists on the target site."
                    })
                    print(f"[CLONER] SKIPPED (DUPLICATE): '{op_name}' already exists on target site")
                    continue

                # Pass 1: "Rich Identity Create" (POST)
                # For Guest/Captive networks, the initial POST is almost the full config.
                create_keys = [
                    "networkName", "type", "authentication", "security", "isWireless",
                    "ipAddressingMode", "isEnabled", "isCaptivePortalEnabled",
                    "isGuestPortalEnabled", "dhcpScope", "isSsidHidden",
                    "isAvailableOn24GHzRadioBand", "isAvailableOn5GHzRadioBand", "isAvailableOn6GHzRadioBand",
                    "isLegacy80211bRatesEnabled", "isHighEfficiency11axEnabled", "isHighEfficiency11axOfdmaEnabled",
                    "isDynamicMulticastOptimizationEnabled", "isBroadcastOnAllBoundApsOnAllBands",
                    "isInternetAllowed", "isIntraSubnetTrafficAllowed", "isAccessRestricted",
                    "activeSchedule", "schedule", "weekSchedule"
                ]

                # Copy basics
                create_payload = {k: v for k, v in full_payload.items() if k in create_keys}

                # Security specific: PSK is needed if not OPEN
                if full_payload.get("security") != "OPEN" and "preSharedKey" in full_payload:
                    create_payload["preSharedKey"] = full_payload["preSharedKey"]

                # Addressing specific: NAT/Internal mode usually forces useVlan=False
                addr_mode = full_payload.get("ipAddressingMode")
                if addr_mode in ["NAT", "internal"]:
                    create_payload["useVlan"] = False
                    create_payload["vlanId"] = None if addr_mode == "internal" else 1
                else:
                    # Bridge mode: keep vlan info if present
                    if "useVlan" in full_payload: create_payload["useVlan"] = full_payload["useVlan"]
                    if "vlanId" in full_payload: create_payload["vlanId"] = full_payload["vlanId"]

                # Critical structure fixes:
                create_payload.update({
                    "accessPoints": [],
                    "wiredNetworkId": None,
                    "isBandwidthLimitEnabled": False,
                    "isAccessRestricted": full_payload.get("isAccessRestricted", False)
                })

                # Basic schedule if it exists, but strip 'state' and 'scheduleId' which are ID-bound
                if "schedule" in full_payload and isinstance(full_payload["schedule"], dict):
                    src_sch = full_payload["schedule"]
                    create_payload["schedule"] = {
                        "activeDays": src_sch.get("activeDays", ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"]),
                        "activeTimeRange": src_sch.get("activeTimeRange", {"enabled": True, "startTime": "09:00", "endTime": "17:00"})
                    }

                print(f"[CLONER] PHASE 1: POST (Create) -> {op['name']}")
                res_post = await client.post(base_url, headers=headers, json=create_payload, timeout=15.0)

                if res_post.status_code not in [200, 201]:
                    results.append({
                        "name": op["name"],
                        "type": op["type"],
                        "status": f"PHASE 1 (CREATE) FAILED [{res_post.status_code}]",
                        "detail": res_post.text[:500]
                    })
                    continue

                # Pass 1 Success!
                post_data = res_post.json()
                new_id = post_data.get("networkId") or post_data.get("id")

                if not new_id:
                    results.append({"name": op["name"], "type": op["type"], "status": "PHASE 1 OK | PHASE 2 SKIPPED", "detail": "Target ID missing from create response."})
                    continue

                # Settle time
                import asyncio
                await asyncio.sleep(0.8)

                # --- Pass 2: "Full Update" (PUT) ---
                # Now we send the ACTUAL full configuration, but still strip root IDs
                update_payload = full_payload.copy()

                # CRITICAL: Strip any field that is site-specific or can cause 400 if devices don't match
                # accessPoints: deviceIds are unique to Site A and will fail on Site B
                # wiredNetworkId: often also site-specific
                problematic_fields = ["networkId", "siteId", "id", "kind", "wiredNetworkId", "accessPoints", "allowList"]
                for k in problematic_fields:
                    update_payload.pop(k, None)

                # Ensure structure is clean for Update
                # Only keep fields that are part of the network configuration itself
                update_url = f"{base_url}/{new_id}"
                print(f"[CLONER] PHASE 2: PUT (Update) -> {op['name']} (ID: {new_id})")
                res_put = await client.put(update_url, headers=headers, json=update_payload, timeout=15.0)

                if res_put.status_code in [200, 204]:
                    results.append({"name": op["name"], "type": op["type"], "status": "SUCCESS (POST+PUT)"})
                else:
                    results.append({
                        "name": op["name"],
                        "type": op["type"],
                        "status": f"PHASE 1 OK | PHASE 2 (UPDATE) FAILED [{res_put.status_code}]",
                        "detail": res_put.text[:500]
                    })

            except Exception as e:
                print(f"[CLONER] ERROR: {str(e)}")
                results.append({"name": op["name"], "type": op["type"], "status": "ERROR", "detail": str(e)})

        # --- Handle GUEST_PORTAL (Single Final Pass after all networks) ---
        # Only apply if at least one network was successfully created
        has_network_success = any("SUCCESS" in r.get("status", "") for r in results)
        if guest_portal_settings and has_network_success:
            try:
                portal_url = f"https://portal.instant-on.hpe.com/api/sites/{target_site_id}/guestPortalSettings"
                print(f"[CLONER] GUEST_PORTAL (Final Pass based on embedded data): PUT")

                # Strip only 'id' which is site-specific. Keep 'kind' as per user cURL.
                clean_portal = {k: v for k, v in guest_portal_settings.items() if k not in ["id"]}
                res_p = await client.put(portal_url, headers=headers, json=clean_portal, timeout=15.0)

                if res_p.status_code in [200, 204]:
                    # Append as supplemental info, not a standalone operation
                    results.append({"name": "Guest Portal Settings", "type": "GUEST_PORTAL", "status": "SUCCESS (GUEST_PORTAL)"})
                else:
                    results.append({
                        "name": "Guest Portal Settings",
                        "type": "GUEST_PORTAL",
                        "status": f"GUEST_PORTAL FAILED [{res_p.status_code}]",
                        "detail": res_p.text[:500]
                    })
            except Exception as e:
                print(f"[CLONER] ERROR applying Guest Portal: {str(e)}")
                results.append({"name": "Guest Portal Settings", "type": "GUEST_PORTAL", "status": "ERROR", "detail": str(e)})
        elif guest_portal_settings and not has_network_success:
            print(f"[CLONER] GUEST_PORTAL skipped — no network was successfully created")

    return results

async def get_site_ssids(site_id: str, aruba_token: str) -> List[Dict[str, Any]]:
    """Fetch only wireless networks for a site"""
    config = await fetch_site_config_live(site_id, aruba_token)
    if "error" in config:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail=config["error"])

    ssids = []
    networks = config.get("networks", [])
    if isinstance(networks, dict):
        networks = networks.get("elements", [])

    for net in networks:
        if net.get("isWireless"):
            ssids.append({
                "networkId": net.get("networkId") or net.get("id"),
                "networkName": net.get("networkName", "Unnamed SSID"),
                "security": net.get("security", "UNKNOWN"),
                "isGuestPortalEnabled": net.get("isGuestPortalEnabled", False)
            })
    return ssids

async def sync_ssids_passwords(source_network_name: str, new_password: str, target_site_ids: List[str], aruba_token: str) -> List[Dict[str, Any]]:
    """Find networks with source_network_name on target_site_ids and update their PSK"""
    headers = {
        "Authorization": f"Bearer {aruba_token}",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "en-us",
        "X-ION-API-VERSION": "22",
        "X-ION-CLIENT-TYPE": "InstantOn",
        "X-ION-CLIENT-PLATFORM": "web",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
        "Content-Type": "application/json"
    }

    import asyncio
    results = []

    async def update_site_ssid(client: httpx.AsyncClient, site_id: str):
        # 1. Permission Check
        site_check_url = f"https://portal.instant-on.hpe.com/api/sites/{site_id}"
        try:
            res_check = await client.get(site_check_url, headers=headers, timeout=10.0)
            if res_check.status_code == 200:
                site_data = res_check.json()
                role = (site_data.get("userRoleOnSite") or "").lower()
                if role not in ["administrator", "operator"]:
                    return {"target": site_id, "name": source_network_name, "status": "ERROR", "detail": f"Insufficient permissions ({role})"}
            else:
                 return {"target": site_id, "name": source_network_name, "status": "ERROR", "detail": f"Failed to verify permissions ({res_check.status_code})"}
        except Exception as e:
            return {"target": site_id, "name": source_network_name, "status": "ERROR", "detail": f"Permission check error: {str(e)}"}

        # 2. Fetch Networks
        nets_url = f"https://portal.instant-on.hpe.com/api/sites/{site_id}/networksSummary"
        try:
            res_nets = await client.get(nets_url, headers=headers, timeout=15.0)
            if res_nets.status_code != 200:
                return {"target": site_id, "name": source_network_name, "status": "ERROR", "detail": f"Failed to fetch networks ({res_nets.status_code})"}

            nets_data = res_nets.json()
            networks = nets_data.get("elements", []) if isinstance(nets_data, dict) else nets_data
        except Exception as e:
            return {"target": site_id, "name": source_network_name, "status": "ERROR", "detail": f"Fetch networks error: {str(e)}"}

        # 3. Find target SSID
        target_net = next((n for n in networks if n.get("networkName") == source_network_name and n.get("isWireless")), None)
        if not target_net:
            return {"target": site_id, "name": source_network_name, "status": "SKIPPED", "detail": "SSID not found on this site"}

        if target_net.get("isGuestPortalEnabled"):
            return {"target": site_id, "name": source_network_name, "status": "ERROR", "detail": "Cannot update password for Guest Portal SSIDs."}

        # 4. Prepare and execute update
        net_id = target_net.get("networkId") or target_net.get("id")
        update_payload = target_net.copy()

        # Clean up restricted fields
        for k in ["networkId", "siteId", "id", "kind", "wiredNetworkId", "accessPoints", "allowList"]:
            update_payload.pop(k, None)

        # Apply new password
        update_payload["preSharedKey"] = new_password
        if update_payload.get("security") == "OPEN":
            update_payload["security"] = "WPA2_PSK"

        update_url = f"https://portal.instant-on.hpe.com/api/sites/{site_id}/networksSummary/{net_id}"

        # Add referer for this specific put
        put_headers = headers.copy()
        put_headers["Referer"] = f"https://portal.instant-on.hpe.com/sites/{site_id}/networks/overview"

        try:
            res_put = await client.put(update_url, headers=put_headers, json=update_payload, timeout=15.0)
            if res_put.status_code in [200, 204]:
                return {"target": site_id, "name": source_network_name, "status": "SUCCESS", "detail": "Password updated successfully"}
            else:
                return {"target": site_id, "name": source_network_name, "status": "ERROR", "detail": f"Update failed: {res_put.status_code} - {res_put.text[:200]}"}
        except Exception as e:
            return {"target": site_id, "name": source_network_name, "status": "ERROR", "detail": f"Update request error: {str(e)}"}

    async with httpx.AsyncClient(verify=False) as client:
        exec_results = []
        for sid in target_site_ids:
            res = await update_site_ssid(client, sid)
            exec_results.append(res)
            await asyncio.sleep(2.0)

    return exec_results

async def sync_ssids_config(source_site_id: str, source_network_name: str, target_site_ids: List[str], aruba_token: str) -> List[Dict[str, Any]]:
    """Deep clone an SSID config using the provided token.
    Also syncs Guest Portal settings (internal/external) if the source SSID has isGuestPortalEnabled.
    """
    headers = {
        "Authorization": f"Bearer {aruba_token}",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "en-us",
        "X-ION-API-VERSION": "22",
        "X-ION-CLIENT-TYPE": "InstantOn",
        "X-ION-CLIENT-PLATFORM": "web",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
        "Content-Type": "application/json"
    }

    import asyncio
    results = []

    # 1. Fetch source network config
    source_guest_portal = None
    async with httpx.AsyncClient(verify=False) as client:
        source_nets_url = f"https://portal.instant-on.hpe.com/api/sites/{source_site_id}/networksSummary"
        try:
            res_src = await client.get(source_nets_url, headers=headers, timeout=15.0)
            if res_src.status_code != 200:
                raise Exception(f"Failed to fetch source networks ({res_src.status_code})")
            nets_data = res_src.json()
            source_networks = nets_data.get("elements", []) if isinstance(nets_data, dict) else nets_data
        except Exception as e:
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail=f"Source fetch error: {str(e)}")

        # 1b. If the source SSID has Guest Portal enabled, fetch the portal settings
        source_net_check = next((n for n in source_networks if n.get("networkName") == source_network_name and n.get("isWireless")), None)
        if source_net_check and source_net_check.get("isGuestPortalEnabled"):
            try:
                portal_url = f"https://portal.instant-on.hpe.com/api/sites/{source_site_id}/guestPortalSettings"
                res_portal = await client.get(portal_url, headers=headers, timeout=15.0)
                if res_portal.status_code == 200:
                    source_guest_portal = res_portal.json()
                    # Strip site-specific 'id' field
                    source_guest_portal.pop("id", None)
                    print(f"[CLONER] Fetched source guest portal settings (type: {source_guest_portal.get('guestPortalType', 'unknown')})")
                else:
                    print(f"[CLONER] Warning: Failed to fetch source guest portal ({res_portal.status_code})")
            except Exception as e:
                print(f"[CLONER] Warning: Exception fetching source guest portal: {e}")

    source_net = next((n for n in source_networks if n.get("networkName") == source_network_name and n.get("isWireless")), None)
    if not source_net:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail=f"Source SSID '{source_network_name}' not found on source site {source_site_id}.")

    # Clean the source payload so it is ready for PUT
    base_put_payload = dict(source_net)
    for k in ["networkId", "siteId", "id", "kind", "wiredNetworkId", "accessPoints", "allowList"]:
        base_put_payload.pop(k, None)

    async def update_site_ssid_config(client: httpx.AsyncClient, site_id: str):
        # 1. Permission Check
        site_check_url = f"https://portal.instant-on.hpe.com/api/sites/{site_id}"
        try:
            res_check = await client.get(site_check_url, headers=headers, timeout=10.0)
            if res_check.status_code == 200:
                site_data = res_check.json()
                role = (site_data.get("userRoleOnSite") or "").lower()
                if role not in ["administrator", "operator"]:
                    return {"target": site_id, "name": source_network_name, "status": "ERROR", "detail": f"Insufficient permissions ({role})"}
            else:
                 return {"target": site_id, "name": source_network_name, "status": "ERROR", "detail": f"Failed to verify permissions ({res_check.status_code})"}
        except Exception as e:
            return {"target": site_id, "name": source_network_name, "status": "ERROR", "detail": f"Permission check error: {str(e)}"}

        # 2. Fetch Networks
        nets_url = f"https://portal.instant-on.hpe.com/api/sites/{site_id}/networksSummary"
        try:
            res_nets = await client.get(nets_url, headers=headers, timeout=15.0)
            if res_nets.status_code != 200:
                return {"target": site_id, "name": source_network_name, "status": "ERROR", "detail": f"Failed to fetch networks ({res_nets.status_code})"}

            nets_data = res_nets.json()
            networks = nets_data.get("elements", []) if isinstance(nets_data, dict) else nets_data
        except Exception as e:
            return {"target": site_id, "name": source_network_name, "status": "ERROR", "detail": f"Fetch networks error: {str(e)}"}

        # 3. Find target SSID
        target_net = next((n for n in networks if n.get("networkName") == source_network_name and n.get("isWireless")), None)
        if not target_net:
            return {"target": site_id, "name": source_network_name, "status": "SKIPPED", "detail": "SSID not found on this site"}

        # 4. Prepare and execute network config update
        net_id = target_net.get("networkId") or target_net.get("id")
        update_payload = dict(base_put_payload)
        update_url = f"https://portal.instant-on.hpe.com/api/sites/{site_id}/networksSummary/{net_id}"

        put_headers = headers.copy()
        put_headers["Referer"] = f"https://portal.instant-on.hpe.com/sites/{site_id}/networks/overview"

        try:
            res_put = await client.put(update_url, headers=put_headers, json=update_payload, timeout=15.0)
            if res_put.status_code not in [200, 204]:
                return {"target": site_id, "name": source_network_name, "status": "ERROR", "detail": f"Update failed: {res_put.status_code} - {res_put.text[:200]}"}
        except Exception as e:
            return {"target": site_id, "name": source_network_name, "status": "ERROR", "detail": f"Update request error: {str(e)}"}

        # 5. Sync Guest Portal settings if source has them
        portal_status = ""
        if source_guest_portal:
            try:
                await asyncio.sleep(0.5)  # Settle time
                portal_url = f"https://portal.instant-on.hpe.com/api/sites/{site_id}/guestPortalSettings"
                portal_type = source_guest_portal.get("guestPortalType", "unknown")

                # Build clean portal payload based on type
                portal_payload = {"kind": "guestPortalSettings", "guestPortalType": portal_type}

                if portal_type == "internalAck" and "internalAckPageSettings" in source_guest_portal:
                    portal_payload["internalAckPageSettings"] = source_guest_portal["internalAckPageSettings"]
                elif portal_type == "external" and "externalPageSettings" in source_guest_portal:
                    # For external, send only the relevant fields (strip nulls from response-only fields)
                    ext_src = source_guest_portal["externalPageSettings"]
                    ext_clean = {k: v for k, v in ext_src.items() if k not in ["socialLoginDomainsMap", "canDisableAuthentication", "provider", "region"]}
                    portal_payload["externalPageSettings"] = ext_clean

                print(f"[CLONER] GUEST_PORTAL: PUT -> {site_id} (type: {portal_type})")
                res_portal = await client.put(portal_url, headers=put_headers, json=portal_payload, timeout=15.0)

                if res_portal.status_code in [200, 204]:
                    portal_status = f" + Guest Portal ({portal_type}) synced"
                else:
                    portal_status = f" | Guest Portal FAILED [{res_portal.status_code}]"
                    print(f"[CLONER] Guest Portal PUT failed: {res_portal.text[:200]}")
            except Exception as e:
                portal_status = f" | Guest Portal error: {str(e)}"
                print(f"[CLONER] Guest Portal exception: {e}")

        return {"target": site_id, "name": source_network_name, "status": "SUCCESS", "detail": f"Deep configuration synced{portal_status}"}

    async with httpx.AsyncClient(verify=False) as client:
        exec_results = []
        for sid in target_site_ids:
            res = await update_site_ssid_config(client, sid)
            exec_results.append(res)
            await asyncio.sleep(2.0)

    return exec_results

async def sync_ssids_delete(source_network_name: str, target_site_ids: List[str], aruba_token: str) -> List[Dict[str, Any]]:
    """Find and delete SSIDs using the provided token."""
    headers = {
        "Authorization": f"Bearer {aruba_token}",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "en-us",
        "X-ION-API-VERSION": "22",
        "X-ION-CLIENT-TYPE": "InstantOn",
        "X-ION-CLIENT-PLATFORM": "web",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
        "Content-Type": "application/json"
    }

    import asyncio
    results = []

    async def delete_site_ssid(client: httpx.AsyncClient, site_id: str):
        # 1. Permission Check
        site_check_url = f"https://portal.instant-on.hpe.com/api/sites/{site_id}"
        try:
            res_check = await client.get(site_check_url, headers=headers, timeout=10.0)
            if res_check.status_code == 200:
                site_data = res_check.json()
                role = (site_data.get("userRoleOnSite") or "").lower()
                if role not in ["administrator", "operator"]:
                    return {"target": site_id, "name": source_network_name, "status": "ERROR", "detail": f"Insufficient permissions ({role})"}
            else:
                 return {"target": site_id, "name": source_network_name, "status": "ERROR", "detail": f"Failed to verify permissions ({res_check.status_code})"}
        except Exception as e:
            return {"target": site_id, "name": source_network_name, "status": "ERROR", "detail": f"Permission check error: {str(e)}"}

        # 2. Fetch Networks
        nets_url = f"https://portal.instant-on.hpe.com/api/sites/{site_id}/networksSummary"
        try:
            res_nets = await client.get(nets_url, headers=headers, timeout=15.0)
            if res_nets.status_code != 200:
                return {"target": site_id, "name": source_network_name, "status": "ERROR", "detail": f"Failed to fetch networks ({res_nets.status_code})"}

            nets_data = res_nets.json()
            networks = nets_data.get("elements", []) if isinstance(nets_data, dict) else nets_data
        except Exception as e:
            return {"target": site_id, "name": source_network_name, "status": "ERROR", "detail": f"Fetch networks error: {str(e)}"}

        # 3. Find target SSID
        target_net = next((n for n in networks if n.get("networkName") == source_network_name and n.get("isWireless")), None)
        if not target_net:
            return {"target": site_id, "name": source_network_name, "status": "SKIPPED", "detail": "SSID not found on this site"}

        # 4. Prepare and execute delete
        net_id = target_net.get("networkId") or target_net.get("id")

        delete_url = f"https://portal.instant-on.hpe.com/api/sites/{site_id}/networksSummary/{net_id}"

        # Add referer for this specific put
        del_headers = headers.copy()
        del_headers["Referer"] = f"https://portal.instant-on.hpe.com/sites/{site_id}/networks/overview"

        try:
            res_del = await client.delete(delete_url, headers=del_headers, timeout=15.0)
            if res_del.status_code in [200, 204]:
                return {"target": site_id, "name": source_network_name, "status": "SUCCESS", "detail": "SSID deleted successfully"}
            else:
                return {"target": site_id, "name": source_network_name, "status": "ERROR", "detail": f"Delete failed: {res_del.status_code} - {res_del.text[:200]}"}
        except Exception as e:
            return {"target": site_id, "name": source_network_name, "status": "ERROR", "detail": f"Delete request error: {str(e)}"}

    async with httpx.AsyncClient(verify=False) as client:
        exec_results = []
        for sid in target_site_ids:
            res = await delete_site_ssid(client, sid)
            exec_results.append(res)
            await asyncio.sleep(2.0)

    return exec_results

async def sync_ssids_create(
    network_name: str,
    network_type: str,
    security: str,
    password: str,
    advanced_options: Dict[str, Any],
    target_site_ids: List[str],
    aruba_token: str
) -> List[Dict[str, Any]]:
    """Create a new SSID using the provided token."""
    headers = {
        "Authorization": f"Bearer {aruba_token}",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "en-us",
        "X-ION-API-VERSION": "22",
        "X-ION-CLIENT-TYPE": "InstantOn",
        "X-ION-CLIENT-PLATFORM": "web",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
        "Content-Type": "application/json"
    }

    import asyncio
    results = []

    # 1. Base Configuration representing the complete desired state
    full_payload = {
        "networkName": network_name,
        "type": "WIRELESS_NETWORK",
        "authentication": "WPA2_PSK" if security == "WPA2_PSK" else "OPEN",
        "security": security,
        "isWireless": True,
        "ipAddressingMode": "internal" if network_type == "EMPLOYEE" else "NAT",
        "isEnabled": True,
        "isCaptivePortalEnabled": False,
        "isGuestPortalEnabled": True if network_type == "GUEST" else False,
        "isSsidHidden": advanced_options.get("is_hidden", False),
        "isAvailableOn24GHzRadioBand": advanced_options.get("band_24", True),
        "isAvailableOn5GHzRadioBand": advanced_options.get("band_5", True),
        "isAvailableOn6GHzRadioBand": advanced_options.get("band_6", True),
        "isLegacy80211bRatesEnabled": False,
        "isHighEfficiency11axEnabled": advanced_options.get("is_wifi6_enabled", True),
        "isHighEfficiency11axOfdmaEnabled": advanced_options.get("is_wifi6_enabled", True),
        "isDynamicMulticastOptimizationEnabled": False,
        "isBroadcastOnAllBoundApsOnAllBands": True,
        "isInternetAllowed": True,
        "isIntraSubnetTrafficAllowed": True,
        "isAccessRestricted": advanced_options.get("client_isolation", False),
        "useVlan": advanced_options.get("vlan_id") is not None,
        "vlanId": advanced_options.get("vlan_id"),
        "preSharedKey": password if security == "WPA2_PSK" else "",
        "wiredNetworkId": None
    }

    # GUEST overrides
    if network_type == "GUEST":
        full_payload["ipAddressingMode"] = "NAT"
        full_payload["isIntraSubnetTrafficAllowed"] = False

    async def create_site_ssid(client: httpx.AsyncClient, site_id: str):
        # Pre-flight Check
        site_check_url = f"https://portal.instant-on.hpe.com/api/sites/{site_id}"
        try:
            res_check = await client.get(site_check_url, headers=headers, timeout=10.0)
            if res_check.status_code == 200:
                site_data = res_check.json()
                role = (site_data.get("userRoleOnSite") or "").lower()
                if role not in ["administrator", "operator"]:
                    return {"target": site_id, "name": network_name, "status": "ERROR", "detail": f"Insufficient permissions ({role})"}
            else:
                 return {"target": site_id, "name": network_name, "status": "ERROR", "detail": f"Failed to verify permissions ({res_check.status_code})"}
        except Exception as e:
            return {"target": site_id, "name": network_name, "status": "ERROR", "detail": f"Permission check error: {str(e)}"}

        base_url = f"https://portal.instant-on.hpe.com/api/sites/{site_id}/networksSummary"
        api_headers = headers.copy()
        api_headers["Referer"] = f"https://portal.instant-on.hpe.com/sites/{site_id}/networks/overview"

        # Phase 1: POST Create (Minimal/Clean Payload)
        # Based on actual user provided trace:
        create_payload = {
            "authentication": full_payload.get("authentication"),
            "security": full_payload.get("security"),
            "networkName": full_payload.get("networkName"),
            "isEnabled": full_payload.get("isEnabled"),
            "useVlan": full_payload.get("useVlan"),
            "vlanId": full_payload.get("vlanId"),
            "isSsidHidden": full_payload.get("isSsidHidden"),
            "isWireless": full_payload.get("isWireless"),
            "type": full_payload.get("type").lower() if full_payload.get("type") == "WIRELESS_NETWORK" else full_payload.get("type").lower(),
            "isCaptivePortalEnabled": full_payload.get("isCaptivePortalEnabled"),
            "ipAddressingMode": "network" if full_payload.get("ipAddressingMode") == "internal" else full_payload.get("ipAddressingMode"),
            "isAvailableOn24GHzRadioBand": full_payload.get("isAvailableOn24GHzRadioBand"),
            "isAvailableOn5GHzRadioBand": full_payload.get("isAvailableOn5GHzRadioBand"),
            "isAvailableOn6GHzRadioBand": full_payload.get("isAvailableOn6GHzRadioBand"),
            "isLegacy80211bRatesEnabled": full_payload.get("isLegacy80211bRatesEnabled"),
            "isHighEfficiency11axEnabled": full_payload.get("isHighEfficiency11axEnabled"),
            "isHighEfficiency11axOfdmaEnabled": full_payload.get("isHighEfficiency11axOfdmaEnabled"),
            "isDynamicMulticastOptimizationEnabled": full_payload.get("isDynamicMulticastOptimizationEnabled"),
            "isBroadcastOnAllBoundApsOnAllBands": full_payload.get("isBroadcastOnAllBoundApsOnAllBands"),
            "accessPoints": [],
            "wiredNetworkId": None,
            "schedule": {
                "activeDays": ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"],
                "activeTimeRange": {"enabled": True, "startTime": "09:00", "endTime": "17:00"}
            },
            "weekSchedule": {
                "schedulePerWeekdayMap": {
                    day: {"enabled": False, "activeAllDay": True, "startTime": "09:00", "endTime": "17:00"}
                    for day in ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
                }
            },
            "activeSchedule": "simple",
            "isBandwidthLimitEnabled": False,
            "isAccessRestricted": full_payload.get("isAccessRestricted"),
            "isInternetAllowed": full_payload.get("isInternetAllowed"),
            "isIntraSubnetTrafficAllowed": full_payload.get("isIntraSubnetTrafficAllowed"),
            "isSpecificDestinationsAllowed": None,
            "allowedDestinations": [],
            "localAirgroupServices": [],
            "sharedAirgroupServices": []
        }

        # User auth payload mapping:
        if full_payload.get("authentication") == "WPA2_PSK":
            create_payload["authentication"] = "psk"
            create_payload["security"] = "wpa2"
            create_payload["preSharedKey"] = full_payload.get("preSharedKey")
        elif full_payload.get("authentication") == "WPA3_SAE_PSK": # Just in case it's actually wpa3
             create_payload["authentication"] = "psk"
             create_payload["security"] = "wpa3"
             create_payload["preSharedKey"] = full_payload.get("preSharedKey")
        elif full_payload.get("authentication") == "OPEN":
            create_payload["authentication"] = "open"
            create_payload["security"] = "open"

        # Type mapping based on curl
        create_payload["type"] = "employee" if network_type == "EMPLOYEE" else "guest"

        # Determine wiredNetworkId by fetching site config
        try:
            site_config = await fetch_site_config_live(site_id)
            networks = site_config.get("networks", [])
            if isinstance(networks, dict):
                networks = networks.get("elements", [])
            wired_net_id = None
            for net in networks:
                if net.get("type", "").lower() == "wired":
                    wired_net_id = net.get("id")
                    break

            # Use found wiredNetworkId or fallback
            create_payload["wiredNetworkId"] = wired_net_id
        except Exception as e:
            print(f"[CLONER] Failed to resolve wiredNetworkId: {e}")

        try:
            res_post = await client.post(base_url, headers=api_headers, json=create_payload, timeout=15.0)

            def safe_json(res):
                try:
                    return res.json()
                except:
                    return res.text

            if res_post.status_code not in [200, 201]:
                return {"target": site_id, "name": network_name, "status": "ERROR", "detail": safe_json(res_post)}

            post_data = safe_json(res_post)
            if isinstance(post_data, str):
                return {"target": site_id, "name": network_name, "status": "ERROR", "detail": f"Phase 1 Success but response is not JSON: {post_data}"}

            new_id = post_data.get("networkId") or post_data.get("id")
            if not new_id:
                return {"target": site_id, "name": network_name, "status": "SKIPPED", "detail": "Phase 1 succeeded, but ID missing to do Phase 2."}

            await asyncio.sleep(0.8)

            # Phase 2: PUT Update (Full Payload context) Requires hitting /networks/{id} not /networksSummary
            update_payload = dict(full_payload)
            update_url = f"https://portal.instant-on.hpe.com/api/sites/{site_id}/networks/{new_id}"

            res_put = await client.put(update_url, headers=api_headers, json=update_payload, timeout=15.0)
            if res_put.status_code in [200, 204]:
                return {"target": site_id, "name": network_name, "status": "SUCCESS", "detail": "SSID customized successfully (POST+PUT)"}
            else:
                return {"target": site_id, "name": network_name, "status": "ERROR", "detail": {
                    "message": f"Phase 1 OK, Phase 2 (PUT) failed with status {res_put.status_code}",
                    "api_error": safe_json(res_put)
                }}

        except Exception as e:
            return {"target": site_id, "name": network_name, "status": "ERROR", "detail": f"Request error: {str(e)}"}

    async with httpx.AsyncClient(verify=False) as client:
        exec_results = []
        for sid in target_site_ids:
            res = await create_site_ssid(client, sid)
            exec_results.append(res)
            await asyncio.sleep(2.0)

    return exec_results

async def batch_account_precheck(email: str, target_site_ids: List[str], master_token: str) -> List[Dict]:
    api_headers = {"Authorization": f"Bearer {master_token}"}
    existing_sites = []
    
    async with httpx.AsyncClient(verify=False) as client:
        # We will do this sequentially with a small delay to avoid rate limiting
        for site_id in target_site_ids:
            url = f"https://portal.instant-on.hpe.com/api/sites/{site_id}/administration"
            try:
                res = await client.get(url, headers=api_headers, timeout=10.0)
                if res.status_code == 200:
                    data = res.json()
                    admins = data.get("administrators", [])
                    # check if email exists in admins array
                    if any(admin.get("email", "").lower() == email.lower() for admin in admins):
                        existing_sites.append({"site_id": site_id})
            except Exception as e:
                pass # Ignore errors during pre-check, they will be caught during execution
                
            await asyncio.sleep(0.2)
            
    return existing_sites

async def batch_account_access(action_type: str, email: str, role: str, target_site_ids: List[str], master_token: str, actor_email: str = "anonymous") -> List[Dict]:
    import asyncio
    api_headers = {"Authorization": f"Bearer {master_token}"}
    results = []
    
    async with httpx.AsyncClient(verify=False) as client:
        for site_id in target_site_ids:
            url = f"https://portal.instant-on.hpe.com/api/sites/{site_id}/administration?action=addAccount" if action_type == "add" else f"https://portal.instant-on.hpe.com/api/sites/{site_id}/administration?action=removeAccount"
            payload = {"email": email}
            if action_type == "add":
                payload["roleOnSite"] = role
                
            status_text = "ERROR"
            try:
                res = await client.post(url, headers=api_headers, json=payload, timeout=20.0)
                if res.status_code in [200, 204]:
                    status_text = "SUCCESS"
                    results.append({"target": site_id, "status": "SUCCESS", "detail": f"Account {action_type}ed successfully."})
                else:
                    data = res.json() if res.content else res.text
                    results.append({"target": site_id, "status": "ERROR", "detail": data})
            except Exception as e:
                results.append({"target": site_id, "status": "ERROR", "detail": str(e)})

            await asyncio.sleep(2.0)
        
    return results

async def batch_site_delete(target_site_ids: List[str], master_token: str, actor_email: str = "anonymous") -> List[Dict]:
    import asyncio
    api_headers = {"Authorization": f"Bearer {master_token}"}
    results = []
    
    async with httpx.AsyncClient(verify=False) as client:
        for site_id in target_site_ids:
            # We need to hit DELETE /sites/{site_id}
            url = f"https://portal.instant-on.hpe.com/api/sites/{site_id}"
            status_text = "ERROR"
            try:
                res = await client.delete(url, headers=api_headers, timeout=20.0)
                if res.status_code in [200, 204]:
                    status_text = "SUCCESS"
                    results.append({"target": site_id, "status": "SUCCESS", "detail": "Site deleted successfully."})
                else:
                    data = res.json() if res.content else res.text
                    results.append({"target": site_id, "status": "ERROR", "detail": data})
            except Exception as e:
                results.append({"target": site_id, "status": "ERROR", "detail": str(e)})

            await asyncio.sleep(2.0)
        
    return results

async def batch_site_provision(
    source_site_id: str,
    clone_count: int,
    prefix: str,
    regulatory_domain: str,
    timezone_iana: str,
    configured_location: dict,
    target_zone_ids: List[str],
    master_token: str,
    actor_email: str = "anonymous",
    template_id: Optional[str] = None,
) -> List[Dict]:
    import asyncio
    api_headers = {"Authorization": f"Bearer {master_token}", "X-ION-API-VERSION": "23"}
    results = []
    
    # We need to hit POST /sites/{source_site_id}/siteCloning
    url = f"https://portal.instant-on.hpe.com/api/sites/{source_site_id}/siteCloning"
    
    from app.database.zones_crud import add_sites_to_zone
    
    async with httpx.AsyncClient(verify=False) as client:
        for i in range(clone_count):
            padded_index = str(i + 1).zfill(2)
            site_name = f"{prefix.strip()} - {padded_index}"
            
            payload = {
                "siteName": site_name,
                "regulatoryDomain": regulatory_domain,
                "timezoneIana": timezone_iana,
                "configuredLocation": configured_location
            }
            
            status_text = "ERROR"
            new_site_id = None
            try:
                res = await client.post(url, headers=api_headers, json=payload, timeout=30.0)
                if res.status_code in [200, 201]:
                    status_text = "SUCCESS"
                    data = res.json()
                    new_site_id = data.get("siteId") or data.get("id")
                    results.append({"target": site_name, "status": "SUCCESS", "detail": "Site provisioned successfully.", "new_site_id": new_site_id})
                    
                    # Add to target zones
                    if new_site_id and target_zone_ids:
                        for zone_id in target_zone_ids:
                            await add_sites_to_zone(zone_id, [new_site_id])

                    # Assign template badge if template_id is provided
                    if new_site_id and template_id:
                        try:
                            from app.features.templates.service import assign_site_to_template
                            await assign_site_to_template(actor_email, new_site_id, template_id)
                        except Exception as tpl_err:
                            print(f"[PROVISION] Template badge assignment failed for {new_site_id}: {tpl_err}")
                else:
                    data = res.json() if res.content else res.text
                    results.append({"target": site_name, "status": "ERROR", "detail": data})
            except Exception as e:
                results.append({"target": site_name, "status": "ERROR", "detail": str(e)})

            await asyncio.sleep(2.0)
            
    return results


async def batch_clear_site_networks(target_site_ids: List[str], master_token: str, actor_email: str = "anonymous") -> List[Dict]:
    """FULL WIPE: Delete ALL config from target sites — SSIDs, wired networks, policies, guest portal.
    
    Strategy: DELETE everything possible, not just reset.
    Order: SSIDs first (depend on wired) → Wired networks → Guest Portal
    If Aruba blocks a default item (400), skip it — but try everything.
    """
    import asyncio
    headers = {
        "Authorization": f"Bearer {master_token}",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "en-us",
        "X-ION-API-VERSION": "22",
        "X-ION-CLIENT-TYPE": "InstantOn",
        "X-ION-CLIENT-PLATFORM": "web",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
        "Content-Type": "application/json"
    }

    results = []

    async with httpx.AsyncClient(verify=False) as client:
        for site_id in target_site_ids:
            site_result = {
                "target": site_id, "status": "ERROR", "detail": "",
                "ssids_deleted": 0, "wired_deleted": 0, "skipped": 0,
                "guest_portal_reset": False,
            }

            try:
                # ── 1. Permission check ──────────────────────────────────
                site_url = f"https://portal.instant-on.hpe.com/api/sites/{site_id}"
                res_check = await client.get(site_url, headers=headers, timeout=10.0)
                if res_check.status_code != 200:
                    site_result["detail"] = f"Cannot access site ({res_check.status_code})"
                    results.append(site_result)
                    continue

                site_data = res_check.json()
                role = (site_data.get("userRoleOnSite") or "").lower()
                if role not in ["administrator", "operator"]:
                    site_result["detail"] = f"Insufficient permissions ({role})"
                    results.append(site_result)
                    continue

                req_headers = headers.copy()
                req_headers["Referer"] = f"https://portal.instant-on.hpe.com/sites/{site_id}/networks/overview"
                errors = []

                # ── 2. DELETE all SSIDs (networksSummary) ─────────────────
                # Must delete SSIDs BEFORE wired networks (dependency)
                nets_url = f"https://portal.instant-on.hpe.com/api/sites/{site_id}/networksSummary"
                res_nets = await client.get(nets_url, headers=req_headers, timeout=15.0)

                ssid_deleted = 0
                skipped = 0

                if res_nets.status_code == 200:
                    nets_data = res_nets.json()
                    networks = nets_data.get("elements", []) if isinstance(nets_data, dict) else (nets_data if isinstance(nets_data, list) else [])

                    for net in networks:
                        net_id = net.get("networkId") or net.get("id")
                        net_name = net.get("networkName", "Unnamed")
                        if not net_id:
                            skipped += 1
                            continue

                        try:
                            res_del = await client.delete(f"{nets_url}/{net_id}", headers=req_headers, timeout=15.0)
                            if res_del.status_code in [200, 204]:
                                ssid_deleted += 1
                                print(f"[CLEAR] ✓ Deleted SSID '{net_name}'")
                            elif res_del.status_code == 400:
                                skipped += 1
                                print(f"[CLEAR] ✗ Cannot delete '{net_name}' (400)")
                            else:
                                errors.append(f"SSID {net_name}: {res_del.status_code}")
                        except Exception as e:
                            errors.append(f"SSID {net_name}: {str(e)}")
                        await asyncio.sleep(0.5)

                # ── 3. DELETE all wired networks ─────────────────────────
                # First delete any remaining nested SSIDs, then DELETE the wired network itself
                wired_url = f"https://portal.instant-on.hpe.com/api/sites/{site_id}/wiredNetworks"
                res_wired = await client.get(wired_url, headers=req_headers, timeout=15.0)

                wired_deleted = 0
                if res_wired.status_code == 200:
                    wired_data = res_wired.json()
                    wired_list = wired_data.get("elements", []) if isinstance(wired_data, dict) else (wired_data if isinstance(wired_data, list) else [])

                    for wired in wired_list:
                        wired_id = wired.get("id") or wired.get("wiredNetworkId")
                        wired_name = wired.get("wiredNetworkName", "Unnamed")
                        if not wired_id:
                            continue

                        # Delete nested SSIDs first (may have been missed above)
                        for ws in (wired.get("wirelessNetworks") or []):
                            ws_id = ws.get("id") or ws.get("networkId")
                            ws_name = ws.get("networkName", "?")
                            if not ws_id:
                                continue
                            try:
                                res_ws = await client.delete(f"{nets_url}/{ws_id}", headers=req_headers, timeout=15.0)
                                if res_ws.status_code in [200, 204]:
                                    ssid_deleted += 1
                                    print(f"[CLEAR] ✓ Deleted nested SSID '{ws_name}'")
                            except:
                                pass
                            await asyncio.sleep(0.3)

                        # Now DELETE the wired network itself
                        try:
                            res_wdel = await client.delete(f"{wired_url}/{wired_id}", headers=req_headers, timeout=15.0)
                            if res_wdel.status_code in [200, 204]:
                                wired_deleted += 1
                                print(f"[CLEAR] ✓ Deleted wired '{wired_name}'")
                            elif res_wdel.status_code == 400:
                                # Aruba may block deleting the last/default wired — skip
                                skipped += 1
                                print(f"[CLEAR] ✗ Cannot delete wired '{wired_name}' (400 — protected by Aruba)")
                            else:
                                errors.append(f"Wired {wired_name}: {res_wdel.status_code}")
                                print(f"[CLEAR] ✗ Wired '{wired_name}' failed: {res_wdel.status_code}")
                        except Exception as e:
                            errors.append(f"Wired {wired_name}: {str(e)}")
                        await asyncio.sleep(0.5)

                # ── 4. Reset Guest Portal ────────────────────────────────
                gp_reset = False
                try:
                    gp_url = f"https://portal.instant-on.hpe.com/api/sites/{site_id}/guestPortalSettings"
                    res_gp = await client.get(gp_url, headers=req_headers, timeout=10.0)
                    if res_gp.status_code == 200:
                        gp_data = res_gp.json()
                        gp_reset_payload = {k: v for k, v in gp_data.items() if k != "id"}
                        gp_reset_payload["isEnabled"] = False
                        gp_reset_payload["portalType"] = "INTERNAL"
                        res_gp_put = await client.put(gp_url, headers=req_headers, json=gp_reset_payload, timeout=15.0)
                        if res_gp_put.status_code in [200, 204]:
                            gp_reset = True
                            print(f"[CLEAR] ✓ Reset guest portal")
                except Exception as e:
                    errors.append(f"Guest portal: {str(e)}")

                # ── Build result ─────────────────────────────────────────
                site_result["ssids_deleted"] = ssid_deleted
                site_result["wired_deleted"] = wired_deleted
                site_result["skipped"] = skipped
                site_result["guest_portal_reset"] = gp_reset
                # Keep backwards-compat key
                site_result["networks_deleted"] = ssid_deleted + wired_deleted

                total_actions = ssid_deleted + wired_deleted + (1 if gp_reset else 0)
                parts = []
                if ssid_deleted: parts.append(f"{ssid_deleted} SSIDs xóa")
                if wired_deleted: parts.append(f"{wired_deleted} wired xóa")
                if gp_reset: parts.append("guest portal reset")
                if skipped: parts.append(f"{skipped} bị chặn (Aruba protected)")
                if errors: parts.append(f"lỗi: {'; '.join(errors[:3])}")

                if total_actions > 0 or (not errors):
                    site_result["status"] = "SUCCESS"
                    site_result["detail"] = " | ".join(parts) if parts else "Site đã trống sẵn"
                else:
                    site_result["detail"] = "Thất bại: " + (" | ".join(parts) if parts else "Unknown")

            except Exception as e:
                site_result["detail"] = f"Exception: {str(e)}"

            results.append(site_result)
            await asyncio.sleep(1.0)

    return results


