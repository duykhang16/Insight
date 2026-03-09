# Centralized Environment Config Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Centralize all hardcoded config into a single `sources/insight/.env` file (monorepo style), extract Aruba constants to `constants.py`, and refactor backend/frontend to read from environment variables.

**Architecture:** One `.env` file at `sources/insight/` is the single source of truth. Backend uses `python-dotenv` with `find_dotenv()` to locate it. Frontend uses Vite's `envDir: '../'` config. Docker Compose reads from `env_file`. Aruba URLs/constants move to a dedicated `constants.py` (not in `.env` since they never change).

**Tech Stack:** Python 3 + python-dotenv + FastAPI, Vite + React

---

## Context / Key Findings

- `config.py` already uses `python-dotenv` (`load_dotenv()`) but `DATABASE_NAME` is hardcoded as `"insight"` — NOT read from env
- `backend/.env.example` has wrong DB name: `aruba_capture` — will be corrected
- `docker-compose.yml` injects env vars inline — will be converted to `env_file` reference
- Aruba constants in `aruba.py` and `replay_service.py` are HPE-fixed values — will move to `constants.py` (NOT `.env`)
- Frontend `.env` and `vite.config.js` proxy target are hardcoded to `localhost:8001`
- CORS origins in `main.py` are hardcoded strings

---

## Task 1: Create `backend/app/core/constants.py`

**Files:**
- Create: `sources/insight/backend/app/core/constants.py`

**Step 1: Create the constants file**

```python
"""Aruba/HPE Instant-On fixed constants.

These values are determined by the Aruba platform and never change per environment.
Do NOT put these in .env — they are not deployment-specific configuration.
"""

# Aruba Instant-On Portal
ARUBA_BASE_URL = "https://portal.instant-on.hpe.com"
ARUBA_ORIGIN = "https://portal.instant-on.hpe.com"
ARUBA_REFERER = "https://portal.instant-on.hpe.com/"

# Aruba SSO endpoints
ARUBA_SSO_VALIDATE_URL = "https://sso.arubainstanton.com/aio/api/v1/mfa/validate/full"
ARUBA_SSO_AUTHORIZE_URL = "https://sso.arubainstanton.com/as/authorization.oauth2"
ARUBA_SSO_TOKEN_URL = "https://sso.arubainstanton.com/as/token.oauth2"

# Aruba API headers
ARUBA_API_VERSION = "23"
ARUBA_CLIENT_TYPE = "InstantOn"
ARUBA_CLIENT_PLATFORM = "web"

# Chrome User-Agent (used for Aruba header spoofing)
CHROME_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/145.0.0.0 Safari/537.36"
)
```

**Step 2: Verify file was created**

Check file exists at `sources/insight/backend/app/core/constants.py`

---

## Task 2: Refactor `aruba.py` to import from `constants.py`

**Files:**
- Modify: `sources/insight/backend/app/services/aruba.py`

**Step 1: Update imports and remove local constants**

Replace the top of the file (lines 1-10):

OLD:
```python
import httpx
import json
from typing import Optional, Dict, Any
from urllib.parse import urlparse

# Constants
STRICT_ORIGIN = "https://portal.instant-on.hpe.com"
STRICT_REFERER = "https://portal.instant-on.hpe.com/"
CHROME_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
DEFAULT_BASE_URL = "https://portal.instant-on.hpe.com"
```

NEW:
```python
import httpx
import json
from typing import Optional, Dict, Any
from urllib.parse import urlparse
from app.core.constants import (
    ARUBA_BASE_URL,
    ARUBA_API_VERSION,
    ARUBA_CLIENT_TYPE,
    ARUBA_CLIENT_PLATFORM,
    CHROME_USER_AGENT,
)
```

**Step 2: Update usages inside `call_api` method**

Replace references:
- `DEFAULT_BASE_URL` → `ARUBA_BASE_URL`
- `"23"` (hardcoded in `final_headers`) → `ARUBA_API_VERSION`
- `"InstantOn"` → `ARUBA_CLIENT_TYPE`
- `"web"` → `ARUBA_CLIENT_PLATFORM`
- `CHROME_USER_AGENT` stays the same (now imported)

The `final_headers` dict should become:
```python
final_headers = {
    "User-Agent": CHROME_USER_AGENT,
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-us",
    "X-Ion-Api-Version": ARUBA_API_VERSION,
    "X-Ion-Client-Type": ARUBA_CLIENT_TYPE,
    "X-Ion-Client-Platform": ARUBA_CLIENT_PLATFORM,
}
```

And the base_url line:
```python
base_url = f"https://{target_domain}" if target_domain else ARUBA_BASE_URL
```

**Step 3: Verify no remaining hardcoded Aruba URLs in this file**

---

## Task 3: Refactor `replay_service.py` to import from `constants.py`

**Files:**
- Modify: `sources/insight/backend/app/core/replay_service.py`

**Step 1: Add import at top of file**

After existing imports, add:
```python
from app.core.constants import (
    ARUBA_BASE_URL,
    ARUBA_SSO_VALIDATE_URL,
    ARUBA_SSO_AUTHORIZE_URL,
    ARUBA_SSO_TOKEN_URL,
    CHROME_USER_AGENT,
)
```

**Step 2: Replace hardcoded URL strings in `replay_login` function**

- Line 21: `url = "https://sso.arubainstanton.com/aio/api/v1/mfa/validate/full"` → `url = ARUBA_SSO_VALIDATE_URL`
- Line 28: `target_resource = "https://portal.instant-on.hpe.com"` → `target_resource = ARUBA_BASE_URL`
- Line 166: `authz_url = "https://sso.arubainstanton.com/as/authorization.oauth2"` → `authz_url = ARUBA_SSO_AUTHORIZE_URL`
- Line 211: `exchange_url = "https://sso.arubainstanton.com/as/token.oauth2"` → `exchange_url = ARUBA_SSO_TOKEN_URL`
- User-Agent strings in `headers` dict → `CHROME_USER_AGENT`

**Step 3: Verify no remaining hardcoded `arubainstanton.com` or `instant-on.hpe.com` strings remain**

Run:
```bash
grep -n "arubainstanton\|instant-on.hpe" sources/insight/backend/app/core/replay_service.py
```
Expected: no output

---

## Task 4: Refactor `config.py` — add `DATABASE_NAME` from env

**Files:**
- Modify: `sources/insight/backend/app/config.py`

**Step 1: Update `config.py`**

Replace current content with:
```python
"""Application configuration loaded from environment variables."""
import os
from dotenv import load_dotenv, find_dotenv

# find_dotenv() walks up directory tree to find .env — works from any subdirectory
load_dotenv(find_dotenv(usecwd=False))

MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
DATABASE_NAME = os.getenv("DATABASE_NAME", "insight")

# Security — Fernet key source (MUST be set via env var in production)
_DEFAULT_KEY = "secret-internal-key-change-me"
INTERNAL_APP_AUTH = os.getenv("INTERNAL_APP_AUTH", _DEFAULT_KEY)
if INTERNAL_APP_AUTH == _DEFAULT_KEY:
    import warnings
    warnings.warn(
        "[SECURITY] INTERNAL_APP_AUTH đang dùng giá trị mặc định. "
        "Hãy set biến môi trường này trước khi deploy lên production.",
        stacklevel=2,
    )

# Super Admins (comma-separated list of emails)
SUPER_ADMIN_EMAILS = [
    email.strip()
    for email in os.getenv("SUPER_ADMIN_EMAILS", "admin@example.com").split(",")
    if email.strip()
]
```

Key changes:
- `load_dotenv()` → `load_dotenv(find_dotenv(usecwd=False))` — traverses up to find `insight/.env`
- `DATABASE_NAME = "insight"` → `DATABASE_NAME = os.getenv("DATABASE_NAME", "insight")`
- Default `SUPER_ADMIN_EMAILS` changed from real email to `admin@example.com`

---

## Task 5: Refactor `main.py` — read CORS from env

**Files:**
- Modify: `sources/insight/backend/app/main.py`

**Step 1: Update CORS configuration**

Add import at top:
```python
import os
```

Replace the hardcoded CORS middleware line:
```python
allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "*"],
```

With:
```python
_cors_raw = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
_cors_origins = [o.strip() for o in _cors_raw.split(",") if o.strip()]
```

And update middleware call:
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)
```

---

## Task 6: Create centralized `sources/insight/.env.example`

**Files:**
- Create: `sources/insight/.env.example`

**Step 1: Create the file**

```env
# ============================================================
# Insight — Centralized Environment Configuration
# Copy this file to .env and fill in real values.
# NEVER commit .env to version control.
# ============================================================

# === DATABASE ===
# MongoDB connection string
MONGODB_URL=mongodb://localhost:27017
# Database name used by the backend
DATABASE_NAME=insight

# === AUTH & SECURITY ===
# Fernet encryption key source — CHANGE THIS in production!
# Generate a strong random string: python -c "import secrets; print(secrets.token_hex(32))"
INTERNAL_APP_AUTH=secret-internal-key-change-me

# === ADMIN ===
# Comma-separated list of emails that get auto-created as admin on startup
SUPER_ADMIN_EMAILS=admin@example.com

# === BACKEND SERVER ===
# Comma-separated allowed CORS origins (used in production; dev uses Vite proxy)
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173

# === FRONTEND (Vite — prefix VITE_ is required) ===
# Backend API URL used by the frontend dev server proxy
VITE_API_URL=http://localhost:8001
```

---

## Task 7: Update `vite.config.js` to use `envDir` and env-based proxy

**Files:**
- Modify: `sources/insight/frontend/vite.config.js`

**Step 1: Update vite config**

```javascript
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load env from the monorepo root (insight/) instead of frontend/
  const env = loadEnv(mode, '../', '')

  return {
    plugins: [react()],
    // Tell Vite to read .env files from insight/ (one level up)
    envDir: '../',
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: env.VITE_API_URL || 'http://localhost:8001',
          changeOrigin: true,
        },
      },
    },
  }
})
```

---

## Task 8: Update `docker-compose.yml` to use `env_file`

**Files:**
- Modify: `sources/insight/docker-compose.yml`

**Step 1: Replace inline environment with env_file**

```yaml
version: '3.8'

services:
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: insight_backend
    restart: unless-stopped
    env_file:
      - .env
    ports:
      - "3003:8001"
    extra_hosts:
      - "host.docker.internal:host-gateway"
    networks:
      - insight-net

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: insight_frontend
    restart: unless-stopped
    ports:
      - "3002:80"
    depends_on:
      - backend
    networks:
      - insight-net

networks:
  insight-net:
    driver: bridge
```

Note: Frontend Docker build bakes `VITE_*` vars at build time via ARG/ENV in Dockerfile — since the current frontend Dockerfile doesn't do this, we leave it as-is. The `VITE_API_URL` in `.env` serves the dev server only.

---

## Task 9: Update `.gitignore` and clean up old `.env.example` files

**Files:**
- Modify: `d:/AITC/API-Testing/.gitignore`
- Update: `sources/insight/backend/.env.example`
- Update: `sources/insight/frontend/.env.example`

**Step 1: Ensure `.gitignore` covers the new centralized `.env`**

Add to `.gitignore` if not already present:
```
sources/insight/.env
```

**Step 2: Update `backend/.env.example`** — redirect users to root file:
```
# This project uses a centralized .env at sources/insight/.env
# See sources/insight/.env.example for all available variables.
#
# For local development without Docker, you can optionally create
# a backend/.env to override specific values:
#
# MONGODB_URL=mongodb://localhost:27017
# DATABASE_NAME=insight
```

**Step 3: Update `frontend/.env.example`** — redirect users to root file:
```
# This project uses a centralized .env at sources/insight/.env
# See sources/insight/.env.example for all available variables.
#
# For local development without Docker, you can optionally create
# a frontend/.env to override specific values:
#
# VITE_API_URL=http://localhost:8001
```

---

## Task 10: Create actual `sources/insight/.env` (local dev defaults)

**Files:**
- Create: `sources/insight/.env` (gitignored — do NOT commit)

**Step 1: Create `.env` with local dev values**

```env
# Local development environment — DO NOT COMMIT
MONGODB_URL=mongodb://localhost:27017
DATABASE_NAME=insight
INTERNAL_APP_AUTH=secret-internal-key-change-me
SUPER_ADMIN_EMAILS=admin@example.com
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
VITE_API_URL=http://localhost:8001
```

---

## Summary of Changes

| File | Action | Change |
|------|--------|--------|
| `backend/app/core/constants.py` | CREATE | All Aruba/HPE fixed constants |
| `backend/app/services/aruba.py` | MODIFY | Import constants, remove local defs |
| `backend/app/core/replay_service.py` | MODIFY | Import constants, replace hardcoded URLs |
| `backend/app/config.py` | MODIFY | `find_dotenv()`, `DATABASE_NAME` from env |
| `backend/app/main.py` | MODIFY | CORS origins from env |
| `frontend/vite.config.js` | MODIFY | `envDir: '../'`, env-based proxy target |
| `docker-compose.yml` | MODIFY | `env_file: - .env` (remove inline env) |
| `insight/.env.example` | CREATE | Centralized template with all vars |
| `insight/.env` | CREATE | Local dev defaults (gitignored) |
| `backend/.env.example` | UPDATE | Redirect note to root file |
| `frontend/.env.example` | UPDATE | Redirect note to root file |
| `.gitignore` | MODIFY | Add `sources/insight/.env` |

## New Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `MONGODB_URL` | `mongodb://localhost:27017` | MongoDB connection string |
| `DATABASE_NAME` | `insight` | MongoDB database name (was hardcoded) |
| `INTERNAL_APP_AUTH` | `secret-internal-key-change-me` | Fernet key source |
| `SUPER_ADMIN_EMAILS` | `admin@example.com` | Auto-created admin accounts |
| `CORS_ORIGINS` | `http://localhost:5173,...` | Allowed CORS origins (was hardcoded) |
| `VITE_API_URL` | `http://localhost:8001` | Frontend API URL (already existed) |
