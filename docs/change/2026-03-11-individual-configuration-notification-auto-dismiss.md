# Code Change: Individual Configuration Notification Auto Dismiss

## Summary

Top-page notifications in the individual configuration page now auto-dismiss after 7 seconds.

## Logic

- added a timed visibility effect for `error` and `success`
- notifications fade out before the message state is cleared
- section changes clear any active notification immediately

## Improvement

- no stale notifications remain pinned on the page
- dismissal is smoother and does not require reload
