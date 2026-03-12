# Code Change: Individual Configuration Network Assignment Radio

## Summary

The wireless `Network Assignment` section is now wired for radio-field updates.

## Logic

- backend route:
  - `PUT /api/v1/config/sites/{site_id}/individual/networks/{network_id}/network-assignment`
- backend updates only:
  - `isAvailableOn24GHzRadioBand`
  - `isAvailableOn5GHzRadioBand`
  - `isAvailableOn6GHzRadioBand`
  - `isLegacy80211bRatesEnabled`
- frontend `Network Assignment` section now uses those fields and saves through the new route

## Improvement

- adds the next real individual configuration section after Overview and IP Assignment
- keeps access-point work isolated until the API behavior is clearer

## Warning / Fallback

- access point panel is placeholder only
- at least one radio frequency must remain enabled in the frontend
