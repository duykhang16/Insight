# Code Change: Individual Configuration Network Delete Wiring

## Summary

`Delete Network` is now wired for both wireless and wired networks in `Individual Configuration`.

## Logic

- backend route:
  - `DELETE /api/v1/config/sites/{site_id}/individual/networks/{network_id}`
- backend service:
  - finds the normalized selected network
  - if wireless:
    - calls Aruba `DELETE /api/sites/{site_id}/networksSummary/{ssid_id}`
  - if wired:
    - uses the network `vlanId`
    - calls Aruba `DELETE /api/sites/{site_id}/wiredNetworks/{vlan_id}`

## Improvement

- keeps Aruba endpoint mapping inside the backend service model
- gives the frontend one internal delete contract for both network types
- updates local UI state after delete without a full reload

## Warning / Fallback

- wired delete assumes the Aruba delete path uses `vlanId`
- if a site has no remaining networks after delete, the page now shows an empty state
- this change does not add restore behavior

## How To Use

1. Open `Individual Configuration`
2. Select a wireless or wired network
3. Click `Delete`
4. Confirm the action
