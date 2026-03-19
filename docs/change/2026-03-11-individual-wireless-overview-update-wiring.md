# Code Change: Individual Wireless Overview Update Wiring

## Summary

`Individual Configuration` wireless overview now saves through a dedicated backend-owned update flow.

## Logic

The backend now:

1. loads the current Aruba `networksSummary` object for the selected SSID
2. removes restricted identity/system keys from the outgoing payload
3. replaces only:
   - `networkName`
   - `isEnabled`
   - `isSsidHidden`
   - `authentication`
   - `security`
   - `preSharedKey`
4. sends the merged payload to Aruba `PUT /api/sites/{site_id}/networksSummary/{ssid_id}`

## Improvement

- preserves non-overview Aruba fields instead of rebuilding payload in the frontend
- makes update behavior consistent with the dedicated backend service model for `Individual Configuration`
- keeps overview wiring small and low-risk for the first save path

## Warning / Fallback

- this change only supports wireless overview updates
- wired overview update is still not wired
- enterprise security modes remain disabled in the frontend
- if Aruba returns `204 No Content`, the backend falls back to the merged request payload for UI refresh

## Follow-up Fix

A regression in `config/service.py` left the shared `networksSummary` read path referencing `raw` before assignment.

The fix restored:

- helper-based Aruba GET for `networksSummary`
- valid JSON parse path
- shared read support for both:
  - `get_site_config()`
  - `update_individual_wireless_overview()`

## How To Use

1. Open site `Individual Configuration`
2. Select a wireless network
3. Change overview fields
4. Click `Update`

The page will call the backend route:

- `PUT /api/v1/config/sites/{site_id}/individual/networks/{network_id}/overview`

That backend route then calls Aruba:

- `PUT /api/sites/{site_id}/networksSummary/{network_id}`
