# Individual Wireless Overview Update Wiring

## Request

Wire the first backend update flow for `Individual Configuration` using Aruba Instant On:

- `PUT /api/sites/{site_id}/networksSummary/{ssid_id}`
- use the sample payload shape from `net_03_payload (1).json`
- only overview fields should change
- all other payload fields should remain unchanged

## Plan

1. Add a dedicated backend update route under the `config` feature for individual wireless overview.
2. Read the current Aruba `networksSummary` payload for the selected SSID.
3. Merge only the editable overview fields into that payload.
4. Reuse the Aruba `PUT /api/sites/{site_id}/networksSummary/{ssid_id}` contract.
5. Wire the frontend `Update` button for wireless overview to the new backend route.

## Architectural Note

This change keeps the dedicated backend service model limited to `Individual Configuration`.

Reason:

- the frontend should not depend on raw Aruba payload shape for edit operations
- the backend should own payload preservation and field-level update rules
- this reduces coupling and makes later section-by-section wiring safer

## Implemented Scope

- Added backend route for individual wireless overview update
- Added backend service logic to:
  - fetch current Aruba `networksSummary`
  - find the target wireless network
  - preserve untouched fields
  - overwrite only overview fields
  - call Aruba PUT
- Wired frontend wireless `Update` to the backend route

## Follow-up Fix

After the first wiring pass, `get_site_config()` raised:

- `Lỗi parse networksSummary: name 'raw' is not defined`

Cause:

- the shared `networksSummary` helper was left in an invalid intermediate state

Fix:

- restored `_get_networks_summary_response()` to perform the Aruba GET and JSON parse
- updated `get_site_config()` to use the helper consistently

## Deferred

- wired overview update
- non-overview wireless sections
- delete actions
