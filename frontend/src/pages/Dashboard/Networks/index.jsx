import React, { useState, useMemo, useEffect } from 'react';
import { AlertCircle, Search, Network, Wifi, Users } from 'lucide-react';
import apiClient from '../../../api/apiClient';
import { useSite } from '../../../context/SiteContext';
import { processNetworks } from './dataProcessor';
import NetworkTable from './NetworkTable';
import WirelessTable from './WirelessTable';
import useIntervalFetch from '../../../hooks/useIntervalFetch';
import { useSettings } from '../../../context/SettingsContext';
import SyncIndicator from '../../../components/SyncIndicator';

const Networks = () => {
    const [networksData, setNetworksData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [error, setError] = useState('');
    const [lastUpdated, setLastUpdated] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeTab, setActiveTab] = useState('all'); // 'all' | 'wireless' | 'wired'
    const [wiredSort, setWiredSort] = useState({ key: 'vlan', direction: 'asc' });

    const { selectedSiteId, sites, fetchSites } = useSite();
    const { isAutoRefreshEnabled } = useSettings();

    useEffect(() => {
        if (sites.length === 0) fetchSites();
    }, []);

    useEffect(() => {
        setNetworksData([]);
        if (selectedSiteId) fetchNetworks(selectedSiteId);
    }, [selectedSiteId]);

    const fetchNetworks = async (siteId, silent = false) => {
        if (!siteId) return;
        if (!silent) setLoading(true);
        else setIsRefreshing(true);
        setError('');
        try {
            const res = await apiClient.get(`/overview/sites/${siteId}/wiredNetworks`);
            setNetworksData(processNetworks(res.data));
            setLastUpdated(new Date());
        } catch (err) {
            console.error('Networks fetch error:', err);
            if (!silent) setError('Failed to synchronize network configurations.');
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
        const all = networksData.filter(n =>
            !q || n.name.toLowerCase().includes(q) || String(n.vlanId).includes(q)
        );
        return {
            wiredRows:    all.filter(n => n.rowType === 'wired'),
            wirelessRows: all.filter(n => n.rowType === 'wireless'),
        };
    }, [networksData, searchTerm]);

    // Legacy shape needed by NetworkTable/NetworkRow (expects ssids[] etc.)
    // NetworkTable receives wiredRows directly; it was designed for the old shape.
    // We pass wiredRows as-is — NetworkTable only uses: id, name, vlanId, type→usage,
    // isEnabled, health, totalClients, ssids[]. Map here.
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

    // Total clients = wired rows only (wired.clients already includes wireless SSID clients)
    const totalClients        = networksData.filter(n => n.rowType === 'wired').reduce((s, n) => s + n.clients, 0);
    const wiredAll            = networksData.filter(n => n.rowType === 'wired');
    const wirelessAll         = networksData.filter(n => n.rowType === 'wireless');
    const wiredCount          = wiredAll.length;
    const wirelessCount       = wirelessAll.length;
    const wiredActiveCount    = wiredAll.filter(n => n.isEnabled).length;
    const wirelessActiveCount = wirelessAll.filter(n => n.isEnabled).length;
    const wiredInactiveCount  = wiredCount - wiredActiveCount;
    const wirelessInactiveCount = wirelessCount - wirelessActiveCount;

    return (
        <div className="p-8 pb-32 font-sans overflow-hidden bg-slate-950 min-h-screen">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                <div>
                    <h1 className="text-2xl font-black text-white tracking-tight italic uppercase">Networks</h1>
                    <p className="text-sm text-slate-400 mt-1">
                        Wired &amp; wireless topology for {sites.find(s => s.siteId === selectedSiteId)?.siteName || 'current site'}
                    </p>
                </div>
                <SyncIndicator isSyncing={loading || isRefreshing} lastUpdated={lastUpdated} />
            </div>

            {/* Stats Row */}
            <div className="flex flex-wrap gap-3 mb-6">
                {/* Wired pill */}
                <div className="bg-slate-900 border border-white/5 rounded-2xl h-14 px-5 flex items-center gap-3 shadow-xl">
                    <Network size={15} className="text-amber-400 shrink-0" />
                    <div className="flex flex-col leading-none gap-0.5">
                        <span className="text-[9px] font-black text-amber-400 uppercase tracking-widest">Wired</span>
                        <span className="text-[10px] font-black text-slate-300">
                            <span className="text-emerald-400">{wiredActiveCount} on</span>
                            <span className="text-slate-600 mx-1">/</span>
                            <span className="text-slate-500">{wiredInactiveCount} off</span>
                            <span className="text-slate-600 ml-1">· {wiredCount} total</span>
                        </span>
                    </div>
                </div>
                {/* Wireless pill */}
                <div className="bg-slate-900 border border-white/5 rounded-2xl h-14 px-5 flex items-center gap-3 shadow-xl">
                    <Wifi size={15} className="text-blue-400 shrink-0" />
                    <div className="flex flex-col leading-none gap-0.5">
                        <span className="text-[9px] font-black text-blue-400 uppercase tracking-widest">Wireless</span>
                        <span className="text-[10px] font-black text-slate-300">
                            <span className="text-emerald-400">{wirelessActiveCount} on</span>
                            <span className="text-slate-600 mx-1">/</span>
                            <span className="text-slate-500">{wirelessInactiveCount} off</span>
                            <span className="text-slate-600 ml-1">· {wirelessCount} total</span>
                        </span>
                    </div>
                </div>
                {/* Clients pill */}
                <div className="bg-slate-900 border border-white/5 rounded-2xl h-14 px-5 flex items-center gap-3 shadow-xl">
                    <Users size={15} className="text-slate-500 shrink-0" />
                    <div className="flex flex-col leading-none gap-0.5">
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Clients</span>
                        <span className="text-[10px] font-black text-slate-300">{totalClients} connected</span>
                    </div>
                </div>
            </div>

            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-4 mb-6">
                <div className="relative flex-1 min-w-[280px]">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                    <input
                        type="text"
                        placeholder="Search network name or VLAN..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full h-14 pl-12 pr-4 bg-slate-900 border border-white/5 rounded-2xl text-white text-sm focus:outline-none focus:border-indigo-500/50 shadow-inner transition-all hover:bg-slate-800/50"
                    />
                </div>

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
                            Wireless Networks
                            <span className="text-slate-700 normal-case font-bold tracking-normal">— {wirelessRows.length} SSIDs</span>
                        </h2>
                    )}
                    <WirelessTable data={wirelessRows} loading={loading} />
                </div>
            )}

            {/* Wired section */}
            {(activeTab === 'all' || activeTab === 'wired') && (
                <div>
                    {activeTab === 'all' && (
                        <h2 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-3 px-1 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
                            Wired Networks
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
                    />
                </div>
            )}
        </div>
    );
};

export default Networks;
