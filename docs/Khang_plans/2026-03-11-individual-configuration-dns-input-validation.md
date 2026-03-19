# Individual Configuration DNS Input Validation

## Request

Add validation when entering DNS server values so wrong DNS input is blocked before update.

## Implemented Change

- added frontend IPv4 validation for DNS inputs in wireless `IP Assignment`
- when DNS mode is `Static`:
  - `Primary DNS Server` is required
  - `Primary DNS Server` must be a valid IPv4 address
  - `Secondary DNS Server` is optional
  - if present, `Secondary DNS Server` must be a valid IPv4 address
- invalid fields now show inline validation errors
- `Update` is blocked when the static DNS values are invalid

## Scope

Frontend only for this step.
