"""
Aruba API Client Wrapper — Triệt để xử lý response từ Aruba Instant On API.

Responsibilities:
1. Hard Error Handling: HTTP status errors (401, 403, 404, 500), timeouts, network errors
2. Soft Error Handling: HTTP 200 but JSON contains error indicators
3. Error Mapping: Translate cryptic device errors to user-friendly messages
4. Retry Logic: Configurable retry with exponential backoff for transient failures
"""

import httpx
import json
from typing import Any, Dict, Optional, Tuple
from dataclasses import dataclass
from app.shared.constants import (
    ARUBA_BASE_URL,
    ARUBA_API_VERSION,
    ARUBA_CLIENT_TYPE,
    ARUBA_CLIENT_PLATFORM,
    CHROME_USER_AGENT,
)


# ─── Error Mapping Dictionary ───────────────────────────────────────────────
# Maps cryptic Aruba API error codes/messages to user-friendly descriptions.
# Extend this as new error patterns are discovered.
ERROR_MAP: Dict[str, str] = {
    # Network/SSID errors
    "ERR_VLAN_INVALID": "VLAN ID không hợp lệ hoặc chưa được cấu hình trên thiết bị.",
    "ERR_NETWORK_LIMIT": "Đã đạt giới hạn tối đa số lượng mạng (8 wireless networks).",
    "ERR_DUPLICATE_SSID": "SSID đã tồn tại trên site này.",
    "ERR_PSK_TOO_SHORT": "Mật khẩu PSK phải có ít nhất 8 ký tự.",
    "ERR_PSK_TOO_LONG": "Mật khẩu PSK không được vượt quá 63 ký tự.",
    "ERR_INVALID_NETWORK_NAME": "Tên mạng chứa ký tự không hợp lệ.",
    "ERR_NETWORK_NAME_TOO_LONG": "Tên mạng không được vượt quá 32 ký tự.",

    # Auth errors
    "ERR_UNAUTHORIZED": "Token đã hết hạn hoặc không hợp lệ. Vui lòng đăng nhập lại.",
    "ERR_FORBIDDEN": "Không có quyền thực hiện thao tác này trên site.",
    "ERR_INSUFFICIENT_ROLE": "Cần quyền Administrator để thực hiện thao tác này.",

    # Device errors
    "ERR_DEVICE_OFFLINE": "Thiết bị đang offline, không thể áp dụng cấu hình.",
    "ERR_DEVICE_BUSY": "Thiết bị đang xử lý tác vụ khác. Vui lòng thử lại sau.",
    "ERR_FIRMWARE_UPDATE": "Thiết bị đang cập nhật firmware, không thể thay đổi cấu hình.",

    # Portal errors
    "ERR_PORTAL_CONFIG": "Cấu hình Guest Portal không hợp lệ.",
    "ERR_EXTERNAL_SERVER": "Không thể kết nối tới External Captive Portal server.",

    # Generic
    "ERR_RATE_LIMIT": "Đã vượt quá giới hạn request. Vui lòng đợi 30 giây.",
    "ERR_INTERNAL": "Lỗi nội bộ từ hệ thống Aruba. Vui lòng thử lại.",
    "ERR_TIMEOUT": "Request tới Aruba API bị timeout. Kiểm tra kết nối mạng.",
    "ERR_NETWORK": "Không thể kết nối tới Aruba API. Kiểm tra kết nối internet.",
}

# Patterns to detect soft errors in seemingly successful responses
SOFT_ERROR_KEYS = ["error", "error_code", "errorCode", "errorMessage", "fault"]


@dataclass
class ArubaResponse:
    """Standardized response from Aruba API."""
    success: bool
    status_code: int
    data: Any = None
    error_code: Optional[str] = None
    error_message: Optional[str] = None
    raw_text: str = ""

    @property
    def friendly_error(self) -> str:
        """Get user-friendly error message."""
        if self.error_code and self.error_code in ERROR_MAP:
            return ERROR_MAP[self.error_code]
        if self.error_message:
            # Try to match partial patterns
            msg_lower = self.error_message.lower()
            if "unauthorized" in msg_lower or "401" in msg_lower:
                return ERROR_MAP["ERR_UNAUTHORIZED"]
            if "forbidden" in msg_lower or "403" in msg_lower:
                return ERROR_MAP["ERR_FORBIDDEN"]
            if "timeout" in msg_lower:
                return ERROR_MAP["ERR_TIMEOUT"]
            if "vlan" in msg_lower:
                return ERROR_MAP["ERR_VLAN_INVALID"]
            if "limit" in msg_lower or "maximum" in msg_lower:
                return ERROR_MAP["ERR_NETWORK_LIMIT"]
            if "duplicate" in msg_lower or "already exists" in msg_lower:
                return ERROR_MAP["ERR_DUPLICATE_SSID"]
            return self.error_message
        return f"HTTP {self.status_code} Error"


class ArubaApiClient:
    """
    Enhanced Aruba API client with comprehensive error handling.

    Usage:
        client = ArubaApiClient(token="...")
        resp = await client.get(f"/api/sites/{site_id}/networksSummary")
        if resp.success:
            networks = resp.data
        else:
            print(resp.friendly_error)
    """

    def __init__(self, token: str, timeout: float = 20.0, max_retries: int = 1):
        self.token = token
        self.timeout = timeout
        self.max_retries = max_retries
        self._base_url = ARUBA_BASE_URL

    def _build_headers(self, site_id: str = None) -> Dict[str, str]:
        """Build standard Aruba API headers."""
        headers = {
            "Authorization": f"Bearer {self.token}",
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "en-us",
            "X-ION-API-VERSION": ARUBA_API_VERSION,
            "X-ION-CLIENT-TYPE": ARUBA_CLIENT_TYPE,
            "X-ION-CLIENT-PLATFORM": ARUBA_CLIENT_PLATFORM,
            "User-Agent": CHROME_USER_AGENT,
            "Content-Type": "application/json",
        }
        if site_id:
            headers["Referer"] = f"{self._base_url}/sites/{site_id}/networks/overview"
        return headers

    async def get(self, path: str, site_id: str = None) -> ArubaResponse:
        """Execute GET request."""
        return await self._request("GET", path, site_id=site_id)

    async def post(self, path: str, payload: dict = None, site_id: str = None) -> ArubaResponse:
        """Execute POST request."""
        return await self._request("POST", path, payload=payload, site_id=site_id)

    async def put(self, path: str, payload: dict = None, site_id: str = None) -> ArubaResponse:
        """Execute PUT request."""
        return await self._request("PUT", path, payload=payload, site_id=site_id)

    async def delete(self, path: str, site_id: str = None) -> ArubaResponse:
        """Execute DELETE request."""
        return await self._request("DELETE", path, site_id=site_id)

    async def _request(
        self,
        method: str,
        path: str,
        payload: dict = None,
        site_id: str = None,
    ) -> ArubaResponse:
        """Execute request with retry logic and comprehensive error handling."""
        url = path if path.startswith("http") else f"{self._base_url}/{path.lstrip('/')}"
        headers = self._build_headers(site_id)

        last_exception = None

        for attempt in range(1, self.max_retries + 2):  # +2 because range is exclusive
            try:
                async with httpx.AsyncClient(verify=False) as client:
                    response = await client.request(
                        method=method,
                        url=url,
                        headers=headers,
                        json=payload,
                        timeout=self.timeout,
                    )

                return self._process_response(response)

            except httpx.TimeoutException:
                last_exception = "timeout"
                if attempt <= self.max_retries:
                    print(f"[ARUBA_CLIENT] Timeout on attempt {attempt}, retrying...")
                    import asyncio
                    await asyncio.sleep(1.0 * attempt)  # Exponential backoff
                    continue
                return ArubaResponse(
                    success=False,
                    status_code=408,
                    error_code="ERR_TIMEOUT",
                    error_message=ERROR_MAP["ERR_TIMEOUT"],
                )

            except httpx.ConnectError:
                last_exception = "connect"
                return ArubaResponse(
                    success=False,
                    status_code=0,
                    error_code="ERR_NETWORK",
                    error_message=ERROR_MAP["ERR_NETWORK"],
                )

            except Exception as e:
                last_exception = str(e)
                if attempt <= self.max_retries:
                    print(f"[ARUBA_CLIENT] Error on attempt {attempt}: {e}, retrying...")
                    import asyncio
                    await asyncio.sleep(1.0 * attempt)
                    continue
                return ArubaResponse(
                    success=False,
                    status_code=0,
                    error_code="ERR_INTERNAL",
                    error_message=f"Request error: {str(e)}",
                )

        # Should not reach here, but safety net
        return ArubaResponse(
            success=False,
            status_code=0,
            error_code="ERR_INTERNAL",
            error_message=f"Max retries exceeded. Last error: {last_exception}",
        )

    def _process_response(self, response: httpx.Response) -> ArubaResponse:
        """Process HTTP response — handle both hard and soft errors."""
        raw_text = response.text[:1000]

        # ─── Hard Errors (HTTP status) ───
        if response.status_code == 401:
            return ArubaResponse(
                success=False,
                status_code=401,
                error_code="ERR_UNAUTHORIZED",
                error_message=ERROR_MAP["ERR_UNAUTHORIZED"],
                raw_text=raw_text,
            )

        if response.status_code == 403:
            return ArubaResponse(
                success=False,
                status_code=403,
                error_code="ERR_FORBIDDEN",
                error_message=ERROR_MAP["ERR_FORBIDDEN"],
                raw_text=raw_text,
            )

        if response.status_code == 429:
            return ArubaResponse(
                success=False,
                status_code=429,
                error_code="ERR_RATE_LIMIT",
                error_message=ERROR_MAP["ERR_RATE_LIMIT"],
                raw_text=raw_text,
            )

        if response.status_code >= 500:
            return ArubaResponse(
                success=False,
                status_code=response.status_code,
                error_code="ERR_INTERNAL",
                error_message=f"Aruba server error [{response.status_code}]",
                raw_text=raw_text,
            )

        # ─── Parse JSON ───
        data = None
        try:
            data = response.json()
        except (json.JSONDecodeError, ValueError):
            if response.status_code in [200, 201, 204]:
                return ArubaResponse(success=True, status_code=response.status_code, raw_text=raw_text)
            return ArubaResponse(
                success=False,
                status_code=response.status_code,
                error_message=f"Invalid JSON response [{response.status_code}]",
                raw_text=raw_text,
            )

        # ─── Hard Error with JSON body (4xx) ───
        if response.status_code >= 400:
            error_msg = None
            error_code = None
            if isinstance(data, dict):
                error_msg = data.get("message") or data.get("error") or data.get("detail") or data.get("errorMessage")
                error_code = data.get("error_code") or data.get("errorCode")
            return ArubaResponse(
                success=False,
                status_code=response.status_code,
                data=data,
                error_code=error_code,
                error_message=error_msg or f"Request failed [{response.status_code}]",
                raw_text=raw_text,
            )

        # ─── Soft Errors (HTTP 200 but error in body) ───
        if isinstance(data, dict):
            for key in SOFT_ERROR_KEYS:
                if key in data and data[key]:
                    err_val = data[key]
                    if isinstance(err_val, str) and err_val.lower() not in ["none", "null", ""]:
                        print(f"[ARUBA_CLIENT] Soft error detected: {key}={err_val}")
                        return ArubaResponse(
                            success=False,
                            status_code=response.status_code,
                            data=data,
                            error_code=err_val if err_val.startswith("ERR_") else None,
                            error_message=err_val,
                            raw_text=raw_text,
                        )

            # Check for status field indicating failure
            status_val = data.get("status", "").lower() if isinstance(data.get("status"), str) else ""
            if status_val in ["error", "failure", "failed"]:
                err_msg = data.get("message") or data.get("detail") or "Operation failed (soft error)"
                return ArubaResponse(
                    success=False,
                    status_code=response.status_code,
                    data=data,
                    error_message=err_msg,
                    raw_text=raw_text,
                )

        # ─── Success ───
        return ArubaResponse(
            success=True,
            status_code=response.status_code,
            data=data,
            raw_text=raw_text,
        )


def translate_error(error_code: str) -> str:
    """Translate an error code to a user-friendly message."""
    return ERROR_MAP.get(error_code, error_code)
