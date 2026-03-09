# Design: SiteDetail Metric Cards Sub-Metrics

**Date:** 2026-03-04
**Status:** Approved

## Problem

The 5 metric cards on `SiteDetail.jsx` display only a single large number. The Aruba dashboard response already contains granular breakdowns (Good/Fair/Poor clients, Online/Offline devices, etc.) that are being discarded. Users must navigate to detail pages to see any breakdown.

## Solution

Extend each card object in the `cards` array with a `sub` string containing the pre-computed sub-metric text. Render it as a single additional line below the main number.

**Approach:** Extend `cards` array (no new components, no structural changes).

## Data Mapping

| Card | Main Number | Sub-metric format |
|---|---|---|
| Health | `healthOverview.currentScore.score` | `Conditions: {n}` |
| Alerts | `major + minor + info` (existing) | `Major: {n} / Minor: {n} / Info: {n}` |
| Clients | `clientsOverview.totalClient.total` | `Good: {n} / Fair: {n} / Poor: {n}` |
| Networks | `wireless + wired + vpn` (existing) | `Active: {n} / Inactive: {n}` |
| Devices | `ap.online + sw.online + ...` (existing) | `Online: {n} / Offline: {n}` |

### Networks: Active / Inactive derivation
```
inactiveWireless = data?.networksOverview?.inactiveWirelessNetworks ?? 0
inactiveWired    = data?.networksOverview?.inactiveWiredNetworks ?? 0
inactive         = inactiveWireless + inactiveWired
active           = activeNetworks - inactive
```

### Devices: Offline derivation
```
offlineAP  = ap.total - ap.online
offlineSW  = sw.total - sw.online
offline    = offlineAP + offlineSW + (stacks.total - stacks.online) + ...
online     = existing onlineDevices value
```

## Render Change (cards.map)

```jsx
<div className="mt-2 flex items-baseline gap-2">
  <span className="text-4xl font-black text-slate-800 dark:text-white tracking-tighter">
    {loading && !data ? '...' : card.value}
  </span>
</div>
{/* NEW */}
{card.sub && !loading && (
  <div className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 font-medium tracking-wide">
    {card.sub}
  </div>
)}
```

## Files Modified

- `sources/insight/frontend/src/pages/Dashboard/SiteDetail.jsx` — only file changed

## Verification

1. Run the frontend dev server
2. Navigate to a site detail page
3. Confirm each card shows the sub-metric row once data loads
4. Confirm no sub-metric row appears during the initial loading state
5. Confirm graceful fallback (0) when specific fields are absent from the API response
