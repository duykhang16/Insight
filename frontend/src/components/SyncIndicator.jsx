import React from 'react';
import { RefreshCw, Clock } from 'lucide-react';
import { useSettings } from '../context/SettingsContext';
import { useLanguage } from '../context/LanguageContext';

const SyncIndicator = ({ isSyncing, lastUpdated }) => {
    const { isAutoRefreshEnabled, toggleAutoRefresh } = useSettings();
    const { t } = useLanguage();

    // Format date string to HH:mm:ss
    const formattedTime = lastUpdated instanceof Date
        ? lastUpdated.toLocaleTimeString()
        : (lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : '--:--:--');

    if (!lastUpdated && !isSyncing) return null;

    return (
        <div className="fixed bottom-6 right-6 z-50 pointer-events-none">
            <div className="flex items-center gap-3 px-4 py-2 rounded-2xl bg-slate-900/40 backdrop-blur-md border border-white/5 shadow-2xl transition-all duration-500 hover:bg-slate-900/60 pointer-events-auto group">
                {/* Status Dot */}
                <div className="relative flex items-center justify-center">
                    {isSyncing ? (
                        <RefreshCw size={12} className="text-blue-400 animate-spin" />
                    ) : (
                        <>
                            {isAutoRefreshEnabled && (
                                <span className="absolute inline-flex h-2 w-2 rounded-full bg-emerald-500/40 animate-ping"></span>
                            )}
                            <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${isAutoRefreshEnabled ? 'bg-emerald-500' : 'bg-slate-500'}`}></span>
                        </>
                    )}
                </div>

                {/* Info Text */}
                <div className="flex flex-col">
                    <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400/80 group-hover:text-slate-300 transition-colors">
                            {isSyncing ? t('common.syncing') : t('common.live_data')}
                        </span>
                    </div>
                    <div className="flex items-center gap-1 text-[9px] font-mono text-slate-500/60">
                        <Clock size={8} />
                        <span>{formattedTime}</span>
                    </div>
                </div>

                {/* Subtle Toggle Button */}
                <button
                    onClick={toggleAutoRefresh}
                    className={`ml-1 p-1.5 rounded-lg transition-all ${isAutoRefreshEnabled
                        ? 'text-emerald-500/40 hover:text-emerald-500 hover:bg-emerald-500/10'
                        : 'text-slate-600 hover:text-slate-400 hover:bg-white/5'
                        }`}
                    title={isAutoRefreshEnabled ? t('common.auto_refresh_on') : t('common.auto_refresh_off')}
                >
                    <RefreshCw size={12} className={isAutoRefreshEnabled ? "animate-spin-slow" : ""} />
                </button>
            </div>
        </div>
    );
};

export default SyncIndicator;
