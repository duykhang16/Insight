# Individual Configuration Success Banner State Fix

## Request

Fix the case where the success banner does not appear after a successful update.

## Root Cause

The selected-network refresh effect was clearing `success` immediately after the updated network list was written back to local state.

## Implemented Change

- tracked the last selected network id
- success is now cleared only when the user actually changes the selected network
- success is no longer cleared by the normal post-save network refresh
