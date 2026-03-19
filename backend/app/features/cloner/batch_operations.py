"""
Cloner batch operations — account access, site delete, site provision, clear networks.
"""
import asyncio
import httpx
from typing import Any, Dict, List, Optional

from app.features.cloner.helpers import (
    build_headers,
    response_detail,
    is_retryable_response,
    insert_batch_audit_log,
    run_bounded_batch,
    BATCH_MAX_CONCURRENCY,
    ARUBA_PORTAL_BASE,
    ARUBA_COMMON_HEADERS,
)


async def batch_account_precheck(
    email: str,
    target_site_ids: List[str],
    master_token: str,
) -> List[Dict]:
    api_headers = {"Authorization": f"Bearer {master_token}"}
    existing_sites = []

    async with httpx.AsyncClient(verify=False) as client:
        for site_id in target_site_ids:
            url = f"{ARUBA_PORTAL_BASE}/api/sites/{site_id}/administration"
            try:
                res = await client.get(url, headers=api_headers, timeout=10.0)
                if res.status_code == 200:
                    data = res.json()
                    admins = data.get("administrators", [])
                    if any(admin.get("email", "").lower() == email.lower() for admin in admins):
                        existing_sites.append({"site_id": site_id})
            except Exception:
                pass

            await asyncio.sleep(0.2)

    return existing_sites


async def batch_account_access(
    action_type: str,
    email: str,
    role: str,
    target_site_ids: List[str],
    master_token: str,
    actor_email: str = "anonymous",
) -> List[Dict]:
    api_headers = {"Authorization": f"Bearer {master_token}"}
    client_limits = httpx.Limits(max_connections=BATCH_MAX_CONCURRENCY, max_keepalive_connections=BATCH_MAX_CONCURRENCY)

    async with httpx.AsyncClient(verify=False, limits=client_limits) as client:
        async def handle_site(site_id: str) -> Dict[str, Any]:
            url = (
                f"{ARUBA_PORTAL_BASE}/api/sites/{site_id}/administration?action=addAccount"
                if action_type == "add"
                else f"{ARUBA_PORTAL_BASE}/api/sites/{site_id}/administration?action=removeAccount"
            )
            payload = {"email": email}
            if action_type == "add":
                payload["roleOnSite"] = role

            try:
                res = await client.post(url, headers=api_headers, json=payload, timeout=20.0)
                if res.status_code in [200, 204]:
                    return {"target": site_id, "status": "SUCCESS", "detail": f"Account {action_type}ed successfully."}

                return {
                    "target": site_id,
                    "status": "ERROR",
                    "detail": response_detail(res),
                    "_retryable": is_retryable_response(res.status_code),
                }
            except Exception as e:
                return {"target": site_id, "status": "ERROR", "detail": str(e), "_retryable": True}

        results = await run_bounded_batch(target_site_ids, handle_site)

    await asyncio.gather(*(
        insert_batch_audit_log(
            action=f"Batch Account Access ({action_type.capitalize()})",
            actor_email=actor_email,
            site_id=result.get("target"),
            status=result.get("status", "ERROR"),
            detail=f"Target Email: {email}",
        )
        for result in results
    ))

    return results


async def batch_site_delete(
    target_site_ids: List[str],
    master_token: str,
    actor_email: str = "anonymous",
) -> List[Dict]:
    api_headers = {"Authorization": f"Bearer {master_token}"}
    client_limits = httpx.Limits(max_connections=BATCH_MAX_CONCURRENCY, max_keepalive_connections=BATCH_MAX_CONCURRENCY)

    async with httpx.AsyncClient(verify=False, limits=client_limits) as client:
        async def handle_site(site_id: str) -> Dict[str, Any]:
            url = f"{ARUBA_PORTAL_BASE}/api/sites/{site_id}"
            try:
                res = await client.delete(url, headers=api_headers, timeout=20.0)
                if res.status_code in [200, 204]:
                    return {"target": site_id, "status": "SUCCESS", "detail": "Site deleted successfully."}

                return {
                    "target": site_id,
                    "status": "ERROR",
                    "detail": response_detail(res),
                    "_retryable": is_retryable_response(res.status_code),
                }
            except Exception as e:
                return {"target": site_id, "status": "ERROR", "detail": str(e), "_retryable": True}

        results = await run_bounded_batch(target_site_ids, handle_site)

    await asyncio.gather(*(
        insert_batch_audit_log(
            action="Batch Site Delete",
            actor_email=actor_email,
            site_id=result.get("target"),
            status=result.get("status", "ERROR"),
        )
        for result in results
    ))

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
    api_headers = {"Authorization": f"Bearer {master_token}", "X-ION-API-VERSION": "23"}
    url = f"{ARUBA_PORTAL_BASE}/api/sites/{source_site_id}/siteCloning"
    client_limits = httpx.Limits(max_connections=BATCH_MAX_CONCURRENCY, max_keepalive_connections=BATCH_MAX_CONCURRENCY)

    from app.database.zones_crud import add_sites_to_zone

    async with httpx.AsyncClient(verify=False, limits=client_limits) as client:
        async def handle_clone(index: int) -> Dict[str, Any]:
            padded_index = str(index + 1).zfill(2)
            site_name = f"{prefix.strip()} - {padded_index}"
            payload = {
                "siteName": site_name,
                "regulatoryDomain": regulatory_domain,
                "timezoneIana": timezone_iana,
                "configuredLocation": configured_location
            }
            try:
                res = await client.post(url, headers=api_headers, json=payload, timeout=30.0)
                if res.status_code in [200, 201]:
                    data = res.json()
                    new_site_id = data.get("siteId") or data.get("id")
                    if new_site_id and target_zone_ids:
                        for zone_id in target_zone_ids:
                            await add_sites_to_zone(zone_id, [new_site_id])

                    return {
                        "target": site_name,
                        "status": "SUCCESS",
                        "detail": "Site provisioned successfully.",
                        "new_site_id": new_site_id,
                    }

                return {
                    "target": site_name,
                    "status": "ERROR",
                    "detail": response_detail(res),
                    "_retryable": is_retryable_response(res.status_code),
                }
            except Exception as e:
                return {"target": site_name, "status": "ERROR", "detail": str(e), "_retryable": True}

        results = await run_bounded_batch(list(range(clone_count)), handle_clone, timeout_seconds=60.0)

    await asyncio.gather(*(
        insert_batch_audit_log(
            action="Batch Site Provision",
            actor_email=actor_email,
            site_id=result.get("new_site_id") if result.get("status") == "SUCCESS" else None,
            status=result.get("status", "ERROR"),
            detail=f"Provisioned: {result.get('target')}",
        )
        for result in results
    ))

    return results


async def batch_clear_site_networks(
    target_site_ids: List[str],
    master_token: str,
    actor_email: str = "anonymous",
) -> List[Dict]:
    headers = build_headers(master_token)
    results = []

    async with httpx.AsyncClient(verify=False) as client:
        for site_id in target_site_ids:
            site_result = {
                "target": site_id, "status": "ERROR", "detail": "",
                "ssids_deleted": 0, "wired_deleted": 0, "skipped": 0,
                "guest_portal_reset": False,
            }

            try:
                site_url = f"{ARUBA_PORTAL_BASE}/api/sites/{site_id}"
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

                req_headers = build_headers(master_token, referer=f"{ARUBA_PORTAL_BASE}/sites/{site_id}/networks/overview")
                errors = []

                # DELETE all SSIDs
                nets_url = f"{ARUBA_PORTAL_BASE}/api/sites/{site_id}/networksSummary"
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

                # DELETE all wired networks
                wired_url = f"{ARUBA_PORTAL_BASE}/api/sites/{site_id}/wiredNetworks"
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
                            except Exception:
                                pass
                            await asyncio.sleep(0.3)

                        try:
                            res_wdel = await client.delete(f"{wired_url}/{wired_id}", headers=req_headers, timeout=15.0)
                            if res_wdel.status_code in [200, 204]:
                                wired_deleted += 1
                                print(f"[CLEAR] ✓ Deleted wired '{wired_name}'")
                            elif res_wdel.status_code == 400:
                                skipped += 1
                                print(f"[CLEAR] ✗ Cannot delete wired '{wired_name}' (400 — protected by Aruba)")
                            else:
                                errors.append(f"Wired {wired_name}: {res_wdel.status_code}")
                                print(f"[CLEAR] ✗ Wired '{wired_name}' failed: {res_wdel.status_code}")
                        except Exception as e:
                            errors.append(f"Wired {wired_name}: {str(e)}")
                        await asyncio.sleep(0.5)

                # Reset Guest Portal
                gp_reset = False
                try:
                    gp_url = f"{ARUBA_PORTAL_BASE}/api/sites/{site_id}/guestPortalSettings"
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

                # Build result
                site_result["ssids_deleted"] = ssid_deleted
                site_result["wired_deleted"] = wired_deleted
                site_result["skipped"] = skipped
                site_result["guest_portal_reset"] = gp_reset
                site_result["networks_deleted"] = ssid_deleted + wired_deleted

                total_actions = ssid_deleted + wired_deleted + (1 if gp_reset else 0)
                parts = []
                if ssid_deleted:
                    parts.append(f"{ssid_deleted} SSIDs xóa")
                if wired_deleted:
                    parts.append(f"{wired_deleted} wired xóa")
                if gp_reset:
                    parts.append("guest portal reset")
                if skipped:
                    parts.append(f"{skipped} bị chặn (Aruba protected)")
                if errors:
                    parts.append(f"lỗi: {'; '.join(errors[:3])}")

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
