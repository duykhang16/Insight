# Site Configuration Never Highlight Parent

## Request

The `Configuration` parent item should never be highlighted. Only:

- the active configuration subtask, or
- the active non-configuration sidebar item

should be highlighted.

Also:

- when clicking any non-configuration sidebar item, the configuration group should collapse

## Implemented Change

- removed highlight styling from the `Configuration` parent row
- added auto-collapse when navigating to non-configuration site routes
- active highlight is now owned only by:
  - a configuration child route, or
  - a non-configuration main route
