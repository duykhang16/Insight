import React, { useState, useMemo, useEffect } from 'react';
import { AlertCircle, RefreshCw, Search, HardDrive, Wifi, ArrowDown, ArrowUp, Cloud, CloudOff, Users } from 'lucide-react';
import apiClient from '../../../api/apiClient';
import { useSite } from '../../../context/SiteContext';

// Aruba internal model ID → friendly display name
const MODEL_DISPLAY_MAP = {
    'AP-515': 'AP25',
    'AP-505': 'AP22',
    'AP-535': 'AP35',
    'AP-555': 'AP55',
    'AP-575': 'AP75',
    'AP-505H': 'AP22H',
};
const getDisplayModel = (model) => MODEL_DISPLAY_MAP[model] || model || '—';

const formatUptime = (seconds) => {
    if (!seconds || seconds < 0) return '—';
    const months = Math.floor(seconds / (30 * 24 * 3600));
    const days = Math.floor((seconds % (30 * 24 * 3600)) / (24 * 3600));
    const hours = Math.floor((seconds % (24 * 3600)) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (months > 0) return `${months}mo ${days}d`;
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
};

const getHealthConfig = (device) => {
    const isUp = (device.status || device.state || '').toLowerCase() === 'up';
    const health = (device.health || (isUp ? 'good' : 'poor')).toLowerCase();
    const map = {
        good: { dot: 'bg-emerald-400 shadow-emerald-400/60', text: 'text-emerald-400', label: 'Good' },
        fair: { dot: 'bg-amber-400 shadow-amber-400/60', text: 'text-amber-400', label: 'Fair' },
        poor: { dot: 'bg-rose-500 shadow-rose-500/60', text: 'text-rose-400', label: 'Poor' },
    };
    return { ...(map[health] || { dot: 'bg-slate-500', text: 'text-slate-500', label: health }), isUp };
};

const getRadioBands = (device) => {
    if (device.deviceType?.toLowerCase() !== 'accesspoint') return null;
    return device.radios
        ?.map(r => {
            const band = r.wirelessBand || r.band || '';
            return band.replace(/(\d+\.?\d*)ghz/i, '$1G');
        })
        .filter(Boolean)
        .join(' / ') || null;
};

// Client count extraction:
//   Access Points  → sum wirelessClientsCount across all radios
//   Switches       → wiredClientsCount on the root object
const getClientCount = (device) => {
    const type = device.deviceType?.toLowerCase();
    if (type === 'accesspoint') {
        if (!device.radios?.length) return device.connectedClients ?? 0;
        return device.radios.reduce((sum, r) => sum + (r.wirelessClientsCount ?? 0), 0);
    }
    return device.wiredClientsCount ?? device.connectedClients ?? 0;
};

const Devices = () => {
    const [devices, setDevices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [typeFilter, setTypeFilter] = useState('all');
    const [healthFilter, setHealthFilter] = useState('all');
    const [sortConfig, setSortConfig] = useState({ key: 'clients', direction: 'desc' });

    const { selectedSiteId, sites, fetchSites } = useSite();

    useEffect(() => {
        if (sites.length === 0) fetchSites();
    }, []);

    useEffect(() => {
        if (selectedSiteId) fetchInventory(selectedSiteId);
    }, [selectedSiteId]);

    // Silent client-count refresh every 30s — no loading spinner
    useEffect(() => {
        if (!selectedSiteId) return;
        const interval = setInterval(() => fetchInventorySilent(selectedSiteId), 30000);
        return () => clearInterval(interval);
    }, [selectedSiteId]);

    const extractDevices = (data) => {
        if (Array.isArray(data)) return data;
        if (data?.elements) return data.elements;
        if (data?.devices) return data.devices;
        return [];
    };

    const fetchInventory = async (siteId) => {
        setLoading(true);
        setError('');
        try {
            const res = await apiClient.get(`/overview/sites/${siteId}/inventory`);
            setDevices(extractDevices(res.data) || []);
        } catch (err) {
            console.error('Inventory fetch error:', err);
            if (err.response?.status !== 401) setError('Failed to fetch device inventory.');
        } finally {
            setLoading(false);
        }
    };

    const fetchInventorySilent = async (siteId) => {
        try {
            const res = await apiClient.get(`/overview/sites/${siteId}/inventory`);
            const extracted = extractDevices(res.data);
            if (extracted.length > 0) setDevices(extracted);
        } catch { /* silent */ }
    };

    const processedDevices = useMemo(() => {
        let result = [...(devices || [])].filter(d => {
            if (!d) return false;
            const name = d.name || d.defaultName || d.macAddress || '';
            const matchesSearch =
                name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (d.model || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (d.macAddress || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (d.ipAddress || '').toString().includes(searchTerm);
            const matchesType = typeFilter === 'all' || d.deviceType?.toLowerCase() === typeFilter;
            const isUp = (d.status || d.state || '').toLowerCase() === 'up';
            const health = (d.health || (isUp ? 'good' : 'poor')).toLowerCase();
            const matchesHealth = healthFilter === 'all' || health === healthFilter;
            return matchesSearch && matchesType && matchesHealth;
        });

        result.sort((a, b) => {
            let valA, valB;
            const healthScore = { good: 3, fair: 2, poor: 1 };
            switch (sortConfig.key) {
                case 'name':
                    valA = (a.name || a.defaultName || a.macAddress || '').toLowerCase();
                    valB = (b.name || b.defaultName || b.macAddress || '').toLowerCase();
                    break;
                case 'health': {
                    const hA = (a.health || ((a.status || '').toLowerCase() === 'up' ? 'good' : 'poor')).toLowerCase();
                    const hB = (b.health || ((b.status || '').toLowerCase() === 'up' ? 'good' : 'poor')).toLowerCase();
                    valA = healthScore[hA] ?? 0;
                    valB = healthScore[hB] ?? 0;
                    break;
                }
                case 'uptime':
                    valA = a.uptimeInSeconds || 0;
                    valB = b.uptimeInSeconds || 0;
                    break;
                case 'clients':
                    valA = getClientCount(a);
                    valB = getClientCount(b);
                    break;
                case 'ip':
                    valA = (a.ipAddress || '');
                    valB = (b.ipAddress || '');
                    break;
                default:
                    return 0;
            }
            if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
            if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });

        return result;
    }, [devices, searchTerm, typeFilter, healthFilter, sortConfig]);

    const handleSort = (key) => {
        setSortConfig(prev => ({
            key,
            direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
        }));
    };

    const SortIcon = ({ column }) => {
        if (sortConfig.key !== column) return <ArrowDown size={10} className="opacity-20 ml-1 inline" />;
        return sortConfig.direction === 'asc'
            ? <ArrowUp size={10} className="text-purple-400 ml-1 inline" />
            : <ArrowDown size={10} className="text-purple-400 ml-1 inline" />;
    };

    const siteName = sites.find(s => s.siteId === selectedSiteId)?.siteName || 'current site';

    return (
        <div className="p-6 pb-32 min-h-screen bg-slate-950">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                <div>
                    <h1 className="text-xl font-black text-white tracking-tight uppercase italic">Infrastructure</h1>
                    <p className="text-xs text-slate-500 mt-1 font-mono">{siteName} · {processedDevices.length} devices</p>
                </div>
                <button
                    onClick={() => fetchInventory(selectedSiteId)}
                    disabled={loading}
                    className="h-10 px-5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest border border-white/5 transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2"
                >
                    <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                    Refresh
                </button>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3 mb-5">
                <div className="relative flex-1 min-w-[260px]">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" size={15} />
                    <input
                        type="text"
                        placeholder="Search name, model, MAC, IP..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full h-10 pl-10 pr-4 bg-slate-900 border border-white/5 rounded-xl text-slate-200 text-xs focus:outline-none focus:border-purple-500/50 transition-all"
                    />
                </div>
                <select
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value)}
                    className="h-10 bg-slate-900 border border-white/5 rounded-xl px-4 text-slate-300 text-xs font-bold focus:outline-none appearance-none min-w-[130px]"
                >
                    <option value="all">All Types</option>
                    <option value="accesspoint">Access Points</option>
                    <option value="switch">Switches</option>
                </select>
                <select
                    value={healthFilter}
                    onChange={(e) => setHealthFilter(e.target.value)}
                    className="h-10 bg-slate-900 border border-white/5 rounded-xl px-4 text-slate-300 text-xs font-bold focus:outline-none appearance-none min-w-[130px]"
                >
                    <option value="all">All Health</option>
                    <option value="good">Good</option>
                    <option value="fair">Fair</option>
                    <option value="poor">Poor</option>
                </select>
            </div>

            {error && (
                <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-3 text-rose-400">
                    <AlertCircle size={16} />
                    <span className="text-xs font-bold">{error}</span>
                </div>
            )}

            {/* Table */}
            <div className="bg-slate-900 rounded-2xl border border-white/5 overflow-hidden shadow-2xl">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs whitespace-nowrap">
                        <thead className="bg-slate-800/60 border-b border-white/5">
                            <tr>
                                <th onClick={() => handleSort('name')} className="px-4 py-3.5 font-black uppercase tracking-widest text-[9px] text-slate-400 cursor-pointer hover:text-slate-200 transition-colors">
                                    Device <SortIcon column="name" />
                                </th>
                                <th onClick={() => handleSort('health')} className="px-4 py-3.5 font-black uppercase tracking-widest text-[9px] text-slate-400 cursor-pointer hover:text-slate-200 transition-colors">
                                    Health <SortIcon column="health" />
                                </th>
                                <th className="px-4 py-3.5 font-black uppercase tracking-widest text-[9px] text-slate-400">
                                    State
                                </th>
                                <th onClick={() => handleSort('uptime')} className="px-4 py-3.5 font-black uppercase tracking-widest text-[9px] text-slate-400 cursor-pointer hover:text-slate-200 transition-colors">
                                    Duration <SortIcon column="uptime" />
                                </th>
                                <th className="px-4 py-3.5 font-black uppercase tracking-widest text-[9px] text-slate-400">
                                    Type
                                </th>
                                <th className="px-4 py-3.5 font-black uppercase tracking-widest text-[9px] text-slate-400">
                                    Model
                                </th>
                                <th className="px-4 py-3.5 font-black uppercase tracking-widest text-[9px] text-slate-400">
                                    MAC Address
                                </th>
                                <th onClick={() => handleSort('ip')} className="px-4 py-3.5 font-black uppercase tracking-widest text-[9px] text-slate-400 cursor-pointer hover:text-slate-200 transition-colors">
                                    IP Address <SortIcon column="ip" />
                                </th>
                                <th onClick={() => handleSort('clients')} className="px-4 py-3.5 font-black uppercase tracking-widest text-[9px] text-slate-400 cursor-pointer hover:text-slate-200 transition-colors text-right">
                                    Clients <SortIcon column="clients" />
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.04]">
                            {loading && devices.length === 0 ? (
                                [...Array(5)].map((_, i) => (
                                    <tr key={i} className="animate-pulse">
                                        {[...Array(9)].map((_, j) => (
                                            <td key={j} className="px-4 py-3.5">
                                                <div className="h-3 bg-slate-800 rounded w-3/4"></div>
                                            </td>
                                        ))}
                                    </tr>
                                ))
                            ) : processedDevices.map((device) => {
                                const hCfg = getHealthConfig(device);
                                const isAP = device.deviceType?.toLowerCase() === 'accesspoint';
                                const isSwitch = device.deviceType?.toLowerCase() === 'switch';
                                const name = device.name || device.defaultName || device.macAddress || '—';
                                const model = device.model || '—';
                                const radioBands = getRadioBands(device);
                                const clients = getClientCount(device);

                                return (
                                    <tr key={device.id || device.macAddress}
                                        className="hover:bg-white/[0.02] transition-colors group">

                                        {/* Device */}
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2.5">
                                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center border shrink-0 transition-colors
                                                    ${isAP
                                                        ? 'bg-purple-500/10 border-purple-500/20 text-purple-400 group-hover:border-purple-500/40'
                                                        : 'bg-slate-800 border-white/5 text-slate-400 group-hover:border-white/10'}`}>
                                                    {isAP ? <Wifi size={14} /> : isSwitch ? <HardDrive size={14} /> : <HardDrive size={14} />}
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="text-slate-100 font-bold text-xs truncate max-w-[160px]" title={name}>{name}</div>
                                                </div>
                                            </div>
                                        </td>

                                        {/* Health */}
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-1.5">
                                                <div className={`w-1.5 h-1.5 rounded-full shadow-[0_0_6px] shrink-0 ${hCfg.dot}`}></div>
                                                <span className={`text-[10px] font-black uppercase tracking-wider ${hCfg.text}`}>
                                                    {hCfg.label}
                                                </span>
                                            </div>
                                        </td>

                                        {/* State */}
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-1.5">
                                                {hCfg.isUp
                                                    ? <Cloud size={12} className="text-emerald-400 shrink-0" />
                                                    : <CloudOff size={12} className="text-slate-600 shrink-0" />}
                                                <span className={`text-[10px] font-bold ${hCfg.isUp ? 'text-emerald-400' : 'text-slate-500'}`}>
                                                    {hCfg.isUp ? 'Online' : 'Offline'}
                                                </span>
                                            </div>
                                        </td>

                                        {/* Duration */}
                                        <td className="px-4 py-3">
                                            <span className="text-slate-300 font-mono text-[10px]">
                                                {formatUptime(device.uptimeInSeconds)}
                                            </span>
                                        </td>

                                        {/* Type */}
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-1.5">
                                                {isAP
                                                    ? <Wifi size={11} className="text-purple-400 shrink-0" />
                                                    : <HardDrive size={11} className="text-slate-400 shrink-0" />}
                                                <span className="text-slate-300 text-[10px] font-bold">
                                                    {isAP ? 'Access Point' : isSwitch ? 'Switch' : (device.deviceType || 'Unknown')}
                                                </span>
                                            </div>
                                            {isAP && radioBands && (
                                                <div className="text-[9px] text-slate-500 mt-0.5 font-mono">{radioBands}</div>
                                            )}
                                        </td>

                                        {/* Model */}
                                        <td className="px-4 py-3">
                                            <span className="text-slate-300 font-mono text-[10px] font-bold">
                                                {getDisplayModel(model)}
                                            </span>
                                        </td>

                                        {/* MAC */}
                                        <td className="px-4 py-3">
                                            <span className="text-slate-400 font-mono text-[10px] tracking-wide">
                                                {device.macAddress || '—'}
                                            </span>
                                        </td>

                                        {/* IP */}
                                        <td className="px-4 py-3">
                                            <span className="text-slate-300 font-mono text-[10px]">
                                                {device.ipAddress || '—'}
                                            </span>
                                        </td>

                                        {/* Clients */}
                                        <td className="px-4 py-3 text-right">
                                            <div className="flex items-center justify-end gap-1">
                                                <Users size={10} className="text-slate-500 shrink-0" />
                                                <span className={`font-black text-xs tabular-nums ${clients > 0 ? 'text-white' : 'text-slate-600'}`}>
                                                    {clients}
                                                </span>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}

                            {!loading && processedDevices.length === 0 && (
                                <tr>
                                    <td colSpan={9} className="px-6 py-16 text-center">
                                        <HardDrive size={36} className="mx-auto mb-3 text-slate-700" />
                                        <p className="text-sm font-black text-slate-600 uppercase tracking-widest">No devices found</p>
                                        <p className="text-[10px] text-slate-700 mt-1">Try adjusting your filters</p>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div >
    );
};

export default Devices;
