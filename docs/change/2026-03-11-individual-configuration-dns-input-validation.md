# Code Change: Individual Configuration DNS Input Validation

## Summary

Static DNS fields now validate IPv4 input before update is allowed.

## Logic

- added a small IPv4 validator in the individual configuration page
- derived validation state for primary and secondary DNS inputs
- rendered inline errors and error styling on invalid inputs
- blocked update when static DNS validation fails

## Improvement

- prevents obviously invalid DNS values from being submitted in the UI
- gives immediate feedback at the field level

## Follow-up

- mirror the same validation in the backend when static DNS save wiring is implemented
