import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Wifi, Globe, Shield, MapPin, ChevronRight } from 'lucide-react';

/**
 * SSIDSelector – A premium custom dropdown for selecting an SSID.
 *
 * Each option shows:
 *   • SSID name
 *   • Security type badge
 *   • "Found in X sites" pill
 *   • On hover → inline expansion listing site names (no external tooltip)
 */
const SSIDSelector = ({ compiledSSIDs = [], value, onChange, placeholder = '-- Choose Network --' }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [expandedIdx, setExpandedIdx] = useState(null);
    const wrapperRef = useRef(null);

    // Close on outside click
    useEffect(() => {
        const handler = (e) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
                setIsOpen(false);
                setExpandedIdx(null);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const selectedSSID = compiledSSIDs.find(s => s.networkName === value);

    const getSecurityLabel = (security) => {
        if (!security || security === 'UNKNOWN') return null;
        const s = security.toUpperCase();
        // Aruba API returns values like: WPA2_PSK, WPA3_SAE, WPA3_SAE_PSK, OWE, OPEN
        if (s === 'OWE') return { text: 'OWE', color: 'text-cyan-500 bg-cyan-500/10 border-cyan-500/20' };
        if (s === 'OPEN') return { text: 'OPEN', color: 'text-amber-500 bg-amber-500/10 border-amber-500/20' };
        if (s.includes('WPA3')) return { text: 'WPA3', color: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20' };
        if (s.includes('WPA2')) return { text: 'WPA2', color: 'text-blue-500 bg-blue-500/10 border-blue-500/20' };
        return { text: s.slice(0, 6), color: 'text-slate-400 bg-slate-500/10 border-slate-500/20' };
    };

    return (
        <div ref={wrapperRef} className="relative">
            {/* ── Trigger Button ── */}
            <button
                type="button"
                onClick={() => { setIsOpen(prev => !prev); setExpandedIdx(null); }}
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

            {/* ── Dropdown Panel ── */}
            {isOpen && (
                <div
                    className="absolute z-50 left-0 right-0 mt-2 max-h-[400px] overflow-y-auto custom-scrollbar rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0c1425] shadow-2xl shadow-black/10 dark:shadow-black/40 backdrop-blur-xl"
                    style={{ animationDuration: '150ms' }}
                >
                    {/* Placeholder / reset option */}
                    <button
                        type="button"
                        onClick={() => { onChange(''); setIsOpen(false); setExpandedIdx(null); }}
                        className={`
                            w-full px-4 py-3 text-left text-[13px] font-medium transition-colors
                            border-b border-slate-100 dark:border-white/5
                            ${!value
                                ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/5'
                                : 'text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-white/5'
                            }
                        `}
                    >
                        {placeholder}
                    </button>

                    {compiledSSIDs.map((ssid, idx) => {
                        const isSelected = ssid.networkName === value;
                        const secLabel = getSecurityLabel(ssid.security);
                        const isExpanded = expandedIdx === idx;
                        const siteNames = ssid.foundInSiteNames || [];

                        return (
                            <div
                                key={ssid.networkName}
                                className={`
                                    border-b border-slate-100/60 dark:border-white/5 last:border-b-0
                                    transition-colors duration-150
                                    ${isSelected
                                        ? 'bg-emerald-500/[0.06]'
                                        : isExpanded
                                            ? 'bg-slate-50/80 dark:bg-white/[0.03]'
                                            : ''
                                    }
                                `}
                            >
                                {/* Main row */}
                                <div
                                    className="flex items-center gap-2 px-4 py-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-white/[0.04] transition-colors"
                                    onClick={() => { onChange(ssid.networkName); setIsOpen(false); setExpandedIdx(null); }}
                                >
                                    {/* Active bar */}
                                    <div className={`w-1 h-7 rounded-full shrink-0 transition-colors ${isSelected ? 'bg-emerald-500' : 'bg-transparent'}`} />

                                    <Wifi size={13} className={`shrink-0 ${isSelected ? 'text-emerald-500' : 'text-slate-400 dark:text-slate-600'}`} />

                                    {/* Name */}
                                    <span className={`text-[13px] font-bold truncate flex-1 min-w-0 ${isSelected ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-200'}`}>
                                        {ssid.networkName}
                                    </span>

                                    {/* Badges row */}
                                    <div className="flex items-center gap-1.5 shrink-0">
                                        {ssid.isGuestPortalEnabled && (
                                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[7px] font-black uppercase tracking-wider bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                                                <Globe size={7} />
                                                Portal
                                            </span>
                                        )}
                                        {secLabel && (
                                            <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[7px] font-black uppercase tracking-wider border ${secLabel.color}`}>
                                                <Shield size={7} />
                                                {secLabel.text}
                                            </span>
                                        )}
                                    </div>

                                    {/* Sites count pill — clickable to expand */}
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setExpandedIdx(isExpanded ? null : idx);
                                        }}
                                        className={`
                                            shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-lg
                                            text-[9px] font-black tracking-wide
                                            transition-all duration-150 cursor-pointer
                                            hover:scale-105 active:scale-95
                                            ${isExpanded
                                                ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 ring-1 ring-emerald-500/10'
                                                : isSelected
                                                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25'
                                                    : 'bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-white/10 hover:bg-slate-200/60 dark:hover:bg-white/8'
                                            }
                                        `}
                                        title="Click to see site names"
                                    >
                                        <MapPin size={9} />
                                        {ssid.foundInSites}
                                        <ChevronRight size={9} className={`transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} />
                                    </button>
                                </div>

                                {/* Expanded: site name list (inline, inside the dropdown) */}
                                {isExpanded && siteNames.length > 0 && (
                                    <div className="px-4 pb-3 pt-0.5 ml-7">
                                        <div className="rounded-xl bg-slate-100/80 dark:bg-white/[0.04] border border-slate-200/60 dark:border-white/5 p-3">
                                            <div className="flex items-center gap-1.5 mb-2 pb-1.5 border-b border-slate-200/60 dark:border-white/5">
                                                <MapPin size={10} className="text-emerald-500" />
                                                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">
                                                    Found in {ssid.foundInSites} site{ssid.foundInSites !== 1 ? 's' : ''}
                                                </span>
                                            </div>
                                            <div className="flex flex-wrap gap-1.5">
                                                {siteNames.map((name, i) => (
                                                    <span
                                                        key={i}
                                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-white dark:bg-white/[0.06] text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-white/10"
                                                    >
                                                        <span className="w-1 h-1 rounded-full bg-emerald-500 shrink-0" />
                                                        {name}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}

                    {compiledSSIDs.length === 0 && (
                        <div className="px-4 py-8 text-center text-sm text-slate-400 dark:text-slate-600">
                            No SSIDs found in selected sites
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default SSIDSelector;
