import React, { useState } from 'react';
import { Wifi, Users, ArrowUp, ArrowDown } from 'lucide-react';
import { formatBytes } from './dataProcessor';

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
    management: { label: 'Mgmt',     color: 'bg-slate-700 text-slate-300 border-white/10' },
};
const getUsage = (u) =>
    USAGE_CONFIG[u?.toLowerCase()] || { label: u || 'Employee', color: 'bg-slate-700 text-slate-400 border-white/5' };

// --- Component ---
const WirelessTable = ({ data, loading }) => {
    const [sortConfig, setSortConfig] = useState({ key: 'clients', direction: 'desc' });

    const handleSort = (key) => {
        setSortConfig(prev => ({
            key,
            direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
        }));
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
            return <ArrowDown size={12} className="opacity-20 ml-1 inline" />;
        return sortConfig.direction === 'asc'
            ? <ArrowUp size={12} className="text-indigo-500 ml-1 inline" />
            : <ArrowDown size={12} className="text-indigo-500 ml-1 inline" />;
    };

    return (
        <div className="bg-slate-900 rounded-[2.5rem] shadow-2xl border border-white/5 overflow-hidden w-full">
            <div className="max-h-[calc(100vh-400px)] overflow-auto custom-scrollbar">
                <table className="w-full min-w-[900px] text-left text-sm whitespace-nowrap">
                    <thead className="text-slate-500 border-b border-white/5 sticky top-0 z-10 bg-slate-900">
                        <tr>
                            <th onClick={() => handleSort('name')} className="px-8 py-5 font-black uppercase tracking-widest text-[10px] cursor-pointer hover:text-white transition-colors min-w-[220px]">
                                Network <SortIcon column="name" />
                            </th>
                            <th className="px-6 py-5 font-black uppercase tracking-widest text-[10px] min-w-[90px]">
                                State
                            </th>
                            <th onClick={() => handleSort('health')} className="px-6 py-5 font-black uppercase tracking-widest text-[10px] cursor-pointer hover:text-white transition-colors min-w-[100px]">
                                Health <SortIcon column="health" />
                            </th>
                            <th className="px-6 py-5 font-black uppercase tracking-widest text-[10px] min-w-[110px]">
                                Usage
                            </th>
                            <th className="px-6 py-5 font-black uppercase tracking-widest text-[10px] min-w-[150px]">
                                Band
                            </th>
                            <th className="px-6 py-5 font-black uppercase tracking-widest text-[10px] min-w-[100px]">
                                Security
                            </th>
                            <th onClick={() => handleSort('vlan')} className="px-6 py-5 font-black uppercase tracking-widest text-[10px] cursor-pointer hover:text-white transition-colors min-w-[90px]">
                                VLAN <SortIcon column="vlan" />
                            </th>
                            <th className="px-6 py-5 font-black uppercase tracking-widest text-[10px] min-w-[120px]">
                                24h Usage
                            </th>
                            <th onClick={() => handleSort('clients')} className="px-6 py-5 font-black uppercase tracking-widest text-[10px] cursor-pointer hover:text-white transition-colors text-right min-w-[100px]">
                                Clients <SortIcon column="clients" />
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-slate-300">
                        {loading && Array.from({ length: 4 }).map((_, i) => (
                            <tr key={`wskel-${i}`} className="animate-pulse">
                                <td className="px-8 py-5"><div className="h-4 bg-slate-800 rounded w-40" /></td>
                                <td className="px-6 py-5"><div className="h-4 bg-slate-800 rounded w-16" /></td>
                                <td className="px-6 py-5"><div className="h-4 bg-slate-800 rounded w-16" /></td>
                                <td className="px-6 py-5"><div className="h-4 bg-slate-800 rounded w-20" /></td>
                                <td className="px-6 py-5"><div className="h-4 bg-slate-800 rounded w-24" /></td>
                                <td className="px-6 py-5"><div className="h-4 bg-slate-800 rounded w-16" /></td>
                                <td className="px-6 py-5"><div className="h-4 bg-slate-800 rounded w-12" /></td>
                                <td className="px-6 py-5"><div className="h-4 bg-slate-800 rounded w-16" /></td>
                                <td className="px-6 py-5 text-right"><div className="h-4 bg-slate-800 rounded w-10 ml-auto" /></td>
                            </tr>
                        ))}

                        {!loading && sorted.map(ssid => {
                            const health = getHealth(ssid.health);
                            const usageCfg = getUsage(ssid.usage);
                            return (
                                <tr key={ssid.id} className="hover:bg-white/[0.02] transition-colors group">
                                    {/* Network Name */}
                                    <td className="px-8 py-5">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex-shrink-0">
                                                <Wifi size={14} />
                                            </div>
                                            <p className="text-white font-black text-sm tracking-tight italic uppercase truncate max-w-[180px]" title={ssid.name}>
                                                {ssid.name}
                                            </p>
                                        </div>
                                    </td>

                                    {/* State */}
                                    <td className="px-6 py-5">
                                        {ssid.isEnabled ? (
                                            <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-emerald-400">
                                                <span className="relative flex h-2 w-2">
                                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-50" />
                                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                                                </span>
                                                Active
                                            </span>
                                        ) : (
                                            <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-600">
                                                <span className="w-2 h-2 rounded-full bg-slate-700" />
                                                Inactive
                                            </span>
                                        )}
                                    </td>

                                    {/* Health */}
                                    <td className="px-6 py-5">
                                        <span className={`flex items-center gap-1.5 text-xs font-bold ${health.text}`}>
                                            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${health.dot}`} />
                                            {health.label}
                                        </span>
                                    </td>

                                    {/* Usage (Employee/Guest) */}
                                    <td className="px-6 py-5">
                                        <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border ${usageCfg.color}`}>
                                            {usageCfg.label}
                                        </span>
                                    </td>

                                    {/* Band */}
                                    <td className="px-6 py-5">
                                        <span className="text-xs font-bold text-slate-300">
                                            {ssid.band || '—'}
                                        </span>
                                    </td>

                                    {/* Security */}
                                    <td className="px-6 py-5">
                                        <span className="text-xs font-bold text-slate-400">
                                            {ssid.security || '—'}
                                        </span>
                                    </td>

                                    {/* VLAN */}
                                    <td className="px-6 py-5">
                                        <span className="font-mono font-black text-indigo-400 text-sm bg-indigo-500/10 px-3 py-1 rounded-lg border border-indigo-500/20">
                                            {ssid.vlanId ?? '—'}
                                        </span>
                                    </td>

                                    {/* 24h Usage */}
                                    <td className="px-6 py-5">
                                        <span className="text-xs font-bold text-slate-500">
                                            {ssid.usage24h != null ? formatBytes(ssid.usage24h) : '—'}
                                        </span>
                                    </td>

                                    {/* Clients */}
                                    <td className="px-6 py-5 text-right">
                                        <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-2xl border transition-all ${
                                            ssid.clients > 0
                                                ? 'bg-slate-800 border-indigo-500/20 group-hover:border-indigo-500/40'
                                                : 'bg-slate-900 border-white/5 opacity-50'
                                        }`}>
                                            <Users size={12} className={ssid.clients > 0 ? 'text-indigo-400' : 'text-slate-600'} />
                                            <span className={`font-black text-sm ${ssid.clients > 0 ? 'text-white' : 'text-slate-600'}`}>
                                                {ssid.clients}
                                            </span>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}

                        {!loading && data.length === 0 && (
                            <tr>
                                <td colSpan="9" className="px-6 py-16 text-center text-slate-500">
                                    <div className="flex flex-col items-center">
                                        <div className="p-6 bg-slate-800 rounded-3xl mb-4 opacity-20">
                                            <Wifi size={48} className="text-slate-400" />
                                        </div>
                                        <p className="text-lg font-black text-slate-700 uppercase tracking-[0.2em]">No Wireless Networks</p>
                                        <p className="text-xs text-slate-600 mt-2 font-bold uppercase tracking-widest">No SSIDs found for this site</p>
                                    </div>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default WirelessTable;
