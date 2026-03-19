"""
Cloner site operations — fetch live/captured site data and SSIDs.
"""
import re
import asyncio
from typing import Any, Dict, List

from app.database.connection import get_database
from app.features.cloner.helpers import ARUBA_PORTAL_BASE


async def get_live_account_sites(aruba_token: str) -> List[Dict[str, Any]]:
    print("!!! DEBUG: GET_LIVE_ACCOUNT_SITES CALLED !!!")
    from app.shared.aruba import aruba_service
    try:
        res = await aruba_service.call_api(
            method="GET",
            endpoint="/api/sites",
            aruba_token=aruba_token,
            use_master_auto=True
        )

        if res.status_code in [401, 403]:
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

            standard_sites = []
            for s in raw_elements:
                role_raw = (s.get("role") or s.get("userRoleOnSite") or "").strip().lower()
                standard_sites.append({
                    "id": s.get("id") or s.get("siteId") or s.get("site_id"),
                    "siteId": s.get("id") or s.get("siteId") or s.get("site_id"),
                    "siteName": s.get("name") or s.get("siteName") or s.get("site_name", "Unknown Site"),
                    "role": "admin" if role_raw.startswith("admin") else ("op" if role_raw.startswith("op") else "view")
                })
            return standard_sites
    except Exception as e:
        from fastapi import HTTPException
        print(f"[CLONER] Failed to fetch live sites: {e}")
        if isinstance(e, HTTPException):
            raise e
    return []


async def fetch_site_config_live(site_id: str, aruba_token: str = None) -> Dict[str, Any]:
    from app.shared.aruba import aruba_service

    use_master = aruba_token is not None
    token = aruba_token

    try:
        res_nets = await aruba_service.call_api(
            method="GET",
            endpoint=f"/api/sites/{site_id}/networksSummary",
            aruba_token=token,
            use_master_auto=use_master
        )

        if res_nets.status_code in [401, 403]:
            res_nets = await aruba_service.call_api(
                method="GET",
                endpoint=f"/api/v1/sites/{site_id}/networksSummary",
                aruba_token=token,
                use_master_auto=use_master
            )

        if res_nets.status_code in [401, 403]:
            print(f"[CLONER] Live config fetch received {res_nets.status_code}")
            from fastapi import HTTPException
            raise HTTPException(status_code=401, detail="Phiên làm việc Aruba đã hết hạn.")

        res_guest = await aruba_service.call_api(
            method="GET",
            endpoint=f"/api/sites/{site_id}/guestPortalSettings",
            aruba_token=token,
            use_master_auto=use_master
        )

        res_wired = await aruba_service.call_api(
            method="GET",
            endpoint=f"/api/sites/{site_id}/wiredNetworks",
            aruba_token=token,
            use_master_auto=use_master
        )

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
    db = get_database()

    cursor = db.raw_logs.find(
        {"url": {"$regex": "api/v1/.*sites"}},
        {"response_body": 1, "timestamp": 1, "url": 1}
    ).sort("timestamp", -1)

    sites = {}
    async for doc in cursor:
        body = doc.get("response_body")
        if not body or not isinstance(body, dict):
            continue
        elements = body.get("elements", []) if isinstance(body.get("elements"), list) else ([body] if body.get("siteId") else [])
        for s in elements:
            s_id = s.get("siteId")
            if s_id and s_id not in sites:
                sites[s_id] = {
                    "siteId": s_id,
                    "siteName": s.get("siteName", "Unknown Site"),
                    "captured_at": doc.get("timestamp")
                }

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
    db = get_database()
    cursor = db.raw_logs.find({
        "url": {"$regex": f"sites/{site_id}/(networksSummary|wiredNetworks)"},
        "method": "GET",
        "status_code": 200
    }).sort("timestamp", -1).limit(1)

    log = await cursor.to_list(length=1)
    if not log:
        return {"error": "No configuration found for this site ID in logs."}

    return log[0].get("response_body", {})


async def get_site_ssids(site_id: str, aruba_token: str) -> List[Dict[str, Any]]:
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
