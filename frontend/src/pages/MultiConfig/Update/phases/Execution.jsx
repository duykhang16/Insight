import React from 'react';
import {
    Rocket, CheckCircle, XCircle, AlertCircle, Database,
} from 'lucide-react';

/**
 * Phase 3 – Execution: deployment review, progress bar, and terminal logs.
 */
const Execution = ({
    liveSites,
    compiledSSIDs,
    selectedSSIDName,
    selectedTargetIds,
    selectedAction,
    selectedSourceSiteId,
    actionLabel,
    confirmReady,
    executionLoading,
    executionResult,
    executionLogs,
    progress,
}) => (
    <div className="space-y-6">
        {/* Confirm card */}
        {!executionLoading && !executionResult && !confirmReady && (
            <div className="max-w-2xl mx-auto">
                <div className="bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 rounded-2xl p-8 shadow-lg border-l-4 border-l-emerald-500 space-y-6">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-500"><Rocket size={24} /></div>
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-500 mb-0.5">DEPLOYMENT REVIEW</p>
                            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Sync Execution Summary</h3>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 gap-3">
                        {[
                            { label: 'Action', value: actionLabel },
                            { label: 'Target SSID', value: selectedSSIDName || '—' },
                            { label: 'Sites affected', value: `${selectedTargetIds.size} sites` },
                        ].map(row => (
                            <div key={row.label} className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-white/5 last:border-0">
                                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{row.label}</span>
                                <span className={`text-sm font-bold ${row.label === 'Target SSID' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-3 py-1 rounded-full border border-emerald-500/20' : 'text-slate-800 dark:text-white'}`}>{row.value}</span>
                            </div>
                        ))}
                    </div>

                    {/* Site detail list */}
                    {selectedSSIDName && (() => {
                        const ssidEntry = compiledSSIDs.find(s => s.networkName === selectedSSIDName);
                        const matchSiteIds = ssidEntry ? ssidEntry.foundInSiteIds : [];
                        const targetArr = Array.from(selectedTargetIds);
                        const matchSites = targetArr.filter(id => matchSiteIds.includes(id));
                        const skipSites = targetArr.filter(id => !matchSiteIds.includes(id));
                        return (
                            <div className="rounded-xl border border-slate-200 dark:border-white/5 overflow-hidden">
                                <div className="px-4 py-2.5 bg-slate-50 dark:bg-white/[0.03] border-b border-slate-200 dark:border-white/5 flex items-center justify-between">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Target Sites Detail</span>
                                    <div className="flex items-center gap-2">
                                        <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20">
                                            <CheckCircle size={11} /> {matchSites.length} Execute
                                        </span>
                                        {skipSites.length > 0 && (
                                            <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg bg-slate-50 dark:bg-white/5 text-slate-400 border border-slate-200 dark:border-white/10">
                                                <XCircle size={11} /> {skipSites.length} Skip
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="max-h-[200px] overflow-y-auto custom-scrollbar p-2 space-y-1">
                                    {matchSites.map(siteId => {
                                        const site = liveSites.find(s => s.siteId === siteId);
                                        return (
                                            <div key={siteId} className="flex items-center gap-3 px-3.5 py-2.5 rounded-lg bg-emerald-50/50 dark:bg-emerald-500/[0.04] border border-emerald-100/50 dark:border-emerald-500/10">
                                                <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                                                <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate flex-1">{site?.siteName || siteId}</span>
                                                <span className="text-[9px] font-black uppercase text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-500/15 px-2 py-0.5 rounded-md">EXECUTE</span>
                                            </div>
                                        );
                                    })}
                                    {skipSites.map(siteId => {
                                        const site = liveSites.find(s => s.siteId === siteId);
                                        return (
                                            <div key={siteId} className="flex items-center gap-3 px-3.5 py-2.5 rounded-lg bg-slate-50/50 dark:bg-white/[0.02] border border-slate-100/50 dark:border-white/5 opacity-60">
                                                <div className="w-2 h-2 rounded-full bg-slate-400 shrink-0" />
                                                <span className="text-xs font-semibold text-slate-500 truncate flex-1">{site?.siteName || siteId}</span>
                                                <span className="text-[9px] font-black uppercase text-slate-400 bg-slate-100 dark:bg-white/5 px-2 py-0.5 rounded-md">SKIP</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })()}

                    <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                        <AlertCircle size={14} className="text-amber-500 shrink-0 mt-0.5" />
                        <p className="text-[11px] text-amber-600 dark:text-amber-400 leading-relaxed">Sites không có SSID này sẽ tự động bỏ qua (SKIPPED).</p>
                    </div>
                </div>
            </div>
        )}

        {/* Progress bar */}
        {(confirmReady || executionLoading || executionResult) && (
            <div className="space-y-4">
                <div className="flex justify-between items-end">
                    <span className="text-xs font-black uppercase text-slate-400">Transmission Progress</span>
                    <span className="text-lg font-mono font-black text-emerald-500">{progress}%</span>
                </div>
                <div className="w-full h-3 bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden border border-slate-200 dark:border-white/5">
                    <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500 shadow-[0_0_15px_rgba(16,185,129,0.5)]"
                        style={{ width: `${progress}%` }} />
                </div>
            </div>
        )}

        {/* Execution Terminal */}
        {(confirmReady || executionLoading || executionResult || executionLogs.length > 0) && (
            <div className="bg-white dark:bg-[#0c111b] border border-slate-200 dark:border-white/10 rounded-2xl overflow-hidden flex flex-col h-[400px] shadow-lg">
                <div className="px-5 py-3 bg-slate-50 dark:bg-white/5 border-b border-slate-200 dark:border-white/5 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="flex gap-1.5">
                            <div className="w-3 h-3 rounded-full bg-rose-500" />
                            <div className="w-3 h-3 rounded-full bg-amber-500" />
                            <div className="w-3 h-3 rounded-full bg-emerald-500" />
                        </div>
                        <div className="w-6 h-6 rounded-lg bg-slate-200 dark:bg-white/5 flex items-center justify-center">
                            <Database size={12} className="text-slate-400" />
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Execution Logs</span>
                    </div>
                    <div className="text-[10px] font-mono text-slate-400">{new Date().toLocaleTimeString()}</div>
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-1.5 custom-scrollbar">
                    {executionLogs.length === 0 && (
                        <div className="text-slate-500 animate-pulse italic text-xs p-4 text-center">Awaiting deployment signal...</div>
                    )}
                    {executionLogs.map((log, idx) => (
                        <div key={idx} className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors ${
                            log.status === 'SUCCESS' ? 'bg-emerald-50 dark:bg-emerald-500/[0.06] border-emerald-100 dark:border-emerald-500/10' :
                            log.status === 'ERROR' ? 'bg-rose-50 dark:bg-rose-500/[0.06] border-rose-100 dark:border-rose-500/10' :
                            log.status === 'SKIPPED' ? 'bg-white dark:bg-white/[0.02] border-slate-100 dark:border-white/5' :
                            'bg-amber-50 dark:bg-amber-500/[0.04] border-amber-100 dark:border-amber-500/10'
                        }`}>
                            <span className="text-[10px] font-mono text-slate-400 shrink-0">[{new Date().toLocaleTimeString([], { hour12: false })}]</span>
                            <span className={`text-[9px] font-black uppercase tracking-wider shrink-0 px-2 py-1 rounded-md border ${
                                log.status === 'SUCCESS' ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20' :
                                log.status === 'ERROR' ? 'text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/20' :
                                log.status === 'SKIPPED' ? 'text-slate-400 bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10' :
                                'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20'
                            }`}>{log.status}</span>
                            <span className="text-slate-700 dark:text-slate-200 font-bold text-[13px] shrink-0">{log.siteName}</span>
                            <span className="text-slate-500 text-[11px]">{log.detail}</span>
                        </div>
                    ))}
                </div>
            </div>
        )}
    </div>
);

export default Execution;
