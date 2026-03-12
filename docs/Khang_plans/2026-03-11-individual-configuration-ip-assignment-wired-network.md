# Individual Configuration IP Assignment Wired Network

## Request

Implement the first `IP Assignment` step for wireless `Individual Configuration`.

Scope:

- support `Same as a Local Network (default)`
- use the selected wired network from site data
- update Aruba by changing only `wiredNetworkId`

## Plan

1. Extend the dedicated individual-config backend model to include `wiredNetworkId` for wireless networks.
2. Add a backend update route for wireless IP Assignment.
3. Keep the Aruba payload merge backend-owned.
4. Add the frontend `IP Assignment` section for wireless networks.
5. Wire `Update` to the new backend route.

## Implemented Scope

- backend wireless individual network model now includes `wiredNetworkId`
- added backend route for wireless IP Assignment update
- backend update logic preserves the Aruba payload and overwrites only `wiredNetworkId`
- frontend `IP Assignment` section added for wireless networks
- first mode only:
  - `Same as a Local Network (default)`

## Deferred

- `Specific to This Network`
- wired network IP assignment editing
- advanced validation of assignment modes
