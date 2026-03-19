# Individual Configuration Unified Notification State

## Request

Fix the case where the success banner still does not appear after a successful update.

## Root Cause

The page was still using split `error` and `success` state paths, which were fragile around local state refreshes and effect-driven form rebuilds.

## Implemented Change

- replaced split notification strings with one unified notification object:
  - `type`
  - `message`
- notification visibility, timer, and banner rendering now all use the same state source
- success and error update flows both use the same notification helper path
