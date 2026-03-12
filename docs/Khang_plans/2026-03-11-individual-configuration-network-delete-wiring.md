# Individual Configuration Network Delete Wiring

## Request

Wire the `Delete Network` action in `Individual Configuration` to the Aruba APIs:

- wireless:
  - `DELETE /api/sites/{site_id}/networksSummary/{ssid_id}`
- wired:
  - `DELETE /api/sites/{site_id}/wiredNetworks/{vlan_id}`

## Plan

1. Add one backend delete route under the dedicated `config` feature.
2. Resolve the selected individual network by the normalized frontend id.
3. Branch in the backend by network type:
   - wireless -> Aruba `networksSummary/{ssid_id}`
   - wired -> Aruba `wiredNetworks/{vlan_id}`
4. Wire both frontend delete buttons to the internal backend route.
5. Remove the deleted network from local state and select the next available item.

## Implemented Change

- added backend delete route for individual networks
- added backend delete service mapping by network type
- wired both overview delete buttons to the backend
- added confirm dialog before delete
- added empty state when no networks remain

## Mapping Note

For wired deletion:

- the frontend continues using the normalized wired network `id` for selection
- the backend translates that record to its Aruba `vlanId`
- Aruba delete call is made with `wiredNetworks/{vlan_id}`
