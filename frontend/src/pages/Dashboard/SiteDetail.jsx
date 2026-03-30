import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
<<<<<<< HEAD
import { Bell, BellDot, X } from 'lucide-react';
import { Heartbeat, Users, WifiHigh, Monitor, WarningCircle } from '@phosphor-icons/react';
=======
import { Activity, Bell, BellDot, Users, Wifi, Monitor, AlertCircle, X } from 'lucide-react';
>>>>>>> parent of 30b1732 (Delete frontend directory)
import apiClient from '../../api/apiClient';
import { useSite } from '../../context/SiteContext';
import useIntervalFetch from '../../hooks/useIntervalFetch';
import { useSettings } from '../../context/SettingsContext';
import { useLanguage } from '../../context/LanguageContext';
import ApplicationSummaryCard from './Applications/ApplicationSummaryCard';

const HEALTH_BADGE_CLS = {
    good: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    warning: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    poor: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
    up: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    down: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
};

const SiteDetail = () => {
    const { siteId } = useParams();
    const navigate = useNavigate();
    const { t } = useLanguage();
    const { isAutoRefreshEnabled } = useSettings();
    const { sites, setSelectedSiteId, fetchSites, siteCache, updateSiteCache } = useSite();

    const [data, setData] = useState(null);
    const [siteInfo, setSiteInfo] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [error, setError] = useState('');
    const [lastUpdated, setLastUpdated] = useState(null);

    // Alert notification state
    const [alertNotif, setAlertNotif] = useState({ unread: 0, total_recent: 0, hours: 24 });
    const [notifOpen, setNotifOpen] = useState(false);
    const notifRef = useRef(null);


    // Make sure sites are loaded (needed for site name fallback)
    useEffect(() => {
        if (sites.length === 0) fetchSites();
    }, []);

    const site = sites.find(s => (s.siteId || s.id || s._id) === siteId);
    const siteName = siteInfo?.name || site?.siteName || site?.name || siteId;

    // Parallel fetch: site info (header) + dashboard metrics (cards)
    const fetchAll = async (silent = false) => {
        // Use preloaded data if available and fresh (< 60s)
        const cached = siteCache[siteId];
        if (cached && !silent && Date.now() - cached.timestamp < 60000) {
            if (cached.info) setSiteInfo(cached.info);
            if (cached.dashboard) setData(cached.dashboard);
            setLoading(false);
            setLastUpdated(new Date(cached.timestamp));
            return;
        }

        if (!silent) setLoading(true);
        else setIsRefreshing(true);
        setError('');
        try {
            const [infoRes, dashRes] = await Promise.all([
                apiClient.get(`/overview/sites/${siteId}`),
                apiClient.get(`/overview/sites/${siteId}/dashboard`),
            ]);
            setSiteInfo(infoRes.data);
            setData(dashRes.data);
            setLastUpdated(new Date());

            // Update cache with fresh data
            updateSiteCache(siteId, {
                info: infoRes.data,
                dashboard: dashRes.data
            });
        } catch (err) {
            console.error('Fetch error:', err);
            if (!silent) setError(t('dashboard.error_fetch'));
        } finally {
            if (!silent) setLoading(false);
            else setIsRefreshing(false);
        }
    };

    useEffect(() => {
        if (siteId) fetchAll();
    }, [siteId]);

    useIntervalFetch(() => {
        if (siteId && !loading) fetchAll(true);
    }, isAutoRefreshEnabled ? 60000 : null, [siteId, loading, isAutoRefreshEnabled]);

    // Fetch alert notification on mount
    useEffect(() => {
        if (!siteId) return;
        apiClient.get(`/overview/sites/${siteId}/alert-notification?hours=24`)
            .then(res => setAlertNotif(res.data || { unread: 0, total_recent: 0, hours: 24 }))
            .catch(() => {});
    }, [siteId]);

    // Close notification dropdown on click outside
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (notifRef.current && !notifRef.current.contains(e.target)) {
                setNotifOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleBellClick = async () => {
        if (alertNotif.unread > 0) {
            // Mark as read
            await apiClient.post(`/overview/sites/${siteId}/alert-notification/read`).catch(() => {});
            setAlertNotif(prev => ({ ...prev, unread: 0 }));
        }
        setNotifOpen(prev => !prev);
    };

    // ── BE now returns flat schema — no nested Aruba paths needed ──
    const healthScore = data?.healthScore ?? 'N/A';
    const activeAlerts = data?.alerts?.total || 0;
    const connectedClients = data?.clients?.total || 0;
    const activeNetworks = data?.networks?.total || 0;
    const onlineDevices = data?.devices?.online || 0;

    // Sub-metric derivations — direct from BE flat schema
    const majorAlerts = data?.alerts?.major || 0;
    const minorAlerts = data?.alerts?.minor || 0;
    const infoAlerts = data?.alerts?.info || 0;

    const goodClients = data?.clients?.good || 0;
    const fairClients = data?.clients?.fair || 0;
    const poorClients = data?.clients?.poor || 0;
    const wiredClients = data?.clients?.wired || 0;
    const wirelessClients = data?.clients?.wireless || 0;

    const inactiveNetworks = data?.networks?.inactive || 0;
    const activeNetworkCount = data?.networks?.active || 0;

    const offlineDevices = data?.devices?.offline || 0;

    const healthConditions = data?.healthConditions || 0;


    const cards = [
        {
            key: 'health',
            label: t('site.dashboard.card_health_label'),
<<<<<<< HEAD
            icon: <Heartbeat className="text-emerald-500" size={24} weight="duotone" />,
=======
            icon: <Activity className="text-emerald-500" size={24} />,
>>>>>>> parent of 30b1732 (Delete frontend directory)
            value: healthScore,
            sub: data ? `Conditions: ${healthConditions}` : '',
            route: `/site/${siteId}/health`,
            displayValue: (loading && !data) ? '...' : (typeof healthScore === 'number' ? `${Math.round(healthScore)}%` : healthScore)
        },
        {
            key: 'alerts',
            label: t('site.dashboard.card_alerts_label'),
            icon: <Bell className="text-rose-500" size={24} />,
            value: activeAlerts,
            sub: data ? `Major: ${majorAlerts} / Minor: ${minorAlerts} / Info: ${infoAlerts}` : '',
            route: `/site/${siteId}/alerts`,
        },
        {
            key: 'clients',
            label: t('site.dashboard.card_clients_label'),
<<<<<<< HEAD
            icon: <Users className="text-blue-500" size={24} weight="duotone" />,
=======
            icon: <Users className="text-blue-500" size={24} />,
>>>>>>> parent of 30b1732 (Delete frontend directory)
            value: connectedClients,
            sub: data ? `Good: ${goodClients} / Fair: ${fairClients} / Poor: ${poorClients}` : '',
            route: `/site/${siteId}/clients`,
        },
        {
            key: 'networks',
            label: t('site.dashboard.card_networks_label'),
<<<<<<< HEAD
            icon: <WifiHigh className="text-indigo-500" size={24} weight="duotone" />,
=======
            icon: <Wifi className="text-indigo-500" size={24} />,
>>>>>>> parent of 30b1732 (Delete frontend directory)
            value: activeNetworks,
            sub: data ? `Active: ${activeNetworkCount} / Inactive: ${inactiveNetworks}` : '',
            route: `/site/${siteId}/networks`,
        },
        {
            key: 'devices',
            label: t('site.dashboard.card_devices_label'),
<<<<<<< HEAD
            icon: <Monitor className="text-purple-500" size={24} weight="duotone" />,
=======
            icon: <Monitor className="text-purple-500" size={24} />,
>>>>>>> parent of 30b1732 (Delete frontend directory)
            value: onlineDevices,
            sub: data ? `Online: ${onlineDevices} / Offline: ${offlineDevices}` : '',
            route: `/site/${siteId}/devices`,
        },
    ];

    const HEALTH_BADGE_LABEL = {
        good: t('site.dashboard.health_badge_good'),
        warning: t('site.dashboard.health_badge_warning'),
        poor: t('site.dashboard.health_badge_poor'),
        up: t('site.dashboard.health_badge_up'),
        down: t('site.dashboard.health_badge_down'),
    };
    // Derived health status from numeric score for consistency
    const numericScore = typeof healthScore === 'number' ? healthScore : (site?.healthScore ? site.healthScore : null);
    
    let healthKey = null;
    if (numericScore !== null) {
        // Have actual health score → show health-based badge
        if (numericScore >= 67) healthKey = 'good';
        else if (numericScore >= 34) healthKey = 'warning';
        else healthKey = 'poor';
    } else {
        // No health score → show connection status badge (up/down)
        const connStatus = siteInfo?.status || site?.status;
        if (connStatus === 'up' || connStatus === 'down') {
            healthKey = connStatus;
        }
    }

    const badge = healthKey && HEALTH_BADGE_CLS[healthKey]
        ? { label: HEALTH_BADGE_LABEL[healthKey], cls: HEALTH_BADGE_CLS[healthKey] }
        : null;

    return (
        <div className="p-8 pb-32">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                <div>
                    <div className="flex items-center gap-3">
                        <h1 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight">
                            {siteName}
                        </h1>
                        {badge && (
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${badge.cls}`}>
                                {badge.label}
                            </span>
                        )}

                        {/* Alert Notification Bell */}
                        <div className="relative" ref={notifRef}>
                            <button
                                onClick={handleBellClick}
                                className="relative p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                title={`${alertNotif.total_recent} alerts in last ${alertNotif.hours}h`}
                            >
                                {alertNotif.unread > 0 ? (
                                    <BellDot size={20} className="text-rose-400 animate-[pulse_2s_ease-in-out_infinite]" />
                                ) : (
                                    <Bell size={20} className="text-slate-400 dark:text-slate-500" />
                                )}
                                {alertNotif.unread > 0 && (
                                    <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center bg-rose-500 text-white text-[10px] font-black rounded-full px-1 shadow-lg shadow-rose-500/30 animate-bounce">
                                        {alertNotif.unread}
                                    </span>
                                )}
                            </button>

                            {/* Dropdown */}
                            {notifOpen && (
                                <div className="absolute top-full left-0 mt-2 w-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden">
                                    <div className="px-4 py-3 border-b border-slate-100 dark:border-white/5 flex items-center justify-between">
                                        <h3 className="text-sm font-bold text-slate-700 dark:text-white">Alert Notifications</h3>
                                        <button onClick={() => setNotifOpen(false)} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                                            <X size={14} className="text-slate-400" />
                                        </button>
                                    </div>
                                    <div className="p-4">
                                        {alertNotif.total_recent > 0 ? (
                                            <div className="flex items-start gap-3">
                                                <div className="p-2 bg-rose-500/10 rounded-lg shrink-0">
                                                    <Bell size={16} className="text-rose-400" />
                                                </div>
                                                <div>
                                                    <p className="text-sm font-bold text-slate-700 dark:text-white">
                                                        {alertNotif.total_recent} alert{alertNotif.total_recent !== 1 ? 's' : ''} in last {alertNotif.hours}h
                                                    </p>
                                                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                                        All caught up — marked as read
                                                    </p>
                                                    <button
                                                        onClick={() => { setNotifOpen(false); navigate(`/site/${siteId}/alerts`); }}
                                                        className="text-xs text-blue-500 hover:text-blue-400 font-bold mt-2 transition-colors"
                                                    >
                                                        View all alerts →
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="text-center py-3">
                                                <Bell size={24} className="text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                                                <p className="text-sm text-slate-500 dark:text-slate-400">No alerts in last {alertNotif.hours}h</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                        {t('site.dashboard.subtitle')}
                    </p>
                </div>
            </div>

            {error && (
                <div className="mb-6 p-4 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-xl flex items-center gap-3 text-rose-600 dark:text-rose-400">
<<<<<<< HEAD
                    <WarningCircle size={20} weight="duotone" />
=======
                    <AlertCircle size={20} />
>>>>>>> parent of 30b1732 (Delete frontend directory)
                    <span className="text-sm font-bold">{error}</span>
                </div>
            )}

            {/* Metric cards — each clickable */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-6">
                {cards.map(card => (
                    <div
                        key={card.key}
                        onClick={() => navigate(card.route)}
                        className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-xl border border-slate-100 dark:border-white/5 relative overflow-hidden group hover:border-blue-500/40 dark:hover:border-blue-500/40 hover:shadow-blue-500/10 transition-all cursor-pointer h-full flex flex-col justify-between"
                    >
                        <div className="absolute -right-6 -top-6 opacity-5 group-hover:opacity-10 group-hover:scale-110 transition-all duration-500">
                            {card.icon}
                        </div>
                        <div className="flex items-center gap-4 mb-4">
                            <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-white/5 shadow-inner">
                                {card.icon}
                            </div>
                            <h2 className="text-sm font-bold text-slate-500 dark:text-slate-400">
                                {card.label}
                            </h2>
                        </div>
                        <div className="mt-2 flex items-baseline gap-2">
                            <span className="text-4xl font-black text-slate-800 dark:text-white tracking-tighter transition-all">
                                {card.displayValue || (loading && !data ? '...' : card.value)}
                            </span>
                        </div>
                        {card.sub && (
                            card.key === 'clients' ? (
                                <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1.5 font-medium tracking-wide flex flex-col gap-1">
                                    <div className="flex items-center gap-1">
                                        <span onClick={(e) => { e.stopPropagation(); navigate(`/site/${siteId}/clients?type=wired`); }} className="hover:text-emerald-500 transition-colors cursor-pointer">Wired: {wiredClients}</span> /
                                        <span onClick={(e) => { e.stopPropagation(); navigate(`/site/${siteId}/clients?type=wireless`); }} className="hover:text-blue-500 transition-colors cursor-pointer ml-1">Wireless: {wirelessClients}</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <span onClick={(e) => { e.stopPropagation(); navigate(`/site/${siteId}/clients?health=good`); }} className="hover:text-emerald-500 transition-colors cursor-pointer">Good: {goodClients}</span> /
                                        <span onClick={(e) => { e.stopPropagation(); navigate(`/site/${siteId}/clients?health=fair`); }} className="hover:text-amber-500 transition-colors cursor-pointer ml-1">Fair: {fairClients}</span> /
                                        <span onClick={(e) => { e.stopPropagation(); navigate(`/site/${siteId}/clients?health=poor`); }} className="hover:text-rose-500 transition-colors cursor-pointer ml-1">Poor: {poorClients}</span>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 font-medium tracking-wide">
                                    {card.sub}
                                </div>
                            )
                        )}
                    </div>
                ))}
            </div>

            {/* Application Summary */}
            <div className="w-full">
                <ApplicationSummaryCard dashboardData={data} loading={loading} />
            </div>
        </div>
    );
};

export default SiteDetail;
