import React, { useState } from 'react';
import { Wifi, Users, ArrowUp, ArrowDown } from 'lucide-react';
import { formatBytes } from '../../../api/apiClient';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

// --- Helpers ---
const HEALTH_CONFIG = {
    good:    { dot: 'bg-emerald-500', label: 'Good',    text: 'text-emerald-400' },
    warning: { dot: 'bg-amber-500',   label: 'Warning', text: 'text-amber-400' },
    poor:    { dot: 'bg-rose-500',    label: 'Poor',    text: 'text-rose-400' },
    none:    { dot: 'bg-slate-600',   label: 'None',    text: 'text-slate-500' },
};
const getHealth = (h) => HEALTH_CONFIG[h?.toLowerCase()] || HEALTH_CONFIG.none;

const USAGE_CONFIG = {
    employee:   { label: 'Employee', color: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' },
    guest:      { label: 'Guest',    color: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
    management: { label: 'Mgmt',     color: 'bg-slate-700 th-text-secondary border-white/10' },
};
const getUsage = (u) =>
    USAGE_CONFIG[u?.toLowerCase()] || { label: u || 'Employee', color: 'bg-slate-700 text-slate-400 border-white/5' };

// --- Component ---
const WirelessTable = ({ data, loading, onNetworkSelect }) => {
    const [sortConfig, setSortConfig] = useState({ key: 'clients', direction: 'desc' });

    const handleSort = (key) => {
        setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc' }));
    };

    const sorted = [...data].sort((a, b) => {
        let valA, valB;
        switch (sortConfig.key) {
            case 'name':    valA = a.name.toLowerCase();  valB = b.name.toLowerCase(); break;
            case 'clients': valA = a.clients;             valB = b.clients;            break;
            case 'vlan':    valA = Number(a.vlanId) || 0; valB = Number(b.vlanId) || 0; break;
            case 'health':  valA = a.health || '';        valB = b.health || '';        break;
            default: return 0;
        }
        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
    });

    const SortIcon = ({ column }) => {
        if (sortConfig.key !== column)
            return <ArrowDown size={10} className="opacity-20 ml-0.5 inline" />;
        return sortConfig.direction === 'asc'
            ? <ArrowUp size={10} className="text-indigo-500 ml-0.5 inline" />
            : <ArrowDown size={10} className="text-indigo-500 ml-0.5 inline" />;
    };

    // ── Mobile card ──
    const renderCard = (ssid) => {
        const health = getHealth(ssid.health);
        const usageCfg = getUsage(ssid.usage);

        return (
            <div key={ssid.id} className="th-bg-surface border th-border rounded-xl p-4 space-y-3">
                {/* Top: name + state */}
                <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                        <div className="p-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 shrink-0">
                            <Wifi size={12} />
                        </div>
                        <p className="th-text-primary font-bold text-sm truncate">{ssid.name}</p>
                    </div>
                    {ssid.isEnabled ? (
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

                {/* Info grid */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                    <div>
                        <span className="text-[10px] text-slate-500 uppercase tracking-wider">Health</span>
                        <div className={`flex items-center gap-1 ${health.text}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${health.dot}`} />
                            <span className="font-medium">{health.label}</span>
                        </div>
                    </div>
                    <div>
                        <span className="text-[10px] text-slate-500 uppercase tracking-wider">Clients</span>
                        <div className="flex items-center gap-1">
                            <Users size={10} className={ssid.clients > 0 ? 'text-indigo-400' : 'text-slate-600'} />
                            <span className={`font-bold ${ssid.clients > 0 ? 'th-text-primary' : 'text-slate-600'}`}>{ssid.clients}</span>
                        </div>
                    </div>
                    <div>
                        <span className="text-[10px] text-slate-500 uppercase tracking-wider">Usage</span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold uppercase border ${usageCfg.color}`}>
                            {usageCfg.label}
                        </span>
                    </div>
                    <div>
                        <span className="text-[10px] text-slate-500 uppercase tracking-wider">VLAN</span>
                        <span className="font-mono font-bold text-indigo-400 text-[11px]">{ssid.vlanId ?? '—'}</span>
                    </div>
                    <div>
                        <span className="text-[10px] text-slate-500 uppercase tracking-wider">Band</span>
                        <div className="th-text-secondary">{ssid.band || '—'}</div>
                    </div>
                    <div>
                        <span className="text-[10px] text-slate-500 uppercase tracking-wider">Security</span>
                        <div className="text-slate-400">{ssid.security || '—'}</div>
                    </div>
                </div>

                {/* 24h Usage footer */}
                {ssid.usage24h != null && (
                    <div className="pt-2 border-t border-white/5 text-[10px] text-slate-500">
                        24h Usage: <span className="th-text-secondary font-medium">{formatBytes(ssid.usage24h)}</span>
                    </div>
                )}
            </div>
        );
    };

    return (
        <>
            {/* Loading */}
            {loading && (
                <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-7 w-7 border-t-2 border-b-2 border-blue-500" />
                </div>
            )}

            {/* Mobile cards */}
            {!loading && (
                <div className="md:hidden space-y-3">
                    {data.length === 0 ? (
                        <div className="text-center py-10">
                            <Wifi size={32} className="mx-auto mb-2 opacity-10" />
                            <p className="text-sm font-bold text-slate-600 uppercase tracking-wider">No Wireless Networks</p>
                            <p className="text-xs text-slate-600 mt-1">No SSIDs found for this site</p>
                        </div>
                    ) : sorted.map(ssid => renderCard(ssid))}
                </div>
            )}

            {/* Desktop table */}
            {!loading && (
                <div className="hidden md:block">
                    <div className="th-bg-surface rounded-xl border border-white/5 overflow-hidden shadow-xl">
                        <div className="max-h-[calc(100vh-400px)] overflow-auto custom-scrollbar">
                            <Table>
                                <TableHeader className="table-header-sticky">
                                    <TableRow className="th-bg-surface-alt hover:bg-transparent border-b border-white/5">
                                        <TableHead onClick={() => handleSort('name')} className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 cursor-pointer hover:th-text-primary transition-colors min-w-[180px]">
                                            Network <SortIcon column="name" />
                                        </TableHead>
                                        <TableHead className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 min-w-[80px]">
                                            State
                                        </TableHead>
                                        <TableHead onClick={() => handleSort('health')} className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 cursor-pointer hover:th-text-primary transition-colors min-w-[80px]">
                                            Health <SortIcon column="health" />
                                        </TableHead>
                                        <TableHead className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 min-w-[90px]">
                                            Usage
                                        </TableHead>
                                        <TableHead className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 min-w-[120px]">
                                            Band
                                        </TableHead>
                                        <TableHead className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 min-w-[80px]">
                                            Security
                                        </TableHead>
                                        <TableHead onClick={() => handleSort('vlan')} className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 cursor-pointer hover:th-text-primary transition-colors min-w-[70px]">
                                            VLAN <SortIcon column="vlan" />
                                        </TableHead>
                                        <TableHead className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 min-w-[100px]">
                                            24h Usage
                                        </TableHead>
                                        <TableHead onClick={() => handleSort('clients')} className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-500 text-right cursor-pointer hover:th-text-primary transition-colors min-w-[80px]">
                                            Clients <SortIcon column="clients" />
                                        </TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {sorted.map(ssid => {
                                        const health = getHealth(ssid.health);
                                        const usageCfg = getUsage(ssid.usage);
                                        return (
                                            <TableRow key={ssid.id} className="transition-colors group">
                                                <TableCell className="px-4 py-3">
                                                    <div className="flex items-center gap-2">
                                                        <div className="p-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 shrink-0">
                                                            <Wifi size={12} />
                                                        </div>
                                                        <p className="th-text-primary font-bold text-xs truncate max-w-[160px]" title={ssid.name}>
                                                            {ssid.name}
                                                        </p>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="px-4 py-3">
                                                    {ssid.isEnabled ? (
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
                                                <TableCell className="px-4 py-3">
                                                    <span className={`flex items-center gap-1 text-xs font-medium ${health.text}`}>
                                                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${health.dot}`} />
                                                        {health.label}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="px-4 py-3">
                                                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${usageCfg.color}`}>
                                                        {usageCfg.label}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="px-4 py-3 text-xs font-medium th-text-secondary">{ssid.band || '—'}</TableCell>
                                                <TableCell className="px-4 py-3 text-xs text-slate-400">{ssid.security || '—'}</TableCell>
                                                <TableCell className="px-4 py-3">
                                                    <span className="font-mono font-bold text-indigo-400 text-xs bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                                                        {ssid.vlanId ?? '—'}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="px-4 py-3 text-xs text-slate-500">
                                                    {ssid.usage24h != null ? formatBytes(ssid.usage24h) : '—'}
                                                </TableCell>
                                                <TableCell className="px-4 py-3 text-right">
                                                    <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl border transition-all ${
                                                        ssid.clients > 0
                                                            ? 'th-bg-elevated border-indigo-500/20 group-hover:border-indigo-500/40'
                                                            : 'th-bg-surface border-white/5 opacity-50'
                                                    }`}>
                                                        <Users size={10} className={ssid.clients > 0 ? 'text-indigo-400' : 'text-slate-600'} />
                                                        <span className={`font-bold text-xs ${ssid.clients > 0 ? 'th-text-primary' : 'text-slate-600'}`}>
                                                            {ssid.clients}
                                                        </span>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}

                                    {data.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={9} className="px-6 py-12 text-center text-slate-500">
                                                <Wifi size={32} className="mx-auto mb-2 opacity-10" />
                                                <p className="text-sm font-bold text-slate-600 uppercase tracking-wider">No Wireless Networks</p>
                                                <p className="text-xs text-slate-600 mt-1">No SSIDs found for this site</p>
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

export default WirelessTable;
