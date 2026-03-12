# Code Change: Site Configuration Sidebar Section Navigation

## Summary

Site detail configuration now uses the left sidebar for section navigation instead of the old `Individual Configuration` / `Batch Configuration` submenu split.

## Logic

- updated `SiteSidebar` to expose direct section links
- updated `App` site routes to:
  - `configuration/overview`
  - `configuration/ip-assignment`
  - `configuration/network-assignment`
  - `configuration/access-control`
  - `configuration/schedule`
  - `configuration/wireless-options`
- updated `IndividualConfiguration` to read the active section from the route path
- removed the top in-page section tabs

## Improvement

- cleaner information architecture
- batch tools stay at the zone/global configuration level
- site detail navigation now matches the actual section-based individual configuration workflow
