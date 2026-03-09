import React, { useState, useEffect, useMemo } from 'react';
import { Users, Search, RefreshCw, AlertCircle, Smartphone, Laptop, Monitor, Globe, Wifi, Circle, Radio, ArrowDown, ArrowUp, Database } from 'lucide-react';
import apiClient, { formatBytes } from '../../../api/apiClient';
import { useSite } from '../../../context/SiteContext';
import { useSettings } from '../../../context/SettingsContext';
import useIntervalFetch from '../../../hooks/useIntervalFetch';
import SyncIndicator from '../../../components/SyncIndicator';

const Clients = () => {
    const [clients, setClients] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [lastUpdated, setLastUpdated] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [typeFilter, setTypeFilter] = useState('all');
    const [healthFilter, setHealthFilter] = useState('all');
    const [sortConfig, setSortConfig] = useState({ key: 'client', direction: 'asc' });

    const { selectedSiteId, sites, fetchSites } = useSite();
    const { isAutoRefreshEnabled } = useSettings();

    useEffect(() => {
        if (sites.length === 0) {
            fetchSites();
        }
    }, []);

    useEffect(() => {
        if (selectedSiteId) {
            fetchClients(selectedSiteId);
        }
    }, [selectedSiteId]);

    const fetchClients = async (siteId, silent = false) => {
        if (!silent) setLoading(true);
        setError('');
        try {
            let res;
            const endpoints = [
                `/overview/sites/${siteId}/clientSummary`,
                `/overview/sites/${siteId}/clientsSummary`,
                `/overview/sites/${siteId}/clients`,
                `/overview/sites/${siteId}/clients`,
                `/overview/sites/${siteId}/dashboard`
            ];

            for (const url of endpoints) {
                try {
                    const tempRes = await apiClient.get(url);
                    if (tempRes.data && (Array.isArray(tempRes.data) || tempRes.data.elements || tempRes.data.clients || (tempRes.data.clientsOverview && tempRes.data.clientsOverview.clients))) {
                        res = tempRes;
                        break;
                    }
                } catch (e) {
                    if (e.response?.status !== 401) console.warn(`Failed endpoint: ${url}`);
                }
            }

            if (!res) throw new Error("Could not find clients endpoint or no data available.");

            const data = res.data;
            let extracted = [];
            if (Array.isArray(data)) extracted = data;
            else if (data.elements) extracted = data.elements;
            else if (data.clients) extracted = data.clients;
            else if (data.clientsOverview?.clients) extracted = data.clientsOverview.clients;

            setClients(extracted);
            setLastUpdated(new Date());
        } catch (err) {
            console.error("Clients fetch error:", err);
            if (err.response?.status !== 401 && !silent) {
                setError("Failed to fetch client list. Ensure you are logged in.");
            }
        } finally {
            if (!silent) setLoading(false);
        }
    };

    useIntervalFetch(() => {
        if (selectedSiteId && !loading) {
            fetchClients(selectedSiteId, true);
        }
    }, isAutoRefreshEnabled ? 60000 : null, [selectedSiteId, loading, isAutoRefreshEnabled]);

    const formatDuration = (seconds) => {
        if (!seconds || seconds < 0) return '0 min';
        const days = Math.floor(seconds / (24 * 3600));
        const hours = Math.floor((seconds % (24 * 3600)) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);

        let parts = [];
        if (days > 0) parts.push(`${days} day${days > 1 ? 's' : ''}`);
        if (hours > 0) parts.push(`${hours} hour${hours > 1 ? 's' : ''}`);
        if (days === 0 && hours === 0 && minutes >= 0) parts.push(`${minutes} minute${minutes !== 1 ? 's' : ''}`);
        else if (minutes > 0 && parts.length < 2) parts.push(`${minutes} minute${minutes !== 1 ? 's' : ''}`);

        return parts.slice(0, 2).join(' ') || '0 min';
    };

    const formatInterface = (client) => {
        const isWired = client.clientType === 'wired';
        if (isWired) {
            const port = client.connectedToPorts?.[0]?.portNumber;
            return port ? `(Port ${port})` : 'Wired';
        }
        if (client.wirelessBand) {
            return client.wirelessBand.toLowerCase().replace('ghz', ' GHz');
        }
        return '-';
    };

    const getHealthColor = (health) => {
        const h = (health || "").toLowerCase();
        if (h === 'good') return 'bg-emerald-500';
        if (h === 'fair') return 'bg-amber-500';
        if (h === 'poor') return 'bg-rose-500';
        return 'bg-slate-500';
    };

    const getHealthTextClass = (health) => {
        const h = (health || "").toLowerCase();
        if (h === 'good') return 'text-emerald-500';
        if (h === 'fair') return 'text-amber-500';
        if (h === 'poor') return 'text-rose-500';
        return 'text-slate-500';
    };

    const handleSort = (key) => {
        setSortConfig(prev => ({
            key,
            direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const processedClients = useMemo(() => {
        let result = [...(clients || [])];

        // Multi-filter
        result = result.filter(c => {
            if (!c) return false;

            const matchesSearch =
                (c.name || c.hostName || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
                (c.macAddress || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
                (c.ipAddress || c.reservedIpAddress || "").toString().includes(searchTerm);

            const matchesType = typeFilter === 'all' || c.clientType === typeFilter;

            const matchesHealth = healthFilter === 'all' || (c.health || "").toLowerCase() === healthFilter;

            return matchesSearch && matchesType && matchesHealth;
        });

        // Sorting
        result.sort((a, b) => {
            let valA, valB;
            switch (sortConfig.key) {
                case 'client':
                    valA = (a.name || a.hostName || a.macAddress || "").toLowerCase();
                    valB = (b.name || b.hostName || b.macAddress || "").toLowerCase();
                    break;
                case 'health':
                    const priority = { good: 3, fair: 2, poor: 1, '': 0 };
                    valA = priority[(a.health || "").toLowerCase()] ?? 0;
                    valB = priority[(b.health || "").toLowerCase()] ?? 0;
                    break;
                case 'duration':
                    valA = a.connectionDurationInSeconds || 0;
                    valB = b.connectionDurationInSeconds || 0;
                    break;
                case 'usage':
                    valA = a.downstreamDataTransferredInBytes || 0;
                    valB = b.downstreamDataTransferredInBytes || 0;
                    break;
                default:
                    return 0;
            }

            if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
            if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });

        return result;
    }, [clients, searchTerm, typeFilter, healthFilter, sortConfig]);

    const SortIcon = ({ column }) => {
        if (sortConfig.key !== column) return <ArrowDown size={12} className="opacity-20 ml-1 inline" />;
        return sortConfig.direction === 'asc' ?
            <ArrowUp size={12} className="text-blue-500 ml-1 inline" /> :
            <ArrowDown size={12} className="text-blue-500 ml-1 inline" />;
    };

    return (
        <div className="p-8 pb-32 min-h-screen bg-slate-950">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                <div>
                    <h1 className="text-2xl font-black text-white tracking-tight">Connected Clients</h1>
                    <p className="text-sm text-slate-400 mt-1">
                        Active sessions at {sites.find(s => s.siteId === selectedSiteId)?.siteName || 'current site'}
                    </p>
                </div>

                <div className="flex items-center gap-4 w-full md:w-auto">
                    <SyncIndicator isSyncing={loading} lastUpdated={lastUpdated} />
                </div>
            </div>

            {/* Filter Toolbar */}
            <div className="flex flex-wrap items-center gap-4 mb-6">
                <div className="relative flex-1 min-w-[300px]">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                    <input
                        type="text"
                        placeholder="Search by name, MAC, or IP address..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full h-14 pl-12 pr-4 bg-slate-900 border border-white/5 rounded-2xl text-white text-sm focus:outline-none focus:border-blue-500/50 shadow-inner"
                    />
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-black uppercase text-slate-500 ml-1 tracking-widest">Type</label>
                        <select
                            value={typeFilter}
                            onChange={(e) => setTypeFilter(e.target.value)}
                            className="h-14 bg-slate-900 border border-white/5 rounded-2xl px-5 text-white text-sm font-bold focus:outline-none focus:border-blue-500/50 min-w-[140px] appearance-none"
                        >
                            <option value="all">All Types</option>
                            <option value="wired">Wired</option>
                            <option value="wireless">Wireless</option>
                        </select>
                    </div>

                    <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-black uppercase text-slate-500 ml-1 tracking-widest">Health</label>
                        <select
                            value={healthFilter}
                            onChange={(e) => setHealthFilter(e.target.value)}
                            className="h-14 bg-slate-900 border border-white/5 rounded-2xl px-5 text-white text-sm font-bold focus:outline-none focus:border-blue-500/50 min-w-[140px] appearance-none"
                        >
                            <option value="all">All Health</option>
                            <option value="good">Good</option>
                            <option value="fair">Fair</option>
                            <option value="poor">Poor</option>
                        </select>
                    </div>
                </div>
            </div>

            {error && (
                <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-3 text-rose-400">
                    <AlertCircle size={20} />
                    <span className="text-sm font-bold">{error}</span>
                </div>
            )}

            <div className="bg-slate-900 rounded-3xl shadow-2xl border border-white/5 overflow-hidden w-full">
                <div className="max-h-[calc(100vh-250px)] overflow-auto custom-scrollbar">
                    <table className="w-full min-w-[1200px] text-left text-sm whitespace-nowrap block md:table">
                        <thead className="bg-slate-900/50 text-slate-500 border-b border-white/5 table-header-sticky">
                            <tr>
                                <th onClick={() => handleSort('client')} className="px-6 py-5 font-black uppercase tracking-widest text-[10px] cursor-pointer hover:text-white transition-colors group table-col-sticky table-header-sticky resizable-col min-w-[250px]">
                                    Client <SortIcon column="client" />
                                </th>
                                <th onClick={() => handleSort('health')} className="px-6 py-5 font-black uppercase tracking-widest text-[10px] cursor-pointer hover:text-white transition-colors group resizable-col min-w-[100px]">
                                    Health <SortIcon column="health" />
                                </th>
                                <th className="px-6 py-5 font-black uppercase tracking-widest text-[10px] resizable-col min-w-[100px]">State</th>
                                <th onClick={() => handleSort('duration')} className="px-6 py-5 font-black uppercase tracking-widest text-[10px] cursor-pointer hover:text-white transition-colors group text-right resizable-col min-w-[100px]">
                                    Duration <SortIcon column="duration" />
                                </th>
                                <th className="px-6 py-5 font-black uppercase tracking-widest text-[10px] resizable-col min-w-[150px]">Network & Interface</th>
                                <th className="px-6 py-5 font-black uppercase tracking-widest text-[10px] resizable-col min-w-[100px]">Type</th>
                                <th className="px-6 py-5 font-black uppercase tracking-widest text-[10px] resizable-col min-w-[150px]">Addressing</th>
                                <th onClick={() => handleSort('usage')} className="px-6 py-5 font-black uppercase tracking-widest text-[10px] cursor-pointer hover:text-white transition-colors group text-right resizable-col min-w-[120px]">
                                    Usage <SortIcon column="usage" />
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 text-slate-300">
                            {processedClients.map((client) => {
                                const isWired = client.clientType === 'wired';
                                const clientName = client.name || client.hostName || client.macAddress;
                                const isUp = (client.status || "").toLowerCase() === 'up';

                                // Network Mapping logic
                                const networkDisplay = isWired
                                    ? (client.accessedWiredNetworks?.[0]?.networkName || `VLAN ${client.vlanId || '-'}`)
                                    : (client.wirelessNetworkName || '-');

                                return (
                                    <tr key={client.id || client.macAddress} className="hover:bg-white/[0.02] transition-colors group border-b border-white/5 last:border-0 hover:-translate-y-0.5">
                                        <td className="px-6 py-4 table-col-sticky border-r border-white/5 z-10 bg-slate-900 group-hover:bg-white/[0.03]">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 bg-slate-800 rounded-xl flex items-center justify-center text-blue-400 border border-white/5 group-hover:border-blue-500/30 transition-colors">
                                                    <Laptop size={18} />
                                                </div>
                                                <div>
                                                    <div className="text-white font-bold tracking-tight text-sm truncate max-w-[180px]" title={clientName}>{clientName}</div>
                                                    <div className="text-[10px] text-slate-500 font-mono uppercase">{client.macAddress}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                <div className={`w-2 h-2 rounded-full ${getHealthColor(client.health)} shadow-[0_0_8px] shadow-current`}></div>
                                                <span className={`text-[10px] font-black uppercase tracking-widest ${getHealthTextClass(client.health)}`}>
                                                    {client.health || 'Unknown'}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-800 rounded-full w-fit border border-white/5">
                                                <Circle size={8} className={isUp ? "fill-emerald-500 text-emerald-500" : "text-slate-600"} />
                                                <span className="text-[10px] font-bold uppercase">{isUp ? 'Online' : 'Offline'}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right text-xs font-bold text-slate-400">
                                            {formatDuration(client.connectionDurationInSeconds)}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="text-xs font-bold text-slate-200">{networkDisplay}</div>
                                            <div className="text-[10px] text-slate-500 italic mt-0.5">{formatInterface(client)}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2 text-xs font-bold">
                                                {isWired ? <Globe size={14} className="text-emerald-500" /> : <Wifi size={14} className="text-blue-500" />}
                                                <span className="text-slate-200">{isWired ? 'Wired' : 'Wireless'}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="text-xs font-black text-slate-200 font-mono">
                                                {client.ipAddress || client.reservedIpAddress || '-'}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="text-white font-black text-xs tracking-tighter">
                                                {formatBytes(client.downstreamDataTransferredInBytes || 0)}
                                            </div>
                                            <div className="text-[9px] text-slate-500 font-bold uppercase">Downstream</div>
                                        </td>
                                    </tr>
                                );
                            })}
                            {!loading && processedClients.length === 0 && (
                                <tr>
                                    <td colSpan="8" className="px-6 py-20 text-center text-slate-500 bg-black/10">
                                        <div className="flex flex-col items-center">
                                            <Users size={48} className="mb-4 opacity-5" />
                                            <p className="text-lg font-black text-slate-500 uppercase tracking-widest">No clients found</p>
                                            <p className="text-xs text-slate-600 mt-2">Adjust your filters or search term to see results</p>
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

export default Clients;
