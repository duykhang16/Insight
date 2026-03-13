import React, { useState, useMemo, useEffect } from 'react';
import { AlertCircle, RefreshCw, Search, HardDrive, Wifi, ArrowDown, ArrowUp, Cloud, CloudOff, Users, X } from 'lucide-react';
import apiClient from '../../../api/apiClient';
import { useSite } from '../../../context/SiteContext';
import { useLanguage } from '../../../context/LanguageContext';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

const MODEL_DISPLAY_MAP = {
    'AP-515': 'AP25', 'AP-505': 'AP22', 'AP-535': 'AP35', 'AP-555': 'AP55',
    'AP-575': 'AP75', 'AP-505H': 'AP22H', 'JL678A': '6200F', 'JL806A': '1960',
    'JL807A': '1960', 'JL808A': '1960', 'JL809A': '1960',
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
    const isUp = device.isUp ?? (device.status === 'up');
    const health = (device.health || 'good').toLowerCase();
    const map = {
        good: { dot: 'bg-emerald-400 shadow-emerald-400/60', text: 'text-emerald-400', label: 'Good' },
        fair: { dot: 'bg-amber-400 shadow-amber-400/60', text: 'text-amber-400', label: 'Fair' },
        poor: { dot: 'bg-rose-500 shadow-rose-500/60', text: 'text-rose-400', label: 'Poor' },
    };
    return { ...(map[health] || { dot: 'bg-slate-500', text: 'text-slate-500', label: health }), isUp };
};

const Devices = () => {
    const { t } = useLanguage();
    const [devices, setDevices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [typeFilter, setTypeFilter] = useState('all');
    const [healthFilter, setHealthFilter] = useState('all');
    const [lastUpdated, setLastUpdated] = useState(null);
    const [sortConfig, setSortConfig] = useState({ key: 'clients', direction: 'desc' });

    const { selectedSiteId, sites, fetchSites } = useSite();

    useEffect(() => { if (sites.length === 0) fetchSites(); }, []);
    useEffect(() => { if (selectedSiteId) fetchInventory(selectedSiteId); }, [selectedSiteId]);
    useEffect(() => {
        if (!selectedSiteId) return;
        const interval = setInterval(() => fetchInventorySilent(selectedSiteId), 30000);
        return () => clearInterval(interval);
    }, [selectedSiteId]);

    const fetchInventory = async (siteId) => {
        setLoading(true); setError('');
        try {
            const res = await apiClient.get(`/overview/sites/${siteId}/inventory`);
            setDevices(Array.isArray(res.data) ? res.data : []);
            setLastUpdated(new Date());
        } catch (err) {
            console.error('Inventory fetch error:', err);
            if (err.response?.status !== 401) setError(t('site.devices.error_fetch'));
        } finally { setLoading(false); }
    };

    const fetchInventorySilent = async (siteId) => {
        try {
            const res = await apiClient.get(`/overview/sites/${siteId}/inventory`);
            const data = Array.isArray(res.data) ? res.data : [];
            if (data.length > 0) { setDevices(data); setLastUpdated(new Date()); }
        } catch { /* silent */ }
    };

    const processedDevices = useMemo(() => {
        let result = [...(devices || [])].filter(d => {
            if (!d) return false;
            const name = d.name || '—';
            const matchesSearch = name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (d.model || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (d.macAddress || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (d.ipAddress || '').toString().includes(searchTerm);
            const matchesType = typeFilter === 'all' || d.deviceType?.toLowerCase() === typeFilter;
            const matchesHealth = healthFilter === 'all' || (d.health || '').toLowerCase() === healthFilter;
            return matchesSearch && matchesType && matchesHealth;
        });
        result.sort((a, b) => {
            let valA, valB;
            const healthScore = { good: 3, fair: 2, poor: 1 };
            switch (sortConfig.key) {
                case 'name': valA = (a.name || '').toLowerCase(); valB = (b.name || '').toLowerCase(); break;
                case 'health': valA = healthScore[(a.health || 'good').toLowerCase()] ?? 0; valB = healthScore[(b.health || 'good').toLowerCase()] ?? 0; break;
                case 'uptime': valA = a.uptimeSeconds || 0; valB = b.uptimeSeconds || 0; break;
                case 'clients': valA = a.clientCount || 0; valB = b.clientCount || 0; break;
                case 'ip': valA = a.ipAddress || ''; valB = b.ipAddress || ''; break;
                default: return 0;
            }
            if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
            if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
        return result;
    }, [devices, searchTerm, typeFilter, healthFilter, sortConfig]);

    const handleSort = (key) => {
        setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc' }));
    };

    const SortIcon = ({ column }) => {
        if (sortConfig.key !== column) return <ArrowDown size={10} className="opacity-20 ml-0.5 inline" />;
        return sortConfig.direction === 'asc'
            ? <ArrowUp size={10} className="text-purple-400 ml-0.5 inline" />
            : <ArrowDown size={10} className="text-purple-400 ml-0.5 inline" />;
    };

    const siteName = sites.find(s => s.siteId === selectedSiteId)?.siteName || 'current site';

    // ── Card for mobile ──
    const renderCard = (device) => {
        const hCfg = getHealthConfig(device);
        const isAP = device.deviceType?.toLowerCase() === 'accesspoint';
        const name = device.name || '—';
        const model = device.model || '—';
        const clients = device.clientCount || 0;

        return (
            <div key={device.id || device.macAddress} className="th-bg-surface border th-border rounded-xl p-4 space-y-3">
                {/* Top: name + health */}
                <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center border shrink-0 ${
                            isAP ? 'bg-purple-500/10 border-purple-500/20 text-purple-400' : 'th-bg-elevated border-white/5 text-slate-400'
                        }`}>
                            {isAP ? <Wifi size={14} /> : <HardDrive size={14} />}
                        </div>
                        <div className="min-w-0">
                            <div className="th-text-primary font-bold text-sm truncate">{name}</div>
                            <div className="text-[10px] text-slate-500">{getDisplayModel(model)}</div>
                        </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                        <div className={`w-1.5 h-1.5 rounded-full shadow-[0_0_6px] ${hCfg.dot}`} />
                        <span className={`text-[10px] font-bold uppercase ${hCfg.text}`}>{hCfg.label}</span>
                    </div>
                </div>

                {/* Info grid */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                    <div>
                        <span className="text-[10px] text-slate-500 uppercase tracking-wider">{t('site.devices.table_header_state')}</span>
                        <div className="flex items-center gap-1">
                            {hCfg.isUp ? <Cloud size={11} className="text-emerald-400" /> : <CloudOff size={11} className="text-slate-600" />}
                            <span className={hCfg.isUp ? 'text-emerald-400' : 'text-slate-500'}>
                                {hCfg.isUp ? t('site.devices.state_online') : t('site.devices.state_offline')}
                            </span>
                        </div>
                    </div>
                    <div>
                        <span className="text-[10px] text-slate-500 uppercase tracking-wider">{t('site.devices.table_header_clients')}</span>
                        <div className="flex items-center gap-1">
                            <Users size={10} className="text-slate-500" />
                            <span className={`font-bold ${clients > 0 ? 'th-text-primary' : 'text-slate-600'}`}>{clients}</span>
                        </div>
                    </div>
                    <div>
                        <span className="text-[10px] text-slate-500 uppercase tracking-wider">{t('site.devices.table_header_duration')}</span>
                        <div className="th-text-secondary font-mono text-[11px]">{formatUptime(device.uptimeSeconds)}</div>
                    </div>
                    <div>
                        <span className="text-[10px] text-slate-500 uppercase tracking-wider">{t('site.devices.table_header_type')}</span>
                        <div className="flex items-center gap-1">
                            {isAP ? <Wifi size={10} className="text-purple-400" /> : <HardDrive size={10} className="text-slate-400" />}
                            <span className="th-text-secondary">
                                {isAP ? t('site.devices.device_type_ap') : device.deviceType?.toLowerCase() === 'switch' ? t('site.devices.device_type_switch') : (device.deviceType || 'Unknown')}
                            </span>
                        </div>
                    </div>
                    <div>
                        <span className="text-[10px] text-slate-500 uppercase tracking-wider">{t('site.devices.table_header_ip')}</span>
                        <div className="th-text-secondary font-mono text-[11px]">{device.ipAddress || '—'}</div>
                    </div>
                    <div>
                        <span className="text-[10px] text-slate-500 uppercase tracking-wider">{t('site.devices.table_header_mac')}</span>
                        <div className="text-slate-400 font-mono text-[11px]">{device.macAddress || '—'}</div>
                    </div>
                </div>

                {/* Radio bands for APs */}
                {isAP && device.radioBands && (
                    <div className="pt-2 border-t border-white/5 text-[10px] text-slate-500 font-mono">
                        Radio: {device.radioBands}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="p-4 md:p-6 pb-32 min-h-screen th-bg-base">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-5 gap-3">
                <div>
                    <h1 className="text-xl font-black th-text-primary tracking-tight uppercase italic">{t('site.devices.title')}</h1>
                    <p className="text-xs text-slate-500 mt-0.5 font-mono">{siteName} · {processedDevices.length} {t('site.devices.subtitle')}</p>
                </div>
                <button
                    onClick={() => fetchInventory(selectedSiteId)}
                    disabled={loading}
                    className="h-9 px-4 th-bg-elevated hover:bg-slate-700 th-text-primary rounded-xl text-[10px] font-bold uppercase tracking-wider border border-white/5 transition-all disabled:opacity-50 flex items-center gap-2"
                >
                    <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
                    {t('site.devices.button_refresh')}
                </button>
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3 mb-5">
                <div className="relative flex-1 min-w-0">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={15} />
                    <input
                        type="text"
                        placeholder={t('site.devices.search_placeholder')}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full h-10 pl-9 pr-8 th-bg-surface border border-white/5 rounded-xl th-text-primary text-xs focus:outline-none focus:border-purple-500/50 transition-all"
                    />
                    {searchTerm && (
                        <button onClick={() => setSearchTerm('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:th-text-primary">
                            <X size={14} />
                        </button>
                    )}
                </div>
                <div className="flex gap-2">
                    <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
                        className="h-10 th-bg-surface border border-white/5 rounded-xl px-3 th-text-secondary text-xs font-medium focus:outline-none appearance-none min-w-[110px]"
                    >
                        <option value="all">{t('site.devices.filter_type_all')}</option>
                        <option value="accesspoint">{t('site.devices.filter_type_ap')}</option>
                        <option value="switch">{t('site.devices.filter_type_switch')}</option>
                    </select>
                    <select value={healthFilter} onChange={(e) => setHealthFilter(e.target.value)}
                        className="h-10 th-bg-surface border border-white/5 rounded-xl px-3 th-text-secondary text-xs font-medium focus:outline-none appearance-none min-w-[110px]"
                    >
                        <option value="all">{t('site.devices.filter_health_all')}</option>
                        <option value="good">{t('site.devices.filter_health_good')}</option>
                        <option value="fair">{t('site.devices.filter_health_fair')}</option>
                        <option value="poor">{t('site.devices.filter_health_poor')}</option>
                    </select>
                </div>
            </div>

            {error && (
                <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-3 text-rose-400">
                    <AlertCircle size={16} />
                    <span className="text-xs font-medium">{error}</span>
                </div>
            )}

            {/* Loading */}
            {loading && devices.length === 0 && (
                <div className="flex items-center justify-center py-16">
                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-purple-500" />
                </div>
            )}

            {/* Mobile cards */}
            {!loading && (
                <div className="md:hidden space-y-3">
                    {processedDevices.length === 0 ? (
                        <div className="text-center py-12">
                            <HardDrive size={36} className="mx-auto mb-3 text-slate-700" />
                            <p className="text-sm font-bold text-slate-600 uppercase tracking-wider">{t('site.devices.empty_state_title')}</p>
                            <p className="text-[10px] text-slate-700 mt-1">{t('site.devices.empty_state_hint')}</p>
                        </div>
                    ) : processedDevices.map(device => renderCard(device))}
                </div>
            )}

            {/* Desktop table */}
            {!loading && (
                <div className="hidden md:block">
                    <div className="th-bg-surface rounded-xl border border-white/5 overflow-hidden shadow-xl">
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow className="th-bg-surface-alt hover:bg-transparent border-b border-white/5">
                                        <TableHead onClick={() => handleSort('name')} className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 cursor-pointer hover:th-text-primary transition-colors">
                                            {t('site.devices.table_header_device')} <SortIcon column="name" />
                                        </TableHead>
                                        <TableHead onClick={() => handleSort('health')} className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 cursor-pointer hover:th-text-primary transition-colors">
                                            {t('site.devices.table_header_health')} <SortIcon column="health" />
                                        </TableHead>
                                        <TableHead className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                            {t('site.devices.table_header_state')}
                                        </TableHead>
                                        <TableHead onClick={() => handleSort('uptime')} className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 cursor-pointer hover:th-text-primary transition-colors">
                                            {t('site.devices.table_header_duration')} <SortIcon column="uptime" />
                                        </TableHead>
                                        <TableHead className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                            {t('site.devices.table_header_type')}
                                        </TableHead>
                                        <TableHead className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                            {t('site.devices.table_header_model')}
                                        </TableHead>
                                        <TableHead className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                            {t('site.devices.table_header_mac')}
                                        </TableHead>
                                        <TableHead onClick={() => handleSort('ip')} className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 cursor-pointer hover:th-text-primary transition-colors">
                                            {t('site.devices.table_header_ip')} <SortIcon column="ip" />
                                        </TableHead>
                                        <TableHead onClick={() => handleSort('clients')} className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 text-right cursor-pointer hover:th-text-primary transition-colors">
                                            {t('site.devices.table_header_clients')} <SortIcon column="clients" />
                                        </TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {processedDevices.map((device) => {
                                        const hCfg = getHealthConfig(device);
                                        const isAP = device.deviceType?.toLowerCase() === 'accesspoint';
                                        const isSwitch = device.deviceType?.toLowerCase() === 'switch';
                                        const name = device.name || '—';
                                        const model = device.model || '—';
                                        const clients = device.clientCount || 0;

                                        return (
                                            <TableRow key={device.id || device.macAddress} className="transition-colors group">
                                                <TableCell className="px-4 py-3">
                                                    <div className="flex items-center gap-2">
                                                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center border shrink-0 ${
                                                            isAP ? 'bg-purple-500/10 border-purple-500/20 text-purple-400' : 'th-bg-elevated border-white/5 text-slate-400'
                                                        }`}>
                                                            {isAP ? <Wifi size={12} /> : <HardDrive size={12} />}
                                                        </div>
                                                        <span className="th-text-primary font-bold text-xs truncate max-w-[140px]" title={name}>{name}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="px-4 py-3">
                                                    <div className="flex items-center gap-1.5">
                                                        <div className={`w-1.5 h-1.5 rounded-full shadow-[0_0_6px] shrink-0 ${hCfg.dot}`} />
                                                        <span className={`text-[10px] font-bold uppercase tracking-wider ${hCfg.text}`}>
                                                            {hCfg.label === 'Good' ? t('site.devices.health_label_good') : hCfg.label === 'Fair' ? t('site.devices.health_label_fair') : hCfg.label === 'Poor' ? t('site.devices.health_label_poor') : hCfg.label}
                                                        </span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="px-4 py-3">
                                                    <div className="flex items-center gap-1">
                                                        {hCfg.isUp ? <Cloud size={11} className="text-emerald-400 shrink-0" /> : <CloudOff size={11} className="text-slate-600 shrink-0" />}
                                                        <span className={`text-[10px] font-medium ${hCfg.isUp ? 'text-emerald-400' : 'text-slate-500'}`}>
                                                            {hCfg.isUp ? t('site.devices.state_online') : t('site.devices.state_offline')}
                                                        </span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="px-4 py-3 th-text-secondary font-mono text-[10px]">
                                                    {formatUptime(device.uptimeSeconds)}
                                                </TableCell>
                                                <TableCell className="px-4 py-3">
                                                    <div className="flex items-center gap-1">
                                                        {isAP ? <Wifi size={10} className="text-purple-400 shrink-0" /> : <HardDrive size={10} className="text-slate-400 shrink-0" />}
                                                        <span className="th-text-secondary text-[10px] font-medium">
                                                            {isAP ? t('site.devices.device_type_ap') : isSwitch ? t('site.devices.device_type_switch') : (device.deviceType || 'Unknown')}
                                                        </span>
                                                    </div>
                                                    {isAP && device.radioBands && <div className="text-[9px] text-slate-500 mt-0.5 font-mono">{device.radioBands}</div>}
                                                </TableCell>
                                                <TableCell className="px-4 py-3 th-text-secondary font-mono text-[10px] font-medium">{getDisplayModel(model)}</TableCell>
                                                <TableCell className="px-4 py-3 text-slate-400 font-mono text-[10px]">{device.macAddress || '—'}</TableCell>
                                                <TableCell className="px-4 py-3 th-text-secondary font-mono text-[10px]">{device.ipAddress || '—'}</TableCell>
                                                <TableCell className="px-4 py-3 text-right">
                                                    <div className="flex items-center justify-end gap-1">
                                                        <Users size={10} className="text-slate-500 shrink-0" />
                                                        <span className={`font-bold text-xs tabular-nums ${clients > 0 ? 'th-text-primary' : 'text-slate-600'}`}>{clients}</span>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}

                                    {processedDevices.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={9} className="px-6 py-16 text-center">
                                                <HardDrive size={36} className="mx-auto mb-3 text-slate-700" />
                                                <p className="text-sm font-bold text-slate-600 uppercase tracking-wider">{t('site.devices.empty_state_title')}</p>
                                                <p className="text-[10px] text-slate-700 mt-1">{t('site.devices.empty_state_hint')}</p>
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

export default Devices;
