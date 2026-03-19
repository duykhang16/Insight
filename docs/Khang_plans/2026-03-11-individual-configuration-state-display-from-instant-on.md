# Individual Configuration State Display From Instant On

## Request

The `State` field on overview should display only the state returned from Instant On, not a frontend-derived value that changes immediately when the `Enabled` checkbox is toggled.

## Implemented Change

- `State` is now stored from the loaded backend network payload
- the overview screen renders that stored state value
- toggling `Enabled` no longer changes the visible `State` label before save

## Result

The page now reflects Instant On state display semantics more accurately:

- `Enabled` is still editable
- `State` remains display-only until refreshed from backend data
