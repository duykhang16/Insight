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
        target_domain: Optional[str] = None
    ) -> httpx.Response:
        """
        Executes a request to the Aruba API with automatic auth injection and header spoofing.
        """
        base_url = f"https://{target_domain}" if target_domain else ARUBA_BASE_URL
        if not endpoint.startswith("http"):
             url = f"{base_url}/{endpoint.lstrip('/')}"
        else:
            url = endpoint

        # Prepare Auth
        auth_headers = await self._get_auth_headers(aruba_token)

        # Prepare Request Headers
        final_headers = {
            "User-Agent": CHROME_USER_AGENT,
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "en-us",
            "X-Ion-Api-Version": ARUBA_API_VERSION,
            "X-Ion-Client-Type": ARUBA_CLIENT_TYPE,
            "X-Ion-Client-Platform": ARUBA_CLIENT_PLATFORM,
        }
        final_headers.update(auth_headers)
        if headers:
            final_headers.update(headers)

        # Dynamic Header Spoofing
        parsed_target = urlparse(url)
        target_host = parsed_target.netloc

        origin_val = f"{parsed_target.scheme}://{target_host}"
        referer_val = f"{origin_val}/"

        final_headers["Origin"] = origin_val
        final_headers["Referer"] = referer_val
        final_headers["Host"] = target_host

        print(f"[ARUBA SERVICE] Final URL: {url}")
        print(f"[ARUBA SERVICE] Target Host: {target_host}")
        token_present = "Yes" if final_headers.get("Authorization") or final_headers.get("authorization") else "No"
        print(f"[ARUBA SERVICE] Token Presence: {token_present}")

        # Execute Request
        async with httpx.AsyncClient(
            timeout=30.0,
            follow_redirects=True,
            verify=False
        ) as client:
            resp = await client.request(
                method=method,
                url=url,
                headers=final_headers,
                data=data,
                json=json_data
            )

            # If we get unauthorized
            if resp.status_code in [401, 403]:
                print(f"[ARUBA SERVICE] Received {resp.status_code}. Token might be expired.")

            return resp

# Singleton instance
aruba_service = ArubaService()
