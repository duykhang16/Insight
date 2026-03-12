# Individual Configuration Radio Options 2.4 GHz Dependency

## Request

When `2.4 GHz` is turned off:

- `Extended 2.4 GHz range` must also turn off
- the `Radio Options` block should be hidden in the frontend

## Implemented Change

- turning off `2.4 GHz` now automatically clears `Extended 2.4 GHz range`
- the `Radio Options` block only renders when `2.4 GHz` is enabled
