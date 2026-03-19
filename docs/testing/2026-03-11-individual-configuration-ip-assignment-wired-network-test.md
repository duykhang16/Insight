# Test Note: Individual Configuration IP Assignment Wired Network

## Backend Checks

- route exists:
  - `PUT /api/v1/config/sites/{site_id}/individual/networks/{network_id}/ip-assignment`
- backend changes only `wiredNetworkId` in the Aruba payload merge

## Frontend Checks

- wireless `IP Assignment` section renders
- wired network dropdown is populated from site wired networks
- selecting a wired network marks the page dirty
- `Update` calls the backend route
- success response refreshes local form/network state

## Deferred Runtime Validation

- confirm that the selected wired option id matches Aruba `wiredNetworkId` exactly
- live Aruba update test for one SSID
