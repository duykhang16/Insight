# Test Note: Individual Configuration Network Assignment Radio

## Backend Checks

- route exists:
  - `PUT /api/v1/config/sites/{site_id}/individual/networks/{network_id}/network-assignment`
- backend changes only radio-related fields in the Aruba payload merge

## Frontend Checks

- `Network Assignment` renders for wireless networks
- radio toggles reflect current network values
- `Extended 2.4 GHz range` toggle reflects current value
- Access Point area is placeholder only
- `Update` calls the backend route
- page blocks saving if all radio frequencies are disabled
