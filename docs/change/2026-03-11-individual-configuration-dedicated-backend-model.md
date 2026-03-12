# Code Change

## Metadata

- Date: 2026-03-11
- Topic: Individual configuration dedicated backend model
- Related task record: `docs/Khang_plans/2026-03-11-individual-configuration-dedicated-backend-model.md`
- Related test record: `docs/testing/2026-03-11-individual-configuration-dedicated-backend-model-test.md`

## What Changed

- File: `backend/app/features/config/service.py`
  - Change: Added dedicated backend normalization for wired and wireless individual configuration networks.
- File: `backend/app/features/config/routes.py`
  - Change: Added `GET /api/v1/config/sites/{site_id}/individual/networks`.
- File: `frontend/src/pages/Configuration/IndividualConfiguration.jsx`
  - Change: Switched the page from raw Aruba-shaped frontend mapping to the dedicated normalized backend endpoint.

## Logic Behind It

This change is an intentional architecture shift for `Individual Configuration`.

Before:
- backend proxied Aruba raw responses
- frontend understood Aruba nesting and field quirks directly

After:
- backend owns the individual-configuration read contract
- backend fetches Aruba `networksSummary` and `wiredNetworks`
- backend normalizes them into one combined network list
- frontend consumes a stable, config-specific schema

This is the right direction for configuration editing because forms need predictable fields, stable defaults, and a place to centralize Aruba-specific mapping logic.

## Improvement

- Reliability:
  - Removes raw Aruba response dependence from the individual configuration page.
- Performance:
  - One normalized endpoint now provides the combined network selector model for the page.
- Maintainability:
  - Mapping logic now lives in the backend config feature, where future update logic can reuse it.

## Warning / Potential Fallback

- Risk:
  - The normalized model currently focuses on overview data, not the full future configuration surface.
- Limitation:
  - Dashboard pages still use the raw overview proxy, so the codebase intentionally supports both patterns for now.
- Fallback:
  - If a future individual-configuration field is missing, extend the config service normalization rather than pushing Aruba raw fields back into the frontend.

## How To Use

- Endpoint or feature:
  - `GET /api/v1/config/sites/{site_id}/individual/networks`
- Inputs:
  - `site_id`
- Expected output:
  - Normalized combined list of wired and wireless networks for the individual configuration selector
- Operational notes:
  - This endpoint is for individual configuration only.
  - Existing raw proxy routes remain in place for dashboard-style consumers.
