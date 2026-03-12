# Test Note: Individual Configuration Pragmatic DNS Validation

## Backend Checks

- invalid network address returns `400`
- unsupported subnet mask returns `400`
- invalid primary DNS returns `400`
- invalid secondary DNS returns `400`
- valid payload proceeds to Aruba `PUT`

## Frontend Checks

- wireless `IP Assignment` now sends:
  - `ipAddressingMode`
  - `wiredNetworkId`
  - `networkAddress`
  - `subnetMask`
  - `dnsServerAssignationMode`
  - `primaryDnsServer`
  - `secondaryDnsServer`
