# Site Configuration Parent Child Highlight Behavior

## Request

Fix the sidebar highlight behavior so:

- when a configuration subtask is active, only the subtask is highlighted
- when `Configuration` is expanded manually outside a configuration route, only the parent is highlighted

## Implemented Change

- separated parent highlight state from child route-active state
- parent `Configuration` row now highlights only when:
  - the group is expanded
  - and no configuration sub-route is currently active
- child section items continue to use route-based active highlighting
