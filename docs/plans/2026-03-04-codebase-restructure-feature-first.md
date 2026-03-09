# Codebase Restructure: Feature-First Flat + /api/v1/ Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restructure the Insight backend from a split `app/core/` + `app/features/` hybrid into a single unified `app/features/` pattern, with all routes under `/api/v1/` prefix for future proxy-layer readiness.

**Architecture:** Each feature (`auth`, `cloner`, `replay`, `admin`, `inventory`, `overview`, `config`, `capture`) lives as a self-contained folder under `app/features/` with its own `routes.py`, `service.py`, and `schemas.py`. Shared utilities (auth deps, aruba client, fernet, constants) move to `app/shared/`. Frontend `apiClient.js` baseURL updates to `/api/v1` and all hardcoded API paths are updated accordingly.

**Tech Stack:** Python 3.11, FastAPI, Motor (MongoDB async), React + Axios (frontend), Docker

---

## Current → Target Mapping

| Current location | Target location |
|---|---|
| `app/core/cloner/routes.py` | `app/features/cloner/routes.py` |
| `app/core/cloner_service.py` | `app/features/cloner/service.py` |
| `app/core/replay/routes.py` | `app/features/replay/routes.py` |
| `app/core/replay_service.py` | `app/features/replay/service.py` |
| `app/core/admin/routes.py` | `app/features/admin/routes.py` |
| `app/core/capture/routes.py` | `app/features/capture/routes.py` |
| `app/core/inventory/routes.py` | `app/features/inventory/routes.py` |
| `app/core/inventory/service.py` | `app/features/inventory/service.py` |
| `app/core/auth_deps.py` | `app/shared/auth_deps.py` |
| `app/core/fernet.py` | `app/shared/fernet.py` |
| `app/core/constants.py` | `app/shared/constants.py` |
| `app/core/allowed_emails.py` | `app/shared/allowed_emails.py` |
| `app/core/logging_middleware.py` | `app/shared/logging_middleware.py` |
| `app/services/aruba.py` | `app/shared/aruba.py` |
| `app/schemas/device.py` | `app/features/inventory/schemas.py` |
| `app/features/auth/routes.py` | unchanged (already correct) |
| `app/features/overview/routes.py` | unchanged |
| `app/features/config/routes.py` | unchanged |

## URL Changes

| Old URL | New URL |
|---|---|
| `/api/auth/*` | `/api/v1/auth/*` |
| `/api/cloner/*` | `/api/v1/cloner/*` |
| `/api/replay/*` | `/api/v1/replay/*` |
| `/api/admin/*` | `/api/v1/admin/*` |
| `/api/overview/*` | `/api/v1/overview/*` |
| `/api/config/*` | `/api/v1/config/*` |
| `/api/inventory/*` | `/api/v1/inventory/*` |
| `/api/capture*` | `/api/v1/capture*` |

---

## Task 1: Create `app/shared/` and move shared utilities

**Files:**
- Create: `sources/insight/backend/app/shared/__init__.py`
- Move+update: `app/core/auth_deps.py` → `app/shared/auth_deps.py`
- Move+update: `app/core/fernet.py` → `app/shared/fernet.py`
- Move+update: `app/core/constants.py` → `app/shared/constants.py`
- Move+update: `app/core/allowed_emails.py` → `app/shared/allowed_emails.py`
- Move+update: `app/core/logging_middleware.py` → `app/shared/logging_middleware.py`
- Move+update: `app/services/aruba.py` → `app/shared/aruba.py`

**Step 1: Create `app/shared/__init__.py`**
```bash
touch sources/insight/backend/app/shared/__init__.py
```

**Step 2: Copy files to shared/**
```bash
cp sources/insight/backend/app/core/auth_deps.py sources/insight/backend/app/shared/auth_deps.py
cp sources/insight/backend/app/core/fernet.py sources/insight/backend/app/shared/fernet.py
cp sources/insight/backend/app/core/constants.py sources/insight/backend/app/shared/constants.py
cp sources/insight/backend/app/core/allowed_emails.py sources/insight/backend/app/shared/allowed_emails.py
cp sources/insight/backend/app/core/logging_middleware.py sources/insight/backend/app/shared/logging_middleware.py
cp sources/insight/backend/app/services/aruba.py sources/insight/backend/app/shared/aruba.py
```

**Step 3: Update imports inside each shared file**

In each copied file, change any `from app.core.X import` or `from app.services.X import` references to `from app.shared.X import`.

**Step 4: Commit**
```bash
git add sources/insight/backend/app/shared/
git commit -m "refactor: create app/shared/ and migrate shared utilities"
```

---

## Task 2: Migrate `cloner` feature

**Files:**
- Modify: `sources/insight/backend/app/features/cloner/routes.py` (already exists — currently in `app/core/cloner/routes.py`)
- Create: `sources/insight/backend/app/features/cloner/service.py`
- Create: `sources/insight/backend/app/features/cloner/__init__.py`

**Step 1: Create the cloner feature folder**
```bash
mkdir -p sources/insight/backend/app/features/cloner
touch sources/insight/backend/app/features/cloner/__init__.py
```

**Step 2: Copy `cloner_service.py` → `features/cloner/service.py`**
```bash
cp sources/insight/backend/app/core/cloner_service.py sources/insight/backend/app/features/cloner/service.py
```

**Step 3: Copy `core/cloner/routes.py` → `features/cloner/routes.py`**
```bash
cp sources/insight/backend/app/core/cloner/routes.py sources/insight/backend/app/features/cloner/routes.py
```

**Step 4: Update imports in `features/cloner/routes.py`**

Change:
```python
from app.core.cloner_service import (...)
from app.core.replay_service import replay_login
```
To:
```python
from app.features.cloner.service import (...)
from app.features.replay.service import replay_login
```

And change router prefix:
```python
router = APIRouter(prefix="/api/v1/cloner", tags=["Site Cloner"])
```

**Step 5: Update imports in `features/cloner/service.py`**

Change all `from app.core.X` → `from app.shared.X` and `from app.services.aruba` → `from app.shared.aruba`.

**Step 6: Commit**
```bash
git add sources/insight/backend/app/features/cloner/
git commit -m "refactor: migrate cloner to app/features/cloner with /api/v1/ prefix"
```

---

## Task 3: Migrate `replay` feature

**Files:**
- Create: `sources/insight/backend/app/features/replay/__init__.py`
- Create: `sources/insight/backend/app/features/replay/routes.py`
- Create: `sources/insight/backend/app/features/replay/service.py`

**Step 1: Create folder**
```bash
mkdir -p sources/insight/backend/app/features/replay
touch sources/insight/backend/app/features/replay/__init__.py
```

**Step 2: Copy replay_service.py → features/replay/service.py**
```bash
cp sources/insight/backend/app/core/replay_service.py sources/insight/backend/app/features/replay/service.py
```

**Step 3: Copy core/replay/routes.py → features/replay/routes.py**
```bash
cp sources/insight/backend/app/core/replay/routes.py sources/insight/backend/app/features/replay/routes.py
```

**Step 4: Update routes.py imports and prefix**

Change:
```python
from app.core.replay_service import replay_login, proxy_api_call
```
To:
```python
from app.features.replay.service import replay_login, proxy_api_call
```

Change route paths from hardcoded `/api/replay/...` → use `APIRouter(prefix="/api/v1/replay")`:
```python
router = APIRouter(prefix="/api/v1/replay", tags=["Replay"])

@router.post("/login")
async def login(payload: ReplayLoginPayload):
    ...

@router.api_route("/{path:path}", methods=["GET","POST","PUT","DELETE","PATCH","HEAD","OPTIONS"])
async def proxy(path: str, request: Request):
    ...
```

**Step 5: Update service.py imports**

Change `from app.services.aruba import` → `from app.shared.aruba import`.

**Step 6: Commit**
```bash
git add sources/insight/backend/app/features/replay/
git commit -m "refactor: migrate replay to app/features/replay with /api/v1/ prefix"
```

---

## Task 4: Migrate `admin` feature

**Files:**
- Create: `sources/insight/backend/app/features/admin/__init__.py`
- Create: `sources/insight/backend/app/features/admin/routes.py`

**Step 1: Create folder**
```bash
mkdir -p sources/insight/backend/app/features/admin
touch sources/insight/backend/app/features/admin/__init__.py
```

**Step 2: Copy core/admin/routes.py → features/admin/routes.py**
```bash
cp sources/insight/backend/app/core/admin/routes.py sources/insight/backend/app/features/admin/routes.py
```

**Step 3: Update imports in routes.py**

Change:
```python
from app.core.auth_deps import require_internal_admin as require_admin
```
To:
```python
from app.shared.auth_deps import require_internal_admin as require_admin
```

Router remains prefix-less (prefix applied in main.py):
```python
router = APIRouter()
```

**Step 4: Commit**
```bash
git add sources/insight/backend/app/features/admin/
git commit -m "refactor: migrate admin to app/features/admin"
```

---

## Task 5: Migrate `inventory` feature

**Files:**
- Create: `sources/insight/backend/app/features/inventory/__init__.py`
- Create: `sources/insight/backend/app/features/inventory/routes.py`
- Create: `sources/insight/backend/app/features/inventory/service.py`
- Create: `sources/insight/backend/app/features/inventory/schemas.py`

**Step 1: Create folder**
```bash
mkdir -p sources/insight/backend/app/features/inventory
touch sources/insight/backend/app/features/inventory/__init__.py
```

**Step 2: Copy files**
```bash
cp sources/insight/backend/app/core/inventory/routes.py sources/insight/backend/app/features/inventory/routes.py
cp sources/insight/backend/app/core/inventory/service.py sources/insight/backend/app/features/inventory/service.py
cp sources/insight/backend/app/schemas/device.py sources/insight/backend/app/features/inventory/schemas.py
```

**Step 3: Update routes.py**

Change prefix and imports:
```python
from app.features.inventory.schemas import DeviceResponse
from app.features.inventory.service import inventory_service

router = APIRouter(prefix="/api/v1/inventory", tags=["Inventory"])
```

**Step 4: Update service.py imports**

Change `from app.services.aruba import` → `from app.shared.aruba import`.

**Step 5: Commit**
```bash
git add sources/insight/backend/app/features/inventory/
git commit -m "refactor: migrate inventory to app/features/inventory with /api/v1/ prefix"
```

---

## Task 6: Migrate `capture` feature

**Files:**
- Create: `sources/insight/backend/app/features/capture/__init__.py`
- Create: `sources/insight/backend/app/features/capture/routes.py`

**Step 1: Create folder**
```bash
mkdir -p sources/insight/backend/app/features/capture
touch sources/insight/backend/app/features/capture/__init__.py
```

**Step 2: Copy core/capture/routes.py → features/capture/routes.py**
```bash
cp sources/insight/backend/app/core/capture/routes.py sources/insight/backend/app/features/capture/routes.py
```

**Step 3: Update routes.py**

The capture routes use hardcoded `/api/capture` paths. Wrap with a router:
```python
router = APIRouter(prefix="/api/v1", include_in_schema=False)

# Change @router.post("/api/capture") → @router.post("/capture")
# Change @router.post("/api/capture/batch") → @router.post("/capture/batch")
# etc.
```

Also update any imports from `app.core.websocket` (check if this module exists or needs to be moved too).

**Step 4: Commit**
```bash
git add sources/insight/backend/app/features/capture/
git commit -m "refactor: migrate capture to app/features/capture with /api/v1/ prefix"
```

---

## Task 7: Update existing `auth`, `overview`, `config` features to `/api/v1/`

These features already live in `app/features/` — only the prefix needs updating.

**Files:**
- Modify: `sources/insight/backend/app/features/auth/routes.py`
- Modify: `sources/insight/backend/app/features/overview/routes.py`
- Modify: `sources/insight/backend/app/features/config/routes.py`

**Step 1: Update auth/routes.py**

Change:
```python
router = APIRouter(prefix="/api/auth", tags=["Stateless Auth"])
```
To:
```python
router = APIRouter(prefix="/api/v1/auth", tags=["Stateless Auth"])
```

Also update imports from `app.core.fernet` → `app.shared.fernet` and `app.core.replay_service` → `app.features.replay.service`.

**Step 2: Update overview/routes.py**

Change:
```python
router = APIRouter(prefix="/api/overview", tags=["Overview"])
```
To:
```python
router = APIRouter(prefix="/api/v1/overview", tags=["Overview"])
```

**Step 3: Update config/routes.py**

Change:
```python
router = APIRouter(prefix="/api/config", tags=["Config"])
```
To:
```python
router = APIRouter(prefix="/api/v1/config", tags=["Config"])
```

**Step 4: Update imports in auth/routes.py**
```python
# Before
from app.core.fernet import encrypt_credentials, decrypt_credentials
from app.core.replay_service import replay_login
# After
from app.shared.fernet import encrypt_credentials, decrypt_credentials
from app.features.replay.service import replay_login
```

**Step 5: Commit**
```bash
git add sources/insight/backend/app/features/auth/routes.py \
        sources/insight/backend/app/features/overview/routes.py \
        sources/insight/backend/app/features/config/routes.py
git commit -m "refactor: update existing features to /api/v1/ prefix and shared imports"
```

---

## Task 8: Rewrite `main.py`

**Files:**
- Modify: `sources/insight/backend/app/main.py`

**Step 1: Rewrite main.py with unified router registration**

```python
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database.connection import connect_to_mongo, close_mongo_connection, get_database
from app.config import INTERNAL_APP_AUTH, SUPER_ADMIN_EMAILS
from app.shared.logging_middleware import GlobalLoggingMiddleware
from datetime import datetime, timezone

# All feature routers
from app.features.auth.routes import router as auth_router
from app.features.cloner.routes import router as cloner_router
from app.features.replay.routes import router as replay_router
from app.features.admin.routes import router as admin_router
from app.features.inventory.routes import router as inventory_router
from app.features.overview.routes import router as overview_router
from app.features.config.routes import router as config_router
from app.features.capture.routes import router as capture_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect_to_mongo()
    db = get_database()
    for email in SUPER_ADMIN_EMAILS:
        existing = await db.users.find_one({"email": email})
        if not existing:
            await db.users.insert_one({
                "email": email,
                "role": "admin",
                "isApproved": True,
                "created_at": datetime.now(timezone.utc)
            })
        else:
            await db.users.update_one({"email": email}, {"$set": {"role": "admin", "isApproved": True}})
    yield
    await close_mongo_connection()

app = FastAPI(
    title="Instant Insight Backend",
    version="2.0",
    lifespan=lifespan,
    docs_url=None,
    redoc_url=None,
    openapi_url=None
)

_cors_raw = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
_cors_origins = [o.strip() for o in _cors_raw.split(",") if o.strip()]
app.add_middleware(CORSMiddleware, allow_origins=_cors_origins, allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"], expose_headers=["*"])
app.add_middleware(GlobalLoggingMiddleware)

# Feature-first routers — all under /api/v1/
app.include_router(auth_router)        # /api/v1/auth
app.include_router(cloner_router)      # /api/v1/cloner
app.include_router(replay_router)      # /api/v1/replay
app.include_router(admin_router, prefix="/api/v1/admin", tags=["Admin"])
app.include_router(inventory_router)   # /api/v1/inventory
app.include_router(overview_router)    # /api/v1/overview
app.include_router(config_router)      # /api/v1/config
app.include_router(capture_router)     # /api/v1/capture (hidden)

@app.get("/health", tags=["System"])
async def health():
    return {"status": "healthy", "version": "2.0.0"}
```

**Step 2: Commit**
```bash
git add sources/insight/backend/app/main.py
git commit -m "refactor: rewrite main.py with unified feature-first router registration"
```

---

## Task 9: Delete legacy folders

Only after Task 8 passes (backend starts without errors), delete legacy code.

**Step 1: Remove legacy directories**
```bash
rm -rf sources/insight/backend/app/core/cloner/
rm -rf sources/insight/backend/app/core/replay/
rm -rf sources/insight/backend/app/core/admin/
rm -rf sources/insight/backend/app/core/capture/
rm -rf sources/insight/backend/app/core/inventory/
rm -rf sources/insight/backend/app/core/swagger/
# Remove legacy service files (now in features/*/service.py or shared/)
rm sources/insight/backend/app/core/cloner_service.py
rm sources/insight/backend/app/core/replay_service.py
rm sources/insight/backend/app/core/auth_deps.py
rm sources/insight/backend/app/core/fernet.py
rm sources/insight/backend/app/core/constants.py
rm sources/insight/backend/app/core/allowed_emails.py
rm sources/insight/backend/app/core/logging_middleware.py
# Remove old services/ and schemas/ folders
rm -rf sources/insight/backend/app/services/
rm -rf sources/insight/backend/app/schemas/
# Remove legacy ui/ (ui routes)
rm -rf sources/insight/backend/app/ui/
```

**Step 2: Verify**
```bash
cd sources/insight/backend
python -c "from app.main import app; print('OK')"
```
Expected: `OK`

**Step 3: Commit**
```bash
git add -A
git commit -m "refactor: delete legacy app/core/, app/services/, app/schemas/, app/ui/ folders"
```

---

## Task 10: Update Frontend — apiClient baseURL

**Files:**
- Modify: `sources/insight/frontend/src/api/apiClient.js`

**Step 1: Update baseURL**

Change:
```javascript
const apiClient = axios.create({
    baseURL: '/api'
});
```
To:
```javascript
const apiClient = axios.create({
    baseURL: '/api/v1'
});
```

**Step 2: Update hardcoded URLs in apiClient.js**

The refresh call and logout call use hardcoded paths:
```javascript
// Before
const res = await axios.post('/api/auth/refresh', { refresh_token: refreshToken });
fetch('/api/auth/logout', { method: 'POST' })
// After
const res = await axios.post('/api/v1/auth/refresh', { refresh_token: refreshToken });
fetch('/api/v1/auth/logout', { method: 'POST' })
```

**Step 3: Commit**
```bash
git add sources/insight/frontend/src/api/apiClient.js
git commit -m "feat: update apiClient baseURL to /api/v1 for proxy-ready architecture"
```

---

## Task 11: Update Frontend — all page/component API calls

**Files to grep for `/api/` calls:**
```bash
grep -r "'/api/" sources/insight/frontend/src/ --include="*.js" --include="*.jsx" -l
grep -r '"/api/' sources/insight/frontend/src/ --include="*.js" --include="*.jsx" -l
```

For each file found, update hardcoded `/api/X` paths → `/api/v1/X` **or** remove the prefix entirely if the file uses `apiClient` (since baseURL already handles it).

Key pattern to find and replace:
- `apiClient.get('/auth/` → no change needed (relative to baseURL)
- `apiClient.post('/cloner/` → no change needed
- `axios.post('/api/` → change to `/api/v1/`

**Step 1: Find all files with hardcoded `/api/` strings**
```bash
grep -rn "'/api/" sources/insight/frontend/src/ --include="*.jsx" --include="*.js"
```

**Step 2: For each hardcoded axios/fetch call, update prefix**

Files likely affected:
- `src/api/authApi.js` — check for `/api/auth/*` calls
- Any page making direct `fetch()` calls

**Step 3: Commit after all frontend paths updated**
```bash
git add sources/insight/frontend/src/
git commit -m "refactor: update frontend API paths for /api/v1/ prefix"
```

---

## Task 12: Smoke Test — Backend

**Step 1: Start backend**
```bash
cd sources/insight/backend
uvicorn app.main:app --reload --port 8000
```
Expected: No import errors, server starts.

**Step 2: Test health endpoint**
```bash
curl http://localhost:8000/health
```
Expected: `{"status":"healthy","version":"2.0.0"}`

**Step 3: Test a key endpoint**
```bash
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"test@example.com","password":"wrong"}'
```
Expected: `401` with detail (not 404 or 500)

**Step 4: Commit**
```bash
git commit -m "test: smoke test passed — backend starts cleanly on /api/v1/ routes"
```

---

## Task 13: Smoke Test — Frontend

**Step 1: Start frontend dev server**
```bash
cd sources/insight/frontend
npm run dev
```
Expected: No build errors.

**Step 2: Open browser → login page → attempt login**

Expected: Login request goes to `/api/v1/auth/login`, not `/api/auth/login`.

**Step 3: Verify in browser Network tab**
- All requests should now show `/api/v1/...` prefix.

**Step 4: Final commit**
```bash
git commit -m "chore: codebase restructure complete — feature-first flat + /api/v1/"
```

---

## Appendix: Final Directory Structure

```
backend/app/
├── features/
│   ├── auth/          routes.py, service.py (fernet + replay)
│   ├── cloner/        routes.py, service.py
│   ├── replay/        routes.py, service.py
│   ├── admin/         routes.py
│   ├── inventory/     routes.py, service.py, schemas.py
│   ├── overview/      routes.py, service.py
│   ├── config/        routes.py, service.py
│   └── capture/       routes.py
├── shared/
│   ├── aruba.py
│   ├── auth_deps.py
│   ├── fernet.py
│   ├── constants.py
│   ├── allowed_emails.py
│   └── logging_middleware.py
├── database/
│   ├── connection.py
│   ├── models.py
│   ├── crud.py
│   └── auth_crud.py
├── config.py
└── main.py
```
