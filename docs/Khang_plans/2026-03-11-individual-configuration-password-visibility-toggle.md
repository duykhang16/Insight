# Individual Configuration Password Visibility Toggle

## Request

The wireless overview password field shows an eye icon, but the icon does not currently toggle password visibility.

## Implemented Change

- added local show/hide state for the wireless password field
- password remains hidden by default
- clicking the eye icon now toggles between hidden and visible text
- visibility resets when:
  - switching networks
  - canceling changes
  - successful save
