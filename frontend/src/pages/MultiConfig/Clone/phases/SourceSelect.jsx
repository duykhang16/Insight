import React from 'react';
import { Server, Search, CheckCircle } from 'lucide-react';

/**
 * CloneConfig Phase 1 — Source site selection with zone filter and search.
 */
const SourceSelect = ({
    sourceSites,
    selectedSourceId,
    setSelectedSourceId,
    sourceZoneFilter,
    setSourceZoneFilter,
    sourceSearchTerm,
    setSourceSearchTerm,
    zones,
    fetchError,
    t,
}) => {
    const filtered = sourceSites
        .filter(site => {
            const matchesSearch = (site.siteName || '').toLowerCase().includes(sourceSearchTerm.toLowerCase());
            let matchesZone = true;
            if (sourceZoneFilter !== 'all') {
                const zoneObj = zones.find(z => String(z.id || z._id) === sourceZoneFilter);
                matchesZone = zoneObj ? (zoneObj.site_ids || []).includes(site.siteId || site.id) : false;
            }
            return matchesSearch && matchesZone;
        })
        .sort((a, b) => (a.siteName || '').localeCompare(b.siteName || ''));

    const sourceSiteName = sourceSites.find(s => s.siteId === selectedSourceId)?.siteName || selectedSourceId;

    return (
        <div className="max-w-3xl mx-auto space-y-6">
            <div className="space-y-3">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                    <Server size={12} /> {t('cloner.origin_site') || 'Site nguồn'}
                </label>

                <div className="flex gap-2">
                    <select
                        value={sourceZoneFilter}
                        onChange={e => setSourceZoneFilter(e.target.value)}
                        className="h-11 bg-white dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl px-3 text-slate-800 dark:text-white text-xs font-bold focus:outline-none min-w-[140px] appearance-none"
                    >
                        <option value="all">All Zones</option>
                        {zones.map(z => (
                            <option key={z.id || z._id} value={z.id || z._id}>{z.name}</option>
                        ))}
                    </select>
                    <div className="relative flex-1">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Search size={14} className="text-slate-400" />
                        </div>
                        <input
                            type="text"
                            placeholder="Search source site..."
                            value={sourceSearchTerm}
                            onChange={e => setSourceSearchTerm(e.target.value)}
                            className="w-full h-11 bg-white dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl pl-9 pr-4 text-slate-800 dark:text-white text-xs font-medium focus:outline-none focus:border-blue-500/50 transition-all"
                        />
                    </div>
                </div>

                {/* Site list */}
                <div className="bg-white dark:bg-black/20 border border-slate-200 dark:border-white/5 rounded-2xl overflow-hidden max-h-[440px] overflow-y-auto custom-scrollbar">
                    {filtered.length === 0 ? (
                        <div className="p-6 text-center text-slate-400 dark:text-slate-600 text-xs">
                            No sites found
                        </div>
                    ) : (
                        filtered.map(site => {
                            const isSelected = selectedSourceId === site.siteId;
                            const tpl = site.template;
                            return (
                                <div
                                    key={site.siteId}
                                    onClick={() => setSelectedSourceId(site.siteId)}
                                    className={`flex items-center justify-between px-4 py-3.5 cursor-pointer transition-all border-b border-slate-100 dark:border-white/5 last:border-b-0 ${
                                        isSelected
                                            ? 'bg-blue-50 dark:bg-blue-500/10'
                                            : 'hover:bg-slate-50 dark:hover:bg-white/5'
                                    }`}
                                >
                                    <div className="flex items-center gap-3 min-w-0 flex-1">
                                        <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                                            isSelected ? 'bg-blue-500' : 'bg-slate-300 dark:bg-slate-600'
                                        }`} />
                                        <span className={`text-sm font-semibold truncate ${
                                            isSelected ? 'text-blue-700 dark:text-blue-300' : 'text-slate-700 dark:text-slate-200'
                                        }`}>
                                            {site.siteName}
                                        </span>
                                        {tpl && (
                                            <span
                                                className="shrink-0 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border"
                                                style={{
                                                    borderColor: `${tpl.color || '#6366f1'}30`,
                                                    backgroundColor: `${tpl.color || '#6366f1'}10`,
                                                    color: tpl.color || '#6366f1'
                                                }}
                                            >
                                                {tpl.name}
                                            </span>
                                        )}
                                    </div>
                                    {isSelected && <CheckCircle size={16} className="text-blue-500 shrink-0" />}
                                </div>
                            );
                        })
                    )}
                </div>

                {selectedSourceId && (
                    <div className="flex items-center gap-2 text-[10px] font-bold text-blue-600 dark:text-blue-400">
                        <CheckCircle size={12} />
                        Selected: {sourceSiteName}
                    </div>
                )}
            </div>

            {fetchError && <p className="text-rose-500 text-xs font-bold text-center italic">{fetchError}</p>}
        </div>
    );
};

export default SourceSelect;
