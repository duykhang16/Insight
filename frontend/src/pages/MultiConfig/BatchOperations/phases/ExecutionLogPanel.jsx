import React from 'react';
import {
    CheckCircle, XCircle, RefreshCw, Play, AlertOctagon, Square as SquareIcon,
} from 'lucide-react';

/**
 * Shared execution log panel used by Delete and AccountAccess.
 * Renders a terminal-style panel with styled log entries.
 *
 * @param {Object} props
 * @param {Array} props.logs - Array of { id, status ('ok'|'error'|'running'), msg }
 * @param {boolean} props.isRunning
 * @param {number} [props.progress] - 0-100 progress value (optional)
 * @param {string} [props.accentColor] - 'rose' | 'blue'
 * @param {string} [props.title] - Panel title
 * @param {string} [props.emptyText] - Text when no logs
 * @param {React.ReactNode} [props.headerExtra] - Extra content in header
 * @param {React.ReactNode} [props.children] - Extra content below logs
 */
const ExecutionLogPanel = ({
    logs,
    isRunning,
    progress,
    accentColor = 'rose',
    title = 'Execution Log',
    emptyText = 'Ready for execution...',
    headerExtra,
    children,
}) => {
    const iconColor = accentColor === 'rose' ? 'text-rose-500' : 'text-blue-500';
    const progressGradient = accentColor === 'rose'
        ? 'from-rose-500 to-red-400'
        : 'from-blue-500 to-indigo-400';
    const progressShadow = accentColor === 'rose'
        ? 'shadow-[0_0_10px_rgba(244,63,94,0.5)]'
        : 'shadow-[0_0_10px_rgba(59,130,246,0.5)]';
    const progressText = accentColor === 'rose' ? 'text-rose-500' : 'text-blue-500';

    return (
        <div className="backdrop-blur-2xl bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 rounded-3xl p-6 flex flex-col gap-4 shadow-xl dark:shadow-none min-h-[500px]">
            <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg ${accentColor === 'rose' ? 'bg-rose-500/10' : 'bg-blue-500/10'} flex items-center justify-center`}>
                    <Play size={16} className={iconColor} />
                </div>
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">{title}</h3>
            </div>

            {headerExtra}

            {/* Progress Bar */}
            {(isRunning || (progress != null && progress > 0)) && (
                <div className="space-y-2 py-1">
                    <div className="flex justify-between items-center">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                            {isRunning ? 'Processing...' : 'Completed'}
                        </span>
                        <span className={`text-sm font-mono font-black ${progressText}`}>{progress}%</span>
                    </div>
                    <div className="w-full h-3 bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
                        <div
                            className={`h-full bg-gradient-to-r ${progressGradient} transition-all duration-300 ${progressShadow}`}
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                </div>
            )}

            {/* Log Entries */}
            <div className="flex-1 overflow-y-auto max-h-[400px] space-y-2 pr-1 custom-scrollbar">
                {logs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-400 dark:text-slate-600 py-12">
                        <AlertOctagon size={32} strokeWidth={1} className="opacity-50" />
                        <p className="text-xs text-center font-sans">{emptyText}</p>
                    </div>
                ) : (
                    logs.map((log) => (
                        <div key={log.id}
                            className={`flex items-start gap-3 p-3.5 rounded-xl text-xs border transition-colors ${
                                log.status === 'ok' ? 'bg-emerald-50/70 dark:bg-emerald-500/[0.06] border-emerald-200 dark:border-emerald-500/10' :
                                log.status === 'error' ? 'bg-rose-50/70 dark:bg-rose-500/[0.06] border-rose-200 dark:border-rose-500/10' :
                                log.status === 'running' ? `bg-${accentColor}-50/50 dark:bg-${accentColor}-500/[0.04] border-${accentColor}-200 dark:border-${accentColor}-500/10 animate-pulse` :
                                'bg-white dark:bg-white/[0.02] border-slate-200 dark:border-white/5'
                            }`}>
                            <span className="shrink-0 mt-0.5">
                                {log.status === 'ok' && <CheckCircle size={16} className="text-emerald-500" />}
                                {log.status === 'error' && <XCircle size={16} className="text-rose-500" />}
                                {log.status === 'running' && <div className={`w-4 h-4 rounded-full border-2 border-${accentColor}-500 border-t-transparent animate-spin`} />}
                            </span>
                            <div className="flex-1 min-w-0">
                                <p className={`font-bold ${log.status === 'error' ? 'text-rose-700 dark:text-rose-400' : log.status === 'running' ? `text-${accentColor}-700 dark:text-${accentColor}-400 font-bold` : 'text-slate-700 dark:text-slate-300'} text-[11px] break-all leading-relaxed`}>
                                    {log.msg}
                                </p>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {children}
        </div>
    );
};

export default ExecutionLogPanel;
