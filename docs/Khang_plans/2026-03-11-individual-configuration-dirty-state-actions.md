# Session Record

## Metadata

- Date: 2026-03-11
- Main topic: Individual configuration dirty-state action visibility
- Requested by: User
- Related files:
  - `frontend/src/pages/Configuration/IndividualConfiguration.jsx`

## User Request

Show the `Update` and `Cancel` buttons only after the page has been edited. Once the user changes a field, the buttons should stay visible even if they type the original value back in.

## Context Gathered

- Files inspected:
  - `frontend/src/pages/Configuration/IndividualConfiguration.jsx`
- Current behavior:
  - Bottom action buttons were always visible.
- Constraints:
  - The user wanted dirty-state tracking based on interaction, not strict value comparison.

## Plan

1. Add a local dirty flag to the individual configuration page.
2. Mark the page dirty on any supported edit interaction.
3. Hide the action buttons until the page becomes dirty.
4. Reset dirty state on `Cancel`, successful `Update`, or network change.

## Exchange Log

- User: Requested that buttons appear only after edits and stay visible even if the original value is typed again.
- Agent: Adjusted the design from diff-based visibility to dirty-state visibility and implemented it.

## Proposed Changes

- Change: Replace value-diff action visibility with dirty-state visibility.
- Reason: Match the intended interaction model where any edit session exposes `Update` and `Cancel`.
- Expected impact: More predictable form actions for the user.

## Implemented Changes

- File: `frontend/src/pages/Configuration/IndividualConfiguration.jsx`
  - Summary: Added `isDirty` tracking, marked edits as dirty, hid action buttons until dirty, and reset dirty state on cancel/update/network switch.

## Verification

- Checks performed:
  - Static review of the updated dirty-state flow
- Checks not performed:
  - Browser interaction test

## Follow-up

- Next task:
  - Browser validation of dirty-state behavior for both wired and wireless overview forms.
- Risks:
  - Dirty state is interaction-based, so buttons remain visible after an edit even if the current values visually match the original ones.
