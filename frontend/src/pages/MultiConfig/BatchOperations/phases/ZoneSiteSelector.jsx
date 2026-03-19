import React from 'react';
import {
    Map, RefreshCw, CheckSquare, Square as SquareIcon,
    ShieldAlert, AlertTriangle, Search,
} from 'lucide-react';

/**
 * Shared Zone & Site selector with tabbed UI.
 * Used by Delete, AccountAccess, and potentially other batch modules.
 *
 * @param {Object} props
 * @param {Array} props.zones - list of zone objects
 * @param {Set} props.selectedZones - selected zone ID set
 * @param {Function} props.setSelectedZones - setter for selectedZones
 * @param {Array} props.sites - list of site objects
 * @param {Array} props.selectedSites - selected site ID array
 * @param {Function} props.setSelectedSites - setter for selectedSites
 * @param {string} props.activeTab - 'zones' or 'sites'
 * @param {Function} props.setActiveTab - setter
 * @param {string} props.searchTargetTerm - search string
 * @param {Function} props.setSearchTargetTerm - setter
 * @param {string} props.selectedZoneFilter - zone filter for sites tab
 * @param {Function} props.setSelectedZoneFilter - setter
 * @param {boolean} props.isLoadingZones
 * @param {boolean} props.isLoadingSites
 * @param {boolean} props.disabled - disable interactions (e.g. during execution)
 * @param {Function} props.onRefresh - callback for refresh button
 * @param {string} props.accentColor - 'rose' | 'blue' (default 'rose')
 * @param {Function} props.t - i18n translation
 * @param {string} props.i18nPrefix - 'batch_delete' or 'batch_account'
 */
const ZoneSiteSelector = ({
    zones,
    selectedZones,
    setSelectedZones,
    sites,
    selectedSites,
    setSelectedSites,
    activeTab,
    setActiveTab,
    searchTargetTerm,
    setSearchTargetTerm,
    selectedZoneFilter,
    setSelectedZoneFilter,
    isLoadingZones,
    isLoadingSites,
    disabled = false,
    onRefresh,
    accentColor = 'rose',
    t,
    i18nPrefix = 'batch_delete',
}) => {
    const accent = accentColor;
    const accentClasses = {
        selected: accent === 'rose' ? 'text-rose-600 dark:text-rose-400' : 'text-blue-600 dark:text-blue-400',
        bg: accent === 'rose' ? 'bg-rose-50/50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/30' : 'bg-blue-50/50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/30',
        tab: accent === 'rose' ? 'text-rose-600 dark:text-rose-400' : 'text-blue-600 dark:text-blue-400',
        icon: accent === 'rose' ? 'text-rose-500' : 'text-blue-500',
        count: accent === 'rose' ? 'text-rose-500' : 'text-blue-500',
        checkbox: accent === 'rose' ? 'text-rose-600 dark:text-rose-400' : 'text-blue-600 dark:text-blue-400',
        focus: accent === 'rose' ? 'focus:border-rose-500/50 focus:ring-1 focus:ring-rose-500/50' : 'focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50',
    };

    // Zone toggle helpers
    const handleSelectAllZones = () => {
        if (selectedZones.size === zones.length && zones.length > 0) setSelectedZones(new Set());
        else setSelectedZones(new Set(zones.map(z => z.id)));
    };

    const toggleZone = (zoneId) => {
        const newSet = new Set(selectedZones);
        if (newSet.has(zoneId)) newSet.delete(zoneId);
        else newSet.add(zoneId);
        setSelectedZones(newSet);
    };

    // Site filtering
    const filteredSites = sites.filter(site => {
        const matchesSearch = (site.siteName || '').toLowerCase().includes(searchTargetTerm.toLowerCase());
        let matchesZone = true;
        if (selectedZoneFilter !== 'all') {
            const zoneObj = zones.find(z => String(z.id || z._id) === selectedZoneFilter);
            matchesZone = zoneObj ? (zoneObj.site_ids || []).includes(site.id) : false;
        }
        return matchesSearch && matchesZone;
    });
    const filteredSiteIds = filteredSites.map(s => s.id);
    const allFilteredSelected = filteredSiteIds.length > 0 && filteredSiteIds.every(id => selectedSites.includes(id));

    const handleSelectAllSites = () => {
        if (allFilteredSelected) {
            setSelectedSites(prev => prev.filter(id => !filteredSiteIds.includes(id)));
        } else {
            setSelectedSites(prev => Array.from(new Set([...prev, ...filteredSiteIds])));
        }
    };

    const toggleSite = (siteId) => {
        setSelectedSites(prev =>
            prev.includes(siteId) ? prev.filter(id => id !== siteId) : [...prev, siteId]
        );
    };

    return (
        <div className="backdrop-blur-2xl bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 rounded-3xl p-6 flex flex-col gap-5 shadow-xl dark:shadow-none min-h-[500px]">
            <div className="flex items-center justify-between">
                <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400 flex items-center gap-2">
                    <Map size={14} className={accentClasses.icon} /> {t(`${i18nPrefix}.source_targets`) || t(`${i18nPrefix}.target_selection`) || 'Target Selection'}
                </h3>
                {onRefresh && (
                    <button onClick={onRefresh} disabled={isLoadingZones || isLoadingSites || disabled}
                        className={`flex items-center gap-1.5 text-[10px] font-bold uppercase hover:${accentClasses.icon} text-slate-500 dark:text-slate-400 transition-colors disabled:opacity-50`}>
                        <RefreshCw size={12} className={isLoadingZones || isLoadingSites ? 'animate-spin' : ''} />
                        {t(`${i18nPrefix}.refresh`) || t('batch_account.refresh') || 'Refresh'}
                    </button>
                )}
            </div>

            {/* Tabs */}
            <div className="flex gap-2 p-1 bg-slate-100 dark:bg-black/40 rounded-xl relative">
                <button
                    onClick={() => setActiveTab('zones')}
                    className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${activeTab === 'zones' ? `bg-white dark:bg-slate-800 ${accentClasses.tab} shadow-sm border border-slate-200 dark:border-white/10` : 'text-slate-500 hover:text-slate-700 dark:hover:th-text-secondary'}`}
                >
                    {t(`${i18nPrefix}.zones_tab`) || 'By Zone'}
                </button>
                <button
                    onClick={() => setActiveTab('sites')}
                    className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${activeTab === 'sites' ? `bg-white dark:bg-slate-800 ${accentClasses.tab} shadow-sm border border-slate-200 dark:border-white/10` : 'text-slate-500 hover:text-slate-700 dark:hover:th-text-secondary'}`}
                >
                    {t(`${i18nPrefix}.sites_tab`) || 'By Site'}
                </button>
            </div>

            {/* Zone Tab */}
            {activeTab === 'zones' ? (
                isLoadingZones ? (
                    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-400 dark:text-slate-600">
                        <RefreshCw size={36} strokeWidth={1} className="animate-spin" />
                        <p className="text-xs text-center">{t(`${i18nPrefix}.loading_zones`) || 'Loading zones...'}</p>
                    </div>
                ) : zones.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-400 dark:text-slate-600 px-4">
                        <ShieldAlert size={36} strokeWidth={1} className="text-amber-500/50" />
                        <p className="text-xs text-center">{t(`${i18nPrefix}.you_dont_have_access`) || t(`${i18nPrefix}.no_zones_available`) || 'No zones available'}</p>
                    </div>
                ) : (
                    <>
                        <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/5 pb-3">
                            <button onClick={handleSelectAllZones} disabled={disabled}
                                className={`flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:${accentClasses.selected} transition-colors disabled:opacity-50`}>
                                {selectedZones.size === zones.length ? (
                                    <><CheckSquare size={16} className={accentClasses.checkbox} /> {t(`${i18nPrefix}.deselect_all`) || 'Deselect All'}</>
                                ) : (
                                    <><SquareIcon size={16} className="text-slate-400" /> {t(`${i18nPrefix}.select_all`) || 'Select All'}</>
                                )}
                            </button>
                            <span className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded font-mono text-[10px] font-bold">
                                <span className={accentClasses.count}>{selectedZones.size}</span> / {zones.length}
                            </span>
                        </div>
                        <div className="flex-1 overflow-y-auto max-h-[360px] pr-2 space-y-2 custom-scrollbar">
                            {zones.map(zone => (
                                <div key={zone.id}
                                    onClick={() => !disabled && toggleZone(zone.id)}
                                    className={`p-3 rounded-xl border flex items-center gap-3 cursor-pointer transition-all ${selectedZones.has(zone.id) ? accentClasses.bg : 'bg-white dark:bg-black/20 border-slate-100 dark:border-white/5 hover:border-slate-300 dark:hover:border-white/20'} ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
                                    <div className="shrink-0 flex items-center justify-center">
                                        {selectedZones.has(zone.id)
                                            ? <CheckSquare size={18} className={accentClasses.checkbox} />
                                            : <SquareIcon size={18} className="th-text-secondary dark:text-slate-600" />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">{zone.name}</p>
                                        <p className="text-[10px] font-mono text-slate-500 truncate">{zone.site_count || 0} {t(`${i18nPrefix}.sites_count`) || 'sites'}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                )
            ) : (
                /* Sites Tab */
                isLoadingSites ? (
                    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-400 dark:text-slate-600">
                        <RefreshCw size={36} strokeWidth={1} className="animate-spin" />
                        <p className="text-xs text-center">{t(`${i18nPrefix}.loading_sites`) || 'Loading sites...'}</p>
                    </div>
                ) : sites.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-400 dark:text-slate-600 px-4">
                        <AlertTriangle size={36} strokeWidth={1} className="text-amber-500/50" />
                        <p className="text-xs text-center">{t(`${i18nPrefix}.no_available_sites`) || t(`${i18nPrefix}.no_sites_available`) || 'No sites available'}</p>
                    </div>
                ) : (
                    <>
                        <div className="flex gap-3 shrink-0 mt-2">
                            <div className="relative flex-1">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <Search size={16} className="text-slate-400 dark:text-slate-500" />
                                </div>
                                <input type="text"
                                    placeholder={t(`${i18nPrefix}.search_sites`) || 'Search sites...'}
                                    value={searchTargetTerm}
                                    onChange={(e) => setSearchTargetTerm(e.target.value)}
                                    className={`w-full text-sm bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl py-3 pl-10 pr-4 text-slate-800 dark:text-white focus:outline-none ${accentClasses.focus} transition-all font-mono`}
                                />
                            </div>
                            <select value={selectedZoneFilter} onChange={(e) => setSelectedZoneFilter(e.target.value)}
                                className="h-[46px] bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl px-4 text-slate-800 dark:text-white text-sm font-bold focus:outline-none min-w-[150px] md:max-w-[200px]">
                                <option value="all">{t(`${i18nPrefix}.all_groups`) || 'All Groups'}</option>
                                {zones.map(z => <option key={z.id || z._id} value={z.id || z._id}>{z.name}</option>)}
                            </select>
                        </div>
                        <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/5 pb-3">
                            <button onClick={handleSelectAllSites} disabled={disabled}
                                className={`flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:${accentClasses.selected} transition-colors disabled:opacity-50`}>
                                {allFilteredSelected ? (
                                    <><CheckSquare size={16} className={accentClasses.checkbox} /> {t(`${i18nPrefix}.deselect_all`) || 'Deselect All'}</>
                                ) : (
                                    <><SquareIcon size={16} className="text-slate-400" /> {t(`${i18nPrefix}.select_all`) || 'Select All'}</>
                                )}
                            </button>
                            <span className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded font-mono text-[10px] font-bold">
                                <span className={accentClasses.count}>{filteredSiteIds.filter(id => selectedSites.includes(id)).length}</span> / {filteredSites.length}
                                {filteredSites.length < sites.length && <span className="text-slate-400 ml-1">(filtered)</span>}
                            </span>
                        </div>
                        <div className="flex-1 overflow-y-auto max-h-[360px] pr-2 space-y-2 custom-scrollbar">
                            {filteredSites.map(site => (
                                <div key={site.id}
                                    onClick={() => !disabled && toggleSite(site.id)}
                                    className={`p-3 rounded-xl border flex items-center gap-3 cursor-pointer transition-all ${selectedSites.includes(site.id) ? accentClasses.bg : 'bg-white dark:bg-black/20 border-slate-100 dark:border-white/5 hover:border-slate-300 dark:hover:border-white/20'} ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
                                    <div className="shrink-0 flex items-center justify-center">
                                        {selectedSites.includes(site.id)
                                            ? <CheckSquare size={18} className={accentClasses.checkbox} />
                                            : <SquareIcon size={18} className="th-text-secondary dark:text-slate-600" />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">{site.siteName}</p>
                                        <p className="text-[10px] font-mono text-slate-500 truncate">{site.id}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                )
            )}
        </div>
    );
};

export default ZoneSiteSelector;
