# Site Configuration Sidebar Section Navigation

## Request

Change the site detail configuration navigation so the left sidebar shows direct section links:

- Overview
- IP Assignment
- Network Assignment
- Access Control
- Schedule
- Wireless Options

At the same time:

- zone/global configuration remains the batch configuration page
- remove the site submenu pair:
  - Individual Configuration
  - Batch Configuration

## Implemented Change

- site sidebar configuration submenu now links directly to the six site configuration sections
- site routes now map each section path to the shared individual configuration page
- the individual configuration page derives its active section from the route
- the old top in-page tabs were removed

## Compatibility

Legacy site routes are redirected to the new structure:

- `configuration/individual` -> `configuration/overview`
- `configuration/batch` -> `configuration/overview`
- `cloner` -> `configuration/overview`
