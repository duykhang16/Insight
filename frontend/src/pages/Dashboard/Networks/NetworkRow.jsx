import React from 'react';
import { Wifi, Plug, Users, Lock, Radio } from 'lucide-react';

// --- Helpers ---
const TYPE_CONFIG = {
    employee: { label: 'Employee', color: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' },
    guest:    { label: 'Guest',    color: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
};

const getTypeConfig = (type) =>
    TYPE_CONFIG[type?.toLowerCase()] || { label: type || 'Employee', color: 'bg-slate-700 text-slate-400 border-white/5' };

const BAND_LABEL = {
    '5ghz':   '5 GHz',
    '2.4ghz': '2.4 GHz',
    '6ghz':   '6 GHz',
};

const getBandLabel = (band) => BAND_LABEL[band?.toLowerCase()] || band || null;

// --- SSID Chip (inline inside wired row) ---
const SsidChip = ({ ssid }) => (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-bold transition-opacity ${
        ssid.isEnabled
            ? 'bg-blue-500/10 border-blue-500/20 text-blue-300'
            : 'bg-slate-800 border-white/5 text-slate-600 opacity-50'
    }`}>
        <Wifi size={10} />
        <span className="font-black">{ssid.name}</span>
        {getBandLabel(ssid.band) && (
            <span className="text-[9px] opacity-60">· {getBandLabel(ssid.band)}</span>
        )}
        {ssid.clients > 0 && (
            <span className="ml-1 bg-blue-500/20 px-1.5 py-0.5 rounded text-[9px] font-black text-blue-300">
                {ssid.clients}
            </span>
        )}
    </div>
);

// --- Main Wired Network Row ---
const NetworkRow = ({ net }) => {
    const typeConfig = getTypeConfig(net.type);

    return (
        <tr className="hover:bg-white/[0.02] transition-colors group">

            {/* Network Name */}
            <td className="px-8 py-5">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex-shrink-0">
                        <Plug size={14} />
                    </div>
                    <div>
                        <p
                            className="text-white font-black text-sm tracking-tight italic uppercase truncate max-w-[200px]"
                            title={net.name}
                        >
                            {net.name}
                        </p>
                    </div>
                </div>
            </td>

            {/* VLAN */}
            <td className="px-6 py-5">
                <span className="font-mono font-black text-indigo-400 text-sm bg-indigo-500/10 px-3 py-1 rounded-lg border border-indigo-500/20">
                    {net.vlanId}
                </span>
            </td>

            {/* Type */}
            <td className="px-6 py-5">
                <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border ${typeConfig.color}`}>
                    {typeConfig.label}
                </span>
            </td>

            {/* Attached SSIDs */}
            <td className="px-6 py-5">
                {net.ssids.length === 0 ? (
                    <span className="text-slate-700 text-xs font-bold">No SSIDs</span>
                ) : (
                    <div className="flex flex-wrap gap-1.5">
                        {net.ssids.map(ssid => (
                            <SsidChip key={ssid.id} ssid={ssid} />
                        ))}
                    </div>
                )}
            </td>

            {/* Clients */}
            <td className="px-6 py-5 text-right">
                <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-2xl border transition-all ${
                    net.totalClients > 0
                        ? 'bg-slate-800 border-indigo-500/20 group-hover:border-indigo-500/40'
                        : 'bg-slate-900 border-white/5 opacity-50'
                }`}>
                    <Users size={12} className={net.totalClients > 0 ? 'text-indigo-400' : 'text-slate-600'} />
                    <span className={`font-black text-sm ${net.totalClients > 0 ? 'text-white' : 'text-slate-600'}`}>
                        {net.totalClients}
                    </span>
                </div>
            </td>

            {/* Status */}
            <td className="px-6 py-5">
                {net.isEnabled ? (
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
        </tr>
    );
};

export default NetworkRow;
