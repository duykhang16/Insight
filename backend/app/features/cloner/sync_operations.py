"""
Cloner sync operations — SSID password sync, config sync, delete sync, create sync.
"""
import asyncio
import httpx
from typing import Any, Dict, List

from app.features.cloner.helpers import (
    build_headers,
    check_site_permission,
    fetch_site_networks,
    ARUBA_PORTAL_BASE,
)
from app.features.cloner.site_operations import fetch_site_config_live


async def sync_ssids_passwords(
    source_network_name: str,
    new_password: str,
    target_site_ids: List[str],
    aruba_token: str,
) -> List[Dict[str, Any]]:
    headers = build_headers(aruba_token)

    async def update_site_ssid(client: httpx.AsyncClient, site_id: str):
        perm_error = await check_site_permission(client, site_id, headers, name=source_network_name)
        if perm_error:
            return perm_error

        networks, net_error = await fetch_site_networks(client, site_id, headers, name=source_network_name)
        if net_error:
            return net_error

        target_net = next((n for n in networks if n.get("networkName") == source_network_name and n.get("isWireless")), None)
        if not target_net:
            return {"target": site_id, "name": source_network_name, "status": "SKIPPED", "detail": "SSID not found on this site"}

        if target_net.get("isGuestPortalEnabled"):
            return {"target": site_id, "name": source_network_name, "status": "ERROR", "detail": "Cannot update password for Guest Portal SSIDs."}

        net_id = target_net.get("networkId") or target_net.get("id")
        update_payload = target_net.copy()

        for k in ["networkId", "siteId", "id", "kind", "wiredNetworkId", "accessPoints", "allowList"]:
            update_payload.pop(k, None)

        update_payload["preSharedKey"] = new_password
        if update_payload.get("security") == "OPEN":
            update_payload["security"] = "WPA2_PSK"

        update_url = f"{ARUBA_PORTAL_BASE}/api/sites/{site_id}/networksSummary/{net_id}"
        put_headers = build_headers(aruba_token, referer=f"{ARUBA_PORTAL_BASE}/sites/{site_id}/networks/overview")

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


async def sync_ssids_config(
    source_site_id: str,
    source_network_name: str,
    target_site_ids: List[str],
    aruba_token: str,
) -> List[Dict[str, Any]]:
    headers = build_headers(aruba_token)

    source_guest_portal = None
    async with httpx.AsyncClient(verify=False) as client:
        source_nets_url = f"{ARUBA_PORTAL_BASE}/api/sites/{source_site_id}/networksSummary"
        try:
            res_src = await client.get(source_nets_url, headers=headers, timeout=15.0)
            if res_src.status_code != 200:
                raise Exception(f"Failed to fetch source networks ({res_src.status_code})")
            nets_data = res_src.json()
            source_networks = nets_data.get("elements", []) if isinstance(nets_data, dict) else nets_data
        except Exception as e:
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail=f"Source fetch error: {str(e)}")

        source_net_check = next((n for n in source_networks if n.get("networkName") == source_network_name and n.get("isWireless")), None)
        if source_net_check and source_net_check.get("isGuestPortalEnabled"):
            try:
                portal_url = f"{ARUBA_PORTAL_BASE}/api/sites/{source_site_id}/guestPortalSettings"
                res_portal = await client.get(portal_url, headers=headers, timeout=15.0)
                if res_portal.status_code == 200:
                    source_guest_portal = res_portal.json()
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

    base_put_payload = dict(source_net)
    for k in ["networkId", "siteId", "id", "kind", "wiredNetworkId", "accessPoints", "allowList"]:
        base_put_payload.pop(k, None)

    async def update_site_ssid_config(client: httpx.AsyncClient, site_id: str):
        perm_error = await check_site_permission(client, site_id, headers, name=source_network_name)
        if perm_error:
            return perm_error

        networks, net_error = await fetch_site_networks(client, site_id, headers, name=source_network_name)
        if net_error:
            return net_error

        target_net = next((n for n in networks if n.get("networkName") == source_network_name and n.get("isWireless")), None)
        if not target_net:
            return {"target": site_id, "name": source_network_name, "status": "SKIPPED", "detail": "SSID not found on this site"}

        net_id = target_net.get("networkId") or target_net.get("id")
        update_payload = dict(base_put_payload)
        update_url = f"{ARUBA_PORTAL_BASE}/api/sites/{site_id}/networksSummary/{net_id}"
        put_headers = build_headers(aruba_token, referer=f"{ARUBA_PORTAL_BASE}/sites/{site_id}/networks/overview")

        try:
            res_put = await client.put(update_url, headers=put_headers, json=update_payload, timeout=15.0)
            if res_put.status_code not in [200, 204]:
                return {"target": site_id, "name": source_network_name, "status": "ERROR", "detail": f"Update failed: {res_put.status_code} - {res_put.text[:200]}"}
        except Exception as e:
            return {"target": site_id, "name": source_network_name, "status": "ERROR", "detail": f"Update request error: {str(e)}"}

        portal_status = ""
        if source_guest_portal:
            try:
                await asyncio.sleep(0.5)
                portal_url = f"{ARUBA_PORTAL_BASE}/api/sites/{site_id}/guestPortalSettings"
                portal_type = source_guest_portal.get("guestPortalType", "unknown")

                portal_payload = {"kind": "guestPortalSettings", "guestPortalType": portal_type}

                if portal_type == "internalAck" and "internalAckPageSettings" in source_guest_portal:
                    portal_payload["internalAckPageSettings"] = source_guest_portal["internalAckPageSettings"]
                elif portal_type == "external" and "externalPageSettings" in source_guest_portal:
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


async def sync_ssids_delete(
    source_network_name: str,
    target_site_ids: List[str],
    aruba_token: str,
) -> List[Dict[str, Any]]:
    headers = build_headers(aruba_token)

    async def delete_site_ssid(client: httpx.AsyncClient, site_id: str):
        perm_error = await check_site_permission(client, site_id, headers, name=source_network_name)
        if perm_error:
            return perm_error

        networks, net_error = await fetch_site_networks(client, site_id, headers, name=source_network_name)
        if net_error:
            return net_error

        target_net = next((n for n in networks if n.get("networkName") == source_network_name and n.get("isWireless")), None)
        if not target_net:
            return {"target": site_id, "name": source_network_name, "status": "SKIPPED", "detail": "SSID not found on this site"}

        net_id = target_net.get("networkId") or target_net.get("id")
        delete_url = f"{ARUBA_PORTAL_BASE}/api/sites/{site_id}/networksSummary/{net_id}"
        del_headers = build_headers(aruba_token, referer=f"{ARUBA_PORTAL_BASE}/sites/{site_id}/networks/overview")

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
    aruba_token: str,
) -> List[Dict[str, Any]]:
    headers = build_headers(aruba_token)

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

    if network_type == "GUEST":
        full_payload["ipAddressingMode"] = "NAT"
        full_payload["isIntraSubnetTrafficAllowed"] = False

    async def create_site_ssid(client: httpx.AsyncClient, site_id: str):
        perm_error = await check_site_permission(client, site_id, headers, name=network_name)
        if perm_error:
            return perm_error

        base_url = f"{ARUBA_PORTAL_BASE}/api/sites/{site_id}/networksSummary"
        api_headers = build_headers(aruba_token, referer=f"{ARUBA_PORTAL_BASE}/sites/{site_id}/networks/overview")

        create_payload = {
            "authentication": full_payload.get("authentication"),
            "security": full_payload.get("security"),
            "networkName": full_payload.get("networkName"),
            "isEnabled": full_payload.get("isEnabled"),
            "useVlan": full_payload.get("useVlan"),
            "vlanId": full_payload.get("vlanId"),
            "isSsidHidden": full_payload.get("isSsidHidden"),
            "isWireless": full_payload.get("isWireless"),
            "type": full_payload.get("type", "").lower(),
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
                "activeDays": ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
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

        if full_payload.get("authentication") == "WPA2_PSK":
            create_payload["authentication"] = "psk"
            create_payload["security"] = "wpa2"
            create_payload["preSharedKey"] = full_payload.get("preSharedKey")
        elif full_payload.get("authentication") == "WPA3_SAE_PSK":
            create_payload["authentication"] = "psk"
            create_payload["security"] = "wpa3"
            create_payload["preSharedKey"] = full_payload.get("preSharedKey")
        elif full_payload.get("authentication") == "OPEN":
            create_payload["authentication"] = "open"
            create_payload["security"] = "open"

        create_payload["type"] = "employee" if network_type == "EMPLOYEE" else "guest"

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
            create_payload["wiredNetworkId"] = wired_net_id
        except Exception as e:
            print(f"[CLONER] Failed to resolve wiredNetworkId: {e}")

        try:
            res_post = await client.post(base_url, headers=api_headers, json=create_payload, timeout=15.0)

            def safe_json(res):
                try:
                    return res.json()
                except Exception:
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

            update_payload = dict(full_payload)
            update_url = f"{ARUBA_PORTAL_BASE}/api/sites/{site_id}/networks/{new_id}"

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
