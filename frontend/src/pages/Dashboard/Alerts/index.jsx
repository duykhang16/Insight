import React, { useState, useEffect, useMemo } from 'react';
import { Bell, AlertCircle, CheckCircle2, User, Clock, Filter } from 'lucide-react';
import apiClient from '../../../api/apiClient';
import { useSite } from '../../../context/SiteContext';
import { useSettings } from '../../../context/SettingsContext';
import useIntervalFetch from '../../../hooks/useIntervalFetch';
import SyncIndicator from '../../../components/SyncIndicator';

// --- Constants ---
const ALERT_TYPE_MAP = {
    'watchlistEntityDown': 'Client Offline',
    'siteDown': 'Site Connection Lost',
    'apDown': 'Access Point Down',
    'switchDown': 'Switch Down',
    'apRadioDown': 'Radio Interface Down',
    'clientRoam': 'Client Roaming',
    'rogue': 'Rogue AP Detected',
    'interference': 'RF Interference',
};

// --- Helpers ---
const getAlertLabel = (type) => ALERT_TYPE_MAP[type] || type || 'Unknown Alert';

const formatTimestamp = (unixSec) => {
    if (!unixSec) return '—';
    const d = new Date(unixSec * 1000);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
};

const formatDuration = (totalSeconds) => {
    if (!totalSeconds && totalSeconds !== 0) return '—';
    const s = Math.abs(totalSeconds);
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    const days = Math.floor(s / 86400);
    const hrs = Math.floor((s % 86400) / 3600);
    return hrs > 0 ? `${days}d ${hrs}h ago` : `${days} days ago`;
};

const getClientName = (alert) =>
    alert.alertTypeProperties?.clientName ||
    alert.alertTypeProperties?.deviceName ||
    alert.alertTypeProperties?.apName ||
    null;

// --- Sub-components ---
const StatusDot = ({ isActive }) => (
    isActive ? (
        <span className="relative flex h-3 w-3 mt-0.5 flex-shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-500 opacity-60" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500" />
        </span>
    ) : (
        <CheckCircle2 size={14} className="text-slate-500 flex-shrink-0 mt-0.5" />
    )
);

const SeverityBadge = ({ severity }) => {
    const s = severity?.toLowerCase();
    if (s === 'major') return (
        <span className="px-2 py-0.5 text-[9px] font-black tracking-widest uppercase rounded bg-rose-500/20 text-rose-400 border border-rose-500/30">
            MAJOR
        </span>
    );
    if (s === 'minor') return (
        <span className="px-2 py-0.5 text-[9px] font-black tracking-widest uppercase rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
            MINOR
        </span>
    );
    return (
        <span className="px-2 py-0.5 text-[9px] font-black tracking-widest uppercase rounded bg-slate-700 text-slate-400 border border-white/5">
            {severity || 'INFO'}
        </span>
    );
};

const FilterChip = ({ label, active, onClick }) => (
    <button
        onClick={onClick}
        className={`h-9 px-4 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${active
                ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-500/20'
                : 'bg-slate-900 border-white/5 text-slate-400 hover:text-white hover:border-white/20'
            }`}
    >
        {label}
    </button>
);

// --- Main Component ---
const Alerts = () => {
    const [rawAlerts, setRawAlerts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [error, setError] = useState('');
    const [lastUpdated, setLastUpdated] = useState(null);

    // Filters
    const [severityFilter, setSeverityFilter] = useState('all');   // 'all' | 'major' | 'minor'
    const [statusFilter, setStatusFilter] = useState('all');   // 'all' | 'active' | 'cleared'

    const { selectedSiteId, sites, fetchSites } = useSite();
    const { isAutoRefreshEnabled } = useSettings();

    const selectedSite = sites.find(s => s.siteId === selectedSiteId);

    useEffect(() => {
        if (sites.length === 0) fetchSites();
    }, []);

    useEffect(() => {
        if (selectedSiteId) fetchAlerts();
    }, [selectedSiteId]);

    const fetchAlerts = async (silent = false) => {
        if (!selectedSiteId) return;
        if (!silent) setLoading(true);
        else setIsRefreshing(true);
        setError('');
        try {
            const res = await apiClient.get(`/overview/sites/${selectedSiteId}/alerts`);
            console.log('[Alerts] Raw response:', res.data);

            // Aruba returns { elements: [...] } or a bare array
            const elements = Array.isArray(res.data)
                ? res.data
                : (res.data?.elements || res.data?.alerts || []);

            console.log(`[Alerts] Parsed ${elements.length} alerts for site ${selectedSiteId}`);
            setRawAlerts(elements);
            setLastUpdated(new Date());
        } catch (err) {
            console.error('[Alerts] Fetch error:', err);
            if (!silent) setError('Failed to synchronize alert data.');
        } finally {
            if (!silent) setLoading(false);
            else setIsRefreshing(false);
        }
    };

    // 60s auto-poll
    useIntervalFetch(() => {
        if (selectedSiteId && !loading) fetchAlerts(true);
    }, isAutoRefreshEnabled ? 60000 : null, [selectedSiteId, loading, isAutoRefreshEnabled]);

    // Apply UI filters
    const displayAlerts = useMemo(() => {
        let result = [...rawAlerts];
        if (severityFilter !== 'all')
            result = result.filter(a => a.severity?.toLowerCase() === severityFilter);
        if (statusFilter === 'active')
            result = result.filter(a => a.clearedTime == null);
        if (statusFilter === 'cleared')
            result = result.filter(a => a.clearedTime != null);
        // Sort: active first, then by raisedTime desc
        result.sort((a, b) => {
            const aActive = a.clearedTime == null ? 1 : 0;
            const bActive = b.clearedTime == null ? 1 : 0;
            if (bActive !== aActive) return bActive - aActive;
            return (b.raisedTime || 0) - (a.raisedTime || 0);
        });
        return result;
    }, [rawAlerts, severityFilter, statusFilter]);

    const activeCount = rawAlerts.filter(a => a.clearedTime == null).length;
    const majorCount = rawAlerts.filter(a => a.severity?.toLowerCase() === 'major').length;

    return (
        <div className="p-8 pb-32 font-sans overflow-hidden bg-slate-950 min-h-screen">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                <div>
                    <h1 className="text-2xl font-black text-white tracking-tight italic uppercase">Alerts</h1>
                    <p className="text-sm text-slate-400 mt-1">
                        Event monitoring for {selectedSite?.siteName || 'current site'}
                    </p>
                </div>
                <div className="flex items-center gap-4">
                    <SyncIndicator isSyncing={loading || isRefreshing} lastUpdated={lastUpdated} />
                </div>
            </div>

            {/* Stats Row */}
            <div className="flex flex-wrap gap-3 mb-6">
                <div className="bg-slate-900 border border-white/5 rounded-2xl h-14 px-5 flex items-center gap-3 shadow-xl">
                    <Bell size={16} className="text-indigo-400" />
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        {rawAlerts.length} Total
                    </span>
                </div>
                <div className="bg-slate-900 border border-white/5 rounded-2xl h-14 px-5 flex items-center gap-3 shadow-xl">
                    <span className="relative flex h-2.5 w-2.5">
                        {activeCount > 0 && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-500 opacity-60" />}
                        <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${activeCount > 0 ? 'bg-rose-500' : 'bg-slate-600'}`} />
                    </span>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        {activeCount} Active
                    </span>
                </div>
                <div className="bg-slate-900 border border-white/5 rounded-2xl h-14 px-5 flex items-center gap-3 shadow-xl">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500/70 flex-shrink-0" />
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        {majorCount} Major
                    </span>
                </div>
            </div>

            {/* Filter Toolbar */}
            <div className="flex flex-wrap items-center gap-3 mb-6">
                <div className="flex items-center gap-2">
                    <Filter size={14} className="text-slate-500" />
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Severity</span>
                </div>
                <FilterChip label="All" active={severityFilter === 'all'} onClick={() => setSeverityFilter('all')} />
                <FilterChip label="Major" active={severityFilter === 'major'} onClick={() => setSeverityFilter('major')} />
                <FilterChip label="Minor" active={severityFilter === 'minor'} onClick={() => setSeverityFilter('minor')} />

                <div className="w-px h-6 bg-white/10 mx-2" />

                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Status</span>
                </div>
                <FilterChip label="All" active={statusFilter === 'all'} onClick={() => setStatusFilter('all')} />
                <FilterChip label="Active" active={statusFilter === 'active'} onClick={() => setStatusFilter('active')} />
                <FilterChip label="Cleared" active={statusFilter === 'cleared'} onClick={() => setStatusFilter('cleared')} />
            </div>

            {/* Error */}
            {error && (
                <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-center gap-3 text-rose-400">
                    <AlertCircle size={20} />
                    <span className="text-sm font-bold">{error}</span>
                </div>
            )}

            {/* Table */}
            <div className="bg-slate-900 rounded-[2.5rem] shadow-2xl border border-white/5 overflow-hidden w-full">
                <div className="max-h-[calc(100vh-300px)] overflow-auto custom-scrollbar">
                    <table className="w-full min-w-[900px] text-left text-sm whitespace-nowrap">
                        <thead className="text-slate-500 border-b border-white/5 sticky top-0 z-10 bg-slate-900">
                            <tr>
                                <th className="px-6 py-5 font-black uppercase tracking-widest text-[10px] w-10" />
                                <th className="px-6 py-5 font-black uppercase tracking-widest text-[10px]">Alert</th>
                                <th className="px-6 py-5 font-black uppercase tracking-widest text-[10px]">Severity</th>
                                <th className="px-6 py-5 font-black uppercase tracking-widest text-[10px]">Target</th>
                                <th className="px-6 py-5 font-black uppercase tracking-widest text-[10px]">Time Raised</th>
                                <th className="px-6 py-5 font-black uppercase tracking-widest text-[10px]">Duration</th>
                                <th className="px-6 py-5 font-black uppercase tracking-widest text-[10px]">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 text-slate-300">
                            {/* Skeleton rows while loading */}
                            {loading && Array.from({ length: 5 }).map((_, i) => (
                                <tr key={`skel-${i}`} className="animate-pulse">
                                    <td className="px-6 py-4"><div className="w-3 h-3 rounded-full bg-slate-700 mx-auto" /></td>
                                    <td className="px-6 py-4"><div className="h-3 bg-slate-800 rounded w-48" /></td>
                                    <td className="px-6 py-4"><div className="h-4 bg-slate-800 rounded w-16" /></td>
                                    <td className="px-6 py-4"><div className="h-3 bg-slate-800 rounded w-32" /></td>
                                    <td className="px-6 py-4"><div className="h-3 bg-slate-800 rounded w-36" /></td>
                                    <td className="px-6 py-4"><div className="h-3 bg-slate-800 rounded w-20" /></td>
                                    <td className="px-6 py-4"><div className="h-4 bg-slate-800 rounded w-20" /></td>
                                </tr>
                            ))}

                            {/* Alert rows */}
                            {!loading && displayAlerts.map((alert) => {
                                const isActive = alert.clearedTime == null;
                                const clientName = getClientName(alert);
                                return (
                                    <tr
                                        key={alert.id || alert.raisedTime}
                                        className={`transition-colors hover:bg-white/[0.02] ${isActive ? 'border-l-2 border-rose-500/50' : ''}`}
                                    >
                                        {/* Status dot */}
                                        <td className="px-6 py-4">
                                            <div className="flex justify-center">
                                                <StatusDot isActive={isActive} />
                                            </div>
                                        </td>

                                        {/* Alert description */}
                                        <td className="px-6 py-4">
                                            <p className="font-bold text-white text-sm">
                                                {getAlertLabel(alert.type)}
                                            </p>
                                            {alert.description && (
                                                <p className="text-[11px] text-slate-500 mt-0.5 font-mono">
                                                    {alert.description}
                                                </p>
                                            )}
                                        </td>

                                        {/* Severity */}
                                        <td className="px-6 py-4">
                                            <SeverityBadge severity={alert.severity} />
                                        </td>

                                        {/* Target device/client */}
                                        <td className="px-6 py-4">
                                            {clientName ? (
                                                <div className="flex items-center gap-2">
                                                    <User size={12} className="text-slate-500 flex-shrink-0" />
                                                    <span className="text-slate-300 font-mono text-xs">{clientName}</span>
                                                </div>
                                            ) : (
                                                <span className="text-slate-600">—</span>
                                            )}
                                        </td>

                                        {/* Time raised */}
                                        <td className="px-6 py-4">
                                            <span className="text-slate-400 font-mono text-xs">
                                                {formatTimestamp(alert.raisedTime)}
                                            </span>
                                        </td>

                                        {/* Duration since raised */}
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-1.5 text-slate-400 text-xs">
                                                <Clock size={11} className="text-slate-600" />
                                                {formatDuration(alert.numberOfSecondsSinceRaised)}
                                            </div>
                                        </td>

                                        {/* Status label */}
                                        <td className="px-6 py-4">
                                            {isActive ? (
                                                <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-rose-400">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                                                    Active
                                                </span>
                                            ) : (
                                                <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500">
                                                    <CheckCircle2 size={11} />
                                                    Cleared
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}

                            {/* Empty state */}
                            {!loading && displayAlerts.length === 0 && (
                                <tr>
                                    <td colSpan="7" className="px-6 py-24 text-center text-slate-500">
                                        <div className="flex flex-col items-center">
                                            <div className="p-6 bg-slate-800 rounded-3xl mb-6 opacity-20">
                                                <Bell size={64} className="text-slate-400" />
                                            </div>
                                            <p className="text-xl font-black text-slate-700 uppercase tracking-[0.2em]">No Alerts</p>
                                            <p className="text-xs text-slate-600 mt-3 font-bold uppercase tracking-widest">
                                                {rawAlerts.length > 0
                                                    ? 'Adjust filters to see results'
                                                    : 'All systems operational'}
                                            </p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default Alerts;
