import React from 'react';
import {
    Sliders, AlertCircle, Activity, CheckCircle, XCircle,
} from 'lucide-react';
import SSIDSelector from '../../Update/SSIDSelector';

/**
 * DeleteSSID Phase 2 — Choose SSID to delete + conflict/matching analysis table.
 */
const SSIDSelect = ({
    compiledSSIDs,
    selectedSSIDName,
    setSelectedSSIDName,
    selectedTargetIds,
    liveSites,
}) => {
    return (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            <div className="lg:col-span-2 space-y-6">
                <div className="bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 rounded-2xl p-6 shadow-lg">
                    <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-6 flex items-center gap-2">
                        <Sliders size={16} className="text-rose-500" /> Select SSID to Delete
                    </h3>
                    <div className="space-y-6">
                        <div className="space-y-3">
                            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500">Target SSID</label>
                            <SSIDSelector compiledSSIDs={compiledSSIDs} value={selectedSSIDName} onChange={setSelectedSSIDName} />
                        </div>
                        <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-start gap-3">
                            <AlertCircle className="text-rose-500 mt-0.5 shrink-0" size={16} />
                            <div>
                                <h4 className="text-xs font-black text-rose-700 dark:text-rose-400 uppercase mb-0.5">Warning</h4>
                                <p className="text-[11px] text-rose-600 dark:text-rose-500/80 leading-relaxed">
                                    Hành động xóa SSID sẽ gỡ bỏ hoàn toàn mạng này khỏi các site mục tiêu. Kết nối người dùng sẽ bị ngắt lập tức.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Mapping Analysis */}
            <div className="lg:col-span-3 bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 rounded-2xl overflow-hidden flex flex-col shadow-lg max-h-[500px]">
                <div className="px-5 py-4 border-b border-slate-200 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.04] flex flex-wrap justify-between items-center gap-3 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-lg bg-rose-500/10 flex items-center justify-center">
                            <Activity size={14} className="text-rose-500" />
                        </div>
                        <div>
                            <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-200">Conflict & Matching</h3>
                            <p className="text-[10px] text-slate-400 font-medium mt-0.5">{selectedTargetIds.size} sites</p>
                        </div>
                    </div>
                    {selectedSSIDName && (
                        <div className="flex items-center gap-2">
                            <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20">
                                <XCircle size={12} /> {compiledSSIDs.find(s => s.networkName === selectedSSIDName)?.foundInSites || 0} Delete
                            </span>
                            <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-slate-50 dark:bg-white/5 text-slate-500 border border-slate-200 dark:border-white/10">
                                <CheckCircle size={12} /> {selectedTargetIds.size - (compiledSSIDs.find(s => s.networkName === selectedSSIDName)?.foundInSites || 0)} Skip
                            </span>
                        </div>
                    )}
                </div>
                <div className="grid grid-cols-[40px_1fr_100px_1fr] gap-2 px-5 py-2.5 border-b border-slate-100 dark:border-white/5 bg-slate-50/30 dark:bg-white/[0.02] shrink-0">
                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">#</span>
                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Target Site</span>
                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 text-center">Status</span>
                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Note</span>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar p-2.5 space-y-1.5">
                    {Array.from(selectedTargetIds).map((siteId, idx) => {
                        const site = liveSites.find(s => s.siteId === siteId);
                        const ssidEntry = compiledSSIDs.find(s => s.networkName === selectedSSIDName);
                        const isMatch = !!(ssidEntry && ssidEntry.foundInSiteIds.includes(siteId));
                        return (
                            <div key={siteId} className={`grid grid-cols-[40px_1fr_100px_1fr] gap-2 items-center px-3.5 py-3 rounded-xl border-l-[3px] transition-all ${
                                isMatch ? 'border-l-rose-500 bg-rose-50/60 dark:bg-rose-500/[0.06] border border-rose-100 dark:border-rose-500/10'
                                : 'border-l-slate-300 bg-slate-50/40 dark:bg-white/[0.02] border border-slate-100/60 dark:border-white/5 opacity-75'}`}>
                                <span className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-500 shrink-0">{idx + 1}</span>
                                <div className="min-w-0">
                                    <div className="font-bold text-[13px] text-slate-800 dark:text-slate-100 truncate">{site?.siteName || siteId}</div>
                                    <div className="text-[10px] font-mono text-slate-400 truncate mt-0.5">{siteId}</div>
                                </div>
                                <div className="flex justify-center">
                                    {selectedSSIDName ? (
                                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase border ${
                                            isMatch ? 'bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-500/25'
                                            : 'bg-slate-100 dark:bg-white/5 text-slate-500 border-slate-200 dark:border-white/10'}`}>
                                            {isMatch ? <XCircle size={11} /> : <CheckCircle size={11} />} {isMatch ? 'Delete' : 'Skip'}
                                        </span>
                                    ) : <span className="text-slate-400 text-[10px] font-bold px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10">Pending</span>}
                                </div>
                                <div className="min-w-0">
                                    <span className={`text-xs font-medium ${isMatch ? 'text-rose-500/80' : 'text-slate-500'}`}>
                                        {selectedSSIDName ? (isMatch ? 'SSID will be permanently removed.' : 'SSID not found.') : 'Select an SSID.'}
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default SSIDSelect;
