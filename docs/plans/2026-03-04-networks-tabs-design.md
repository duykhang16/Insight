# Design: Networks Page — Tabs (Wired / Wireless)

**Date:** 2026-03-04
**Status:** Approved

## Problem

The existing `Networks/index.jsx` shows only wired networks (calls `/wiredNetworks`, renders VLAN/Type/Attached SSIDs). Wireless SSIDs are buried as children. The user wants a tabbed view separating Wired and Wireless with appropriate per-type columns.

## Solution

Enhance `Networks/index.jsx` in-place. Add a tab selector and a `WirelessTable` sub-component. Wireless rows are derived by flattening the `ssids[]` from the existing `/wiredNetworks` response — no unverified second endpoint required. 24-hour usage column is included but displays `—` until a real value is available.

## Files

| File | Action |
|---|---|
| `Networks/index.jsx` | Add tab state, flattenWireless(), tab UI, conditional table render |
| `Networks/WirelessTable.jsx` | New — wireless-specific table component |
| `Networks/NetworkTable.jsx` | No changes |
| `Networks/NetworkRow.jsx` | No changes |
| `Networks/dataProcessor.js` | No changes |

## Tab Behavior

- **All**: Wireless table (top) + Wired table (bottom), each with section heading
- **Wireless**: Only WirelessTable
- **Wired**: Only NetworkTable (existing)
- Active tab pill: `bg-indigo-500/20 text-indigo-300 border border-indigo-500/30`

## Wireless Data Derivation

Flatten `ssids[]` from each processed wired network row:

```js
const flattenWireless = (wiredRows) =>
  wiredRows.flatMap(net =>
    net.ssids.map(ssid => ({
      id:       ssid.id,
      name:     ssid.name,
      isEnabled: ssid.isEnabled,
      health:   'unknown',           // not in current payload
      band:     ssid.band || '—',
      security: ssid.security || '—',
      vlanId:   net.vlanId,
      clients:  ssid.clients,
      usage24h: null,                // show '—' in UI
    }))
  );
```

## WirelessTable Columns

| Column | Field | Notes |
|---|---|---|
| Network | `name` | SSID name |
| State | `isEnabled` | Active (emerald) / Inactive (slate) |
| Health | `health` | colored dot; 'unknown' → gray dot |
| Band | `band` | 2.4 GHz / 5 GHz / 6 GHz / — |
| Security | `security` | WPA3 / WPA2 / Open / — |
| VLAN | `vlanId` | from parent wired network |
| 24h Usage | `usage24h` | bytes formatted or — |
| Clients | `clients` | right-aligned |

## Verification

1. Navigate to `/site/:siteId/networks`
2. Confirm three tabs render: All, Wireless, Wired
3. Wireless tab shows flattened SSID rows with correct VLAN parent
4. Wired tab shows existing NetworkTable unchanged
5. All tab shows both sections
6. Search still works (filter applies to the active tab's data)
7. 24h Usage column shows `—` (no crash on null)
