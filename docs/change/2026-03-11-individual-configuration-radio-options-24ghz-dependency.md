# Code Change: Individual Configuration Radio Options 2.4 GHz Dependency

## Summary

The `Extended 2.4 GHz range` option now depends on the `2.4 GHz` radio being enabled.

## Logic

- added a dedicated `2.4 GHz` toggle handler
- when `2.4 GHz` is unchecked:
  - `isLegacy80211bRatesEnabled` is forced to `false`
  - the `Radio Options` section is hidden

## Improvement

- keeps the UI consistent with the dependency between the 2.4 GHz band and its related option
