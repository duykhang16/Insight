# Functional Test

## Metadata

- Date: 2026-03-11
- Feature: Site configuration navigation and individual overview UI
- Related session record: `docs/Khang_plans/2026-03-11-site-configuration-navigation-and-individual-overview.md`
- Tester: Codex

## Objective

Validate that site-level configuration navigation is split into batch and individual routes, and that the new individual overview UI loads against the current site configuration APIs.

## Preconditions

- Environment:
  - Frontend dependencies installed
  - Frontend can be started with `npm run dev`
- Required data:
  - At least one site with at least one wireless SSID
- Required accounts / roles:
  - Insight user with role above `viewer`

## Test Cases

| ID | Scenario | Steps | Expected Result | Actual Result | Status |
|---|---|---|---|---|---|
| TC-01 | Site sidebar config group | Open a site page and inspect the left sidebar | `Configuration` shows `Individual Configuration` and `Batch Configuration` submenus | Not manually opened in browser | Pending |
| TC-02 | Legacy cloner route redirect | Open `/site/{siteId}/cloner` | Redirects to `/site/{siteId}/configuration/batch` | Not manually opened in browser | Pending |
| TC-03 | Batch route | Open `/site/{siteId}/configuration/batch` | Existing batch/full-clone configuration page loads | Not manually opened in browser | Pending |
| TC-04 | Individual overview route | Open `/site/{siteId}/configuration/individual` | Left task bar renders and `Overview` screen loads | Not manually opened in browser | Pending |
| TC-05 | Combined network selector | Open the individual route and inspect the selector | Selector includes both wired and wireless options with type labels | Not manually opened in browser | Pending |
| TC-06 | Frontend startup | Run `npm run dev` | Vite dev server starts without the earlier sandbox EPERM once elevated | Process remained alive until timeout, no startup error after elevation | Partial |

## Notes

- Edge cases:
  - Site with no wireless SSIDs
  - Viewer access to the new individual route
- Errors observed:
  - Sandbox execution of Vite hit `spawn EPERM`; elevated run avoided that error but exceeded the observation timeout, which is expected for a dev server.
- Follow-up needed:
  - Browser validation of route navigation, combined selector behavior, and final save flow.
