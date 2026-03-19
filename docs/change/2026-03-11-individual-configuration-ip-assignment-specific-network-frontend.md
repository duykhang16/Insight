# Code Change: Individual Configuration IP Assignment Specific Network Frontend

## Summary

The wireless `IP Assignment` section now includes the frontend layout for `Specific to This Network` and DNS Resolution.

## Logic

- `ipAddressingMode` now drives which branch is shown
- `internal` renders the specific-network UI
- non-`internal` renders the local-wired-network dropdown
- DNS Resolution UI is controlled by `dnsServerAssignationMode`

## Improvement

- matches the intended Instant On page structure more closely
- prepares the form state for the next backend wiring step
- allows UX review before payload save logic is added

## Warning / Fallback

- this is frontend-only for the specific-network branch
- `Update` is not yet meant to persist the new DHCP/DNS fields
- automatic IP range values are currently display placeholders, not calculated from backend state
