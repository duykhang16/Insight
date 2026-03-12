# Code Change: Individual Configuration Initial Loading Gate

## Summary

The individual configuration page no longer flashes the generic page shell before the site network response is ready.

## Improvement

- avoids misleading intermediate UI
- keeps the first rendered configuration state aligned with the actual selected site network
