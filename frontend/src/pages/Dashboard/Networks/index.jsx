import React, { useState, useMemo, useEffect } from 'react';
<<<<<<< HEAD
import { useNavigate } from 'react-router-dom';
import { AlertCircle, Plus, Search, Network, Wifi, Users } from 'lucide-react';
=======
import { AlertCircle, Search, Network, Wifi, Users } from 'lucide-react';
>>>>>>> parent of 30b1732 (Delete frontend directory)
import apiClient from '../../../api/apiClient';
import { useSite } from '../../../context/SiteContext';
// processNetworks removed — BE now returns pre-mapped data
import NetworkTable from './NetworkTable';
import WirelessTable from './WirelessTable';
import useIntervalFetch from '../../../hooks/useIntervalFetch';
import { useSettings } from '../../../context/SettingsContext';
import { useLanguage } from '../../../context/LanguageContext';

<<<<<<< HEAD
const buildInitialConfigurationNetwork = (network, networkKind) => {
    if (!network || !networkKind) {
        return null;
    }

    const displayName = network.name || network.networkName || `VLAN ${network.vlanId ?? '—'}`;
    const usage = network.usage || network.type || 'employee';
    const state = network.isEnabled === false ? 'Disabled' : 'Active';

    if (networkKind === 'wired') {
        return {
            id: String(network.id || ''),
            networkKind: 'wired',
            displayName,
            label: `${displayName} · Wired`,
            networkName: displayName,
            isEnabled: network.isEnabled !== false,
            health: network.health || 'good',
            state,
            usage,
            vlanId: network.vlanId ?? '',
            isIgmpSnoopingEnabled: true,
            isDhcpArpProtectionEnabled: false,
            isNetworkDestinationsRestricted: false,
        };
    }

    const band = String(network.band || '').toLowerCase();

    return {
        id: String(network.id || ''),
        networkKind: 'wireless',
        displayName,
        label: `${displayName} · Wireless`,
        networkName: displayName,
        isEnabled: network.isEnabled !== false,
        health: network.health || 'good',
        state,
        usage,
        authentication: 'psk',
        security: String(network.security || 'wpa3').toLowerCase(),
        wiredNetworkId: '',
        ipAddressingMode: 'internal',
        dhcpScope: {},
        isAvailableOn24GHzRadioBand: band.includes('2.4'),
        isAvailableOn5GHzRadioBand: band.includes('5'),
        isAvailableOn6GHzRadioBand: band.includes('6'),
        isLegacy80211bRatesEnabled: false,
        isSsidHidden: false,
        preSharedKey: '',
    };
};

const Networks = () => {
    const { t } = useLanguage();
    const navigate = useNavigate();
=======
const Networks = () => {
    const { t } = useLanguage();
>>>>>>> parent of 30b1732 (Delete frontend directory)
    const [beResponse, setBeResponse] = useState({ wired: [], wireless: [], stats: {} });
    const [loading, setLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [error, setError] = useState('');
    const [lastUpdated, setLastUpdated] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeTab, setActiveTab] = useState('all'); // 'all' | 'wireless' | 'wired'
    const [wiredSort, setWiredSort] = useState({ key: 'vlan', direction: 'asc' });

    const { selectedSiteId, sites, fetchSites } = useSite();
    const { isAutoRefreshEnabled } = useSettings();

<<<<<<< HEAD
    const handleNetworkSelect = (networkId, networkKind) => {
        if (!selectedSiteId || !networkId) return;

        const sourceRows = networkKind === 'wired' ? wiredRows : wirelessRows;
        const clickedNetwork = sourceRows.find((network) => String(network.id) === String(networkId)) || null;
        const initialNetwork = buildInitialConfigurationNetwork(clickedNetwork, networkKind);
        const searchParams = new URLSearchParams();
        searchParams.set('networkId', String(networkId));
        if (networkKind) {
            searchParams.set('networkKey', `${networkKind}:${networkId}`);
        }
        navigate(`/site/${selectedSiteId}/configuration/overview?${searchParams.toString()}`, {
            state: initialNetwork ? { initialNetwork } : null,
        });
    };

=======
>>>>>>> parent of 30b1732 (Delete frontend directory)
    useEffect(() => {
        if (sites.length === 0) fetchSites();
    }, []);

    useEffect(() => {
        setBeResponse({ wired: [], wireless: [], stats: {} });
        if (selectedSiteId) fetchNetworks(selectedSiteId);
    }, [selectedSiteId]);

    const fetchNetworks = async (siteId, silent = false) => {
        if (!siteId) return;
        if (!silent) setLoading(true);
        else setIsRefreshing(true);
        setError('');
        try {
            const res = await apiClient.get(`/overview/sites/${siteId}/wiredNetworks`);
            // BE returns { wired: [...], wireless: [...], stats: {...} }
            setBeResponse(res.data || { wired: [], wireless: [], stats: {} });
            setLastUpdated(new Date());
        } catch (err) {
            console.error('Networks fetch error:', err);
            if (!silent) setError(t('site.networks.error_fetch'));
        } finally {
            if (!silent) setLoading(false);
            else setIsRefreshing(false);
        }
    };

    // 30s silent polling
    useIntervalFetch(() => {
        if (selectedSiteId && !loading) fetchNetworks(selectedSiteId, true);
    }, isAutoRefreshEnabled ? 30000 : null, [selectedSiteId, loading, isAutoRefreshEnabled]);

    // Split into wired / wireless — apply search on both
    const { wiredRows, wirelessRows } = useMemo(() => {
        const q = searchTerm.toLowerCase();
        const filterFn = (n) => !q || (n.name || '').toLowerCase().includes(q) || String(n.vlanId).includes(q);
        return {
            wiredRows:    (beResponse.wired || []).filter(filterFn),
            wirelessRows: (beResponse.wireless || []).filter(filterFn),
        };
    }, [beResponse, searchTerm]);

    // Legacy shape needed by NetworkTable/NetworkRow
    const wiredForTable = useMemo(() =>
        wiredRows.map(r => ({
            id:           r.id,
            name:         r.name,
            vlanId:       r.vlanId,
            type:         r.usage,
            isEnabled:    r.isEnabled,
            health:       r.health,
            totalClients: r.clients,
            ssids:        r.ssids || [],
        })),
    [wiredRows]);

    // Stats from BE — no client-side counting needed
    const stats = beResponse.stats || {};
    const totalClients        = stats.totalClients || 0;
    const wiredCount          = stats.wiredCount || 0;
    const wirelessCount       = stats.wirelessCount || 0;
    const wiredActiveCount    = stats.wiredActive || 0;
    const wirelessActiveCount = stats.wirelessActive || 0;
    const wiredInactiveCount  = stats.wiredInactive || 0;
    const wirelessInactiveCount = stats.wirelessInactive || 0;

    return (
        <div className="p-8 pb-32 font-sans overflow-hidden th-bg-base min-h-screen">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                <div>
                    <h1 className="text-2xl font-black th-text-primary tracking-tight italic uppercase">{t('site.networks.title')}</h1>
                    <p className="text-sm text-slate-400 mt-1">
                        {t('site.networks.subtitle')} {sites.find(s => s.siteId === selectedSiteId)?.siteName || 'current site'}
                    </p>
                </div>
            </div>

            {/* Stats Row */}
            <div className="flex flex-wrap gap-3 mb-6">
                {/* Wired pill */}
                <div className="th-bg-surface border border-white/5 rounded-2xl h-14 px-5 flex items-center gap-3 shadow-xl">
                    <Network size={15} className="text-amber-400 shrink-0" />
                    <div className="flex flex-col leading-none gap-0.5">
                        <span className="text-[9px] font-black text-amber-400 uppercase tracking-widest">{t('site.networks.stats_wired_label')}</span>
                        <span className="text-[10px] font-black th-text-secondary">
                            <span className="text-emerald-400">{wiredActiveCount} {t('site.networks.stats_wired_on')}</span>
                            <span className="text-slate-600 mx-1">/</span>
                            <span className="text-slate-500">{wiredInactiveCount} {t('site.networks.stats_wired_off')}</span>
                            <span className="text-slate-600 ml-1">· {wiredCount} {t('site.networks.stats_wired_total')}</span>
                        </span>
                    </div>
                </div>
                {/* Wireless pill */}
                <div className="th-bg-surface border border-white/5 rounded-2xl h-14 px-5 flex items-center gap-3 shadow-xl">
                    <Wifi size={15} className="text-blue-400 shrink-0" />
                    <div className="flex flex-col leading-none gap-0.5">
                        <span className="text-[9px] font-black text-blue-400 uppercase tracking-widest">{t('site.networks.stats_wireless_label')}</span>
                        <span className="text-[10px] font-black th-text-secondary">
                            <span className="text-emerald-400">{wirelessActiveCount} {t('site.networks.stats_wireless_on')}</span>
                            <span className="text-slate-600 mx-1">/</span>
                            <span className="text-slate-500">{wirelessInactiveCount} {t('site.networks.stats_wireless_off')}</span>
                            <span className="text-slate-600 ml-1">· {wirelessCount} {t('site.networks.stats_wireless_total')}</span>
                        </span>
                    </div>
                </div>
                {/* Clients pill */}
                <div className="th-bg-surface border border-white/5 rounded-2xl h-14 px-5 flex items-center gap-3 shadow-xl">
                    <Users size={15} className="text-slate-500 shrink-0" />
                    <div className="flex flex-col leading-none gap-0.5">
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{t('site.networks.stats_clients_label')}</span>
                        <span className="text-[10px] font-black th-text-secondary">{totalClients} {t('site.networks.stats_clients_connected')}</span>
                    </div>
                </div>
            </div>

            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-4 mb-6">
                <div className="relative flex-1 min-w-[280px]">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                    <input
                        type="text"
                        placeholder={t('site.networks.search_placeholder')}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full h-14 pl-12 pr-4 th-bg-surface border border-white/5 rounded-2xl th-text-primary text-sm focus:outline-none focus:border-indigo-500/50 shadow-inner transition-all hover:th-bg-surface-alt"
                    />
                </div>

                {/* Tabs */}
                <div className="flex items-center gap-1 th-bg-surface border border-white/5 rounded-2xl p-1 shadow-xl">
                    {[
                        { value: 'all',      label: t('site.networks.tab_all') },
                        { value: 'wireless', label: t('site.networks.tab_wireless') },
                        { value: 'wired',    label: t('site.networks.tab_wired') },
                    ].map(tab => (
                        <button
                            key={tab.value}
                            onClick={() => setActiveTab(tab.value)}
                            className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                                activeTab === tab.value
                                    ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                                    : 'text-slate-500 hover:th-text-secondary border border-transparent'
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
<<<<<<< HEAD

                {/* Create Network button */}
                <button
                    type="button"
                    onClick={() => navigate(`/site/${selectedSiteId}/configuration/create-network`)}
                    className="inline-flex h-14 items-center gap-2 rounded-2xl bg-emerald-500 px-5 text-xs font-black uppercase tracking-wider text-slate-950 shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_8px_24px_rgba(16,185,129,0.35)] transition-all hover:bg-emerald-400 active:scale-[0.97]"
                >
                    <Plus size={16} strokeWidth={3} />
                    Create
                </button>
=======
>>>>>>> parent of 30b1732 (Delete frontend directory)
            </div>

            {error && (
                <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-center gap-3 text-rose-400">
                    <AlertCircle size={20} />
                    <span className="text-sm font-bold">{error}</span>
                </div>
            )}

            {/* Wireless section */}
            {(activeTab === 'all' || activeTab === 'wireless') && (
                <div className="mb-8">
                    {activeTab === 'all' && (
                        <h2 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-3 px-1 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
                            {t('site.networks.section_wireless_title')}
                            <span className="text-slate-700 normal-case font-bold tracking-normal">— {wirelessRows.length} SSIDs</span>
                        </h2>
                    )}
<<<<<<< HEAD
                    <WirelessTable
                        data={wirelessRows}
                        loading={loading}
                        onNetworkSelect={(networkId) => handleNetworkSelect(networkId, 'wireless')}
                    />
=======
                    <WirelessTable data={wirelessRows} loading={loading} />
>>>>>>> parent of 30b1732 (Delete frontend directory)
                </div>
            )}

            {/* Wired section */}
            {(activeTab === 'all' || activeTab === 'wired') && (
                <div>
                    {activeTab === 'all' && (
                        <h2 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-3 px-1 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
                            {t('site.networks.section_wired_title')}
                            <span className="text-slate-700 normal-case font-bold tracking-normal">— {wiredRows.length} VLANs</span>
                        </h2>
                    )}
                    <NetworkTable
                        data={wiredForTable}
                        sortConfig={wiredSort}
                        onSort={(key) => setWiredSort(prev => ({
                            key,
                            direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
                        }))}
                        loading={loading}
<<<<<<< HEAD
                        onNetworkSelect={(networkId) => handleNetworkSelect(networkId, 'wired')}
=======
>>>>>>> parent of 30b1732 (Delete frontend directory)
                    />
                </div>
            )}
        </div>
    );
};

export default Networks;
