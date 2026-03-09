# Networks Page — Wired/Wireless Tabs Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a tab UI (All / Wireless / Wired) to the existing Networks page, with a new WirelessTable component that shows flattened SSID rows with Health, Band, Security, VLAN, 24h Usage, and Clients columns.

**Architecture:** Enhance `Networks/index.jsx` in-place. Wireless rows are derived by flattening the `ssids[]` already present in the `/wiredNetworks` response — no new API endpoint required. A new `WirelessTable.jsx` handles wireless-specific columns. The existing `NetworkTable` and `NetworkRow` are untouched.

**Tech Stack:** React, Tailwind CSS, lucide-react, existing apiClient + useIntervalFetch hooks

---

## Context

**Existing files (do not break):**
- `Networks/index.jsx` — main page, fetches `/replay/api/sites/{siteId}/wiredNetworks`, uses `processWiredNetworks()` → `networksData[]`
- `Networks/NetworkTable.jsx` — wired table (VLAN / Type / Attached SSIDs / Clients / Status)
- `Networks/NetworkRow.jsx` — single wired row with SSID chips
- `Networks/dataProcessor.js` — `processWiredNetworks()` returns `{ id, name, vlanId, type, isEnabled, health, wiredClients, totalClients, ssids[] }`

Each processed `ssid` in `ssids[]` has: `{ id, name, isEnabled, clients, band, security }`

---

### Task 1: Create WirelessTable.jsx

**Files:**
- Create: `sources/insight/frontend/src/pages/Dashboard/Networks/WirelessTable.jsx`

**Step 1: Create the file with this exact content**

```jsx
import React from 'react';
import { Wifi, Users, ArrowUp, ArrowDown } from 'lucide-react';

// --- Helpers ---
const HEALTH_DOT = {
    good:    'bg-emerald-500',
    warning: 'bg-amber-500',
    poor:    'bg-rose-500',
    unknown: 'bg-slate-600',
};

const formatBytes = (bytes) => {
    if (bytes == null) return '—';
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
};

const BAND_LABEL = {
    '5ghz':   '5 GHz',
    '2.4ghz': '2.4 GHz',
    '6ghz':   '6 GHz',
};
const getBandLabel = (band) => BAND_LABEL[band?.toLowerCase()] || band || '—';

// --- Component ---
const WirelessTable = ({ data, sortConfig, onSort, loading }) => {
    const SortIcon = ({ column }) => {
        if (sortConfig?.key !== column)
            return <ArrowDown size={12} className="opacity-20 ml-1 inline" />;
        return sortConfig.direction === 'asc'
            ? <ArrowUp size={12} className="text-indigo-500 ml-1 inline" />
            : <ArrowDown size={12} className="text-indigo-500 ml-1 inline" />;
    };

    return (
        <div className="bg-slate-900 rounded-[2.5rem] shadow-2xl border border-white/5 overflow-hidden w-full">
            <div className="max-h-[calc(100vh-360px)] overflow-auto custom-scrollbar">
                <table className="w-full min-w-[900px] text-left text-sm whitespace-nowrap">
                    <thead className="text-slate-500 border-b border-white/5 sticky top-0 z-10 bg-slate-900">
                        <tr>
                            <th
                                onClick={() => onSort?.('name')}
                                className="px-8 py-5 font-black uppercase tracking-widest text-[10px] cursor-pointer hover:text-white transition-colors min-w-[220px]"
                            >
                                Network <SortIcon column="name" />
                            </th>
                            <th className="px-6 py-5 font-black uppercase tracking-widest text-[10px] min-w-[100px]">
                                State
                            </th>
                            <th className="px-6 py-5 font-black uppercase tracking-widest text-[10px] min-w-[100px]">
                                Health
                            </th>
                            <th className="px-6 py-5 font-black uppercase tracking-widest text-[10px] min-w-[100px]">
                                Band
                            </th>
                            <th className="px-6 py-5 font-black uppercase tracking-widest text-[10px] min-w-[100px]">
                                Security
                            </th>
                            <th className="px-6 py-5 font-black uppercase tracking-widest text-[10px] min-w-[100px]">
                                VLAN
                            </th>
                            <th className="px-6 py-5 font-black uppercase tracking-widest text-[10px] min-w-[120px]">
                                24h Usage
                            </th>
                            <th
                                onClick={() => onSort?.('clients')}
                                className="px-6 py-5 font-black uppercase tracking-widest text-[10px] cursor-pointer hover:text-white transition-colors text-right min-w-[100px]"
                            >
                                Clients <SortIcon column="clients" />
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-slate-300">
                        {/* Skeleton rows while loading */}
                        {loading && Array.from({ length: 5 }).map((_, i) => (
                            <tr key={`wskel-${i}`} className="animate-pulse">
                                <td className="px-8 py-5"><div className="h-4 bg-slate-800 rounded w-40" /></td>
                                <td className="px-6 py-5"><div className="h-4 bg-slate-800 rounded w-16" /></td>
                                <td className="px-6 py-5"><div className="h-4 bg-slate-800 rounded w-16" /></td>
                                <td className="px-6 py-5"><div className="h-4 bg-slate-800 rounded w-16" /></td>
                                <td className="px-6 py-5"><div className="h-4 bg-slate-800 rounded w-16" /></td>
                                <td className="px-6 py-5"><div className="h-4 bg-slate-800 rounded w-12" /></td>
                                <td className="px-6 py-5"><div className="h-4 bg-slate-800 rounded w-20" /></td>
                                <td className="px-6 py-5 text-right"><div className="h-4 bg-slate-800 rounded w-10 ml-auto" /></td>
                            </tr>
                        ))}

                        {!loading && data.map(ssid => {
                            const dotClass = HEALTH_DOT[ssid.health] || HEALTH_DOT.unknown;
                            const healthLabel = ssid.health
                                ? ssid.health.charAt(0).toUpperCase() + ssid.health.slice(1)
                                : 'Unknown';
                            return (
                                <tr key={ssid.id} className="hover:bg-white/[0.02] transition-colors group">
                                    {/* Network Name */}
                                    <td className="px-8 py-5">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex-shrink-0">
                                                <Wifi size={14} />
                                            </div>
                                            <p className="text-white font-black text-sm tracking-tight italic uppercase truncate max-w-[180px]" title={ssid.name}>
                                                {ssid.name}
                                            </p>
                                        </div>
                                    </td>

                                    {/* State */}
                                    <td className="px-6 py-5">
                                        {ssid.isEnabled ? (
                                            <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-emerald-400">
                                                <span className="relative flex h-2 w-2">
                                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-50" />
                                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                                                </span>
                                                Active
                                            </span>
                                        ) : (
                                            <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-600">
                                                <span className="w-2 h-2 rounded-full bg-slate-700" />
                                                Inactive
                                            </span>
                                        )}
                                    </td>

                                    {/* Health */}
                                    <td className="px-6 py-5">
                                        <span className="flex items-center gap-1.5 text-xs font-bold text-slate-400">
                                            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotClass}`} />
                                            {healthLabel}
                                        </span>
                                    </td>

                                    {/* Band */}
                                    <td className="px-6 py-5">
                                        <span className="text-xs font-bold text-slate-400">
                                            {getBandLabel(ssid.band)}
                                        </span>
                                    </td>

                                    {/* Security */}
                                    <td className="px-6 py-5">
                                        <span className="text-xs font-bold text-slate-400">
                                            {ssid.security || '—'}
                                        </span>
                                    </td>

                                    {/* VLAN */}
                                    <td className="px-6 py-5">
                                        <span className="font-mono font-black text-indigo-400 text-sm bg-indigo-500/10 px-3 py-1 rounded-lg border border-indigo-500/20">
                                            {ssid.vlanId ?? '—'}
                                        </span>
                                    </td>

                                    {/* 24h Usage */}
                                    <td className="px-6 py-5">
                                        <span className="text-xs font-bold text-slate-500">
                                            {formatBytes(ssid.usage24h)}
                                        </span>
                                    </td>

                                    {/* Clients */}
                                    <td className="px-6 py-5 text-right">
                                        <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-2xl border transition-all ${
                                            ssid.clients > 0
                                                ? 'bg-slate-800 border-indigo-500/20 group-hover:border-indigo-500/40'
                                                : 'bg-slate-900 border-white/5 opacity-50'
                                        }`}>
                                            <Users size={12} className={ssid.clients > 0 ? 'text-indigo-400' : 'text-slate-600'} />
                                            <span className={`font-black text-sm ${ssid.clients > 0 ? 'text-white' : 'text-slate-600'}`}>
                                                {ssid.clients}
                                            </span>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}

                        {!loading && data.length === 0 && (
                            <tr>
                                <td colSpan="8" className="px-6 py-24 text-center text-slate-500">
                                    <div className="flex flex-col items-center">
                                        <div className="p-6 bg-slate-800 rounded-3xl mb-6 opacity-20">
                                            <Wifi size={64} className="text-slate-400" />
                                        </div>
                                        <p className="text-xl font-black text-slate-700 uppercase tracking-[0.2em]">No Wireless Networks</p>
                                        <p className="text-xs text-slate-600 mt-3 font-bold uppercase tracking-widest">No SSIDs found for this site</p>
                                    </div>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default WirelessTable;
```

**Step 2: Commit**

```bash
git add sources/insight/frontend/src/pages/Dashboard/Networks/WirelessTable.jsx
git commit -m "feat: add WirelessTable component for SSID rows"
```

---

### Task 2: Update Networks/index.jsx — add tab state, wireless derivation, tab UI, conditional renders

**Files:**
- Modify: `sources/insight/frontend/src/pages/Dashboard/Networks/index.jsx`

**Step 1: Add WirelessTable import at the top (after `NetworkTable` import, line 6)**

```js
import WirelessTable from './WirelessTable';
```

**Step 2: Add `activeTab` state (after `sortConfig` state, around line 19)**

```js
const [activeTab, setActiveTab] = useState('all'); // 'all' | 'wireless' | 'wired'
```

**Step 3: Add `flattenWireless` helper and `wirelessData` memo after the `filteredAndSortedData` useMemo block (around line 113)**

```js
// Flatten SSIDs from wired network rows into wireless display rows
const wirelessData = useMemo(() => {
    let rows = networksData.flatMap(net =>
        net.ssids.map(ssid => ({
            id:        `${net.id}-${ssid.id}`,
            name:      ssid.name,
            isEnabled: ssid.isEnabled,
            health:    'unknown',
            band:      ssid.band,
            security:  ssid.security,
            vlanId:    net.vlanId,
            clients:   ssid.clients,
            usage24h:  null,
        }))
    );

    if (searchTerm) {
        const q = searchTerm.toLowerCase();
        rows = rows.filter(r => r.name.toLowerCase().includes(q));
    }

    return rows;
}, [networksData, searchTerm]);
```

**Step 4: Replace the existing `<select>` type filter with the tab UI + keep the search input**

Find this block (around lines 170-178):
```jsx
                <select
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value)}
                    className="h-14 bg-slate-900 border border-white/5 rounded-2xl px-5 text-white text-sm font-bold focus:outline-none focus:border-indigo-500/50 appearance-none min-w-[160px] cursor-pointer hover:bg-slate-800/50 transition-all shadow-xl"
                >
                    <option value="all">All Types</option>
                    <option value="employee">Employee</option>
                    <option value="guest">Guest</option>
                </select>
```

Replace it with:
```jsx
                {/* Tabs */}
                <div className="flex items-center gap-1 bg-slate-900 border border-white/5 rounded-2xl p-1 shadow-xl">
                    {['all', 'wireless', 'wired'].map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                                activeTab === tab
                                    ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                                    : 'text-slate-500 hover:text-slate-300 border border-transparent'
                            }`}
                        >
                            {tab}
                        </button>
                    ))}
                </div>
```

**Step 5: Replace the `<NetworkTable ... />` render (around line 188) with conditional rendering**

Find:
```jsx
            <NetworkTable
                data={filteredAndSortedData}
                sortConfig={sortConfig}
                onSort={handleSort}
                loading={loading}
            />
```

Replace with:
```jsx
            {/* Wireless section */}
            {(activeTab === 'all' || activeTab === 'wireless') && (
                <div className="mb-8">
                    {activeTab === 'all' && (
                        <h2 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-3 px-1 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
                            Wireless Networks
                        </h2>
                    )}
                    <WirelessTable
                        data={wirelessData}
                        sortConfig={null}
                        onSort={null}
                        loading={loading}
                    />
                </div>
            )}

            {/* Wired section */}
            {(activeTab === 'all' || activeTab === 'wired') && (
                <div>
                    {activeTab === 'all' && (
                        <h2 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-3 px-1 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
                            Wired Networks
                        </h2>
                    )}
                    <NetworkTable
                        data={filteredAndSortedData}
                        sortConfig={sortConfig}
                        onSort={handleSort}
                        loading={loading}
                    />
                </div>
            )}
```

**Step 6: Commit**

```bash
git add sources/insight/frontend/src/pages/Dashboard/Networks/index.jsx
git commit -m "feat: add Wireless/Wired tabs to Networks page"
```

---

## Verification Checklist

Navigate to `/site/:siteId/networks` in the browser:

- [ ] Three pill tabs render: All · Wireless · Wired
- [ ] **All tab**: Two sections visible — "Wireless Networks" heading + WirelessTable, then "Wired Networks" heading + existing wired table
- [ ] **Wireless tab**: Only WirelessTable — rows are the SSIDs from each wired network, with their parent VLAN shown
- [ ] **Wired tab**: Only the existing NetworkTable, unchanged behavior
- [ ] Searching filters both wireless and wired rows simultaneously
- [ ] 24h Usage column always shows `—` (no crash on `null`)
- [ ] Health dots show gray (`bg-slate-600`) since health is `'unknown'`
- [ ] Skeleton loaders appear during initial load on both tables
- [ ] Sites with no SSIDs show the "No Wireless Networks" empty state
- [ ] Clicking tabs does not trigger a re-fetch (tab is purely a UI filter)
