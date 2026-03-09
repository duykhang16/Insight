import React from 'react';
import { formatBytes } from '../../../api/apiClient';

const ApplicationRow = ({ category }) => {
    const { meta, usage, percentage } = category;
    const Icon = meta.icon;

    return (
        <tr className="hover:bg-white/[0.03] transition-all group border-b border-white/5 last:border-0 hover:-translate-y-0.5">
            <td className="px-8 py-5 table-col-sticky border-r border-white/5 z-10 group-hover:bg-white/[0.03]">
                <div className="flex items-center gap-4">
                    <div
                        className="p-2.5 rounded-xl border shadow-inner transition-transform group-hover:scale-110"
                        style={{
                            backgroundColor: `${meta.hex}15`,
                            borderColor: `${meta.hex}30`,
                            color: meta.hex
                        }}
                    >
                        <Icon size={18} />
                    </div>
                    {/* Bold, Uppercase, Italic formatting for Category Name */}
                    <span className="text-white font-black tracking-tight text-sm uppercase italic">
                        {meta.name}
                    </span>
                </div>
            </td>
            <td className="px-8 py-5 text-right">
                <div className="flex flex-col items-end">
                    <span className="text-white font-mono font-bold text-base tracking-tighter">
                        {formatBytes(usage)}
                    </span>
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">
                        24H Traffic
                    </span>
                </div>
            </td>
            <td className="px-8 py-5 text-right min-w-[200px]">
                <div className="flex flex-col gap-2">
                    <div className="flex justify-between items-end">
                        <span className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em]">Usage %</span>
                        <span className="text-indigo-400 font-mono font-black text-sm">{percentage.toFixed(1)}%</span>
                    </div>
                    {/* Progress Bar below percentage */}
                    <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden border border-white/5 shadow-inner">
                        <div
                            className="h-full transition-all duration-1000 ease-out shadow-[0_0_10px_rgba(0,0,0,0.5)]"
                            style={{
                                width: `${percentage}%`,
                                backgroundColor: meta.hex
                            }}
                        ></div>
                    </div>
                </div>
            </td>
        </tr>
    );
};

export default ApplicationRow;
