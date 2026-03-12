# Code Change: Individual Configuration Banner Scroll Anchor Fix

## Summary

The individual configuration page now scrolls to the real top notification area instead of trying to scroll the window.

## Logic

- added a top anchor ref in `IndividualConfiguration`
- changed scroll behavior to `scrollIntoView(...)`
- fixed one leftover action-button disabled prop to use the shared section-aware gating

## Improvement

- success and error notifications are easier to notice
- scrolling now works within the actual site content container
