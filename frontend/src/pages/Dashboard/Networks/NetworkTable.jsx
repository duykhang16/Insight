import React from 'react';
import { ArrowDown, ArrowUp, Network } from 'lucide-react';
import NetworkRow from './NetworkRow';

const NetworkTable = ({ data, sortConfig, onSort, loading }) => {
    const SortIcon = ({ column }) => {
        if (sortConfig.key !== column)
            return <ArrowDown size={12} className="opacity-20 ml-1 inline" />;
        return sortConfig.direction === 'asc'
            ? <ArrowUp size={12} className="text-indigo-500 ml-1 inline" />
            : <ArrowDown size={12} className="text-indigo-500 ml-1 inline" />;
    };

    return (
        <div className="bg-slate-900 rounded-[2.5rem] shadow-2xl border border-white/5 overflow-hidden w-full">
            <div className="max-h-[calc(100vh-300px)] overflow-auto custom-scrollbar">
                <table className="w-full min-w-[900px] text-left text-sm whitespace-nowrap">
                    <thead className="text-slate-500 border-b border-white/5 sticky top-0 z-10 bg-slate-900">
                        <tr>
                            <th onClick={() => onSort('name')} className="px-8 py-5 font-black uppercase tracking-widest text-[10px] cursor-pointer hover:text-white transition-colors min-w-[220px]">
                                Network Name <SortIcon column="name" />
                            </th>
                            <th onClick={() => onSort('vlan')} className="px-6 py-5 font-black uppercase tracking-widest text-[10px] cursor-pointer hover:text-white transition-colors min-w-[100px]">
                                VLAN <SortIcon column="vlan" />
                            </th>
                            <th onClick={() => onSort('type')} className="px-6 py-5 font-black uppercase tracking-widest text-[10px] cursor-pointer hover:text-white transition-colors min-w-[120px]">
                                Type <SortIcon column="type" />
                            </th>
                            <th className="px-6 py-5 font-black uppercase tracking-widest text-[10px] min-w-[280px]">
                                Attached SSIDs
                            </th>
                            <th onClick={() => onSort('clients')} className="px-6 py-5 font-black uppercase tracking-widest text-[10px] cursor-pointer hover:text-white transition-colors text-right min-w-[120px]">
                                Clients <SortIcon column="clients" />
                            </th>
                            <th onClick={() => onSort('status')} className="px-6 py-5 font-black uppercase tracking-widest text-[10px] cursor-pointer hover:text-white transition-colors min-w-[100px]">
                                Status <SortIcon column="status" />
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-slate-300">
                        {/* Skeleton rows while loading */}
                        {loading && Array.from({ length: 6 }).map((_, i) => (
                            <tr key={`skel-${i}`} className="animate-pulse">
                                <td className="px-8 py-5"><div className="h-4 bg-slate-800 rounded w-44" /></td>
                                <td className="px-6 py-5"><div className="h-4 bg-slate-800 rounded w-12" /></td>
                                <td className="px-6 py-5"><div className="h-4 bg-slate-800 rounded w-20" /></td>
                                <td className="px-6 py-5"><div className="h-4 bg-slate-800 rounded w-56" /></td>
                                <td className="px-6 py-5 text-right"><div className="h-4 bg-slate-800 rounded w-12 ml-auto" /></td>
                                <td className="px-6 py-5"><div className="h-4 bg-slate-800 rounded w-16" /></td>
                            </tr>
                        ))}

                        {!loading && data.map(net => (
                            <NetworkRow key={net.id} net={net} />
                        ))}

                        {!loading && data.length === 0 && (
                            <tr>
                                <td colSpan="6" className="px-6 py-24 text-center text-slate-500">
                                    <div className="flex flex-col items-center">
                                        <div className="p-6 bg-slate-800 rounded-3xl mb-6 opacity-20">
                                            <Network size={64} className="text-slate-400" />
                                        </div>
                                        <p className="text-xl font-black text-slate-700 uppercase tracking-[0.2em]">No Networks</p>
                                        <p className="text-xs text-slate-600 mt-3 font-bold uppercase tracking-widest">No wired networks found for this site</p>
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

export default NetworkTable;
