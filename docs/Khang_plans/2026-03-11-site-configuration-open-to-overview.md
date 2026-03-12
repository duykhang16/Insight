# Site Configuration Open To Overview

## Request

When `Configuration` is expanded from the sidebar, it should jump to `Overview` and highlight that subtask instead of highlighting the parent item.

## Implemented Change

- clicking collapsed `Configuration` now:
  - opens the group
  - navigates to `configuration/overview`
- this makes `Overview` the active highlighted subtask immediately
- clicking `Configuration` again while open still collapses the group
