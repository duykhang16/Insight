# Test Note: Individual Configuration Network Delete Wiring

## Backend Checks

- delete route exists:
  - `DELETE /api/v1/config/sites/{site_id}/individual/networks/{network_id}`
- wireless delete maps to Aruba `networksSummary/{ssid_id}`
- wired delete maps to Aruba `wiredNetworks/{vlan_id}`

## Frontend Checks

- both overview screens expose an active delete button
- confirm dialog appears before delete
- after success:
  - deleted network is removed from local list
  - next available network is selected
  - empty state appears if none remain

## Deferred Runtime Validation

- live Aruba delete test for one wireless network
- live Aruba delete test for one wired VLAN
