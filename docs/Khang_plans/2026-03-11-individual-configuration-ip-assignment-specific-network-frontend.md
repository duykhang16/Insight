# Individual Configuration IP Assignment Specific Network Frontend

## Request

Expand the wireless `IP Assignment` page to include the `Specific to This Network` layout and DNS Resolution options shown in the Instant On screenshots.

## Scope

Frontend only for this step.

## Implemented Change

- added the `Specific to This Network` radio option as an active frontend choice
- added the corresponding UI fields:
  - Network Address
  - Subnet Mask
  - Automatic IP Address Assignment summary
  - DNS Resolution
  - Primary DNS Server
  - Secondary DNS Server
- retained the current `Same as a Local Network` wired-network dropdown flow

## Data Source

The frontend form now carries the related Aruba payload fields where available:

- `ipAddressingMode`
- `dhcpScope.network`
- `dhcpScope.netmask`
- `dhcpScope.dns.dnsServerAssignationMode`

## Deferred

- backend save wiring for `Specific to This Network`
- backend save wiring for static DNS fields
- accurate calculated DHCP range from real network/subnet math
