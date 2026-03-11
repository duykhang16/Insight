import React, { useState, useRef, useEffect } from 'react';
import { User, LogOut, RefreshCw, ChevronUp, Power } from 'lucide-react';
import { useSite } from '../../context/SiteContext';
import { useSettings } from '../../context/SettingsContext';
import { useLanguage } from '../../context/LanguageContext';

// New SyncIndicator component
const SyncIndicator = ({ isSyncing, lastUpdated }) => {
    const { t } = useLanguage();

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
                <span className="text-[9px] font-black uppercase tracking-widest th-text-muted whitespace-nowrap">
                    {isSyncing ? t('common.syncing') : 'Live'}
                </span>
                <span className="text-[9px] font-mono th-text-muted mb-[0.5px]" style={{ opacity: 0.7 }}>
                    {formattedTime}
                </span>
            </div>
        </div>
    );
};

const UserWidget = ({ onLogout }) => {
    const [isOpen, setIsOpen] = useState(false);
    const { selectedSiteId, sites, lastUpdated, loadingSites } = useSite();
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
        <div className="relative border-t th-border th-bg-surface-alt" style={{ backgroundColor: 'var(--color-bg-surface-alt)', borderTopColor: 'var(--color-border)' }} ref={dropdownRef}>
            {/* Dropdown Menu */}
            {isOpen && (
                <div className="absolute bottom-full left-0 w-full mb-2 px-2 animate-fade-in z-50">
                    <div className="th-bg-elevated border th-border shadow-xl rounded-xl overflow-hidden py-1" style={{ backgroundColor: 'var(--color-bg-elevated)', borderColor: 'var(--color-border)' }}>
                        <div className="px-4 py-3 border-b" style={{ borderBottomColor: 'var(--color-border-subtle)' }}>
                            <p className="text-[10px] font-black uppercase tracking-widest th-text-muted mb-1">Signed in as</p>
                            <p className="text-xs font-bold th-text-primary truncate" title={userEmail}>{userEmail}</p>
                        </div>

                        <div className="p-2 border-t" style={{ borderTopColor: 'var(--color-border-subtle)' }}>
                            <button
                                onClick={() => {
                                    setIsOpen(false);
                                    onLogout();
                                }}
                                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-rose-500/10 text-rose-500 dark:text-rose-400 transition-colors group"
                            >
                                <LogOut size={14} className="group-hover:text-rose-400" />
                                <span className="text-xs font-bold group-hover:text-rose-400">Log out</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Widget Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full p-4 flex items-center gap-3 hover:th-bg-elevated transition-colors focus:outline-none group"
                style={{ '--tw-hover-bg': 'var(--color-bg-elevated)' }}
            >
                <div className="w-10 h-10 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
                    <User size={18} />
                </div>
                <div className="flex-1 min-w-0 text-left">
                    <div className="text-sm font-bold th-text-primary truncate">{userEmail.split('@')[0]}</div>
                    <SyncIndicator isSyncing={loadingSites} lastUpdated={lastUpdated} />
                </div>
                <ChevronUp
                    size={16}
                    className={`th-text-muted transition-transform duration-200 ${isOpen ? 'rotate-180 th-text-primary' : ''}`}
                />
            </button>
        </div>
    );
};

export default UserWidget;
