# Code Change: Site Configuration Collapsible Sidebar Group

## Summary

The site sidebar `Configuration` item now behaves as a collapsible parent group.

## Logic

- added local open/closed state in `SiteSidebar`
- clicking the parent row toggles submenu visibility
- configuration routes auto-open the group for context

## Improvement

- cleaner sidebar by default
- submenu items are only shown when needed
