import React from 'react';
import { RefreshCw, CheckCircle2, Search, Power } from 'lucide-react';
import { useSettings } from '../context/SettingsContext';
import { useLanguage } from '../context/LanguageContext';

const SyncIndicator = ({ isSyncing, lastUpdated }) => {
    const { isAutoRefreshEnabled, toggleAutoRefresh } = useSettings();
    const { t } = useLanguage();

    // Format date string gracefully
    const formattedTime = lastUpdated instanceof Date
        ? lastUpdated.toLocaleTimeString()
        : (lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : t('common.awaiting_data'));

    return (
        <div className="flex items-center space-x-4 bg-white dark:bg-[#0F172A] p-2 pr-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xl transition-all h-12">
            {/* Auto Refresh Toggle */}
            <button
                onClick={toggleAutoRefresh}
                className={`flex items-center justify-center p-2 rounded-lg transition-all ${isAutoRefreshEnabled
                    ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-500/20'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'
                    }`}
                title={isAutoRefreshEnabled ? t('common.auto_refresh_on') : t('common.auto_refresh_off')}
            >
                <Power size={16} />
            </button>

            {/* Status Section */}
            <div className="flex flex-col justify-center border-l border-slate-200 dark:border-slate-700 pl-4">
                {isSyncing ? (
                    <div className="flex items-center gap-2">
                        <RefreshCw size={12} className="text-indigo-500 dark:text-indigo-400 animate-spin" />
                        <span className="text-xs font-bold text-indigo-500 dark:text-indigo-400 uppercase tracking-widest">
                            {t('common.syncing')}
                        </span>
                    </div>
                ) : (
                    <div className="flex items-center gap-2">
                        <div className="relative flex items-center justify-center h-2 w-2">
                            {isAutoRefreshEnabled && (
                                <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-50 animate-ping"></span>
                            )}
                            <span className={`relative inline-flex rounded-full h-2 w-2 ${isAutoRefreshEnabled ? 'bg-emerald-500' : 'bg-slate-400 dark:bg-slate-500'}`}></span>
                        </div>
                        <span className={`text-xs font-bold uppercase tracking-widest ${isAutoRefreshEnabled ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}`}>
                            {t('common.live_data')}
                        </span>
                    </div>
                )}

                <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono mt-0.5">
                    {t('common.updated')} {formattedTime}
                </span>
            </div>
        </div>
    );
};

export default SyncIndicator;
