# Individual Configuration Pragmatic DNS Validation

## Request

Add backend validation before Aruba `PUT` for IP Assignment so DNS server values and related fields are checked server-side.

## Validation Approach

Deterministic backend validation:

- IPv4 format validation
- mode-aware field requirements
- supported subnet mask validation

## Implemented Scope

Backend wireless IP Assignment now validates before Aruba `PUT`:

- `ipAddressingMode`
- `wiredNetworkId` when using local wired network mode
- `networkAddress` when using specific-network mode
- `subnetMask`
- `dnsServerAssignationMode`
- `primaryDnsServer`
- `secondaryDnsServer`

## Note

Reachability checking was removed from this step. The backend now validates only deterministic input rules before Aruba `PUT`.
