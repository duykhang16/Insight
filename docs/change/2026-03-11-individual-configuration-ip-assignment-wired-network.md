# Code Change: Individual Configuration IP Assignment Wired Network

## Summary

The first wireless `IP Assignment` flow is now wired through the dedicated backend service model.

## Logic

- backend route:
  - `PUT /api/v1/config/sites/{site_id}/individual/networks/{network_id}/ip-assignment`
- backend service:
  - fetches current Aruba `networksSummary`
  - finds the target wireless SSID
  - preserves all existing payload fields
  - overwrites only `wiredNetworkId`
  - sends Aruba `PUT /api/sites/{site_id}/networksSummary/{ssid_id}`

## Improvement

- keeps the frontend from shaping raw Aruba payloads
- uses the same backend-owned update pattern as the overview save flow
- introduces the first non-overview individual configuration section with real save behavior

## Warning / Fallback

- only the `Same as a Local Network` branch is active
- `Specific to This Network` is shown as disabled
- current wiring assumes the selected wired option id is the correct `wiredNetworkId`

## How To Use

1. Open a wireless network in `Individual Configuration`
2. Go to `IP Assignment`
3. Choose a wired network
4. Click `Update`
