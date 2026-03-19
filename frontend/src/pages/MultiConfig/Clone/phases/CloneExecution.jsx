import React from 'react';
import { Server, Activity } from 'lucide-react';

const STATUS_CONFIG = {
    WAITING:  { badge: 'bg-slate-100 dark:bg-white/5 text-slate-400 border-slate-200 dark:border-white/10', dot: 'bg-slate-300 dark:bg-slate-600', label: 'Chờ', icon: '⏳' },
    RUNNING:  { badge: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20 animate-pulse', dot: 'bg-blue-500 animate-pulse', label: 'Đang xử lý', icon: '⚡' },
    SUCCESS:  { badge: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20', dot: 'bg-emerald-500', label: 'Thành công', icon: '✓' },
    SKIPPED:  { badge: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20', dot: 'bg-amber-500', label: 'Bỏ qua', icon: '⊘' },
    PARTIAL:  { badge: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20', dot: 'bg-blue-500', label: 'Một phần', icon: '◐' },
    ERROR:    { badge: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20', dot: 'bg-rose-500', label: 'Lỗi', icon: '✕' },
    STOPPED:  { badge: 'bg-slate-500/10 text-slate-500 border-slate-500/20', dot: 'bg-slate-400', label: 'Đã dừng', icon: '■' },
};

/**
 * CloneConfig Phase 3 — Execution progress, queue, and result logs.
 */
const CloneExecution = ({
    executionLogs,
    executionProgress,
    executionLoading,
    executionResult,
}) => {
    const successCount = executionLogs.filter(l => l.status === 'SUCCESS').length;
    const skipCount = executionLogs.filter(l => l.status === 'SKIPPED').length;
    const partialCount = executionLogs.filter(l => l.status === 'PARTIAL').length;
    const errorCount = executionLogs.filter(l => l.status === 'ERROR').length;
    const waitingCount = executionLogs.filter(l => l.status === 'WAITING').length;
    const processedCount = executionLogs.filter(l => !['WAITING', 'RUNNING'].includes(l.status)).length;

    return (
        <div className="space-y-6">
            {/* Progress */}
            <div className="space-y-3">
                <div className="flex justify-between items-end">
                    <span className="text-[10px] font-black uppercase text-slate-400">
                        {executionLoading
                            ? `Processing... (${processedCount}/${executionLogs.length} sites)`
                            : executionResult ? `Done · ${successCount} success` : 'Ready to execute'}
                    </span>
                    <span className="text-lg font-mono font-black text-emerald-500">{executionProgress}%</span>
                </div>
                <div className="w-full h-3 bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden border border-slate-200 dark:border-white/5">
                    <div
                        className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500 shadow-[0_0_10px_rgba(16,185,129,0.4)]"
                        style={{ width: `${executionProgress}%` }}
                    />
                </div>
            </div>

            {/* Summary Counters */}
            {executionLogs.length > 0 && (
                <div className="flex items-center gap-4 text-[9px] font-black uppercase tracking-widest">
                    <span className="text-slate-400 flex items-center gap-1"><Server size={10} /> {executionLogs.length} total</span>
                    <span className="text-emerald-500">{successCount} ✓</span>
                    <span className="text-amber-500">{skipCount} skip</span>
                    <span className="text-blue-500">{partialCount} partial</span>
                    <span className="text-rose-500">{errorCount} ✕</span>
                    <span className="text-slate-400">{waitingCount} waiting</span>
                </div>
            )}

            {/* Execution Queue */}
            {executionLogs.length > 0 && (
                <div className="bg-white dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-2xl overflow-hidden">
                    <div className="px-5 py-3 border-b border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-white/[0.03] flex items-center gap-3">
                        <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                            <Activity size={14} className="text-emerald-500" />
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300">
                            Execution Queue
                        </span>
                    </div>
                    <div className="max-h-[450px] overflow-y-auto custom-scrollbar p-2.5 space-y-2">
                        {executionLogs.map((entry, idx) => {
                            const cfg = STATUS_CONFIG[entry.status] || STATUS_CONFIG.WAITING;
                            return (
                                <div key={idx} className={`rounded-xl border transition-all duration-300 ${
                                    entry.status === 'RUNNING' ? 'bg-blue-50/70 dark:bg-blue-500/[0.06] border-blue-200 dark:border-blue-500/15' :
                                    entry.status === 'SUCCESS' ? 'bg-emerald-50/30 dark:bg-emerald-500/[0.03] border-emerald-100 dark:border-emerald-500/10' :
                                    entry.status === 'ERROR' ? 'bg-rose-50/30 dark:bg-rose-500/[0.03] border-rose-100 dark:border-rose-500/10' :
                                    'bg-white dark:bg-white/[0.02] border-slate-100 dark:border-white/5'
                                }`}>
                                    <div className="flex items-center gap-3 px-4 py-3.5">
                                        <span className="w-8 h-8 rounded-lg flex items-center justify-center text-[11px] font-black shrink-0 border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-600 dark:text-slate-300">
                                            {entry.queueNumber}
                                        </span>
                                        <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${cfg.dot}`} />
                                        <div className="flex-1 min-w-0">
                                            <div className="text-[13px] font-bold text-slate-700 dark:text-slate-200 truncate">{entry.siteName}</div>
                                            {entry.ssidNames?.length > 0 && (
                                                <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 flex flex-wrap gap-x-1.5">
                                                    {entry.ssidNames.map((name, ni) => (
                                                        <span key={ni}>{ni > 0 ? ' · ' : ''}{name}</span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                        <span className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider border shrink-0 flex items-center gap-1.5 ${cfg.badge}`}>
                                            <span>{cfg.icon}</span> {cfg.label}
                                        </span>
                                    </div>
                                    {entry.detail && entry.status !== 'WAITING' && (
                                        <div className="px-4 pb-3.5 ml-11">
                                            <span className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">{entry.detail}</span>
                                            {entry.opResults?.length > 0 && entry.status !== 'RUNNING' && (
                                                <div className="mt-2 flex flex-wrap gap-1.5">
                                                    {entry.opResults.map((op, opIdx) => {
                                                        const isOk = (op.status || '').includes('SUCCESS');
                                                        const isSkip = (op.status || '').includes('SKIPPED');
                                                        return (
                                                            <span key={opIdx} className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[9px] font-bold border ${
                                                                isOk ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20' :
                                                                isSkip ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-500/20' :
                                                                'bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-500/20'
                                                            }`}>
                                                                {isOk ? '✓' : isSkip ? '⊘' : '✕'} {op.name}
                                                            </span>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

export default CloneExecution;
