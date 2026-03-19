# Individual Configuration DNS Static Empty Inputs

## Request

When DNS mode is switched to `Static`, the Primary and Secondary DNS fields should not show `-`. They should be blank and ready for input.

## Implemented Change

- `Automatic` mode still shows disabled DNS fields with `-`
- `Static` mode now leaves the DNS inputs blank unless there is an actual DNS value present
