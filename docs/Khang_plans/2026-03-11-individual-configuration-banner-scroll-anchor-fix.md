# Individual Configuration Banner Scroll Anchor Fix

## Request

Fix the case where success notification does not appear to pop at the top and the page does not jump to the notification area after update.

## Implemented Change

- replaced global window scrolling with a top-page anchor inside the individual configuration page
- success and error flows now scroll to the actual notification area in the scrollable content pane
- aligned the remaining action-button usage with the shared update-disable logic
