# Functional Test

## Metadata

- Date: 2026-03-11
- Feature: Individual configuration dedicated backend model
- Related session record: `docs/Khang_plans/2026-03-11-individual-configuration-dedicated-backend-model.md`
- Tester: Codex

## Objective

Validate that the backend provides a normalized individual-configuration network model and that the frontend individual configuration page uses it instead of raw proxy responses.

## Preconditions

- Environment:
  - Backend available with linked Aruba master account
  - Frontend available
- Required data:
  - A site with at least one network
- Required accounts / roles:
  - Insight user above `viewer`

## Test Cases

| ID | Scenario | Steps | Expected Result | Actual Result | Status |
|---|---|---|---|---|---|
| TC-01 | Backend compile | Run `python -m py_compile backend/app/features/config/service.py backend/app/features/config/routes.py` | Backend files compile successfully | Passed | Passed |
| TC-02 | Dedicated endpoint shape | Call `GET /api/v1/config/sites/{site_id}/individual/networks` | Response contains normalized `networks` array with `networkKind`, `displayName`, `label`, and overview fields | Not run against live backend | Pending |
| TC-03 | Frontend endpoint usage | Inspect `IndividualConfiguration.jsx` network-loading logic | Page loads from `/config/sites/{siteId}/individual/networks` | Passed by code inspection | Passed |

## Notes

- Edge cases:
  - Site with no wired networks
  - Site with no wireless networks
- Errors observed:
  - The provided `portal_01_response.json` did not match a wired-network sample; it resembled guest portal settings instead, so the dedicated model was built from the existing repo usage of Aruba `wiredNetworks`.
- Follow-up needed:
  - Live endpoint validation with a real Instant On site.
