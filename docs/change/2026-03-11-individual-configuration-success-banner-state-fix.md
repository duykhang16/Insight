# Code Change: Individual Configuration Success Banner State Fix

## Summary

The success banner state is no longer wiped immediately after a successful save.

## Improvement

- success notification can now remain visible after post-save local state refresh
- preserves intended notification timing and scroll behavior
