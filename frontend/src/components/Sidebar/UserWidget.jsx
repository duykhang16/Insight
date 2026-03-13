import React, { useState, useRef, useEffect } from 'react';
import { LogOut, RefreshCw, ChevronsUpDown, Moon, Sun, Languages } from 'lucide-react';
import { useSite } from '../../context/SiteContext';
import { useSettings } from '../../context/SettingsContext';
import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '../../context/ThemeContext';

// Sync status indicator
const SyncIndicator = ({ isSyncing, lastUpdated }) => {
    const { t } = useLanguage();

    const formattedTime = lastUpdated instanceof Date
        ? lastUpdated.toLocaleTimeString()
        : (lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : '--:--:--');

    return (
        <div className="flex items-center gap-1.5 mt-0.5">
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
            <span className="text-[10px] font-medium th-text-muted whitespace-nowrap">
                {isSyncing ? t('common.syncing') : 'Live'}
            </span>
            <span className="text-[10px] font-mono th-text-muted opacity-50">
                {formattedTime}
            </span>
        </div>
    );
};

const UserWidget = ({ onLogout }) => {
    const [isOpen, setIsOpen] = useState(false);
    const { selectedSiteId, sites, lastUpdated, loadingSites } = useSite();
    const { isAutoRefreshEnabled } = useSettings();
    const { t, language, toggleLanguage } = useLanguage();
    const { theme, toggleTheme } = useTheme();
    const dropdownRef = useRef(null);

    const userEmail = sessionStorage.getItem('insight_user_email') || 'user@insight.local';
    const userName = userEmail.split('@')[0];
    const userInitials = userName.slice(0, 2).toUpperCase();

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
        <div className="relative mx-2 mb-2" ref={dropdownRef}>
            {/* Dropdown Menu */}
            {isOpen && (
                <div
                    className="absolute bottom-full left-0 w-full mb-1.5 z-50"
                    style={{ animation: 'userDropdownIn 0.15s ease-out forwards' }}
                >
                    <style>{`
                        @keyframes userDropdownIn {
                            from { opacity: 0; transform: translateY(4px) scale(0.97); }
                            to { opacity: 1; transform: translateY(0) scale(1); }
                        }
                    `}</style>
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 shadow-lg dark:shadow-2xl dark:shadow-black/30 rounded-xl overflow-hidden">
                        {/* User info header */}
                        <div className="px-3 py-3 border-b border-slate-100 dark:border-white/5">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                                    {userInitials}
                                </div>
                                <div className="min-w-0">
                                    <p className="text-xs font-semibold text-slate-800 dark:text-white truncate">{userName}</p>
                                    <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate">{userEmail}</p>
                                </div>
                            </div>
                        </div>

                        {/* Settings: Theme & Language */}
                        <div className="p-1 border-b border-slate-100 dark:border-white/5">
                            {/* Theme toggle */}
                            <button
                                onClick={toggleTheme}
                                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors group"
                            >
                                {theme === 'dark' ? (
                                    <Sun size={14} className="opacity-60 group-hover:opacity-100 group-hover:text-amber-500 transition-all" />
                                ) : (
                                    <Moon size={14} className="opacity-60 group-hover:opacity-100 group-hover:text-blue-500 transition-all" />
                                )}
                                <span className="flex-1 text-left">
                                    {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
                                </span>
                            </button>

                            {/* Language toggle */}
                            <button
                                onClick={toggleLanguage}
                                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors group"
                            >
                                <Languages size={14} className="opacity-60 group-hover:opacity-100 transition-opacity" />
                                <span className="flex-1 text-left">
                                    {language === 'vi' ? 'English' : 'Tiếng Việt'}
                                </span>
                                <span className="text-[10px] font-bold uppercase text-slate-400 dark:text-slate-500">
                                    {language}
                                </span>
                            </button>
                        </div>

                        {/* Logout */}
                        <div className="p-1">
                            <button
                                onClick={() => {
                                    setIsOpen(false);
                                    onLogout();
                                }}
                                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-400 transition-colors group"
                            >
                                <LogOut size={14} className="opacity-60 group-hover:opacity-100 transition-opacity" />
                                {t('common.logout')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Widget Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`w-full p-2.5 flex items-center gap-3 rounded-xl transition-all duration-150 focus:outline-none group ${
                    isOpen
                        ? 'bg-slate-100 dark:bg-white/5'
                        : 'hover:bg-slate-100 dark:hover:bg-white/5'
                }`}
            >
                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-sm group-hover:shadow-md transition-shadow">
                    {userInitials}
                </div>
                <div className="flex-1 min-w-0 text-left">
                    <div className="text-xs font-semibold th-text-primary truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                        {userName}
                    </div>
                    <SyncIndicator isSyncing={loadingSites} lastUpdated={lastUpdated} />
                </div>
                <ChevronsUpDown
                    size={16}
                    className="th-text-muted opacity-40 group-hover:opacity-70 transition-opacity shrink-0"
                />
            </button>
        </div>
    );
};

export default UserWidget;
