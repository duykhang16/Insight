# Code Change

## Metadata

- Date: 2026-03-11
- Topic: Site configuration navigation and individual overview UI
- Related task record: `docs/Khang_plans/2026-03-11-site-configuration-navigation-and-individual-overview.md`
- Related test record: `docs/testing/2026-03-11-site-configuration-navigation-and-individual-overview-test.md`

## What Changed

- File: `frontend/src/components/Sidebar/SiteSidebar.jsx`
  - Change: Added grouped configuration navigation with `Individual Configuration` and `Batch Configuration`.
- File: `frontend/src/App.jsx`
  - Change: Added site-scoped configuration routes and redirected the legacy `/site/:siteId/cloner` path to batch configuration.
- File: `frontend/src/pages/Configuration/IndividualConfiguration.jsx`
  - Change: Added a new individual configuration screen with a top section tab bar, a combined wired/wireless selector, and separate overview layouts for wireless and wired networks.
- File: `frontend/src/pages/Configuration/index.jsx`
  - Change: Left the page as the batch configuration surface.

## Logic Behind It

The repo already had strong batch-oriented configuration tools, but it did not distinguish between batch and single-site editing at the site navigation level. The change introduces that distinction first in the frontend information architecture:

- batch stays on the existing configuration page
- individual gets a new site-specific screen

This keeps the current backend-backed batch flows intact while allowing the new individual configuration experience to grow section by section. The individual page now also recognizes that site configuration is not limited to SSIDs, so the selector supports both wired and wireless networks and swaps overview layouts accordingly. The section navigation was aligned to a top tab pattern so it matches the interaction model already used in batch configuration.

## Improvement

- Reliability:
  - Existing batch workflows remain unchanged and continue using the known backend routes.
- Performance:
  - Individual configuration loads only the current site SSIDs instead of batch-oriented site sets.
- Maintainability:
  - Separates batch tooling and individual SSID editing into distinct route surfaces.
  - Creates one combined network-selector surface instead of splitting wired and wireless into separate pages too early.

## Warning / Potential Fallback

- Risk:
  - The new individual route currently implements only `Overview`; other left-menu sections are placeholders.
- Limitation:
  - The new combined overview UI is still frontend-first; save behavior from this page is not yet wired to the final backend update APIs.
  - Verification used `npm run dev` rather than a completed production build in this pass.
- Fallback:
  - If the new site route structure causes confusion, the legacy `/site/:siteId/cloner` path still redirects into batch configuration.
  - A more aggressive theme pass was intentionally reverted, so styling remains closer to the earlier layout until a new direction is approved.

## How To Use

- Endpoint or feature:
  - Site sidebar -> `Configuration` -> `Individual Configuration`
  - Site sidebar -> `Configuration` -> `Batch Configuration`
- Inputs:
  - For individual configuration, choose a wireless SSID from the top selector.
- Expected output:
  - `Batch Configuration` shows the existing batch/full-clone tools.
  - `Individual Configuration` shows the new left task menu with `Overview` active and a selector that includes wired and wireless networks.
- Operational notes:
  - `viewer` remains blocked from configuration editing on the new individual page.
