# Code Change: Individual Configuration State Display From Instant On

## Summary

The overview `State` field no longer derives from the local `isEnabled` checkbox state.

## Logic

- form builders now keep `state` from the normalized backend network model
- overview panels render `form.state`
- local checkbox edits do not mutate the displayed state label

## Improvement

- avoids misleading UI where state appeared to change before Aruba save/refresh
- keeps display aligned with source-of-truth behavior from Instant On
