"""Background asyncio task that auto-refreshes the master Aruba token.

IMPORTANT: This relies on the app running with a SINGLE Uvicorn worker.
If using multiple workers, each worker spawns its own task, causing multiple
concurrent Aruba SSO login attempts. Set WEB_CONCURRENCY=1 in docker-compose.
"""
import asyncio
from datetime import datetime, timezone, timedelta
from typing import Optional

_refresh_task: Optional[asyncio.Task] = None
CHECK_INTERVAL_SECONDS = 300  # Check every 5 minutes
REFRESH_THRESHOLD_SECONDS = 300  # Refresh if token expires within 5 minutes


def _is_token_expiring_soon(expires_at) -> bool:
    """Return True if token expires within REFRESH_THRESHOLD_SECONDS."""
    if not expires_at:
        return True
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
    elif expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    now = datetime.now(timezone.utc)
    return (expires_at - now).total_seconds() < REFRESH_THRESHOLD_SECONDS


async def _do_refresh():
    """Attempt to refresh the master token using stored credentials."""
    from app.database.master_crud import get_master_config, update_master_token
    from app.features.replay.service import replay_login
    
    try:
        from app.shared.encryption import decrypt_password
    except ImportError:
        pass

    config = await get_master_config()
    if not config or not config.get("is_active"):
        return

    expires_at = config.get("expires_at")
    if expires_at and not _is_token_expiring_soon(expires_at):
        return  # Token still valid, skip refresh

    print("[MASTER TOKEN MANAGER] Refreshing master Aruba token...")
    try:
        from app.shared.encryption import decrypt_password
        plain_pass = decrypt_password(config["encrypted_password"])
        username = config["username"]

        result = await replay_login(username, plain_pass)
        if result.get("status") == "success":
            new_token = result["data"].get("access_token", "")
            expires_in = result.get("expires_in", 1799)
            ok = await update_master_token(new_token, expires_in)
            if ok:
                print(f"[MASTER TOKEN MANAGER] Token refreshed. Expires in {expires_in}s.")
            else:
                print("[MASTER TOKEN MANAGER] WARNING: Token refresh succeeded but DB update failed.")
        else:
            print(f"[MASTER TOKEN MANAGER] ERROR: Aruba login failed — {result.get('message')}")
    except Exception as e:
        print(f"[MASTER TOKEN MANAGER] ERROR during refresh: {e}")


async def _refresh_loop():
    """Infinite loop: check every CHECK_INTERVAL_SECONDS and refresh if needed."""
    while True:
        await _do_refresh()
        await asyncio.sleep(CHECK_INTERVAL_SECONDS)


def start_token_manager():
    """Start the background token refresh task. Called from lifespan()."""
    global _refresh_task
    if _refresh_task is None or _refresh_task.done():
        _refresh_task = asyncio.create_task(_refresh_loop())
