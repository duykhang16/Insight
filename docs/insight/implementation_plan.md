# AI / IDE Prompt: Role Separation, Token Refresh, Backup Overhaul & Audit Logging

This plan outlines the technical implementation for Role Separation, Secure Stateless Token Refresh, the Split Backup Mechanism, and robust Audit Logging.

## 1. Role Separation (Web App vs. Aruba API)

### [MODIFY] [routes.py](file:///d:/AITC/API-Testing/sources/insight/backend/app/core/cloner/routes.py)
- Ensure `cloner_login` and `cloner_auth_session` strictly return the Web App role from the internal `users` database.
- Do not override the internal role with the Aruba API role.

### [MODIFY] [Sidebar.jsx](file:///d:/AITC/API-Testing/sources/insight/frontend/src/components/Sidebar/index.jsx)
- Use `sessionStorage.getItem('userRole')` (Web App Role) to control UI visibility (e.g., showing the Audit Logs only to admins).

---

## 2. Secure Stateless Token Refresh (Security Correction Applied)

### [MODIFY] [cloner/routes.py](file:///d:/AITC/API-Testing/sources/insight/backend/app/core/cloner/routes.py)
- **Login Endpoint**: Modify `cloner_login` to return:
    - `access_token`: The short-lived Aruba token.
    - `refresh_token`: A secure, encrypted/signed blob containing `username` and `password`. Use a secure encryption method (e.g., `cryptography.fernet`) with `app.config.INTERNAL_APP_AUTH` as the key.
- **Refresh Endpoint**: Add `POST /api/cloner/refresh`.
    - Accepts `refresh_token`.
    - Decrypts it to retrieve original credentials.
    - Executes `replay_login` to get a new Aruba `access_token`.
    - Returns the new `access_token` and a *freshly rotated* `refresh_token`.

### [MODIFY] [apiClient.js](file:///d:/AITC/API-Testing/sources/insight/frontend/src/api/apiClient.js)
- **Refresh Token Storage**: Store `refresh_token` in `sessionStorage` (isolated per browser tab). **NO plain-text passwords stored.**
- **Axios Interceptor**: When a 401 error occurs:
    1.  Retrieve `refresh_token` from `sessionStorage`.
    2.  Call `/api/cloner/refresh` to get a new `access_token`.
    3.  Update `sessionStorage` and retry failed requests.

---

## 3. Configuration Source Cleanup

### [MODIFY] [FullClone.jsx](file:///d:/AITC/API-Testing/sources/insight/frontend/src/pages/Configuration/FullClone.jsx)
- Remove the "Captured" option from the configuration source dropdown.

---

## 4. Split Backup Mechanism (Site vs. SSID)

### [MODIFY] [commit/routes.py](file:///d:/AITC/API-Testing/sources/insight/backend/app/core/commit/routes.py)
- **Site Backup**: Captures holistic site config (`networksSummary`, `guestPortalSettings`, etc.) as `type: "SITE"`.
- **SSID Backup**: Captures detailed configurations for only user-selected SSIDs as `type: "SSID_LIST"`.

### [MODIFY] [CommitPanel/index.jsx](file:///d:/AITC/API-Testing/sources/insight/frontend/src/components/CommitPanel/index.jsx)
- Update the backup modal to offer "Full Site Backup" vs "Specific SSID Backup".

---

## 5. Rollback with Cloner Logic

### [MODIFY] [commit/routes.py](file:///d:/AITC/API-Testing/sources/insight/backend/app/core/commit/routes.py)
- Update `rollback_commit` to reuse `cloner_service`'s deep config/apply logic for perfect restoration.

---

## 6. Audit Log Data Implementation (New Requirement)

### [MODIFY] Backend Controllers (cloner/routes.py, commit/routes.py, etc.)
- Explicitly inject logging functions to record major system actions into the database's audit log collection.
- Actions to track: `LOGIN_SUCCESS`, `TOKEN_REFRESH`, `BACKUP_SITE_CREATED`, `BACKUP_SSID_CREATED`, and `ROLLBACK_EXECUTED`.
- Ensure each log entry captures the user performing the action, timestamp, and relevant metadata (e.g., Site ID, Commit ID).

### [MODIFY] Frontend Audit Log Component
- Verify that the Admin Log tab actually fetches and properly renders this newly recorded data from the backend.

---

## 7. Execution, Cleanup & Documentation Requirements

### [CLEANUP]
- Automatically delete all `__pycache__` directories and `.pyc` files generated in `sources/insight/backend/` after testing.

### [DOCUMENTATION]
- Upon completing all the code changes and verifying them, you MUST generate a markdown file summarizing all the updates, root causes fixed, and files modified.
- **Location:** Place the file inside `docs/insight/`.
- **Filename:** Format it with the current date and time in the Vietnam Timezone (GMT+7). Example: `update_log_YYYYMMDD_HHMM.md`.