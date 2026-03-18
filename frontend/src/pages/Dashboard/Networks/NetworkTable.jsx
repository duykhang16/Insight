import React from 'react';
import { ArrowDown, ArrowUp, Network, Plug, Wifi, Users } from 'lucide-react';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

// ── Helpers ──
const TYPE_CONFIG = {
    employee: { label: 'Employee', color: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' },
    guest:    { label: 'Guest',    color: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
};
const getTypeConfig = (type) =>
    TYPE_CONFIG[type?.toLowerCase()] || { label: type || 'Employee', color: 'bg-slate-700 text-slate-400 border-white/5' };

const BAND_LABEL = { '5ghz': '5 GHz', '2.4ghz': '2.4 GHz', '6ghz': '6 GHz' };
const getBandLabel = (band) => BAND_LABEL[band?.toLowerCase()] || band || null;

const SsidChip = ({ ssid }) => (
    <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-medium transition-opacity ${
        ssid.isEnabled
            ? 'bg-blue-500/10 border-blue-500/20 text-blue-300'
            : 'th-bg-elevated border-white/5 text-slate-600 opacity-50'
    }`}>
        <Wifi size={9} />
        <span className="font-bold">{ssid.name}</span>
        {getBandLabel(ssid.band) && <span className="text-[8px] opacity-60">· {getBandLabel(ssid.band)}</span>}
        {ssid.clients > 0 && (
            <span className="ml-0.5 bg-blue-500/20 px-1 py-0.5 rounded text-[8px] font-bold text-blue-300">{ssid.clients}</span>
        )}
    </div>
);

// ── Component ──
const NetworkTable = ({ data, sortConfig, onSort, loading, onNetworkSelect }) => {
    const handleNetworkActivate = (networkId) => onNetworkSelect?.(networkId);

    const SortIcon = ({ column }) => {
        if (sortConfig.key !== column) return <ArrowDown size={10} className="opacity-20 ml-0.5 inline" />;
        return sortConfig.direction === 'asc'
            ? <ArrowUp size={10} className="text-indigo-500 ml-0.5 inline" />
            : <ArrowDown size={10} className="text-indigo-500 ml-0.5 inline" />;
    };

    // ── Mobile card ──
    const renderCard = (net) => {
        const typeConfig = getTypeConfig(net.type);
        return (
            <div key={net.id} className="th-bg-surface border th-border rounded-xl p-4 space-y-3">
                {/* Top: name + status */}
                <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                        <div className="p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 shrink-0">
                            <Plug size={12} />
                        </div>
                        {onNetworkSelect ? (
                            <button
                                type="button"
                                onClick={() => handleNetworkActivate(net.id)}
                                className="th-text-primary font-bold text-sm truncate text-left transition-colors hover:text-amber-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60 rounded-sm"
                                title={net.name}
                            >
                                {net.name}
                            </button>
                        ) : (
                            <p className="th-text-primary font-bold text-sm truncate">{net.name}</p>
                        )}
                    </div>
                    {net.isEnabled ? (
                        <span className="flex items-center gap-1 text-[10px] font-bold uppercase text-emerald-400 shrink-0">
                            <span className="relative flex h-1.5 w-1.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-50" />
                                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                            </span>
                            Active
                        </span>
                    ) : (
                        <span className="flex items-center gap-1 text-[10px] font-bold uppercase text-slate-600 shrink-0">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-700" />
                            Inactive
                        </span>
                    )}
                </div>

                {/* Info row */}
                <div className="flex items-center gap-3 text-xs">
                    <span className="font-mono font-bold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                        VLAN {net.vlanId}
                    </span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold uppercase border ${typeConfig.color}`}>
                        {typeConfig.label}
                    </span>
                    <div className="flex items-center gap-1 ml-auto">
                        <Users size={10} className={net.totalClients > 0 ? 'text-indigo-400' : 'text-slate-600'} />
                        <span className={`font-bold ${net.totalClients > 0 ? 'th-text-primary' : 'text-slate-600'}`}>{net.totalClients}</span>
                    </div>
                </div>

                {/* SSIDs */}
                {net.ssids.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                        {net.ssids.map(ssid => <SsidChip key={ssid.id} ssid={ssid} />)}
                    </div>
                )}
                {net.ssids.length === 0 && (
                    <div className="text-[10px] text-slate-600">No SSIDs attached</div>
                )}
            </div>
        );
    };

    return (
        <>
            {/* Loading */}
            {loading && (
                <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-7 w-7 border-t-2 border-b-2 border-amber-500" />
                </div>
            )}

            {/* Mobile cards */}
            {!loading && (
                <div className="md:hidden space-y-3">
                    {data.length === 0 ? (
                        <div className="text-center py-10">
                            <Network size={32} className="mx-auto mb-2 opacity-10" />
                            <p className="text-sm font-bold text-slate-600 uppercase tracking-wider">No Networks</p>
                            <p className="text-xs text-slate-600 mt-1">No wired networks found for this site</p>
                        </div>
                    ) : data.map(net => renderCard(net))}
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
                                        <TableHead onClick={() => onSort('name')} className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 cursor-pointer hover:th-text-primary transition-colors min-w-[180px]">
                                            Network Name <SortIcon column="name" />
                                        </TableHead>
                                        <TableHead onClick={() => onSort('vlan')} className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 cursor-pointer hover:th-text-primary transition-colors min-w-[80px]">
                                            VLAN <SortIcon column="vlan" />
                                        </TableHead>
                                        <TableHead onClick={() => onSort('type')} className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 cursor-pointer hover:th-text-primary transition-colors min-w-[100px]">
                                            Type <SortIcon column="type" />
                                        </TableHead>
                                        <TableHead className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 min-w-[240px]">
                                            Attached SSIDs
                                        </TableHead>
                                        <TableHead onClick={() => onSort('clients')} className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 text-right cursor-pointer hover:th-text-primary transition-colors min-w-[100px]">
                                            Clients <SortIcon column="clients" />
                                        </TableHead>
                                        <TableHead onClick={() => onSort('status')} className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 cursor-pointer hover:th-text-primary transition-colors min-w-[80px]">
                                            Status <SortIcon column="status" />
                                        </TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {data.map(net => {
                                        const typeConfig = getTypeConfig(net.type);
                                        return (
                                            <TableRow key={net.id} className="transition-colors group">
                                                <TableCell className="px-4 py-3">
                                                    <div className="flex items-center gap-2">
                                                        <div className="p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 shrink-0">
                                                            <Plug size={12} />
                                                        </div>
                                                        {onNetworkSelect ? (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleNetworkActivate(net.id)}
                                                                className="th-text-primary font-bold text-xs truncate max-w-[160px] text-left transition-colors hover:text-amber-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60 rounded-sm"
                                                                title={net.name}
                                                            >
                                                                {net.name}
                                                            </button>
                                                        ) : (
                                                            <p className="th-text-primary font-bold text-xs truncate max-w-[160px]" title={net.name}>{net.name}</p>
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="px-4 py-3">
                                                    <span className="font-mono font-bold text-indigo-400 text-xs bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                                                        {net.vlanId}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="px-4 py-3">
                                                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${typeConfig.color}`}>
                                                        {typeConfig.label}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="px-4 py-3">
                                                    {net.ssids.length === 0 ? (
                                                        <span className="text-slate-700 text-xs">No SSIDs</span>
                                                    ) : (
                                                        <div className="flex flex-wrap gap-1">
                                                            {net.ssids.map(ssid => <SsidChip key={ssid.id} ssid={ssid} />)}
                                                        </div>
                                                    )}
                                                </TableCell>
                                                <TableCell className="px-4 py-3 text-right">
                                                    <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl border transition-all ${
                                                        net.totalClients > 0
                                                            ? 'th-bg-elevated border-indigo-500/20 group-hover:border-indigo-500/40'
                                                            : 'th-bg-surface border-white/5 opacity-50'
                                                    }`}>
                                                        <Users size={10} className={net.totalClients > 0 ? 'text-indigo-400' : 'text-slate-600'} />
                                                        <span className={`font-bold text-xs ${net.totalClients > 0 ? 'th-text-primary' : 'text-slate-600'}`}>
                                                            {net.totalClients}
                                                        </span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="px-4 py-3">
                                                    {net.isEnabled ? (
                                                        <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                                                            <span className="relative flex h-1.5 w-1.5">
                                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-50" />
                                                                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                                                            </span>
                                                            Active
                                                        </span>
                                                    ) : (
                                                        <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                                                            <span className="w-1.5 h-1.5 rounded-full bg-slate-700" />
                                                            Inactive
                                                        </span>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}

                                    {data.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={6} className="px-6 py-12 text-center text-slate-500">
                                                <Network size={32} className="mx-auto mb-2 opacity-10" />
                                                <p className="text-sm font-bold text-slate-600 uppercase tracking-wider">No Networks</p>
                                                <p className="text-xs text-slate-600 mt-1">No wired networks found for this site</p>
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default NetworkTable;
