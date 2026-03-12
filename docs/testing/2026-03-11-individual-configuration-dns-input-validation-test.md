# Test Note: Individual Configuration DNS Input Validation

## Expected Behavior

- DNS `Static` mode:
  - invalid primary DNS shows inline error
  - empty primary DNS shows inline error
  - invalid secondary DNS shows inline error
  - valid IPv4 values clear the errors
- `Update` is blocked while static DNS validation errors exist
