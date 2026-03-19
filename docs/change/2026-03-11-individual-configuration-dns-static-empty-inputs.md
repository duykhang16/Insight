# Code Change: Individual Configuration DNS Static Empty Inputs

## Summary

The DNS input placeholders now behave correctly for `Static` mode.

## Logic

- disabled automatic mode keeps the `-` placeholder
- static mode uses empty placeholders for editable DNS inputs

## Improvement

- avoids misleading `-` markers in fields where the user is expected to type values
