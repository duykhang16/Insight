import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Server, Search, MapPin, CheckCircle } from 'lucide-react';

/**
 * SiteSelector – Portal-based dropdown for selecting a site.
 * Rendered via createPortal to escape parent overflow constraints.
 * Shows site name, role badge, and siteId in a mini-table layout.
 */
const SiteSelector = ({ sites = [], value, onChange, placeholder = '-- Choose Site --', accentColor = 'emerald' }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });
    const triggerRef = useRef(null);
    const dropdownRef = useRef(null);
    const searchInputRef = useRef(null);

    const accentMap = {
        emerald: {
            ring: 'ring-emerald-500/20 border-emerald-500/60 shadow-emerald-500/5',
            text: 'text-emerald-500',
            selectedBg: 'bg-emerald-500/[0.06]',
            bar: 'bg-emerald-500',
            badge: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
            dot: 'bg-emerald-500',
        },
        teal: {
            ring: 'ring-teal-500/20 border-teal-500/60 shadow-teal-500/5',
            text: 'text-teal-500',
            selectedBg: 'bg-teal-500/[0.06]',
            bar: 'bg-teal-500',
            badge: 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20',
            dot: 'bg-teal-500',
        },
        blue: {
            ring: 'ring-blue-500/20 border-blue-500/60 shadow-blue-500/5',
            text: 'text-blue-500',
            selectedBg: 'bg-blue-500/[0.06]',
            bar: 'bg-blue-500',
            badge: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
            dot: 'bg-blue-500',
        },
    };
    const accent = accentMap[accentColor] || accentMap.emerald;

    const selectedSite = sites.find(s => s.siteId === value);

    // Position
    const updatePosition = useCallback(() => {
        if (!triggerRef.current) return;
        const rect = triggerRef.current.getBoundingClientRect();
        const viewportH = window.innerHeight;
        const dropdownMaxH = 420;
        const spaceBelow = viewportH - rect.bottom;
        const spaceAbove = rect.top;
        let top;
        if (spaceBelow >= dropdownMaxH || spaceBelow >= spaceAbove) {
            top = rect.bottom + 6;
        } else {
            top = rect.top - dropdownMaxH - 6;
        }
        setDropdownPos({ top: Math.max(8, top), left: rect.left, width: rect.width });
    }, []);

    useEffect(() => {
        if (!isOpen) return;
        updatePosition();
        const handleUpdate = () => updatePosition();
        window.addEventListener('scroll', handleUpdate, true);
        window.addEventListener('resize', handleUpdate);
        return () => {
            window.removeEventListener('scroll', handleUpdate, true);
            window.removeEventListener('resize', handleUpdate);
        };
    }, [isOpen, updatePosition]);

    useEffect(() => {
        if (isOpen && searchInputRef.current) {
            setTimeout(() => searchInputRef.current?.focus(), 50);
        }
    }, [isOpen]);

    // Close on outside click
    useEffect(() => {
        if (!isOpen) return;
        const handler = (e) => {
            if (
                triggerRef.current && !triggerRef.current.contains(e.target) &&
                dropdownRef.current && !dropdownRef.current.contains(e.target)
            ) {
                setIsOpen(false);
                setSearchTerm('');
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [isOpen]);

    // Escape
    useEffect(() => {
        if (!isOpen) return;
        const handler = (e) => { if (e.key === 'Escape') { setIsOpen(false); setSearchTerm(''); } };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [isOpen]);

    const filteredSites = sites.filter(s =>
        s.siteName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.siteId.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const getRoleBadge = (roleStr) => {
        const role = (roleStr || '').toLowerCase();
        if (role === 'administrator' || role === 'admin') return { text: 'ADMIN', cls: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-700/50' };
        if (role === 'operator' || role === 'op') return { text: 'OP', cls: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-700/50' };
        return { text: role.toUpperCase() || '—', cls: 'bg-slate-100 dark:bg-slate-800/40 text-slate-500 border-slate-200 dark:border-slate-700/50' };
    };

    const handleSelect = (siteId) => {
        onChange(siteId);
        setIsOpen(false);
        setSearchTerm('');
    };

    const dropdownContent = isOpen ? createPortal(
        <div
            ref={dropdownRef}
            className="fixed z-[9999]"
            style={{ top: `${dropdownPos.top}px`, left: `${dropdownPos.left}px`, width: `${dropdownPos.width}px` }}
        >
            <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0c1425] shadow-2xl shadow-black/15 dark:shadow-black/50 backdrop-blur-xl overflow-hidden animate-dropdown-in">
                {/* Search */}
                {sites.length > 5 && (
                    <div className="px-3 py-2.5 border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.03]">
                        <div className="relative">
                            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input ref={searchInputRef} type="text" value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)} placeholder="Search site..."
                                className="w-full h-9 bg-white dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl pl-9 pr-3 text-xs text-slate-800 dark:text-white focus:outline-none focus:border-emerald-500/50 transition-all placeholder:text-slate-400" />
                        </div>
                    </div>
                )}

                {/* Table header */}
                <div className="grid grid-cols-[32px_1fr_60px] gap-2 px-3.5 py-2 border-b border-slate-100 dark:border-white/5 bg-slate-50/30 dark:bg-white/[0.02]">
                    <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">#</span>
                    <span className="text-[8px] font-black uppercase tracking-widest text-slate-400">Site Name</span>
                    <span className="text-[8px] font-black uppercase tracking-widest text-slate-400 text-center">Role</span>
                </div>

                {/* Options */}
                <div className="max-h-[320px] overflow-y-auto custom-scrollbar-portal">
                    {/* Reset option */}
                    <button type="button" onClick={() => handleSelect('')}
                        className={`w-full px-3.5 py-2.5 text-left text-[12px] font-medium transition-colors border-b border-slate-100 dark:border-white/5 ${
                            !value ? `${accent.text} bg-emerald-500/5` : 'text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5'
                        }`}>
                        {placeholder}
                    </button>

                    {filteredSites.map((site, idx) => {
                        const isSelected = site.siteId === value;
                        const roleBadge = getRoleBadge(site.role);
                        return (
                            <div key={site.siteId}
                                onClick={() => handleSelect(site.siteId)}
                                className={`grid grid-cols-[32px_1fr_60px] gap-2 items-center px-3.5 py-2.5 cursor-pointer border-b border-slate-100/50 dark:border-white/[0.03] last:border-b-0 transition-colors ${
                                    isSelected ? accent.selectedBg : idx % 2 === 0 ? 'hover:bg-slate-50 dark:hover:bg-white/[0.04]' : 'bg-slate-50/30 dark:bg-white/[0.01] hover:bg-slate-100/50 dark:hover:bg-white/[0.05]'
                                }`}
                            >
                                {/* Row # */}
                                <span className={`w-6 h-6 rounded-md flex items-center justify-center text-[9px] font-black shrink-0 ${
                                    isSelected
                                        ? `${accent.badge} border`
                                        : 'bg-slate-100 dark:bg-white/5 text-slate-400 border border-slate-200 dark:border-white/10'
                                }`}>
                                    {isSelected ? <CheckCircle size={12} /> : idx + 1}
                                </span>

                                {/* Site info */}
                                <div className="min-w-0">
                                    <div className={`text-[12px] font-bold truncate ${isSelected ? accent.text : 'text-slate-700 dark:text-slate-200'}`}>
                                        {site.siteName}
                                    </div>
                                    <div className="text-[9px] font-mono text-slate-400 truncate mt-0.5">{site.siteId}</div>
                                </div>

                                {/* Role badge */}
                                <div className="flex justify-center">
                                    <span className={`px-1.5 py-0.5 rounded text-[7px] font-black uppercase tracking-wider border ${roleBadge.cls}`}>
                                        {roleBadge.text}
                                    </span>
                                </div>
                            </div>
                        );
                    })}

                    {filteredSites.length === 0 && (
                        <div className="px-4 py-6 text-center text-xs text-slate-400 dark:text-slate-600">
                            {searchTerm ? `No sites matching "${searchTerm}"` : 'No sites available'}
                        </div>
                    )}
                </div>
            </div>
        </div>,
        document.body
    ) : null;

    return (
        <>
            <div ref={triggerRef} className="relative">
                <button type="button"
                    onClick={() => { setIsOpen(prev => !prev); setSearchTerm(''); }}
                    className={`w-full h-14 flex items-center justify-between gap-2 px-4 rounded-2xl border text-sm font-bold transition-all duration-200 cursor-pointer outline-none ${
                        isOpen
                            ? `bg-slate-50 dark:bg-black/80 ${accent.ring} ring-2 shadow-lg`
                            : 'bg-slate-50 dark:bg-black/60 border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20'
                    }`}
                >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <Server size={15} className={`shrink-0 ${value ? accent.text : 'text-slate-400'}`} />
                        {selectedSite ? (
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                                <span className="text-slate-800 dark:text-white truncate text-[13px]">{selectedSite.siteName}</span>
                                <span className={`shrink-0 px-1.5 py-0.5 rounded text-[7px] font-black uppercase border ${getRoleBadge(selectedSite.role).cls}`}>
                                    {getRoleBadge(selectedSite.role).text}
                                </span>
                            </div>
                        ) : (
                            <span className="text-slate-400 dark:text-slate-500 text-[13px]">{placeholder}</span>
                        )}
                    </div>
                    <ChevronDown size={15} className={`shrink-0 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                </button>
            </div>

            {dropdownContent}

            <style>{`
                @keyframes dropdown-in {
                    from { opacity: 0; transform: translateY(-6px) scale(0.98); }
                    to { opacity: 1; transform: translateY(0) scale(1); }
                }
                .animate-dropdown-in { animation: dropdown-in 0.15s ease-out forwards; }
                .custom-scrollbar-portal::-webkit-scrollbar { width: 6px; }
                .custom-scrollbar-portal::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar-portal::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.1); border-radius: 10px; }
                .dark .custom-scrollbar-portal::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.05); }
            `}</style>
        </>
    );
};

export default SiteSelector;
