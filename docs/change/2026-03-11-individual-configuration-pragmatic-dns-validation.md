# Code Change: Individual Configuration Pragmatic DNS Validation

## Summary

The backend now validates wireless IP Assignment input before calling Aruba `PUT`.

## Logic

- added IPv4 validation using Python `ipaddress`
- added supported subnet mask validation
- extended the backend IP Assignment update path to persist:
  - local wired network mode
  - specific-network DHCP/DNS fields

## Improvement

- prevents malformed DNS values from reaching Aruba
- moves important validation out of the frontend only
- keeps Aruba update requests cleaner and safer

## Follow-up

- if reachability or trust checks are needed later, they should be designed separately from the deterministic validation path
