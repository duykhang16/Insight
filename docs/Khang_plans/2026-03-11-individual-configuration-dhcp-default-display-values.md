# Individual Configuration DHCP Default Display Values

## Request

Use the real `network` and `netmask` values from Aruba `networksSummary` as the default display values in wireless `IP Assignment`.

## Implemented Change

- extended the dedicated individual wireless backend model to include:
  - `ipAddressingMode`
  - `dhcpScope`
- the frontend now receives real default values for:
  - Network Address
  - Subnet Mask
