# Batch Site Provisioning Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a "Batch Provision" tab to the Configuration page that lets admins mass-create sites from a template site via `POST /api/sites/{id}/siteCloning`, with sequential throttled execution and a live terminal log.

**Architecture:** Single new component `BatchProvision.jsx` (mirrors the structure of `FullClone.jsx` and `SmartSync.jsx`). All API calls go through the existing `apiClient` (which auto-attaches the stateless Bearer token). A `useRef`-controlled async loop enables mid-run Stop without race conditions. No data is persisted locally — pure API-call-only feature.

**Tech Stack:** React, Tailwind CSS, lucide-react, apiClient (axios), SiteContext

---

## Key Files to Know

- `sources/insight/frontend/src/pages/Configuration/index.jsx` — Tab shell (add 3rd tab here)
- `sources/insight/frontend/src/pages/Configuration/FullClone.jsx` — Style/pattern reference
- `sources/insight/frontend/src/pages/Configuration/Cloner.module.css` — Shared CSS module
- `sources/insight/frontend/src/api/apiClient.js` — Auto-attaches `Authorization: Bearer <token>` + `X-Insight-User`
- `sources/insight/frontend/src/context/SiteContext.jsx` — Provides `sites` list and `selectedSiteId`

## Role Check Logic

The source site picker loads from `GET /api/v1/overview/sites` (same as `FullClone`). Each site has a `role` field (string). The Start button must be disabled unless the **selected source site** has `role === 'administrator'`. Use the same `getRoleBadgeInfo` pattern from `FullClone.jsx`.

## API Call Shape

```
POST /api/v1/sites/{sourceId}/siteCloning
Headers: Authorization: Bearer <token> (auto via apiClient)
Body: {
  "name": "AITC-Office - 01",
  "regulatoryDomain": "VN",
  "timezone": "Asia/Ho_Chi_Minh"
}
```

Note: `apiClient.post('/sites/${sourceId}/siteCloning', body)` — base URL is already `/api/v1`.

## Delay Helper

```js
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
```

## Stop Mechanism

Use `const stopRef = useRef(false)`. On Stop click: `stopRef.current = true`. Inside the loop: `if (stopRef.current) break;`. On Start click: `stopRef.current = false`.

## Name Padding

```js
const padded = String(i + 1).padStart(2, '0'); // "01", "02", ... "50"
const siteName = `${prefix.trim()} - ${padded}`;
```

---

### Task 1: Create `BatchProvision.jsx`

**Files:**
- Create: `sources/insight/frontend/src/pages/Configuration/BatchProvision.jsx`

**Step 1: Scaffold the component with state declarations**

```jsx
import React, { useState, useRef, useEffect } from 'react';
import apiClient from '../../api/apiClient';
import { Layers, Play, Square, AlertTriangle, CheckCircle, XCircle, ChevronRight, Globe, Clock, Hash, Tag } from 'lucide-react';

// IANA timezone options (common subset)
const TIMEZONES = [
  { value: 'Asia/Ho_Chi_Minh', label: 'Asia/Ho_Chi_Minh (UTC+7)' },
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo (UTC+9)' },
  { value: 'Asia/Singapore', label: 'Asia/Singapore (UTC+8)' },
  { value: 'Asia/Bangkok', label: 'Asia/Bangkok (UTC+7)' },
  { value: 'Asia/Seoul', label: 'Asia/Seoul (UTC+9)' },
  { value: 'Asia/Shanghai', label: 'Asia/Shanghai (UTC+8)' },
  { value: 'America/New_York', label: 'America/New_York (UTC-5)' },
  { value: 'America/Los_Angeles', label: 'America/Los_Angeles (UTC-8)' },
  { value: 'Europe/London', label: 'Europe/London (UTC+0)' },
  { value: 'Europe/Paris', label: 'Europe/Paris (UTC+1)' },
  { value: 'Australia/Sydney', label: 'Australia/Sydney (UTC+11)' },
];

const REG_DOMAINS = [
  { value: 'VN', label: 'VN — Vietnam' },
  { value: 'JP', label: 'JP — Japan' },
  { value: 'US', label: 'US — United States' },
  { value: 'SG', label: 'SG — Singapore' },
  { value: 'TH', label: 'TH — Thailand' },
  { value: 'KR', label: 'KR — South Korea' },
  { value: 'CN', label: 'CN — China' },
  { value: 'AU', label: 'AU — Australia' },
  { value: 'GB', label: 'GB — United Kingdom' },
  { value: 'DE', label: 'DE — Germany' },
];

const BatchProvision = () => {
  // --- Sites ---
  const [sites, setSites] = useState([]);
  const [selectedSourceId, setSelectedSourceId] = useState('');

  // --- Form ---
  const [prefix, setPrefix] = useState('');
  const [cloneCount, setCloneCount] = useState(5);
  const [regDomain, setRegDomain] = useState('VN');
  const [timezone, setTimezone] = useState('Asia/Ho_Chi_Minh');
  const [delayMs, setDelayMs] = useState(2000);

  // --- Execution state ---
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);  // 0..cloneCount
  const [logs, setLogs] = useState([]);           // { name, status: 'pending'|'ok'|'error', msg }
  const stopRef = useRef(false);

  useEffect(() => {
    apiClient.get('/overview/sites').then(res => {
      const list = Array.isArray(res.data) ? res.data : (res.data?.sites || []);
      setSites(list);
    }).catch(() => setSites([]));
  }, []);

  const selectedSite = sites.find(s => s.siteId === selectedSourceId);
  const siteRole = (selectedSite?.role || '').toLowerCase();
  const isAdmin = siteRole === 'administrator' || siteRole === 'admin';
  const canStart = isAdmin && prefix.trim() !== '' && selectedSourceId !== '' && !isRunning;

  // ... rest of component
};

export default BatchProvision;
```

**Step 2: Add the `getRoleBadgeInfo` helper (copy pattern from FullClone)**

```jsx
const getRoleBadgeInfo = (roleStr) => {
  const role = (roleStr || 'UNKNOWN').toLowerCase();
  switch (role) {
    case 'administrator':
    case 'admin':
      return { text: 'ADMIN', classes: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-700/50' };
    case 'operator':
    case 'op':
      return { text: 'OPERATOR', classes: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-700/50' };
    case 'viewer':
    case 'view':
      return { text: 'VIEWER', classes: 'bg-slate-200 dark:bg-slate-700/40 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-600/50' };
    default:
      return { text: role.toUpperCase(), classes: 'bg-slate-100 dark:bg-slate-800/40 text-slate-500 border-slate-200 dark:border-slate-700/50' };
  }
};
```

**Step 3: Implement the batch execution loop**

```jsx
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const handleStart = async () => {
  stopRef.current = false;
  setIsRunning(true);
  setProgress(0);

  // Pre-build log entries as 'pending'
  const initial = Array.from({ length: cloneCount }, (_, i) => {
    const padded = String(i + 1).padStart(2, '0');
    return { name: `${prefix.trim()} - ${padded}`, status: 'pending', msg: 'Waiting...' };
  });
  setLogs(initial);

  for (let i = 0; i < cloneCount; i++) {
    if (stopRef.current) {
      setLogs(prev => prev.map((l, idx) =>
        idx >= i ? { ...l, status: 'stopped', msg: 'Stopped by user' } : l
      ));
      break;
    }

    const siteName = initial[i].name;

    // Mark as in-progress
    setLogs(prev => prev.map((l, idx) =>
      idx === i ? { ...l, status: 'running', msg: 'Provisioning...' } : l
    ));

    try {
      await apiClient.post(`/sites/${selectedSourceId}/siteCloning`, {
        name: siteName,
        regulatoryDomain: regDomain,
        timezone: timezone,
      });
      setLogs(prev => prev.map((l, idx) =>
        idx === i ? { ...l, status: 'ok', msg: 'Created successfully' } : l
      ));
    } catch (err) {
      const errMsg = err.response?.data?.detail || err.message || 'Unknown error';
      setLogs(prev => prev.map((l, idx) =>
        idx === i ? { ...l, status: 'error', msg: errMsg } : l
      ));
    }

    setProgress(i + 1);

    // Apply delay between requests (skip delay after last item)
    if (i < cloneCount - 1 && !stopRef.current) {
      await delay(delayMs);
    }
  }

  setIsRunning(false);
};

const handleStop = () => {
  stopRef.current = true;
};
```

**Step 4: Build the three-panel JSX layout**

Layout: CSS Grid `grid-cols-1 lg:grid-cols-3 gap-6` inside the component's dark card wrapper.

**Panel 1 — Config Form** (col-span-1):
- Source site dropdown with role badge
- Non-admin warning banner (conditional)
- Name Prefix text input
- Number of Clones range slider + number display
- Regulatory Domain select
- Timezone select
- Execution Delay slider (500ms–5000ms, step 500)

**Panel 2 — Template Site Summary** (col-span-1):
- Shows selected site name, siteId, role badge
- Shows preview of names that will be created (first 3 + "...")
- Shows total API calls count + estimated time

**Panel 3 — Live Execution Log** (col-span-1):
- Progress bar: `width: (progress/cloneCount * 100)%`
- Status text: "N of M sites provisioned"
- Scrollable log list (max-h-72 overflow-y-auto)
- Each log row: icon (spinner / ✓ / ✗) + site name + status msg
- Start/Stop button at bottom

Full JSX for the return statement:

```jsx
return (
  <div className="relative w-full min-h-[700px] bg-slate-50 dark:bg-[#020617] text-slate-800 dark:text-slate-200 rounded-xl border border-slate-200 dark:border-gray-800 shadow-xl overflow-hidden">
    {/* Background orbs (match FullClone style) */}
    <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden rounded-xl">
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-violet-600/5 dark:bg-violet-600/10 blur-[120px] rounded-full" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-600/5 dark:bg-indigo-600/10 blur-[120px] rounded-full" />
    </div>

    <div className="relative z-10 p-8">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <div className="w-12 h-12 bg-violet-50 dark:bg-violet-500/10 rounded-xl flex items-center justify-center text-violet-500 dark:text-violet-400 border border-violet-100 dark:border-violet-500/20">
          <Layers size={24} />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">Batch Site Provisioning</h2>
          <p className="text-sm text-slate-500">Mass-produce identical site configurations with specific overrides</p>
        </div>
      </div>

      {/* Three-panel grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Panel 1: Config Form */}
        <div className="backdrop-blur-2xl bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 rounded-3xl p-6 flex flex-col gap-5 shadow-xl dark:shadow-none">
          <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400 flex items-center gap-2">
            <Tag size={14} className="text-violet-500" /> Configuration
          </h3>

          {/* Source Site Selector */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Template Site</label>
            <select
              value={selectedSourceId}
              onChange={e => setSelectedSourceId(e.target.value)}
              disabled={isRunning}
              className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-3 text-sm font-semibold text-slate-800 dark:text-white appearance-none focus:outline-none focus:border-violet-500/50 disabled:opacity-50"
            >
              <option value="">— Select template site —</option>
              {sites.map(s => (
                <option key={s.siteId} value={s.siteId} className="bg-white dark:bg-slate-900">
                  {s.siteName}
                </option>
              ))}
            </select>
            {selectedSite && (
              <div className="flex items-center gap-2 mt-1">
                <span className={`px-2 py-0.5 rounded border text-[9px] font-black uppercase tracking-widest ${getRoleBadgeInfo(selectedSite.role).classes}`}>
                  {getRoleBadgeInfo(selectedSite.role).text}
                </span>
                <span className="text-[10px] font-mono text-slate-500">{selectedSite.siteId}</span>
              </div>
            )}
          </div>

          {/* Non-admin warning */}
          {selectedSourceId && !isAdmin && (
            <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-xl">
              <AlertTriangle size={14} className="text-amber-500 shrink-0" />
              <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400">
                Batch Provisioning requires Administrator privileges on the template site.
              </span>
            </div>
          )}

          {/* Name Prefix */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Site Name Prefix</label>
            <input
              type="text"
              value={prefix}
              onChange={e => setPrefix(e.target.value)}
              disabled={isRunning}
              placeholder="e.g. AITC-Office"
              className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-3 text-sm font-semibold text-slate-800 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none focus:border-violet-500/50 disabled:opacity-50"
            />
            {prefix && (
              <span className="text-[10px] text-slate-400 font-mono">Preview: {prefix.trim()} - 01, {prefix.trim()} - 02...</span>
            )}
          </div>

          {/* Number of Clones */}
          <div className="flex flex-col gap-2">
            <div className="flex justify-between items-center">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5"><Hash size={11} /> Number of Clones</label>
              <span className="text-sm font-black text-violet-600 dark:text-violet-400">{cloneCount}</span>
            </div>
            <input
              type="range"
              min={1} max={50}
              value={cloneCount}
              onChange={e => setCloneCount(Number(e.target.value))}
              disabled={isRunning}
              className="w-full accent-violet-500 disabled:opacity-50"
            />
            <div className="flex justify-between text-[9px] text-slate-400 font-mono">
              <span>1</span><span>50</span>
            </div>
          </div>

          {/* Regulatory Domain */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5"><Globe size={11} /> Regulatory Domain</label>
            <select
              value={regDomain}
              onChange={e => setRegDomain(e.target.value)}
              disabled={isRunning}
              className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-3 text-sm font-semibold text-slate-800 dark:text-white appearance-none focus:outline-none focus:border-violet-500/50 disabled:opacity-50"
            >
              {REG_DOMAINS.map(d => <option key={d.value} value={d.value} className="bg-white dark:bg-slate-900">{d.label}</option>)}
            </select>
          </div>

          {/* Timezone */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5"><Clock size={11} /> Timezone</label>
            <select
              value={timezone}
              onChange={e => setTimezone(e.target.value)}
              disabled={isRunning}
              className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-3 text-sm font-semibold text-slate-800 dark:text-white appearance-none focus:outline-none focus:border-violet-500/50 disabled:opacity-50"
            >
              {TIMEZONES.map(z => <option key={z.value} value={z.value} className="bg-white dark:bg-slate-900">{z.label}</option>)}
            </select>
          </div>

          {/* Execution Delay */}
          <div className="flex flex-col gap-2">
            <div className="flex justify-between items-center">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Delay Between Requests</label>
              <span className="text-sm font-black text-violet-600 dark:text-violet-400">{(delayMs / 1000).toFixed(1)}s</span>
            </div>
            <input
              type="range"
              min={500} max={5000} step={500}
              value={delayMs}
              onChange={e => setDelayMs(Number(e.target.value))}
              disabled={isRunning}
              className="w-full accent-violet-500 disabled:opacity-50"
            />
            <div className="flex justify-between text-[9px] text-slate-400 font-mono">
              <span>0.5s</span><span>5.0s</span>
            </div>
          </div>
        </div>

        {/* Panel 2: Template Summary */}
        <div className="backdrop-blur-2xl bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 rounded-3xl p-6 flex flex-col gap-5 shadow-xl dark:shadow-none">
          <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400 flex items-center gap-2">
            <ChevronRight size={14} className="text-violet-500" /> Provision Summary
          </h3>

          {!selectedSourceId || !prefix.trim() ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-400 dark:text-slate-600">
              <Layers size={36} strokeWidth={1} />
              <p className="text-xs text-center">Select a template site and enter a prefix to preview the batch plan.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {/* Template site info */}
              <div className="p-4 bg-slate-50 dark:bg-black/30 border border-slate-200 dark:border-white/5 rounded-2xl">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Template Site</p>
                <p className="text-sm font-bold text-slate-800 dark:text-white">{selectedSite?.siteName}</p>
                <p className="text-[10px] font-mono text-slate-500 mt-0.5">{selectedSourceId}</p>
                {selectedSite && (
                  <span className={`inline-block mt-2 px-2 py-0.5 rounded border text-[9px] font-black uppercase tracking-widest ${getRoleBadgeInfo(selectedSite.role).classes}`}>
                    {getRoleBadgeInfo(selectedSite.role).text}
                  </span>
                )}
              </div>

              {/* Clone preview list */}
              <div className="p-4 bg-slate-50 dark:bg-black/30 border border-slate-200 dark:border-white/5 rounded-2xl">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-3">Sites to Create ({cloneCount})</p>
                <div className="space-y-1.5">
                  {Array.from({ length: Math.min(cloneCount, 4) }, (_, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-violet-400 shrink-0" />
                      <span className="text-xs font-mono text-slate-600 dark:text-slate-400">
                        {prefix.trim()} - {String(i + 1).padStart(2, '0')}
                      </span>
                    </div>
                  ))}
                  {cloneCount > 4 && (
                    <p className="text-[10px] text-slate-400 pl-3.5">+ {cloneCount - 4} more...</p>
                  )}
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-slate-50 dark:bg-black/30 border border-slate-200 dark:border-white/5 rounded-xl text-center">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">API Calls</p>
                  <p className="text-xl font-black text-violet-600 dark:text-violet-400 mt-1">{cloneCount}</p>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-black/30 border border-slate-200 dark:border-white/5 rounded-xl text-center">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Est. Time</p>
                  <p className="text-xl font-black text-violet-600 dark:text-violet-400 mt-1">
                    {Math.ceil((cloneCount * delayMs) / 1000)}s
                  </p>
                </div>
              </div>

              {/* Params summary */}
              <div className="p-4 bg-slate-50 dark:bg-black/30 border border-slate-200 dark:border-white/5 rounded-2xl space-y-2">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Parameters</p>
                {[
                  ['Domain', regDomain],
                  ['Timezone', timezone],
                  ['Delay', `${(delayMs / 1000).toFixed(1)}s`],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between items-center">
                    <span className="text-[10px] text-slate-500">{k}</span>
                    <span className="text-[10px] font-mono font-bold text-slate-700 dark:text-slate-300">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Panel 3: Live Execution Log */}
        <div className="backdrop-blur-2xl bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 rounded-3xl p-6 flex flex-col gap-4 shadow-xl dark:shadow-none">
          <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400 flex items-center gap-2">
            <Play size={14} className="text-violet-500" /> Execution Log
          </h3>

          {/* Progress Bar */}
          {logs.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold text-slate-500">
                  {isRunning ? `Cloning ${progress} of ${cloneCount}...` : progress === cloneCount ? `Completed: ${cloneCount} of ${cloneCount}` : `Stopped at ${progress} of ${cloneCount}`}
                </span>
                <span className="text-[10px] font-black text-violet-600 dark:text-violet-400">
                  {Math.round((progress / cloneCount) * 100)}%
                </span>
              </div>
              <div className="h-1.5 w-full bg-slate-200 dark:bg-white/5 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full transition-all duration-500"
                  style={{ width: `${(progress / cloneCount) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Log list */}
          <div className="flex-1 overflow-y-auto max-h-72 space-y-1.5 font-mono pr-1 custom-scrollbar">
            {logs.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-400 dark:text-slate-600 py-12">
                <Play size={28} strokeWidth={1} />
                <p className="text-xs text-center">Configure and press Start to begin provisioning.</p>
              </div>
            ) : (
              logs.map((log, idx) => (
                <div
                  key={idx}
                  className={`flex items-start gap-2.5 p-2.5 rounded-lg text-[11px] border transition-colors ${
                    log.status === 'ok' ? 'bg-emerald-50 dark:bg-emerald-500/5 border-emerald-200 dark:border-emerald-500/10' :
                    log.status === 'error' ? 'bg-rose-50 dark:bg-rose-500/5 border-rose-200 dark:border-rose-500/10' :
                    log.status === 'running' ? 'bg-violet-50 dark:bg-violet-500/5 border-violet-200 dark:border-violet-500/10 animate-pulse' :
                    log.status === 'stopped' ? 'bg-amber-50 dark:bg-amber-500/5 border-amber-200 dark:border-amber-500/10' :
                    'bg-slate-50 dark:bg-white/[0.02] border-slate-200 dark:border-white/5'
                  }`}
                >
                  <span className="shrink-0 mt-0.5">
                    {log.status === 'ok' && <CheckCircle size={12} className="text-emerald-500" />}
                    {log.status === 'error' && <XCircle size={12} className="text-rose-500" />}
                    {log.status === 'running' && <div className="w-3 h-3 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />}
                    {log.status === 'stopped' && <Square size={12} className="text-amber-500" />}
                    {log.status === 'pending' && <div className="w-3 h-3 rounded-full border border-slate-300 dark:border-slate-600" />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className={`font-bold ${
                      log.status === 'ok' ? 'text-emerald-700 dark:text-emerald-400' :
                      log.status === 'error' ? 'text-rose-700 dark:text-rose-400' :
                      log.status === 'running' ? 'text-violet-700 dark:text-violet-300' :
                      'text-slate-600 dark:text-slate-400'
                    }`}>{log.name}</span>
                    <p className="text-slate-500 dark:text-slate-500 truncate text-[10px] mt-0.5">{log.msg}</p>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Start / Stop Button */}
          <div className="mt-auto pt-2 flex gap-3">
            {!isRunning ? (
              <button
                onClick={handleStart}
                disabled={!canStart}
                className="flex-1 h-12 bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-black uppercase tracking-[0.2em] text-xs rounded-2xl shadow-[0_10px_30px_rgba(124,58,237,0.2)] dark:shadow-[0_10px_40px_rgba(124,58,237,0.3)] hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-25 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Play size={16} /> Start Batch Clone
              </button>
            ) : (
              <button
                onClick={handleStop}
                className="flex-1 h-12 bg-gradient-to-r from-rose-600 to-red-600 text-white font-black uppercase tracking-[0.2em] text-xs rounded-2xl shadow-[0_10px_30px_rgba(220,38,38,0.2)] hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                <Square size={16} /> Stop
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  </div>
);
```

**Step 5: Assemble the full file**

Combine steps 1–4 into the final `BatchProvision.jsx`. The constants (`TIMEZONES`, `REG_DOMAINS`) go at the top of the file. The helpers (`getRoleBadgeInfo`, `delay`) go inside the component or just above it. The `handleStart` and `handleStop` functions go inside the component before the `return`.

**Step 6: Verify it renders without errors**

Run the dev server: `cd sources/insight/frontend && npm run dev`
Navigate to the Configuration tab. Expect no console errors.

---

### Task 2: Update `Configuration/index.jsx`

**Files:**
- Modify: `sources/insight/frontend/src/pages/Configuration/index.jsx`

**Step 1: Add the import**

At the top of `index.jsx`, after the existing imports, add:

```jsx
import BatchProvision from './BatchProvision';
```

**Step 2: Add the Layers icon to the lucide import**

Change:
```jsx
import { Copy, Wifi } from 'lucide-react';
```
To:
```jsx
import { Copy, Wifi, Layers } from 'lucide-react';
```

**Step 3: Add the third tab button**

In the tab bar `<div>`, after the Smart Sync button, add:

```jsx
<button
  className={`flex items-center gap-2 pb-3 px-2 border-b-2 transition-colors ${activeTab === 'batch_provision'
    ? 'border-violet-500 text-violet-600 dark:text-violet-400 font-semibold'
    : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
  }`}
  onClick={() => setActiveTab('batch_provision')}
>
  <Layers size={18} />
  Batch Provision
</button>
```

**Step 4: Add the conditional render**

In the tab content `<div>`, after the SmartSync line, add:

```jsx
{activeTab === 'batch_provision' && <BatchProvision />}
```

**Step 5: Commit**

```bash
git add sources/insight/frontend/src/pages/Configuration/BatchProvision.jsx
git add sources/insight/frontend/src/pages/Configuration/index.jsx
git commit -m "feat: add Batch Site Provisioning tab to Configuration page"
```

---

## Testing Checklist

- [ ] Non-admin site selected → warning badge shows, Start button disabled
- [ ] Admin site selected, no prefix → Start button still disabled
- [ ] Valid config → Start button enables, clicking it starts the loop
- [ ] Log panel pre-fills with pending entries immediately on Start
- [ ] Each entry transitions: pending → running (pulse) → ok/error
- [ ] Progress bar updates after each request
- [ ] Stop button mid-run → remaining entries become 'stopped', loop exits
- [ ] Delay between requests visible (timer in Summary panel)
- [ ] API call body includes `name`, `regulatoryDomain`, `timezone`
- [ ] No network calls made until Start is clicked (stateless, no DB writes)
