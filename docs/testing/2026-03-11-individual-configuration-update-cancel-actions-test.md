# Functional Test

## Metadata

- Date: 2026-03-11
- Feature: Individual configuration update and cancel actions
- Related session record: `docs/Khang_plans/2026-03-11-individual-configuration-update-cancel-actions.md`
- Tester: Codex

## Objective

Validate that the overview form uses bottom `Update` and `Cancel` actions and that `Cancel` restores local form values.

## Preconditions

- Environment:
  - Frontend available
- Required data:
  - At least one selectable wired or wireless network
- Required accounts / roles:
  - Insight user above `viewer`

## Test Cases

| ID | Scenario | Steps | Expected Result | Actual Result | Status |
|---|---|---|---|---|---|
| TC-01 | Bottom actions visible | Open individual configuration overview | `Update` and `Cancel` appear at the bottom of the form | Not run in browser | Pending |
| TC-02 | Header save removed | Open individual configuration overview | Old top `Save Overview` action is not present | Not run in browser | Pending |
| TC-03 | Cancel resets values | Change form values and click `Cancel` | Form returns to the selected network’s loaded values | Not run in browser | Pending |

## Notes

- Edge cases:
  - Change network selection after local edits
- Errors observed:
  - None during patching
- Follow-up needed:
  - Browser verification once the final backend save flow is connected.
