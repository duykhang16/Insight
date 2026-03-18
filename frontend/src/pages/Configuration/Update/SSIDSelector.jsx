import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Wifi, Globe, Shield, MapPin, ChevronRight, Search } from 'lucide-react';

/**
 * SSIDSelector – Portal-based dropdown that escapes any parent overflow constraints.
 * Dropdown is rendered via createPortal at the document body level so it's never
 * clipped by parent containers with overflow:hidden/auto or max-height limits.
 */
const SSIDSelector = ({ compiledSSIDs = [], value, onChange, placeholder = '-- Choose Network --' }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [expandedIdx, setExpandedIdx] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });
    const triggerRef = useRef(null);
    const dropdownRef = useRef(null);
    const searchInputRef = useRef(null);

    // Compute dropdown position relative to viewport
    const updatePosition = useCallback(() => {
        if (!triggerRef.current) return;
        const rect = triggerRef.current.getBoundingClientRect();
        const viewportH = window.innerHeight;
        const dropdownMaxH = 420;

        // Decide: open downward or upward
        const spaceBelow = viewportH - rect.bottom;
        const spaceAbove = rect.top;
        let top;
        if (spaceBelow >= dropdownMaxH || spaceBelow >= spaceAbove) {
            // Open downward
            top = rect.bottom + 6;
        } else {
            // Open upward
            top = rect.top - dropdownMaxH - 6;
        }

        setDropdownPos({
            top: Math.max(8, top),
            left: rect.left,
            width: rect.width,
        });
    }, []);

    // Recalculate on open, scroll, resize
    useEffect(() => {
        if (!isOpen) return;
        updatePosition();

        const handleUpdate = () => updatePosition();
        window.addEventListener('scroll', handleUpdate, true); // capture phase for nested scrolls
        window.addEventListener('resize', handleUpdate);
        return () => {
            window.removeEventListener('scroll', handleUpdate, true);
            window.removeEventListener('resize', handleUpdate);
        };
    }, [isOpen, updatePosition]);

    // Focus search on open
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
                setExpandedIdx(null);
                setSearchTerm('');
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [isOpen]);

    // Close on Escape
    useEffect(() => {
        if (!isOpen) return;
        const handler = (e) => {
            if (e.key === 'Escape') {
                setIsOpen(false);
                setExpandedIdx(null);
                setSearchTerm('');
            }
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [isOpen]);

    const selectedSSID = compiledSSIDs.find(s => s.networkName === value);

    // Filter SSIDs by search
    const filteredSSIDs = compiledSSIDs.filter(ssid =>
        ssid.networkName.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const getSecurityLabel = (security) => {
        if (!security || security === 'UNKNOWN') return null;
        const s = security.toUpperCase();
        if (s === 'OWE') return { text: 'OWE', color: 'text-cyan-500 bg-cyan-500/10 border-cyan-500/20' };
        if (s === 'OPEN') return { text: 'OPEN', color: 'text-amber-500 bg-amber-500/10 border-amber-500/20' };
        if (s.includes('WPA3')) return { text: 'WPA3', color: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20' };
        if (s.includes('WPA2')) return { text: 'WPA2', color: 'text-blue-500 bg-blue-500/10 border-blue-500/20' };
        return { text: s.slice(0, 6), color: 'text-slate-400 bg-slate-500/10 border-slate-500/20' };
    };

    const handleSelect = (networkName) => {
        onChange(networkName);
        setIsOpen(false);
        setExpandedIdx(null);
        setSearchTerm('');
    };

    // ── Dropdown Portal Content ──
    const dropdownContent = isOpen ? createPortal(
        <div
            ref={dropdownRef}
            className="fixed z-[9999]"
            style={{
                top: `${dropdownPos.top}px`,
                left: `${dropdownPos.left}px`,
                width: `${dropdownPos.width}px`,
            }}
        >
            <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0c1425] shadow-2xl shadow-black/15 dark:shadow-black/50 backdrop-blur-xl overflow-hidden animate-dropdown-in">
                {/* Search */}
                {compiledSSIDs.length > 5 && (
                    <div className="px-3 py-2.5 border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.03]">
                        <div className="relative">
                            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                ref={searchInputRef}
                                type="text"
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                placeholder="Search SSID..."
                                className="w-full h-9 bg-white dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl pl-9 pr-3 text-xs text-slate-800 dark:text-white focus:outline-none focus:border-emerald-500/50 transition-all placeholder:text-slate-400"
                            />
                        </div>
                    </div>
                )}

                {/* Options */}
                <div className="max-h-[340px] overflow-y-auto custom-scrollbar-portal">
                    {/* Reset option */}
                    <button
                        type="button"
                        onClick={() => handleSelect('')}
                        className={`w-full px-4 py-3 text-left text-[13px] font-medium transition-colors border-b border-slate-100 dark:border-white/5 ${
                            !value
                                ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/5'
                                : 'text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-white/5'
                        }`}
                    >
                        {placeholder}
                    </button>

                    {filteredSSIDs.map((ssid, idx) => {
                        const isSelected = ssid.networkName === value;
                        const secLabel = getSecurityLabel(ssid.security);
                        // Use original index for expansion tracking
                        const origIdx = compiledSSIDs.indexOf(ssid);
                        const isExpanded = expandedIdx === origIdx;
                        const siteNames = ssid.foundInSiteNames || [];

                        return (
                            <div
                                key={ssid.networkName}
                                className={`border-b border-slate-100/60 dark:border-white/5 last:border-b-0 transition-colors duration-150 ${
                                    isSelected ? 'bg-emerald-500/[0.06]' : isExpanded ? 'bg-slate-50/80 dark:bg-white/[0.03]' : ''
                                }`}
                            >
                                {/* Main row */}
                                <div
                                    className="flex items-center gap-2 px-4 py-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-white/[0.04] transition-colors"
                                    onClick={() => handleSelect(ssid.networkName)}
                                >
                                    <div className={`w-1 h-7 rounded-full shrink-0 transition-colors ${isSelected ? 'bg-emerald-500' : 'bg-transparent'}`} />
                                    <Wifi size={13} className={`shrink-0 ${isSelected ? 'text-emerald-500' : 'text-slate-400 dark:text-slate-600'}`} />
                                    <span className={`text-[13px] font-bold truncate flex-1 min-w-0 ${isSelected ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-200'}`}>
                                        {ssid.networkName}
                                    </span>

                                    {/* Badges */}
                                    <div className="flex items-center gap-1.5 shrink-0">
                                        {ssid.isGuestPortalEnabled && (
                                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[7px] font-black uppercase tracking-wider bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                                                <Globe size={7} /> Portal
                                            </span>
                                        )}
                                        {secLabel && (
                                            <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[7px] font-black uppercase tracking-wider border ${secLabel.color}`}>
                                                <Shield size={7} /> {secLabel.text}
                                            </span>
                                        )}
                                    </div>

                                    {/* Sites count pill */}
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setExpandedIdx(isExpanded ? null : origIdx);
                                        }}
                                        className={`shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-black tracking-wide transition-all duration-150 cursor-pointer hover:scale-105 active:scale-95 ${
                                            isExpanded
                                                ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 ring-1 ring-emerald-500/10'
                                                : isSelected
                                                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25'
                                                    : 'bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-white/10 hover:bg-slate-200/60 dark:hover:bg-white/8'
                                        }`}
                                        title="Click to see site names"
                                    >
                                        <MapPin size={9} />
                                        {ssid.foundInSites}
                                        <ChevronRight size={9} className={`transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} />
                                    </button>
                                </div>

                                {/* Expanded: site name table */}
                                {isExpanded && siteNames.length > 0 && (
                                    <div className="px-4 pb-3 pt-0.5 ml-7">
                                        <div className="rounded-xl bg-slate-100/80 dark:bg-white/[0.04] border border-slate-200/60 dark:border-white/5 overflow-hidden">
                                            {/* Table header */}
                                            <div className="flex items-center gap-1.5 px-3 py-2 border-b border-slate-200/60 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.02]">
                                                <MapPin size={10} className="text-emerald-500" />
                                                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">
                                                    Found in {ssid.foundInSites} site{ssid.foundInSites !== 1 ? 's' : ''}
                                                </span>
                                            </div>
                                            {/* Table rows */}
                                            <div className="max-h-[180px] overflow-y-auto custom-scrollbar-portal">
                                                {siteNames.map((name, i) => (
                                                    <div
                                                        key={i}
                                                        className={`flex items-center gap-3 px-3 py-2 text-[11px] border-b border-slate-100/50 dark:border-white/[0.03] last:border-b-0 transition-colors hover:bg-white/60 dark:hover:bg-white/[0.03] ${
                                                            i % 2 === 0 ? 'bg-white/40 dark:bg-transparent' : 'bg-slate-50/40 dark:bg-white/[0.01]'
                                                        }`}
                                                    >
                                                        <span className="w-5 h-5 rounded-md flex items-center justify-center text-[9px] font-black bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/15 shrink-0">
                                                            {i + 1}
                                                        </span>
                                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                                                        <span className="font-semibold text-slate-700 dark:text-slate-200 truncate">{name}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}

                    {filteredSSIDs.length === 0 && (
                        <div className="px-4 py-8 text-center text-sm text-slate-400 dark:text-slate-600">
                            {searchTerm ? `No SSIDs matching "${searchTerm}"` : 'No SSIDs found in selected sites'}
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
                {/* ── Trigger Button ── */}
                <button
                    type="button"
                    onClick={() => {
                        setIsOpen(prev => !prev);
                        setExpandedIdx(null);
                        setSearchTerm('');
                    }}
                    className={`
                        w-full h-14 flex items-center justify-between gap-2 px-4
                        rounded-2xl border text-sm font-bold transition-all duration-200 cursor-pointer
                        outline-none
                        ${isOpen
                            ? 'bg-slate-50 dark:bg-black/80 border-emerald-500/60 ring-2 ring-emerald-500/20 shadow-lg shadow-emerald-500/5'
                            : 'bg-slate-50 dark:bg-black/60 border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20'
                        }
                    `}
                >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <Wifi size={15} className={`shrink-0 ${value ? 'text-emerald-500' : 'text-slate-400'}`} />
                        {selectedSSID ? (
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                                <span className="text-slate-800 dark:text-white truncate text-[13px]">{selectedSSID.networkName}</span>
                                <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-black bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                    <MapPin size={8} />
                                    {selectedSSID.foundInSites}
                                </span>
                            </div>
                        ) : (
                            <span className="text-slate-400 dark:text-slate-500 text-[13px]">{placeholder}</span>
                        )}
                    </div>
                    <ChevronDown
                        size={15}
                        className={`shrink-0 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                    />
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

export default SSIDSelector;
