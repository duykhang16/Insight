# Individual Configuration Initial Loading Gate

## Request

Fix the case where opening `Configuration` briefly shows the generic individual configuration template before the site-specific network data is loaded.

## Implemented Change

- gated the page header and section shell behind the initial loading state
- while the backend network list is still loading, the page now shows only the loading view
- the site-specific configuration header and selector render only after the selected network data is ready
