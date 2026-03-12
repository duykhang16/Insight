# Functional Test

## Metadata

- Date: 2026-03-11
- Feature: Individual configuration dirty-state action visibility
- Related session record: `docs/Khang_plans/2026-03-11-individual-configuration-dirty-state-actions.md`
- Tester: Codex

## Objective

Validate that `Update` and `Cancel` appear only after edit interaction and remain visible through the edit session.

## Preconditions

- Environment:
  - Frontend available
- Required data:
  - At least one selectable network
- Required accounts / roles:
  - Insight user above `viewer`

## Test Cases

| ID | Scenario | Steps | Expected Result | Actual Result | Status |
|---|---|---|---|---|---|
| TC-01 | Initial clean state | Open overview page without editing | `Update` and `Cancel` are hidden | Not run in browser | Pending |
| TC-02 | Edit starts dirty state | Change any input or toggle | `Update` and `Cancel` appear | Not run in browser | Pending |
| TC-03 | Edit then restore original value | Change a field, then type the original value back | `Update` and `Cancel` remain visible | Not run in browser | Pending |
| TC-04 | Cancel resets state | Edit a field, click `Cancel` | Form resets and action buttons disappear | Not run in browser | Pending |

## Notes

- Edge cases:
  - Network switch after dirty edits
- Errors observed:
  - None during patching
- Follow-up needed:
  - Browser verification after the next UI iteration.
