# Test Note: Individual Wireless Overview Update Wiring

## Target

Wireless overview save path in `Individual Configuration`

## Backend Checks

- route exists for:
  - `PUT /api/v1/config/sites/{site_id}/individual/networks/{network_id}/overview`
- service merges overview updates into current Aruba `networksSummary` payload
- restricted fields are removed before Aruba PUT
- shared `networksSummary` helper no longer throws `name 'raw' is not defined`

## Frontend Checks

- `Update` for wireless overview calls the backend route
- success message appears on successful save
- dirty-state action buttons reset after successful save
- form snapshot refreshes to the returned network payload

## Deferred Runtime Validation

- live Aruba validation with a test SSID
- confirm exact Aruba response shape for `200` vs `204`
- verify unchanged non-overview fields survive round-trip exactly
