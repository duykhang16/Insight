# Individual Configuration IP Assignment Update Button Gating

## Request

In wireless `IP Assignment`, the page should not allow clicking `Update` when known validation errors already exist, such as blank or invalid primary DNS in static mode.

## Implemented Change

- added section-aware `Update` button disable logic
- for wireless `IP Assignment`, `Update` is now disabled when:
  - local wired-network mode has no wired network selected
  - specific-network mode has DNS validation errors

## Note

Backend validation remains in place as the final guard.
