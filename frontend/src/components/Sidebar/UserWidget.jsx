import React, { useState, useRef, useEffect } from 'react';
import { User, LogOut, RefreshCw, ChevronUp, Power } from 'lucide-react';
import { useSite } from '../../context/SiteContext';
import { useSettings } from '../../context/SettingsContext';

const UserWidget = ({ onLogout }) => {
    const [isOpen, setIsOpen] = useState(false);
    const { selectedSiteId, sites } = useSite();
    const { isAutoRefreshEnabled, toggleAutoRefresh } = useSettings();
    const dropdownRef = useRef(null);

    const userEmail = sessionStorage.getItem('insight_user_email') || 'it.admin@insight.local';
    const currentSite = sites.find(s => s.siteId === selectedSiteId)?.siteName || 'No Site Selected';

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

                        <div className="p-2">
                            <button
                                onClick={toggleAutoRefresh}
                                className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-slate-700/50 transition-colors group"
                            >
                                <div className="flex items-center gap-3">
                                    <Power size={14} className={isAutoRefreshEnabled ? 'text-emerald-500 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'} />
                                    <span className="text-xs font-bold text-slate-300 group-hover:text-white">Auto-refresh (60s)</span>
                                </div>
                                <div className={`w-8 h-4 rounded-full transition-colors relative ${isAutoRefreshEnabled ? 'bg-emerald-500/20' : 'bg-slate-700'}`}>
                                    <div className={`absolute top-0.5 w-3 h-3 rounded-full transition-all ${isAutoRefreshEnabled ? 'left-4 bg-emerald-400' : 'left-0.5 bg-slate-500'}`}></div>
                                </div>
                            </button>
                        </div>

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
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 truncate mt-0.5">
                        {currentSite}
                    </div>
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
