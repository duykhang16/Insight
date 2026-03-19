# Code Change: Individual Configuration Unified Notification State

## Summary

The individual configuration page now uses a single notification state model for both success and error banners.

## Improvement

- removes race conditions between separate success/error state updates
- makes banner timing and rendering consistent across update, delete, and load flows
- fixes the missing success banner behavior more reliably than incremental patches on the old split state
