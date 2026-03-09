import React from 'react';
import { ArrowDown, ArrowUp, LayoutGrid } from 'lucide-react';
import ApplicationRow from './ApplicationRow';

const ApplicationTable = ({ data, sortConfig, onSort, loading }) => {
    const SortIcon = ({ column }) => {
        if (sortConfig.key !== column) return <ArrowDown size={12} className="opacity-20 ml-1 inline" />;
        return sortConfig.direction === 'asc' ?
            <ArrowUp size={12} className="text-indigo-500 ml-1 inline" /> :
            <ArrowDown size={12} className="text-indigo-500 ml-1 inline" />;
    };

    return (
        <div className="bg-slate-900 rounded-[2.5rem] shadow-2xl border border-white/5 overflow-hidden w-full">
            <div className="max-h-[calc(100vh-250px)] overflow-auto custom-scrollbar">
                <table className="w-full min-w-[800px] text-left text-sm whitespace-nowrap block md:table">
                    <thead className="text-slate-500 border-b border-white/5 table-header-sticky">
                        <tr>
                            <th onClick={() => onSort('name')} className="px-8 py-6 font-black uppercase tracking-widest text-[10px] cursor-pointer hover:text-white transition-colors group table-col-sticky table-header-sticky resizable-col min-w-[250px]">
                                Category <SortIcon column="name" />
                            </th>
                            <th onClick={() => onSort('usage')} className="px-8 py-6 font-black uppercase tracking-widest text-[10px] cursor-pointer hover:text-white transition-colors group text-right resizable-col min-w-[150px]">
                                24h Usage <SortIcon column="usage" />
                            </th>
                            <th onClick={() => onSort('percentage')} className="px-8 py-6 font-black uppercase tracking-widest text-[10px] cursor-pointer hover:text-white transition-colors group text-right resizable-col min-w-[150px]">
                                24h Usage % <SortIcon column="percentage" />
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-slate-300">
                        {data.map((cat) => (
                            <ApplicationRow key={cat.id} category={cat} />
                        ))}

                        {!loading && data.length === 0 && (
                            <tr>
                                <td colSpan="3" className="px-6 py-24 text-center text-slate-500 bg-black/5">
                                    <div className="flex flex-col items-center">
                                        <div className="p-6 bg-slate-800 rounded-3xl mb-6 opacity-20">
                                            <LayoutGrid size={64} className="text-slate-400" />
                                        </div>
                                        <p className="text-xl font-black text-slate-700 uppercase tracking-[0.2em]">No traffic data</p>
                                        <p className="text-xs text-slate-600 mt-3 font-bold uppercase tracking-widest">DPI analysis is in progress</p>
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

export default ApplicationTable;
