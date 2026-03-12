# Individual Configuration Update Result Behavior

## Request

Change update-result behavior so:

- on error:
  - reset the form like `Cancel`
  - stay on the same page
  - jump to the top
  - show the error banner
- on success:
  - jump to the top
  - show a success banner in the same format/theme
  - update the display from the normalized response

## Implemented Change

- successful updates now scroll to the top
- success banner uses the existing top-page notification pattern
- success display is refreshed from the normalized response payload
- failed updates now reset the form to the current loaded network state
- failed updates also scroll to the top and show the error banner
