# Individual Configuration Network Assignment Radio

## Request

Implement the wireless `Network Assignment` page based on the provided layout.

Scope:

- wire radio-frequency values to SSID update
- keep Access Point as placeholder only
- include the `Extended 2.4 GHz range` option

## Implemented Scope

Backend:

- extended the dedicated individual wireless model to include radio fields
- added a backend update route for wireless network assignment
- update flow preserves the Aruba payload and overwrites only radio-related fields

Frontend:

- added the wireless `Network Assignment` section
- added controls for:
  - 2.4 GHz
  - 5 GHz
  - 6 GHz when present
  - Extended 2.4 GHz range
- added Access Point placeholder panel

## Deferred

- access point assignment logic
- backend validation or special rules for AP binding
