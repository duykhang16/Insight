# Code Change: Individual Configuration Password Visibility Toggle

## Summary

The wireless overview password field eye icon now works.

## Logic

- added local `showPassword` UI state
- switched password input type between `password` and `text`
- replaced static icon display with a clickable toggle button

## Improvement

- matches expected behavior of the existing eye icon
- makes PSK review/edit easier without changing save logic
