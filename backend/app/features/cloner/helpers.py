"""
Cloner helpers — shared utilities, constants, and batch infrastructure.
"""
import asyncio
import httpx
from typing import Any, Callable, Awaitable, Dict, List, Optional, TypeVar
from datetime import datetime, timezone

BATCH_MAX_CONCURRENCY = 4
BATCH_SITE_TIMEOUT_SECONDS = 45.0
BATCH_RETRY_ATTEMPTS = 2
BATCH_RETRY_DELAY_SECONDS = 1.0
BATCH_RETRYABLE_STATUS_CODES = {429, 502, 503, 504}

_BatchItem = TypeVar("_BatchItem")

ARUBA_PORTAL_BASE = "https://portal.instant-on.hpe.com"
ARUBA_COMMON_HEADERS = {
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-us",
    "X-ION-API-VERSION": "22",
    "X-ION-CLIENT-TYPE": "InstantOn",
    "X-ION-CLIENT-PLATFORM": "web",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36",
    "Content-Type": "application/json",
}


def build_headers(aruba_token: str, *, referer: str = None) -> Dict[str, str]:
    headers = {
        **ARUBA_COMMON_HEADERS,
        "Authorization": f"Bearer {aruba_token}",
    }
    if referer:
        headers["Referer"] = referer
    return headers


def response_detail(response: httpx.Response) -> Any:
    try:
        if response.content:
            return response.json()
    except Exception:
        pass
    return response.text[:500]


def finalize_batch_result(result: Dict[str, Any]) -> Dict[str, Any]:
    return {key: value for key, value in result.items() if not key.startswith("_")}


def is_retryable_response(status_code: int) -> bool:
    return status_code in BATCH_RETRYABLE_STATUS_CODES


async def check_site_permission(
    client: httpx.AsyncClient,
    site_id: str,
    headers: Dict[str, str],
    *,
    name: str = "",
) -> Optional[Dict[str, Any]]:
    """Check user role on site. Returns error dict if permission denied, None if OK."""
    site_check_url = f"{ARUBA_PORTAL_BASE}/api/sites/{site_id}"
    try:
        res_check = await client.get(site_check_url, headers=headers, timeout=10.0)
        if res_check.status_code == 200:
            site_data = res_check.json()
            role = (site_data.get("userRoleOnSite") or "").lower()
            if role not in ["administrator", "operator"]:
                return {"target": site_id, "name": name, "status": "ERROR", "detail": f"Insufficient permissions ({role})"}
        else:
            return {"target": site_id, "name": name, "status": "ERROR", "detail": f"Failed to verify permissions ({res_check.status_code})"}
    except Exception as e:
        return {"target": site_id, "name": name, "status": "ERROR", "detail": f"Permission check error: {str(e)}"}
    return None


async def fetch_site_networks(
    client: httpx.AsyncClient,
    site_id: str,
    headers: Dict[str, str],
    *,
    name: str = "",
) -> tuple:
    """Fetch networksSummary for a site. Returns (networks_list, error_dict_or_None)."""
    nets_url = f"{ARUBA_PORTAL_BASE}/api/sites/{site_id}/networksSummary"
    try:
        res_nets = await client.get(nets_url, headers=headers, timeout=15.0)
        if res_nets.status_code != 200:
            return [], {"target": site_id, "name": name, "status": "ERROR", "detail": f"Failed to fetch networks ({res_nets.status_code})"}

        nets_data = res_nets.json()
        networks = nets_data.get("elements", []) if isinstance(nets_data, dict) else nets_data
        return networks, None
    except Exception as e:
        return [], {"target": site_id, "name": name, "status": "ERROR", "detail": f"Fetch networks error: {str(e)}"}


async def insert_batch_audit_log(
    *,
    action: str,
    actor_email: str,
    site_id: Optional[str],
    status: str,
    detail: Optional[str] = None,
) -> None:
    from app.database.auth_crud import insert_audit_log

    log_entry = {
        "timestamp": datetime.now(timezone.utc),
        "insight_user_id": actor_email,
        "admin_master_id": "Master System",
        "action": action,
        "site_id": site_id,
        "status": status,
    }
    if detail:
        log_entry["detail"] = detail
    await insert_audit_log(log_entry)


async def run_bounded_batch(
    items: List[_BatchItem],
    worker: Callable[[_BatchItem], Awaitable[Dict[str, Any]]],
    *,
    concurrency: int = BATCH_MAX_CONCURRENCY,
    timeout_seconds: float = BATCH_SITE_TIMEOUT_SECONDS,
) -> List[Dict[str, Any]]:
    if not items:
        return []

    concurrency = max(1, min(concurrency, len(items)))
    semaphore = asyncio.Semaphore(concurrency)
    results: List[Optional[Dict[str, Any]]] = [None] * len(items)

    async def run_one(index: int, item: _BatchItem) -> None:
        async with semaphore:
            final_result: Dict[str, Any] = {}
            for attempt in range(1, BATCH_RETRY_ATTEMPTS + 1):
                try:
                    final_result = await asyncio.wait_for(worker(item), timeout=timeout_seconds)
                except asyncio.TimeoutError:
                    final_result = {
                        "status": "ERROR",
                        "detail": f"Timed out after {timeout_seconds:.0f}s",
                        "_retryable": attempt < BATCH_RETRY_ATTEMPTS,
                    }
                except Exception as exc:
                    final_result = {
                        "status": "ERROR",
                        "detail": f"Request error: {exc}",
                        "_retryable": attempt < BATCH_RETRY_ATTEMPTS,
                    }

                if not final_result.get("_retryable"):
                    break

                await asyncio.sleep(BATCH_RETRY_DELAY_SECONDS * attempt)

            results[index] = finalize_batch_result(final_result)

    await asyncio.gather(*(run_one(index, item) for index, item in enumerate(items)))
    return [result or {"status": "ERROR", "detail": "Unknown batch execution error"} for result in results]
