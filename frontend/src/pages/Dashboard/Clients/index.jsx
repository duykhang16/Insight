import React, { useState, useEffect, useMemo } from 'react';
import { Users, Search, RefreshCw, AlertCircle, Laptop, Globe, Wifi, Circle, ArrowDown, ArrowUp, GripVertical, X } from 'lucide-react';
import apiClient, { formatBytes } from '../../../api/apiClient';
import { useSite } from '../../../context/SiteContext';
import { useSettings } from '../../../context/SettingsContext';
import useIntervalFetch from '../../../hooks/useIntervalFetch';
import { useLanguage } from '../../../context/LanguageContext';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

// ── Sortable header (desktop only, drag-reorder) ─────────────────────────────
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
        <TableHead
            ref={setNodeRef}
            style={style}
            className={`px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 transition-colors group ${isDragging ? 'th-bg-elevated shadow-xl' : 'hover:th-text-primary'}`}
        >
            <div className="flex items-center gap-1.5">
                <div
                    {...attributes}
                    {...listeners}
                    className="cursor-grab active:cursor-grabbing text-slate-600 hover:text-slate-400 p-0.5 -ml-1 rounded"
                    title="Drag to reorder"
                >
                    <GripVertical size={12} />
                </div>
                <div onClick={onSort} className={`flex items-center ${onSort ? 'cursor-pointer' : ''}`}>
                    {content} {sortIcon && <span className="ml-0.5">{sortIcon}</span>}
                </div>
            </div>
        </TableHead>
    );
};

// ── Main component ───────────────────────────────────────────────────────────
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

    const PART_NUMBER_MAP = {
        'JL678A': '6200F', 'JL439A': '2930F', 'R2X11A': 'AP-505', 'R2H28A': 'AP-515',
        'JZ336A': 'AP-535', 'Q9H62A': 'AP-515', 'R4H16A': 'AP-565', 'Q9H59A': 'AP-514',
        'JL807A': '1930 8G', 'JL681A': '1930 8G PoE', 'JL682A': '1930 24G PoE',
        'S0G14A': 'AP-22', 'R2X01A': 'AP-11', 'R2X06A': 'AP-15',
    };

    const DEFAULT_COLUMNS = [
        { id: 'client', labelKey: 'site.clients.table_header_client', minWidth: 200, sortable: true },
        { id: 'network', labelKey: 'site.clients.table_header_network', minWidth: 120, sortable: true },
        { id: 'usage', labelKey: 'site.clients.table_header_usage', minWidth: 100, sortable: true },
        { id: 'health', labelKey: 'site.clients.table_header_health', minWidth: 80, sortable: true },
        { id: 'state', labelKey: 'site.clients.table_header_state', minWidth: 80, sortable: false },
        { id: 'duration', labelKey: 'site.clients.table_header_duration', minWidth: 80, sortable: true },
        { id: 'type', labelKey: 'site.clients.table_header_type', minWidth: 80, sortable: false },
        { id: 'ip', labelKey: 'site.clients.table_header_ip', minWidth: 100, sortable: false },
        { id: 'device', labelKey: 'site.clients.table_header_device', minWidth: 130, sortable: false },
        { id: 'interface', labelKey: 'site.clients.table_header_interface', minWidth: 120, sortable: false },
    ];

    const [columns, setColumns] = useState(() => {
        const saved = localStorage.getItem('client_table_layout');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                const defaultIds = DEFAULT_COLUMNS.map(c => c.id);
                if (parsed.length === DEFAULT_COLUMNS.length && parsed.every(c => defaultIds.includes(c.id))) {
                    return parsed.map(p => ({ ...DEFAULT_COLUMNS.find(d => d.id === p.id), ...p }));
                }
            } catch (e) { console.error("Invalid column data"); }
        }
        return DEFAULT_COLUMNS;
    });

    const resetColumns = () => { setColumns(DEFAULT_COLUMNS); localStorage.removeItem('client_table_layout'); };

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor)
    );

    const handleDragEnd = (event) => {
        const { active, over } = event;
        if (active.id !== over.id) {
            setColumns((items) => {
                const oldIndex = items.findIndex(i => i.id === active.id);
                const newIndex = items.findIndex(i => i.id === over.id);
                const newArray = arrayMove(items, oldIndex, newIndex);
                localStorage.setItem('client_table_layout', JSON.stringify(newArray));
                return newArray;
            });
        }
    };

    useEffect(() => {
        if (sites.length === 0) fetchSites();
        const params = new URLSearchParams(window.location.search);
        if (params.has('health')) setHealthFilter(params.get('health'));
        if (params.has('type')) setTypeFilter(params.get('type'));
    }, []);

    useEffect(() => { if (selectedSiteId) fetchClients(selectedSiteId); }, [selectedSiteId]);

    const fetchClients = async (siteId, silent = false) => {
        if (!silent) setLoading(true);
        setError('');
        try {
            const res = await apiClient.get(`/overview/sites/${siteId}/clients`);
            setClients(Array.isArray(res.data) ? res.data : []);
            setLastUpdated(new Date());
        } catch (err) {
            console.error("Clients fetch error:", err);
            if (err.response?.status !== 401 && !silent) setError(t('site.clients.error_fetch'));
        } finally {
            if (!silent) setLoading(false);
        }
    };

    useIntervalFetch(() => {
        if (selectedSiteId && !loading) fetchClients(selectedSiteId, true);
    }, isAutoRefreshEnabled ? 60000 : null, [selectedSiteId, loading, isAutoRefreshEnabled]);

    const formatDuration = (item) => {
        const rawSeconds = item?.durationSeconds ?? 0;
        if (rawSeconds <= 0) return '';
        const days = Math.floor(rawSeconds / 86400);
        const hours = Math.floor((rawSeconds % 86400) / 3600);
        const minutes = Math.floor((rawSeconds % 3600) / 60);
        let parts = [];
        if (days > 0) parts.push(`${days}d`);
        if (hours > 0) parts.push(`${hours}h`);
        if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);
        return parts.join(' ');
    };

    const capitalize = (str) => str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
    const getHealthColor = (h) => { const v = (h || '').toLowerCase(); if (v === 'good') return 'bg-emerald-500'; if (v === 'fair') return 'bg-amber-500'; if (v === 'poor') return 'bg-rose-500'; return 'bg-slate-500'; };
    const getHealthTextClass = (h) => { const v = (h || '').toLowerCase(); if (v === 'good') return 'text-emerald-500'; if (v === 'fair') return 'text-amber-500'; if (v === 'poor') return 'text-rose-500'; return 'text-slate-500'; };

    const handleSort = (key) => {
        setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc' }));
    };

    const processedClients = useMemo(() => {
        let result = [...(clients || [])].filter(c => {
            if (!c) return false;
            const matchesSearch = (c.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (c.macAddress || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (c.ipAddress || '').toString().includes(searchTerm);
            const matchesType = typeFilter === 'all' || c.clientType === typeFilter;
            const matchesHealth = healthFilter === 'all' || (c.health || '').toLowerCase() === healthFilter;
            return matchesSearch && matchesType && matchesHealth;
        });
        result.sort((a, b) => {
            let valA, valB;
            switch (sortConfig.key) {
                case 'client': valA = (a.name || a.macAddress || '').toLowerCase(); valB = (b.name || b.macAddress || '').toLowerCase(); break;
                case 'health': { const p = { good: 3, fair: 2, poor: 1, '': 0 }; valA = p[(a.health || '').toLowerCase()] ?? 0; valB = p[(b.health || '').toLowerCase()] ?? 0; break; }
                case 'duration': valA = a.durationSeconds || 0; valB = b.durationSeconds || 0; break;
                case 'network': valA = (a.network || '').toLowerCase(); valB = (b.network || '').toLowerCase(); break;
                case 'usage': valA = a.usageTotal || 0; valB = b.usageTotal || 0; break;
                default: return 0;
            }
            if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
            if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
        return result;
    }, [clients, searchTerm, typeFilter, healthFilter, sortConfig]);

    const SortIcon = ({ column }) => {
        if (sortConfig.key !== column) return <ArrowDown size={10} className="opacity-20 inline" />;
        return sortConfig.direction === 'asc'
            ? <ArrowUp size={10} className="text-blue-500 inline" />
            : <ArrowDown size={10} className="text-blue-500 inline" />;
    };

    // ── Mobile card ──
    const renderCard = (item) => {
        const clientName = item.name || item.macAddress || '';
        const isUp = (item.status || '').toLowerCase() === 'up';
        const isWired = item.clientType?.toLowerCase() === 'wired';
        const devicePartNumber = item.devicePartNumber || '';
        const modelName = PART_NUMBER_MAP[devicePartNumber] || '';

        return (
            <div key={item.id || item.macAddress} className="th-bg-surface border th-border rounded-xl p-4 space-y-3">
                {/* Client name + health */}
                <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <div className="w-9 h-9 th-bg-elevated rounded-lg flex items-center justify-center text-blue-400 border border-white/5 shrink-0">
                            <Laptop size={16} />
                        </div>
                        <div className="min-w-0">
                            <div className="th-text-primary font-bold text-sm truncate">{clientName}</div>
                            <div className="text-[10px] text-slate-500 font-mono">{item.macAddress || ''}</div>
                        </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                        <div className={`w-2 h-2 rounded-full ${getHealthColor(item.health)}`} />
                        <span className={`text-[10px] font-bold uppercase ${getHealthTextClass(item.health)}`}>
                            {capitalize(item.health)}
                        </span>
                    </div>
                </div>

                {/* Info grid */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                    <div>
                        <span className="text-[10px] text-slate-500 uppercase tracking-wider">{t('site.clients.table_header_network')}</span>
                        <div className="th-text-primary font-medium truncate">{item.network || '—'}</div>
                    </div>
                    <div>
                        <span className="text-[10px] text-slate-500 uppercase tracking-wider">{t('site.clients.table_header_usage')}</span>
                        <div className="th-text-primary font-bold">{formatBytes(item.usageTotal || 0)}</div>
                    </div>
                    <div>
                        <span className="text-[10px] text-slate-500 uppercase tracking-wider">{t('site.clients.table_header_type')}</span>
                        <div className="flex items-center gap-1">
                            {isWired ? <Globe size={11} className="text-emerald-500" /> : <Wifi size={11} className="text-blue-500" />}
                            <span className="th-text-primary">{capitalize(item.clientType)}</span>
                        </div>
                    </div>
                    <div>
                        <span className="text-[10px] text-slate-500 uppercase tracking-wider">{t('site.clients.table_header_state')}</span>
                        <div className="flex items-center gap-1">
                            <Circle size={6} className={isUp ? 'fill-emerald-500 text-emerald-500' : 'text-slate-600'} />
                            <span className="font-medium">{isUp ? t('site.clients.state_online') : t('site.clients.state_offline')}</span>
                        </div>
                    </div>
                    <div>
                        <span className="text-[10px] text-slate-500 uppercase tracking-wider">{t('site.clients.table_header_ip')}</span>
                        <div className="th-text-primary font-mono text-[11px]">{item.ipAddress || '—'}</div>
                    </div>
                    <div>
                        <span className="text-[10px] text-slate-500 uppercase tracking-wider">{t('site.clients.table_header_duration')}</span>
                        <div className="text-slate-400">{formatDuration(item)}</div>
                    </div>
                </div>

                {/* Device + Interface footer */}
                {(item.device || item.interface) && (
                    <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[10px] text-slate-500">
                        <span>{item.device || ''}{modelName ? ` (${modelName})` : ''}</span>
                        <span className="font-mono">{item.interface || ''}</span>
                    </div>
                )}
            </div>
        );
    };

    // ── Desktop cell renderer ──
    const renderCell = (colId, item) => {
        const clientName = item.name || item.macAddress || '';
        const isUp = (item.status || '').toLowerCase() === 'up';
        const isWired = item.clientType?.toLowerCase() === 'wired';
        const networkDisplay = item.network || '';
        const deviceDisplayName = item.device || '';
        const devicePartNumber = item.devicePartNumber || '';
        const modelName = PART_NUMBER_MAP[devicePartNumber] || '';

        switch (colId) {
            case 'client':
                return (
                    <TableCell key={colId} className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 th-bg-elevated rounded-lg flex items-center justify-center text-blue-400 border border-white/5 shrink-0">
                                <Laptop size={14} />
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="th-text-primary font-bold text-xs truncate max-w-[160px]" title={clientName}>{clientName}</div>
                                <div className="text-[10px] text-slate-500 font-mono truncate max-w-[160px]">{item.macAddress || ''}</div>
                            </div>
                        </div>
                    </TableCell>
                );
            case 'health':
                return (
                    <TableCell key={colId} className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                            <div className={`w-2 h-2 rounded-full ${getHealthColor(item.health)} shadow-[0_0_6px] shadow-current`} />
                            <span className={`text-[10px] font-bold uppercase tracking-wider ${getHealthTextClass(item.health)}`}>{capitalize(item.health)}</span>
                        </div>
                    </TableCell>
                );
            case 'state':
                return (
                    <TableCell key={colId} className="px-4 py-3">
                        <div className="flex items-center gap-1 px-2 py-0.5 th-bg-elevated rounded-full w-fit border border-white/5">
                            <Circle size={6} className={isUp ? 'fill-emerald-500 text-emerald-500' : 'text-slate-600'} />
                            <span className="text-[10px] font-bold uppercase">{isUp ? t('site.clients.state_online') : t('site.clients.state_offline')}</span>
                        </div>
                    </TableCell>
                );
            case 'type':
                return (
                    <TableCell key={colId} className="px-4 py-3">
                        <div className="flex items-center gap-1.5 text-xs font-medium">
                            {isWired ? <Globe size={12} className="text-emerald-500" /> : <Wifi size={12} className="text-blue-500" />}
                            <span className="th-text-primary">{capitalize(item.clientType)}</span>
                        </div>
                    </TableCell>
                );
            case 'network':
                return <TableCell key={colId} className="px-4 py-3 text-xs font-medium th-text-primary">{networkDisplay}</TableCell>;
            case 'interface':
                return <TableCell key={colId} className="px-4 py-3 text-xs th-text-primary font-mono">{item.interface || ''}</TableCell>;
            case 'ip':
                return <TableCell key={colId} className="px-4 py-3 text-xs th-text-primary font-mono">{item.ipAddress || ''}</TableCell>;
            case 'device':
                return (
                    <TableCell key={colId} className="px-4 py-3">
                        <div className="text-xs font-medium th-text-primary uppercase tracking-tight">{deviceDisplayName}</div>
                        <div className="text-[9px] text-slate-500 font-medium">{modelName || devicePartNumber || ''}</div>
                    </TableCell>
                );
            case 'usage':
                return (
                    <TableCell key={colId} className="px-4 py-3 text-right">
                        <div className="th-text-primary font-bold text-xs">{formatBytes(item.usageTotal || 0)}</div>
                        <div className="text-[9px] text-slate-500 uppercase">{t('site.clients.usage_total')}</div>
                    </TableCell>
                );
            case 'duration':
                return <TableCell key={colId} className="px-4 py-3 text-xs text-slate-400">{formatDuration(item)}</TableCell>;
            default:
                return <TableCell key={colId} />;
        }
    };

    return (
        <div className="p-4 md:p-8 pb-32 min-h-screen th-bg-base">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-3">
                <div>
                    <h1 className="text-xl font-black th-text-primary tracking-tight">{t('site.clients.title')}</h1>
                    <p className="text-sm text-slate-400 mt-0.5">
                        {t('site.clients.subtitle')} {sites.find(s => s.siteId === selectedSiteId)?.siteName || 'current site'}
                    </p>
                </div>
                <button
                    onClick={resetColumns}
                    className="hidden md:flex items-center gap-2 px-3 py-2 th-bg-elevated hover:bg-slate-700 th-text-primary text-xs font-semibold rounded-lg border border-white/10 transition-colors"
                >
                    <RefreshCw size={13} />
                    {t('site.clients.reset_columns') || 'Reset layout'}
                </button>
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3 mb-5">
                <div className="relative flex-1 min-w-0">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                    <input
                        type="text"
                        placeholder={t('site.clients.search_placeholder')}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full h-10 pl-9 pr-8 th-bg-surface border border-white/5 rounded-xl th-text-primary text-sm focus:outline-none focus:border-blue-500/50 transition-colors"
                    />
                    {searchTerm && (
                        <button onClick={() => setSearchTerm('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:th-text-primary">
                            <X size={14} />
                        </button>
                    )}
                </div>
                <div className="flex gap-2">
                    <select
                        value={typeFilter}
                        onChange={(e) => setTypeFilter(e.target.value)}
                        className="h-10 th-bg-surface border border-white/5 rounded-xl px-3 th-text-secondary text-xs font-medium focus:outline-none appearance-none min-w-[110px]"
                    >
                        <option value="all">{t('site.clients.filter_type_all')}</option>
                        <option value="wired">{t('site.clients.filter_type_wired')}</option>
                        <option value="wireless">{t('site.clients.filter_type_wireless')}</option>
                    </select>
                    <select
                        value={healthFilter}
                        onChange={(e) => setHealthFilter(e.target.value)}
                        className="h-10 th-bg-surface border border-white/5 rounded-xl px-3 th-text-secondary text-xs font-medium focus:outline-none appearance-none min-w-[110px]"
                    >
                        <option value="all">{t('site.clients.filter_health_all')}</option>
                        <option value="good">{t('site.clients.filter_health_good')}</option>
                        <option value="fair">{t('site.clients.filter_health_fair')}</option>
                        <option value="poor">{t('site.clients.filter_health_poor')}</option>
                    </select>
                </div>
            </div>

            {error && (
                <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-3 text-rose-400">
                    <AlertCircle size={16} />
                    <span className="text-sm font-medium">{error}</span>
                </div>
            )}

            {/* Loading */}
            {loading && clients.length === 0 && (
                <div className="flex items-center justify-center py-16">
                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500" />
                </div>
            )}

            {/* Mobile card view */}
            {!loading && (
                <div className="md:hidden space-y-3">
                    {processedClients.length === 0 ? (
                        <div className="text-center py-12">
                            <Users size={40} className="mx-auto mb-3 text-slate-700" />
                            <p className="text-sm font-bold text-slate-600 uppercase tracking-wider">{t('site.clients.empty_state_title')}</p>
                            <p className="text-xs text-slate-600 mt-1">{t('site.clients.empty_state_hint')}</p>
                        </div>
                    ) : (
                        processedClients.map(item => renderCard(item))
                    )}
                </div>
            )}

            {/* Desktop table */}
            {!loading && (
                <div className="hidden md:block">
                    <div className="th-bg-surface rounded-xl border border-white/5 overflow-hidden shadow-xl">
                        <div className="max-h-[calc(100vh-250px)] overflow-auto custom-scrollbar">
                            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                                <Table>
                                    <TableHeader className="table-header-sticky">
                                        <TableRow className="th-bg-surface-alt hover:bg-transparent border-b border-white/5">
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
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {processedClients.map((item) => (
                                            <TableRow key={item.id || item.macAddress} className="transition-colors group">
                                                {columns.map(col => renderCell(col.id, item))}
                                            </TableRow>
                                        ))}
                                        {processedClients.length === 0 && (
                                            <TableRow>
                                                <TableCell colSpan={columns.length} className="px-6 py-16 text-center text-slate-500">
                                                    <Users size={40} className="mx-auto mb-3 opacity-10" />
                                                    <p className="text-sm font-bold text-slate-600 uppercase tracking-wider">{t('site.clients.empty_state_title')}</p>
                                                    <p className="text-xs text-slate-600 mt-1">{t('site.clients.empty_state_hint')}</p>
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </DndContext>
                        </div>
                    </div>
                </div>
            )}

            {/* Result count */}
            {!loading && processedClients.length > 0 && (
                <div className="mt-3 text-xs text-slate-500">
                    {processedClients.length} {processedClients.length === 1 ? 'client' : 'clients'}
                </div>
            )}
        </div>
    );
};

export default Clients;
