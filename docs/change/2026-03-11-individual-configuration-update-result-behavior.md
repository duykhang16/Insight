# Code Change: Individual Configuration Update Result Behavior

## Summary

The individual configuration update flow now handles success and error outcomes with a consistent top-of-page notification and form-reset behavior.

## Logic

- added a small shared form rebuild path from the selected/updated normalized network
- on success:
  - replace local network state with the normalized response
  - rebuild the form from that response
  - show success message
  - scroll to top
- on error:
  - rebuild the form from the current selected network
  - clear dirty state
  - show error message
  - scroll to top

## Improvement

- no stale partial edits remain after an update error
- success state is based on the backend-normalized response, not optimistic local values
- notification behavior is consistent across outcomes
