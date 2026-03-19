"""
Cloner apply config — transform source config into operations and push live.
"""
import asyncio
import httpx
from typing import Any, Dict, List

from app.features.cloner.helpers import ARUBA_PORTAL_BASE


async def apply_config_to_site(target_site_id: str, config: Dict[str, Any]):
    operations = []

    raw_networks = []
    guest_portal = None

    if isinstance(config, dict):
        if "networks" in config:
            nets_part = config["networks"]
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

    for net in raw_networks:
        nested_wireless = net.pop("wirelessNetworks", []) if isinstance(net, dict) else []

        clean_payload = {k: v for k, v in net.items() if k not in ["networkId", "siteId", "kind"]}

        is_wireless = net.get("isWireless", False)
        net_type = "WIRELESS_NETWORK" if is_wireless else "WIRED_NETWORK"

        if net.get("isGuestPortalEnabled") and guest_portal:
            clean_payload["_guest_portal_settings"] = guest_portal

        operations.append({
            "type": net_type,
            "name": net.get("networkName") or ("SSID" if is_wireless else "Wired Network"),
            "original_id": net.get("networkId"),
            "payload": clean_payload
        })

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

    return operations


async def apply_config_live(
    target_site_id: str,
    operations: List[Dict[str, Any]],
    aruba_token: str,
) -> List[Dict[str, Any]]:
    headers = {
        "Authorization": f"Bearer {aruba_token}",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "en-us",
        "X-ION-API-VERSION": "22",
        "X-ION-CLIENT-TYPE": "InstantOn",
        "X-ION-CLIENT-PLATFORM": "web",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
        "Referer": f"{ARUBA_PORTAL_BASE}/sites/{target_site_id}/networks/overview",
        "Content-Type": "application/json"
    }

    results = []

    # Pre-flight Permission Check
    async with httpx.AsyncClient(verify=False) as client:
        try:
            site_check_url = f"{ARUBA_PORTAL_BASE}/api/sites/{target_site_id}"
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

    guest_portal_settings = None

    async with httpx.AsyncClient(verify=False) as client:
        base_url = f"{ARUBA_PORTAL_BASE}/api/sites/{target_site_id}/networksSummary"

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

                if "_guest_portal_settings" in full_payload:
                    guest_portal_settings = full_payload.pop("_guest_portal_settings")

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

                create_payload = {k: v for k, v in full_payload.items() if k in create_keys}

                if full_payload.get("security") != "OPEN" and "preSharedKey" in full_payload:
                    create_payload["preSharedKey"] = full_payload["preSharedKey"]

                addr_mode = full_payload.get("ipAddressingMode")
                if addr_mode in ["NAT", "internal"]:
                    create_payload["useVlan"] = False
                    create_payload["vlanId"] = None if addr_mode == "internal" else 1
                else:
                    if "useVlan" in full_payload:
                        create_payload["useVlan"] = full_payload["useVlan"]
                    if "vlanId" in full_payload:
                        create_payload["vlanId"] = full_payload["vlanId"]

                create_payload.update({
                    "accessPoints": [],
                    "wiredNetworkId": None,
                    "isBandwidthLimitEnabled": False,
                    "isAccessRestricted": full_payload.get("isAccessRestricted", False)
                })

                if "schedule" in full_payload and isinstance(full_payload["schedule"], dict):
                    src_sch = full_payload["schedule"]
                    create_payload["schedule"] = {
                        "activeDays": src_sch.get("activeDays", ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]),
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

                post_data = res_post.json()
                new_id = post_data.get("networkId") or post_data.get("id")

                if not new_id:
                    results.append({"name": op["name"], "type": op["type"], "status": "PHASE 1 OK | PHASE 2 SKIPPED", "detail": "Target ID missing from create response."})
                    continue

                await asyncio.sleep(0.8)

                update_payload = full_payload.copy()
                problematic_fields = ["networkId", "siteId", "id", "kind", "wiredNetworkId", "accessPoints", "allowList"]
                for k in problematic_fields:
                    update_payload.pop(k, None)

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

        # Handle GUEST_PORTAL
        has_network_success = any("SUCCESS" in r.get("status", "") for r in results)
        if guest_portal_settings and has_network_success:
            try:
                portal_url = f"{ARUBA_PORTAL_BASE}/api/sites/{target_site_id}/guestPortalSettings"
                print(f"[CLONER] GUEST_PORTAL (Final Pass based on embedded data): PUT")

                clean_portal = {k: v for k, v in guest_portal_settings.items() if k not in ["id"]}
                res_p = await client.put(portal_url, headers=headers, json=clean_portal, timeout=15.0)

                if res_p.status_code in [200, 204]:
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
