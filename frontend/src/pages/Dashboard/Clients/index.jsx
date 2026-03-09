import React, { useState, useEffect, useMemo } from 'react';
import { Users, Search, RefreshCw, AlertCircle, Smartphone, Laptop, Monitor, Globe, Wifi, Circle, Radio, ArrowDown, ArrowUp, Database, GripVertical } from 'lucide-react';
import apiClient, { formatBytes } from '../../../api/apiClient';
import { useSite } from '../../../context/SiteContext';
import { useSettings } from '../../../context/SettingsContext';
import useIntervalFetch from '../../../hooks/useIntervalFetch';
import SyncIndicator from '../../../components/SyncIndicator';
import { useLanguage } from '../../../context/LanguageContext';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const SortableHeader = ({ id, content, onSort, sortIcon, minWidth }) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
    const style = {
        transform: CSS.Translate.toString(transform),
        transition,
        opacity: 1,
        zIndex: isDragging ? 100 : 'auto',
        position: 'relative',
        minWidth: `${minWidth}px`
    };

    return (
        <th
            ref={setNodeRef}
            style={style}
            className={`px-6 py-5 font-black uppercase tracking-widest text-[10px] transition-colors group ${isDragging ? "bg-slate-800/80 shadow-xl" : "hover:text-white"}`}
        >
            <div className="flex items-center gap-2">
                <div
                    {...attributes}
                    {...listeners}
                    className="cursor-grab active:cursor-grabbing text-slate-600 hover:text-slate-400 p-1 -ml-2 rounded"
                    title="Drag to reorder"
                >
                    <GripVertical size={14} />
                </div>
                <div onClick={onSort} className={`flex items-center ${onSort ? 'cursor-pointer' : ''}`}>
                    {content} {sortIcon && <span className="ml-1">{sortIcon}</span>}
                </div>
            </div>
        </th>
    );
};

const Clients = () => {
    const { t } = useLanguage();
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

    // Part Number to Model Name mapping (Task 1)
    const PART_NUMBER_MAP = {
        'JL678A': '6200F',
        'JL439A': '2930F',
        'R2X11A': 'AP-505',
        'R2H28A': 'AP-515',
        'JZ336A': 'AP-535',
        'Q9H62A': 'AP-515',
        'R4H16A': 'AP-565',
        'Q9H59A': 'AP-514',
    };

    // Default 11-column sequence (Task 1)
    const DEFAULT_COLUMNS = [
        { id: 'client', labelKey: 'site.clients.table_header_client', minWidth: 250, sortable: true },
        { id: 'network', labelKey: 'site.clients.table_header_network', minWidth: 150, sortable: true },
        { id: 'usage', labelKey: 'site.clients.table_header_usage', minWidth: 120, sortable: true },
        { id: 'health', labelKey: 'site.clients.table_header_health', minWidth: 100, sortable: true },
        { id: 'state', labelKey: 'site.clients.table_header_state', minWidth: 100, sortable: false },
        { id: 'duration', labelKey: 'site.clients.table_header_duration', minWidth: 100, sortable: true },
        { id: 'type', labelKey: 'site.clients.table_header_type', minWidth: 100, sortable: false },
        { id: 'ip', labelKey: 'site.clients.table_header_ip', minWidth: 120, sortable: false },
        { id: 'device', labelKey: 'site.clients.table_header_device', minWidth: 150, sortable: false },
        { id: 'interface', labelKey: 'site.clients.table_header_interface', minWidth: 150, sortable: false },
    ];

    const [columns, setColumns] = useState(() => {
        const saved = localStorage.getItem('client_table_layout');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                // Validate parsed contains all required IDs
                const defaultIds = DEFAULT_COLUMNS.map(c => c.id);
                if (parsed.length === DEFAULT_COLUMNS.length && parsed.every(c => defaultIds.includes(c.id))) {
                    // Re-attach metadata from default columns to saved IDs
                    return parsed.map(p => ({
                        ...DEFAULT_COLUMNS.find(d => d.id === p.id),
                        ...p
                    }));
                }
            } catch (e) {
                console.error("Invalid column data in localStorage");
            }
        }
        return DEFAULT_COLUMNS;
    });

    const resetColumns = () => {
        setColumns(DEFAULT_COLUMNS);
        localStorage.removeItem('client_table_layout');
    };

    // Sensor for Drag and Drop
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor)
    );

    const handleDragEnd = (event) => {
        const { active, over } = event;
        if (active.id !== over.id) {
            setColumns((items) => {
                const oldIndex = items.findIndex((i) => i.id === active.id);
                const newIndex = items.findIndex((i) => i.id === over.id);
                const newArray = arrayMove(items, oldIndex, newIndex);
                localStorage.setItem('client_table_layout', JSON.stringify(newArray));
                return newArray;
            });
        }
    };

    useEffect(() => {
        if (sites.length === 0) {
            fetchSites();
        }

        // Read URL parameters for initial filters (Task 2 Dashboard linking)
        const params = new URLSearchParams(window.location.search);
        if (params.has('health')) setHealthFilter(params.get('health'));
        if (params.has('type')) setTypeFilter(params.get('type'));
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
                `/overview/sites/${siteId}/clients`,
                `/overview/sites/${siteId}/clientSummary`,
                `/overview/sites/${siteId}/clientsSummary`,
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
                setError(t('site.clients.error_fetch'));
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

    const formatDuration = (item) => {
        const rawSeconds = item?.stateDurationInSeconds ?? item?.connectionDurationInSeconds ?? 0;
        if (rawSeconds <= 0) return '';
        const m = Math.floor(rawSeconds / 60);
        return `${m} min`;
    };

    const formatInterface = (item) => {
        if (!item) return '';
        const isWired = item.clientType?.toLowerCase() === 'wired';
        if (isWired) {
            // Extract port string if array exists
            const port = item.connectedToPorts?.[0]?.portNumber || item.portId;
            return port ? `Port ${port}` : '';
        }
        // Wireless: Map from item.wirelessBand
        if (item.wirelessBand) {
            return item.wirelessBand.toLowerCase().replace('ghz', ' GHz');
        }
        return '';
    };

    const capitalize = (str) => {
        if (!str) return '';
        return str.charAt(0).toUpperCase() + str.slice(1);
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
                case 'network':
                    // Task 1: Sort by SSID
                    valA = (a.wirelessNetworkName || a.accessedWiredNetworks?.[0]?.networkName || '').toLowerCase();
                    valB = (b.wirelessNetworkName || b.accessedWiredNetworks?.[0]?.networkName || '').toLowerCase();
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
        if (sortConfig.key !== column) return <ArrowDown size={12} className="opacity-20 inline" />;
        return sortConfig.direction === 'asc' ?
            <ArrowUp size={12} className="text-blue-500 inline" /> :
            <ArrowDown size={12} className="text-blue-500 inline" />;
    };

    return (
        <div className="p-8 pb-32 min-h-screen bg-slate-950">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                <div>
                    <h1 className="text-2xl font-black text-white tracking-tight">{t('site.clients.title')}</h1>
                    <p className="text-sm text-slate-400 mt-1">
                        {t('site.clients.subtitle')} {sites.find(s => s.siteId === selectedSiteId)?.siteName || 'current site'}
                    </p>
                </div>

                <div className="flex items-center gap-4 w-full md:w-auto">
                    <SyncIndicator isSyncing={loading} lastUpdated={lastUpdated} />
                    <button
                        onClick={resetColumns}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-lg border border-white/10 transition-colors"
                    >
                        <RefreshCw size={14} />
                        {t('site.clients.reset_columns') || 'Đặt lại giao diện'}
                    </button>
                </div>
            </div>

            {/* Filter Toolbar */}
            <div className="flex flex-wrap items-center gap-4 mb-6">
                <div className="relative flex-1 min-w-[300px]">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                    <input
                        type="text"
                        placeholder={t('site.clients.search_placeholder')}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full h-14 pl-12 pr-4 bg-slate-900 border border-white/5 rounded-2xl text-white text-sm focus:outline-none focus:border-blue-500/50 shadow-inner"
                    />
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-black uppercase text-slate-500 ml-1 tracking-widest">{t('site.clients.filter_type_label')}</label>
                        <select
                            value={typeFilter}
                            onChange={(e) => setTypeFilter(e.target.value)}
                            className="h-14 bg-slate-900 border border-white/5 rounded-2xl px-5 text-white text-sm font-bold focus:outline-none focus:border-blue-500/50 min-w-[140px] appearance-none"
                        >
                            <option value="all">{t('site.clients.filter_type_all')}</option>
                            <option value="wired">{t('site.clients.filter_type_wired')}</option>
                            <option value="wireless">{t('site.clients.filter_type_wireless')}</option>
                        </select>
                    </div>

                    <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-black uppercase text-slate-500 ml-1 tracking-widest">{t('site.clients.filter_health_label')}</label>
                        <select
                            value={healthFilter}
                            onChange={(e) => setHealthFilter(e.target.value)}
                            className="h-14 bg-slate-900 border border-white/5 rounded-2xl px-5 text-white text-sm font-bold focus:outline-none focus:border-blue-500/50 min-w-[140px] appearance-none"
                        >
                            <option value="all">{t('site.clients.filter_health_all')}</option>
                            <option value="good">{t('site.clients.filter_health_good')}</option>
                            <option value="fair">{t('site.clients.filter_health_fair')}</option>
                            <option value="poor">{t('site.clients.filter_health_poor')}</option>
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
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                        <table className="w-full min-w-[1200px] text-left text-sm whitespace-nowrap block md:table">
                            <thead className="bg-slate-900/50 text-slate-500 border-b border-white/5 table-header-sticky">
                                <tr>
                                    <SortableContext items={columns.map(c => c.id)} strategy={horizontalListSortingStrategy}>
                                        {columns.map(col => (
                                            <SortableHeader
                                                key={col.id}
                                                id={col.id}
                                                content={t(col.labelKey)}
                                                onSort={col.sortable ? () => handleSort(col.id) : null}
                                                sortIcon={col.sortable ? <SortIcon column={col.id} /> : null}
                                                minWidth={col.minWidth}
                                            />
                                        ))}
                                    </SortableContext>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5 text-slate-300">
                                {processedClients.map((item) => {
                                    const isWired = item.clientType?.toLowerCase() === 'wired';

                                    // Rule: Client: Use item.name. If name is null or same as mac, fallback to item.hostName or item.macAddress.
                                    const clientName = (item.name && item.name !== item.macAddress)
                                        ? item.name
                                        : (item.hostName || item.macAddress || '');

                                    const isUp = (item.status || "").toLowerCase() === 'up';

                                    // Rule: Network: Smart deep search (Wireless -> Wired -> Connected Ports -> VLAN)
                                    const networkDisplay = item.wirelessNetworkName ||
                                        item.wiredNetworkName ||
                                        item.connectedToPorts?.[0]?.accessedWiredNetworks?.[0]?.networkName ||
                                        (item.vlanId ? `VLAN ${item.vlanId}` : '');

                                    // Rule: Device (AP/Switch Name): Map directly from item.deviceName
                                    const deviceDisplayName = item.deviceName || '';

                                    // Device Model Mapping (Task 1 Context)
                                    const devicePartNumber = item.associatedDevicePartNumber || item.partNumber || '';
                                    const modelName = PART_NUMBER_MAP[devicePartNumber] || '';

                                    const renderCell = (colId) => {
                                        switch (colId) {
                                            case 'client':
                                                return (
                                                    <td key={colId} className="px-6 py-4 bg-slate-900 group-hover:bg-white/[0.03] transition-colors">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-10 h-10 bg-slate-800 rounded-xl flex items-center justify-center text-blue-400 border border-white/5 group-hover:border-blue-500/30 transition-colors">
                                                                <Laptop size={18} />
                                                            </div>
                                                            <div className="min-w-0 flex-1">
                                                                <div className="text-white font-bold tracking-tight text-sm truncate max-w-[180px]" title={clientName}>{clientName}</div>
                                                                <div className="text-[10px] text-slate-500 font-mono uppercase truncate max-w-[180px] flex items-center gap-1">
                                                                    <span>{item.macAddress || ''}</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                );
                                            case 'health':
                                                return (
                                                    <td key={colId} className="px-6 py-4">
                                                        <div className="flex items-center gap-2">
                                                            <div className={`w-2 h-2 rounded-full ${getHealthColor(item.health)} shadow-[0_0_8px] shadow-current`}></div>
                                                            <span className={`text-[10px] font-black uppercase tracking-widest ${getHealthTextClass(item.health)}`}>
                                                                {capitalize(item.health)}
                                                            </span>
                                                        </div>
                                                    </td>
                                                );
                                            case 'state':
                                                return (
                                                    <td key={colId} className="px-6 py-4">
                                                        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-800 rounded-full w-fit border border-white/5">
                                                            <Circle size={8} className={isUp ? "fill-emerald-500 text-emerald-500" : "text-slate-600"} />
                                                            <span className="text-[10px] font-bold uppercase">{isUp ? t('site.clients.state_online') : t('site.clients.state_offline')}</span>
                                                        </div>
                                                    </td>
                                                );
                                            case 'type':
                                                return (
                                                    <td key={colId} className="px-6 py-4">
                                                        <div className="flex items-center gap-2 text-xs font-bold">
                                                            {isWired ? <Globe size={14} className="text-emerald-500" /> : <Wifi size={14} className="text-blue-500" />}
                                                            <span className="text-slate-200">{capitalize(item.clientType)}</span>
                                                        </div>
                                                    </td>
                                                );
                                            case 'network':
                                                return (
                                                    <td key={colId} className="px-6 py-4">
                                                        <div className="text-xs font-bold text-slate-200">{networkDisplay}</div>
                                                    </td>
                                                );
                                            case 'interface':
                                                return (
                                                    <td key={colId} className="px-6 py-4">
                                                        <div className="text-xs font-bold text-slate-200 font-mono">{formatInterface(item)}</div>
                                                    </td>
                                                );
                                            case 'mac':
                                                return (
                                                    <td key={colId} className="px-6 py-4">
                                                        <div className="text-xs font-black text-slate-200 font-mono">
                                                            {item.macAddress || '-'}
                                                        </div>
                                                    </td>
                                                );
                                            case 'ip':
                                                return (
                                                    <td key={colId} className="px-6 py-4">
                                                        <div className="text-xs font-black text-slate-200 font-mono">
                                                            {item.ipAddress || ''}
                                                        </div>
                                                    </td>
                                                );
                                            case 'device':
                                                return (
                                                    <td key={colId} className="px-6 py-4">
                                                        <div className="text-xs font-bold text-white uppercase tracking-tight">
                                                            {deviceDisplayName}
                                                        </div>
                                                        <div className="text-[9px] text-slate-500 font-bold">
                                                            {modelName !== '' ? modelName : (devicePartNumber || '')}
                                                        </div>
                                                    </td>
                                                );
                                            case 'usage':
                                                const totalBytes = (item.downstreamDataTransferredInBytes || 0) + (item.upstreamDataTransferredInBytes || 0);
                                                return (
                                                    <td key={colId} className="px-6 py-4 text-right">
                                                        <div className="text-white font-black text-xs tracking-tighter">
                                                            {formatBytes(totalBytes)}
                                                        </div>
                                                        <div className="text-[9px] text-slate-500 font-bold uppercase">{t('site.clients.usage_total')}</div>
                                                    </td>
                                                );
                                            case 'duration':
                                                return (
                                                    <td key={colId} className="px-6 py-4 text-xs font-bold text-slate-400">
                                                        {formatDuration(item)}
                                                    </td>
                                                );
                                            default: return <td key={colId}></td>;
                                        }
                                    };

                                    return (
                                        <tr key={item.id || item.macAddress} className="hover:bg-white/[0.02] transition-colors group border-b border-white/5 last:border-0 hover:-translate-y-0.5">
                                            {columns.map(col => renderCell(col.id))}
                                        </tr>
                                    );
                                })}
                                {!loading && processedClients.length === 0 && (
                                    <tr>
                                        <td colSpan={columns.length} className="px-6 py-20 text-center text-slate-500 bg-black/10">
                                            <div className="flex flex-col items-center">
                                                <Users size={48} className="mb-4 opacity-5" />
                                                <p className="text-lg font-black text-slate-500 uppercase tracking-widest">{t('site.clients.empty_state_title')}</p>
                                                <p className="text-xs text-slate-600 mt-2">{t('site.clients.empty_state_hint')}</p>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </DndContext>
                </div>
            </div>
        </div>
    );
};

export default Clients;
