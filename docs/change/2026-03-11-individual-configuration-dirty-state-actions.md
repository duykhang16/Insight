# Code Change

## Metadata

- Date: 2026-03-11
- Topic: Individual configuration dirty-state action visibility
- Related task record: `docs/Khang_plans/2026-03-11-individual-configuration-dirty-state-actions.md`
- Related test record: `docs/testing/2026-03-11-individual-configuration-dirty-state-actions-test.md`

## What Changed

- File: `frontend/src/pages/Configuration/IndividualConfiguration.jsx`
  - Change: Added dirty-state tracking so `Update` and `Cancel` only appear after the user edits the form.

## Logic Behind It

The requested behavior is not a pure "form differs from original" rule. It is an "editing session has started" rule. The implementation therefore uses a boolean dirty flag that becomes true on any edit interaction and only resets on cancel, successful update, or network selection change.

## Improvement

- Reliability:
  - Action visibility now matches the intended user interaction more closely.
- Performance:
  - Uses simple local state, no deep object diffing required.
- Maintainability:
  - Dirty-state behavior is explicit and easy to extend to new fields later.

## Warning / Potential Fallback

- Risk:
  - Buttons remain visible after edits even if the current values match the original ones exactly.
- Limitation:
  - This is intentional behavior based on the current requirement.
- Fallback:
  - If later needed, this can be changed to a combined dirty-plus-diff model.

## How To Use

- Endpoint or feature:
  - `Site -> Configuration -> Individual Configuration`
- Inputs:
  - Change any editable field in the overview form
- Expected output:
  - `Update` and `Cancel` appear only after editing starts
  - `Cancel` hides them again
- Operational notes:
  - Applies to both wired and wireless overview forms.
