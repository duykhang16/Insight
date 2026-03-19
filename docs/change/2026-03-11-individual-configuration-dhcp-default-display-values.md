# Code Change: Individual Configuration DHCP Default Display Values

## Summary

The wireless individual-config model now exposes DHCP scope data from Aruba `networksSummary`.

## Logic

- backend normalizer now passes through:
  - `ipAddressingMode`
  - `dhcpScope`
- frontend continues reading:
  - `dhcpScope.network`
  - `dhcpScope.netmask`

## Improvement

- default IP Assignment values now come from Instant On data instead of fallback-only frontend values
