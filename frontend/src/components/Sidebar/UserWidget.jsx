import React, { useState, useRef, useEffect } from 'react';
import { User, LogOut, RefreshCw, ChevronUp, Power } from 'lucide-react';
import { useSite } from '../../context/SiteContext';
import { useSettings } from '../../context/SettingsContext';
import { useLanguage } from '../../context/LanguageContext'; // Assuming LanguageContext is available for t()

// New SyncIndicator component
const SyncIndicator = ({ isSyncing, lastUpdated }) => {
    const { t } = useLanguage(); // Assuming useLanguage hook is available

    // Format date string to HH:mm:ss
    const formattedTime = lastUpdated instanceof Date
        ? lastUpdated.toLocaleTimeString()
        : (lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : '--:--:--');

    return (
        <div className="flex items-center gap-2 mt-1 px-1">
            {/* Status Dot */}
            <div className="relative flex items-center justify-center">
                {isSyncing ? (
                    <RefreshCw size={8} className="text-blue-400 animate-spin" />
                ) : (
                    <>
                        <span className="absolute inline-flex h-2 w-2 rounded-full bg-emerald-500/20 animate-ping"></span>
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500 shadow-[0_0_4px_rgba(16,185,129,0.5)]"></span>
                    </>
                )}
            </div>

            {/* Info Text */}
            <div className="flex items-center gap-1.5 overflow-hidden">
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 whitespace-nowrap">
                    {isSyncing ? t('common.syncing') : 'Live'}
                </span>
                <span className="text-[9px] font-mono text-slate-600/80 mb-[0.5px]">
                    {formattedTime}
                </span>
            </div>
        </div>
    );
};

const UserWidget = ({ onLogout }) => {
    const [isOpen, setIsOpen] = useState(false);
    const { selectedSiteId, sites, lastUpdated, loadingSites } = useSite();
    // isAutoRefreshEnabled is now always true and toggleAutoRefresh is a no-op from SettingsContext
    const { isAutoRefreshEnabled } = useSettings();
    const dropdownRef = useRef(null);

    const userEmail = sessionStorage.getItem('insight_user_email') || 'it.admin@insight.local';

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div className="relative border-t border-slate-800 bg-slate-900/50" ref={dropdownRef}>
            {/* Dropdown Menu */}
            {isOpen && (
                <div className="absolute bottom-full left-0 w-full mb-2 px-2 animate-fade-in z-50">
                    <div className="bg-slate-800 border border-slate-700 shadow-xl rounded-xl overflow-hidden py-1">
                        <div className="px-4 py-3 border-b border-slate-700/50">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Signed in as</p>
                            <p className="text-xs font-bold text-white truncate" title={userEmail}>{userEmail}</p>
                        </div>

                        {/* Auto-refresh toggle removed as per instructions */}
                        {/* <div className="p-2">
                            <button
                                onClick={toggleAutoRefresh}
                                className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-slate-700/50 transition-colors group"
                            >
                                <div className="flex items-center gap-3">
                                    <RefreshCw size={14} className={isAutoRefreshEnabled ? 'text-emerald-500 dark:text-emerald-400 animate-spin-slow' : 'text-slate-400 dark:text-slate-500'} />
                                    <span className="text-xs font-bold text-slate-300 group-hover:text-white">Auto-refresh (60s)</span>
                                </div>
                                <div className={`w-8 h-4 rounded-full transition-colors relative ${isAutoRefreshEnabled ? 'bg-emerald-500/20' : 'bg-slate-700'}`}>
                                    <div className={`absolute top-0.5 w-3 h-3 rounded-full transition-all ${isAutoRefreshEnabled ? 'left-4 bg-emerald-400' : 'left-0.5 bg-slate-500'}`}></div>
                                </div>
                            </button>
                        </div> */}

                        <div className="p-2 border-t border-slate-700/50">
                            <button
                                onClick={() => {
                                    setIsOpen(false);
                                    onLogout();
                                }}
                                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-rose-500/10 text-rose-400 transition-colors group"
                            >
                                <LogOut size={14} className="group-hover:text-rose-300" />
                                <span className="text-xs font-bold group-hover:text-rose-300">Log out</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Widget Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full p-4 flex items-center gap-3 hover:bg-slate-800/50 transition-colors focus:outline-none group"
            >
                <div className="w-10 h-10 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
                    <User size={18} />
                </div>
                <div className="flex-1 min-w-0 text-left">
                    <div className="text-sm font-bold text-white truncate">{userEmail.split('@')[0]}</div>
                    <SyncIndicator isSyncing={loadingSites} lastUpdated={lastUpdated} />
                </div>
                <ChevronUp
                    size={16}
                    className={`text-slate-500 transition-transform duration-200 ${isOpen ? 'rotate-180 text-white' : ''}`}
                />
            </button>
        </div>
    );
};

export default UserWidget;
