# Site Configuration Collapsible Sidebar Group

## Request

Make `Configuration` the main visible sidebar item, with the section submenu only shown when the user clicks it. Clicking again should hide the submenu.

## Implemented Change

- `Configuration` is now a collapsible sidebar group
- clicking the main `Configuration` row toggles the section submenu open and closed
- the group auto-expands when the current route is inside the site configuration area
