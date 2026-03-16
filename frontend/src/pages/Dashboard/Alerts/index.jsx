import React, { useState, useEffect, useMemo } from 'react';
import { Bell, AlertCircle, CheckCircle2, User, Clock, Filter } from 'lucide-react';
import apiClient from '../../../api/apiClient';
import { useSite } from '../../../context/SiteContext';
import { useSettings } from '../../../context/SettingsContext';
import useIntervalFetch from '../../../hooks/useIntervalFetch';
import { useLanguage } from '../../../context/LanguageContext';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

// --- Helpers ---
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

const getClientName = (alert) => alert.target || null;

// --- Sub-components ---
const StatusDot = ({ isActive }) => (
    isActive ? (
        <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-500 opacity-60" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500" />
        </span>
    ) : (
        <CheckCircle2 size={13} className="text-slate-500 shrink-0" />
    )
);

const SeverityBadge = ({ severity }) => {
    const s = severity?.toLowerCase();
    if (s === 'major') return (
        <span className="px-2 py-0.5 text-[9px] font-bold tracking-wider uppercase rounded bg-rose-500/20 text-rose-400 border border-rose-500/30">
            MAJOR
        </span>
    );
    if (s === 'minor') return (
        <span className="px-2 py-0.5 text-[9px] font-bold tracking-wider uppercase rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
            MINOR
        </span>
    );
    return (
        <span className="px-2 py-0.5 text-[9px] font-bold tracking-wider uppercase rounded bg-slate-700 text-slate-400 border border-white/5">
            {severity || 'INFO'}
        </span>
    );
};

const FilterChip = ({ label, active, onClick }) => (
    <button
        onClick={onClick}
        className={`h-8 px-3 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border ${
            active
                ? 'bg-indigo-600 border-indigo-500 th-text-primary shadow-lg shadow-indigo-500/20'
                : 'th-bg-surface border-white/5 text-slate-400 hover:th-text-primary hover:border-white/20'
        }`}
    >
        {label}
    </button>
);

// --- Main Component ---
const Alerts = () => {
    const { t } = useLanguage();
    const [rawAlerts, setRawAlerts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [error, setError] = useState('');
    const [lastUpdated, setLastUpdated] = useState(null);
    const [severityFilter, setSeverityFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');

    const { selectedSiteId, sites, fetchSites } = useSite();
    const { isAutoRefreshEnabled } = useSettings();
    const selectedSite = sites.find(s => s.siteId === selectedSiteId);

    const ALERT_TYPE_MAP = {
        'watchlistEntityDown': t('site.alerts.alert_type_watchlist_entity_down'),
        'siteDown': t('site.alerts.alert_type_site_down'),
        'apDown': t('site.alerts.alert_type_ap_down'),
        'switchDown': t('site.alerts.alert_type_switch_down'),
        'apRadioDown': t('site.alerts.alert_type_ap_radio_down'),
        'clientRoam': t('site.alerts.alert_type_client_roam'),
        'rogue': t('site.alerts.alert_type_rogue'),
        'interference': t('site.alerts.alert_type_interference'),
    };
    const getAlertLabel = (type) => ALERT_TYPE_MAP[type] || type || 'Unknown Alert';

    useEffect(() => { if (sites.length === 0) fetchSites(); }, []);
    useEffect(() => { if (selectedSiteId) fetchAlerts(); }, [selectedSiteId]);

    const fetchAlerts = async (silent = false) => {
        if (!selectedSiteId) return;
        if (!silent) setLoading(true);
        else setIsRefreshing(true);
        setError('');
        try {
            const res = await apiClient.get(`/overview/sites/${selectedSiteId}/alerts`);
            setRawAlerts(Array.isArray(res.data) ? res.data : []);
            setLastUpdated(new Date());
        } catch (err) {
            console.error('[Alerts] Fetch error:', err);
            if (!silent) setError(t('site.alerts.error_fetch'));
        } finally {
            if (!silent) setLoading(false);
            else setIsRefreshing(false);
        }
    };

    useIntervalFetch(() => {
        if (selectedSiteId && !loading) fetchAlerts(true);
    }, isAutoRefreshEnabled ? 60000 : null, [selectedSiteId, loading, isAutoRefreshEnabled]);

    const displayAlerts = useMemo(() => {
        let result = [...rawAlerts];
        if (severityFilter !== 'all') result = result.filter(a => a.severity?.toLowerCase() === severityFilter);
        if (statusFilter === 'active') result = result.filter(a => a.clearedTime == null);
        if (statusFilter === 'cleared') result = result.filter(a => a.clearedTime != null);
        return result;
    }, [rawAlerts, severityFilter, statusFilter]);

    const activeCount = rawAlerts.filter(a => a.clearedTime == null).length;
    const majorCount = rawAlerts.filter(a => a.severity?.toLowerCase() === 'major').length;

    // ── Mobile card ──
    const renderCard = (alert) => {
        const isActive = alert.clearedTime == null;
        const clientName = getClientName(alert);

        return (
            <div key={alert.id || alert.raisedTime} className={`th-bg-surface border th-border rounded-xl p-4 space-y-3 ${isActive ? 'border-l-2 border-l-rose-500/50' : ''}`}>
                {/* Top: status + severity */}
                <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                        <StatusDot isActive={isActive} />
                        <div className="min-w-0">
                            <p className="font-bold th-text-primary text-sm truncate">{getAlertLabel(alert.type)}</p>
                            {alert.description && (
                                <p className="text-[10px] text-slate-500 font-mono truncate mt-0.5">{alert.description}</p>
                            )}
                        </div>
                    </div>
                    <SeverityBadge severity={alert.severity} />
                </div>

                {/* Details grid */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                    <div>
                        <span className="text-[10px] text-slate-500 uppercase tracking-wider">{t('site.alerts.table_header_target')}</span>
                        <div className="flex items-center gap-1">
                            {clientName ? (
                                <>
                                    <User size={10} className="text-slate-500" />
                                    <span className="th-text-secondary font-mono text-[11px] truncate">{clientName}</span>
                                </>
                            ) : <span className="text-slate-600">—</span>}
                        </div>
                    </div>
                    <div>
                        <span className="text-[10px] text-slate-500 uppercase tracking-wider">{t('site.alerts.table_header_status')}</span>
                        {isActive ? (
                            <div className="flex items-center gap-1 text-[10px] font-bold uppercase text-rose-400">
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                                {t('site.alerts.alert_status_active')}
                            </div>
                        ) : (
                            <div className="flex items-center gap-1 text-[10px] font-bold uppercase text-slate-500">
                                <CheckCircle2 size={10} />
                                {t('site.alerts.alert_status_cleared')}
                            </div>
                        )}
                    </div>
                    <div>
                        <span className="text-[10px] text-slate-500 uppercase tracking-wider">{t('site.alerts.table_header_time_raised')}</span>
                        <div className="text-slate-400 font-mono text-[11px]">{formatTimestamp(alert.raisedTime)}</div>
                    </div>
                    <div>
                        <span className="text-[10px] text-slate-500 uppercase tracking-wider">{t('site.alerts.table_header_duration')}</span>
                        <div className="flex items-center gap-1 text-slate-400 text-[11px]">
                            <Clock size={10} className="text-slate-600" />
                            {formatDuration(alert.secondsSinceRaised)}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="p-4 md:p-8 pb-32 font-sans overflow-hidden th-bg-base min-h-screen">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-3">
                <div>
                    <h1 className="text-xl font-black th-text-primary tracking-tight italic uppercase">{t('site.alerts.title')}</h1>
                    <p className="text-sm text-slate-400 mt-0.5">
                        {t('site.alerts.subtitle')} {selectedSite?.siteName || 'current site'}
                    </p>
                </div>
            </div>

            {/* Stats Row */}
            <div className="flex flex-wrap gap-2 mb-5">
                <div className="th-bg-surface border border-white/5 rounded-xl h-11 px-4 flex items-center gap-2 shadow-lg">
                    <Bell size={14} className="text-indigo-400" />
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        {rawAlerts.length} {t('site.alerts.stats_total_label')}
                    </span>
                </div>
                <div className="th-bg-surface border border-white/5 rounded-xl h-11 px-4 flex items-center gap-2 shadow-lg">
                    <span className="relative flex h-2 w-2">
                        {activeCount > 0 && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-500 opacity-60" />}
                        <span className={`relative inline-flex rounded-full h-2 w-2 ${activeCount > 0 ? 'bg-rose-500' : 'bg-slate-600'}`} />
                    </span>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        {activeCount} {t('site.alerts.stats_active_label')}
                    </span>
                </div>
                <div className="th-bg-surface border border-white/5 rounded-xl h-11 px-4 flex items-center gap-2 shadow-lg">
                    <span className="w-2 h-2 rounded-full bg-rose-500/70 shrink-0" />
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        {majorCount} {t('site.alerts.stats_major_label')}
                    </span>
                </div>
            </div>

            {/* Filter Toolbar */}
            <div className="flex flex-wrap items-center gap-2 mb-5">
                <div className="flex items-center gap-1.5">
                    <Filter size={12} className="text-slate-500" />
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t('site.alerts.filter_severity_label')}</span>
                </div>
                <FilterChip label={t('site.alerts.filter_all')} active={severityFilter === 'all'} onClick={() => setSeverityFilter('all')} />
                <FilterChip label={t('site.alerts.filter_major')} active={severityFilter === 'major'} onClick={() => setSeverityFilter('major')} />
                <FilterChip label={t('site.alerts.filter_minor')} active={severityFilter === 'minor'} onClick={() => setSeverityFilter('minor')} />

                <div className="w-px h-5 bg-white/10 mx-1 hidden sm:block" />

                <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t('site.alerts.filter_status_label')}</span>
                </div>
                <FilterChip label={t('site.alerts.filter_all')} active={statusFilter === 'all'} onClick={() => setStatusFilter('all')} />
                <FilterChip label={t('site.alerts.filter_active')} active={statusFilter === 'active'} onClick={() => setStatusFilter('active')} />
                <FilterChip label={t('site.alerts.filter_cleared')} active={statusFilter === 'cleared'} onClick={() => setStatusFilter('cleared')} />
            </div>

            {error && (
                <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-3 text-rose-400">
                    <AlertCircle size={16} />
                    <span className="text-sm font-medium">{error}</span>
                </div>
            )}

            {/* Loading */}
            {loading && (
                <div className="flex items-center justify-center py-16">
                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500" />
                </div>
            )}

            {/* Mobile cards */}
            {!loading && (
                <div className="md:hidden space-y-3">
                    {displayAlerts.length === 0 ? (
                        <div className="text-center py-12">
                            <Bell size={40} className="mx-auto mb-3 opacity-10" />
                            <p className="text-sm font-bold text-slate-600 uppercase tracking-wider">{t('site.alerts.empty_state_title')}</p>
                            <p className="text-xs text-slate-600 mt-1">
                                {rawAlerts.length > 0 ? t('site.alerts.empty_state_filters') : t('site.alerts.empty_state_operational')}
                            </p>
                        </div>
                    ) : displayAlerts.map(alert => renderCard(alert))}
                </div>
            )}

            {/* Desktop table */}
            {!loading && (
                <div className="hidden md:block">
                    <div className="th-bg-surface rounded-xl border border-white/5 overflow-hidden shadow-xl">
                        <div className="max-h-[calc(100vh-300px)] overflow-auto custom-scrollbar">
                            <Table>
                                <TableHeader className="table-header-sticky">
                                    <TableRow className="th-bg-surface-alt hover:bg-transparent border-b border-white/5">
                                        <TableHead className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 w-10" />
                                        <TableHead className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">{t('site.alerts.table_header_alert')}</TableHead>
                                        <TableHead className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">{t('site.alerts.table_header_severity')}</TableHead>
                                        <TableHead className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">{t('site.alerts.table_header_target')}</TableHead>
                                        <TableHead className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">{t('site.alerts.table_header_time_raised')}</TableHead>
                                        <TableHead className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">{t('site.alerts.table_header_duration')}</TableHead>
                                        <TableHead className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">{t('site.alerts.table_header_status')}</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {displayAlerts.map((alert) => {
                                        const isActive = alert.clearedTime == null;
                                        const clientName = getClientName(alert);
                                        return (
                                            <TableRow
                                                key={alert.id || alert.raisedTime}
                                                className={`transition-colors ${isActive ? 'border-l-2 border-l-rose-500/50' : ''}`}
                                            >
                                                <TableCell className="px-4 py-3">
                                                    <div className="flex justify-center"><StatusDot isActive={isActive} /></div>
                                                </TableCell>
                                                <TableCell className="px-4 py-3">
                                                    <p className="font-bold th-text-primary text-sm">{getAlertLabel(alert.type)}</p>
                                                    {alert.description && <p className="text-[10px] text-slate-500 mt-0.5 font-mono">{alert.description}</p>}
                                                </TableCell>
                                                <TableCell className="px-4 py-3"><SeverityBadge severity={alert.severity} /></TableCell>
                                                <TableCell className="px-4 py-3">
                                                    {clientName ? (
                                                        <div className="flex items-center gap-1.5">
                                                            <User size={11} className="text-slate-500 shrink-0" />
                                                            <span className="th-text-secondary font-mono text-xs">{clientName}</span>
                                                        </div>
                                                    ) : <span className="text-slate-600">—</span>}
                                                </TableCell>
                                                <TableCell className="px-4 py-3 text-slate-400 font-mono text-xs">{formatTimestamp(alert.raisedTime)}</TableCell>
                                                <TableCell className="px-4 py-3">
                                                    <div className="flex items-center gap-1 text-slate-400 text-xs">
                                                        <Clock size={10} className="text-slate-600" />
                                                        {formatDuration(alert.secondsSinceRaised)}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="px-4 py-3">
                                                    {isActive ? (
                                                        <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-rose-400">
                                                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                                                            {t('site.alerts.alert_status_active')}
                                                        </span>
                                                    ) : (
                                                        <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                                            <CheckCircle2 size={10} />
                                                            {t('site.alerts.alert_status_cleared')}
                                                        </span>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}

                                    {displayAlerts.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={7} className="px-6 py-16 text-center text-slate-500">
                                                <Bell size={40} className="mx-auto mb-3 opacity-10" />
                                                <p className="text-sm font-bold text-slate-600 uppercase tracking-wider">{t('site.alerts.empty_state_title')}</p>
                                                <p className="text-xs text-slate-600 mt-2">
                                                    {rawAlerts.length > 0 ? t('site.alerts.empty_state_filters') : t('site.alerts.empty_state_operational')}
                                                </p>
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Alerts;
