import httpx
import json
from typing import Optional, Dict, Any
from urllib.parse import urlparse
from app.shared.constants import (
    ARUBA_BASE_URL,
    ARUBA_API_VERSION,
    ARUBA_CLIENT_TYPE,
    ARUBA_CLIENT_PLATFORM,
    CHROME_USER_AGENT,
)

class ArubaService:
    def __init__(self):
        pass

    async def _get_auth_headers(self, aruba_token: Optional[str]) -> Dict[str, str]:
        """Prepare headers based on the provided token."""
        headers = {}
        if aruba_token:
            headers["Authorization"] = f"Bearer {aruba_token}"
        return headers

    async def call_api(
        self,
        method: str,
        endpoint: str,
        aruba_token: Optional[str] = None,
        data: Any = None,
        json_data: Any = None,
        headers: Optional[Dict[str, str]] = None,
        target_domain: Optional[str] = None,
        use_master_auto: bool = False
    ) -> httpx.Response:
        """
        Executes a request to the Aruba API with automatic auth injection and header spoofing.
        If use_master_auto is True, it will attempt to use the master token and retry once on 401.
        """
        effective_token = aruba_token
        if use_master_auto and not effective_token:
            from app.features.master.service import get_master_token_auto
            effective_token = await get_master_token_auto()

        async def _do_call(token: Optional[str]):
            base_url = f"https://{target_domain}" if target_domain else ARUBA_BASE_URL
            if not endpoint.startswith("http"):
                 url = f"{base_url}/{endpoint.lstrip('/')}"
            else:
                url = endpoint

            # Prepare Auth
            auth_headers = await self._get_auth_headers(token)

            # Prepare Request Headers
            f_headers = {
                "User-Agent": CHROME_USER_AGENT,
                "Accept": "application/json, text/plain, */*",
                "Accept-Language": "en-us",
                "X-Ion-Api-Version": ARUBA_API_VERSION,
                "X-Ion-Client-Type": ARUBA_CLIENT_TYPE,
                "X-Ion-Client-Platform": ARUBA_CLIENT_PLATFORM,
            }
            f_headers.update(auth_headers)
            if headers:
                f_headers.update(headers)

            parsed_target = urlparse(url)
            t_host = parsed_target.netloc
            f_headers.setdefault("Origin", f"{parsed_target.scheme}://{t_host}")
            f_headers.setdefault("Referer", f"{f_headers['Origin']}/")
            f_headers["Host"] = t_host

            async with httpx.AsyncClient(timeout=30.0, follow_redirects=True, verify=False) as client:
                return await client.request(
                    method=method,
                    url=url,
                    headers=f_headers,
                    data=data,
                    json=json_data
                )

        resp = await _do_call(effective_token)

        # If we get unauthorized and we are using master auto, try one refresh
        if resp.status_code in [401, 403] and use_master_auto:
            print(f"[ARUBA SERVICE] Received {resp.status_code}. Attempting SILENT RE-LOGIN refresh...")
            from app.features.master.service import refresh_token_locked
            ok = await refresh_token_locked()
            if ok:
                from app.features.master.service import get_master_token_auto
                new_token = await get_master_token_auto()
                if new_token and new_token != effective_token:
                    print(f"[ARUBA SERVICE] Refresh success, retrying with new token...")
                    resp = await _do_call(new_token)

        if resp.status_code in [401, 403]:
            print(f"[ARUBA SERVICE] Final response {resp.status_code}. Token might be invalid.")

        return resp

# Singleton instance
aruba_service = ArubaService()
