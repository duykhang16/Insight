# UPDATE LOG — Backup & Rollback Feature Fixes + Enhancements

**Date:** 2026-03-02
**Scope:** `sources/insight/` (backend + frontend) — no changes outside this directory.

---

## 1. Root Causes of Bugs Fixed

### Bug A — Admin Log Tab Resets to `guest` Role After Page Refresh
**Root cause (backend):** `GET /api/cloner/auth-session` returned only `{ token_value, status }` and did **not** include the user's `role`. When `App.jsx` called this endpoint on startup (to verify the session), the response carried no role, so the code fell back to writing `'guest'` into `sessionStorage`.

**Root cause (frontend):** `App.jsx`'s `verifySession` logic did `sessionStorage.setItem('userRole', res.data.role || 'guest')` unconditionally. Because `res.data.role` was always `undefined`, the stored role was overwritten to `'guest'`, hiding the Admin Log tab from any non-guest user.

### Bug B — `viewer` / `user` Roles Blocked from Backup History and Diff
**Root cause:** All commit routes (`GET /api/commits`, `GET /api/commits/{id}/diff`) used `require_operator_stateless`, which only allows `admin` and `operator`. Users with `viewer` or `user` roles received `403 Forbidden` when trying to view backup history.

---

## 2. Fixes Applied

### Fix A — Role Returned by `auth-session` Endpoint
**File:** `sources/insight/backend/app/core/cloner/routes.py`

- `cloner_auth_session` now reads the `X-Insight-User` header, looks up the user in the `users` collection, and returns `role` in the response payload alongside `token_value` and `status`.
- Super-admin fallback: if the email is in `SUPER_ADMIN_EMAILS` and not in `users`, role is `admin`.

### Fix B — `verifySession` Role Preservation in `App.jsx`
**File:** `sources/insight/frontend/src/App.jsx`

- `verifySession` now uses a layered merge strategy:
  - If backend returns a non-`guest` role → always write it (authoritative).
  - If backend returns no role or `guest` → keep the role already in `sessionStorage`.
  - Only fall back to `'guest'` if there is nothing stored.
- This prevents the Admin Log tab from disappearing after page reload.

### Fix C — Viewer/User Role Permissions for Backup Read Routes
**Files:**
- `sources/insight/backend/app/core/auth_deps.py` — added `require_viewer_stateless = StatelessRoleChecker(["admin", "operator", "viewer", "user"])`.
- `sources/insight/backend/app/core/commit/routes.py` — `list_commits` and `get_commit_diff` now use `require_viewer_stateless` instead of `require_operator_stateless`.

---

## 3. New Features Added

### Feature 1 — Visual Diff: Field-Mapping Labels

**File:** `sources/insight/frontend/src/components/DiffModal/index.jsx`

- Added `FIELD_LABELS` dictionary mapping common JSON paths (e.g., `bandSettings.band24.isEnabled`) to human-readable Vietnamese labels (e.g., `Băng tần 2.4 GHz - bật`).
- Added `getFriendlyLabel(rawPath)` function that strips array indices and tries exact, stripped, and suffix matches.
- Diff rows now show the friendly label (bold, colored) alongside the raw JSON path (small, muted).

### Feature 2 — Visual Diff: "Deleted on Live" Detection and Recreate

**Files:**
- `sources/insight/backend/app/core/commit/routes.py` — `get_commit_diff` now returns `deleted_on_live`: a list of SSIDs/networks that exist in the snapshot but are missing from the live configuration. Each entry includes `network_id`, `network_name`, `network_type`, `vlan_id`, and the full `snapshot_data`.
- Helper `_detect_deleted_on_live(snapshot, live)` compares network maps by ID.

**New Backend Endpoint:**
- `POST /api/commits/{commit_id}/recreate/{entity_id}` — recreates a specific network/SSID on the live site using snapshot data. Strips read-only fields (`id`, `createdAt`, etc.) before POST. Requires `operator` or `admin` role. Writes an audit log entry with action code `COMMIT_RECREATE`.

**File:** `sources/insight/frontend/src/components/DiffModal/index.jsx`
- Added a new **"Xóa trên Live"** tab that appears only when `deleted_on_live` has entries. The tab badge shows the count.
- `DeletedEntityCard` component renders each deleted SSID with name, ID, type, VLAN, and a **"Tái tạo"** (Recreate) button.
- Recreate button calls `POST /api/commits/{commitId}/recreate/{entityId}` and updates to a success/error state inline.
- `viewer` and `user` roles see the tab as read-only (no Recreate button).
- `userRole` prop threaded from `CommitPanel` → `DiffModal`.

### Feature 3 — New Endpoint: Fetch Single Entity from Backup Snapshot

**File:** `sources/insight/backend/app/core/commit/routes.py`

- `GET /api/commits/{commit_id}/entities/{entity_id}` — returns the full snapshot data for a single SSID/network within a backup. Requires `viewer_stateless` or higher. Used by "Import from Backup" in SmartSync.

### Feature 4 — SmartSync: "Import from Backup" in Create SSID Flow

**File:** `sources/insight/frontend/src/pages/Configuration/SmartSync.jsx`

- Added imports: `History`, `XIcon`, `Download` from `lucide-react`.
- Added state variables: `scannerTargetSiteId`, `scannedNetworks`, `isScanningSite` (pre-existing references now properly declared), plus `showImportModal`, `importSites`, `importSitesLoading`, `importSelectedSiteId`, `importCommits`, `importCommitsLoading`, `importSelectedCommitId`, `importEntities`, `importEntitiesLoading`.
- Added handler functions: `openImportModal`, `handleImportSiteChange`, `handleImportCommitChange`, `handleImportEntity`.
- In the `create_ssid` Step 2 panel, a small **"Import từ Backup"** button appears next to the "Network Name" label.
- Clicking it opens a 3-step modal: **Select Site → Select Backup → Select SSID**. Selecting an SSID pre-fills the form fields (`networkName`, `networkType`, `security`, `vlanId`, `isHidden`, `isWifi6Enabled`, `bandSettings`, `clientIsolation`). Password is intentionally NOT pre-filled for security.
- Modal fetches `GET /api/commits/sites` → `GET /api/commits?site_id=...` → `GET /api/commits/{id}/diff` (snapshot networks) → `GET /api/commits/{id}/entities/{entity_id}`.

### Feature 5 — FullClone: "Backup" Source Mode

**File:** `sources/insight/frontend/src/pages/Configuration/FullClone.jsx`

- Added imports: `History` from `lucide-react`.
- Added state: `backupSites`, `backupSelectedSiteId`, `backupCommits`, `backupCommitsLoading`, `backupSelectedCommitId`.
- Added handler functions: `handleBackupSiteChange`, `handleFetchFromBackup`.
- Added a **3-way source mode tab bar** (Live / Captured / **Backup**) replacing the previously implicit live/captured toggle.
- When **Backup** mode is selected:
  - Site dropdown loads from `GET /api/commits/sites`.
  - Backup dropdown loads from `GET /api/commits?site_id=...`.
  - "Dùng Backup làm nguồn" button fetches the commit's snapshot, builds a synthetic operations list from snapshot networks, and feeds it into the existing preview/execute pipeline.

---

## 4. Files Modified, Created, or Deleted

### Modified
| File | Change Summary |
|---|---|
| `sources/insight/backend/app/core/cloner/routes.py` | `cloner_auth_session`: return `role` in response |
| `sources/insight/backend/app/core/auth_deps.py` | Add `require_viewer_stateless` dependency |
| `sources/insight/backend/app/core/commit/routes.py` | Fix permissions, enhance diff, add `deleted_on_live`, add entity + recreate endpoints |
| `sources/insight/frontend/src/App.jsx` | Fix `verifySession` role preservation logic |
| `sources/insight/frontend/src/components/DiffModal/index.jsx` | Field-label mapping, Deleted-on-Live tab, Recreate button |
| `sources/insight/frontend/src/components/CommitPanel/index.jsx` | Pass `userRole` prop to `DiffModal` |
| `sources/insight/frontend/src/pages/Configuration/SmartSync.jsx` | Add Import from Backup modal + scanner state declarations |
| `sources/insight/frontend/src/pages/Configuration/FullClone.jsx` | Add Backup source mode tab + backup fetch logic |

### Created
| File | Description |
|---|---|
| `docs/insight/UPDATE_LOG_Backup_Fixes.md` | This document |

### Deleted (garbage cleanup)
All `__pycache__/` directories and `*.pyc` files were removed from `sources/insight/backend/`.

---

## 5. Backward Compatibility

- No database schema changes.
- Existing `config_commits` documents are unaffected.
- All existing API endpoints remain at the same URLs and return the same fields; new fields (`deleted_on_live`, `role`) are additive.
- Frontend changes are additive — existing behavior for `admin` and `operator` roles is unchanged.
