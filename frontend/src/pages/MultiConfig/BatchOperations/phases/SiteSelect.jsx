import React from 'react';
import { Server, Search, CheckCircle } from 'lucide-react';
import { getRoleBadgeInfo } from '../../utils';

/**
 * DeleteSSID Phase 1 — Select target sites with zone filter and search.
 */
const SiteSelect = ({
    liveSites,
    selectedTargetIds,
    setSelectedTargetIds,
    searchTargetTerm,
    setSearchTargetTerm,
    zones,
    selectedZone,
    setSelectedZone,
}) => {
    const filteredSites = liveSites.filter(site => {
        const matchesSearch = site.siteName.toLowerCase().includes(searchTargetTerm.toLowerCase());
        let matchesZone = true;
        if (selectedZone !== 'all') {
            const zoneObj = zones.find(z => String(z.id || z._id) === selectedZone);
            matchesZone = zoneObj ? (zoneObj.site_ids || []).includes(site.siteId) : false;
        }
        return matchesSearch && matchesZone;
    });

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-end">
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500">Select Target Sites</label>
                <span className="text-[10px] font-black text-rose-500 bg-rose-500/10 px-3 py-1 rounded-full border border-rose-500/20">
                    Selected: {selectedTargetIds.size}
                </span>
            </div>

            <div className="flex gap-3">
                <div className="relative flex-1">
                    <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input type="text" placeholder="Search sites..." value={searchTargetTerm}
                        onChange={(e) => setSearchTargetTerm(e.target.value)}
                        className="w-full text-sm bg-white dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl py-3 pl-12 pr-4 text-slate-800 dark:text-white focus:outline-none focus:border-rose-500/50" />
                </div>
                <select value={selectedZone} onChange={(e) => setSelectedZone(e.target.value)}
                    className="h-12 bg-white dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl px-4 text-slate-800 dark:text-white text-sm font-bold focus:outline-none appearance-none min-w-[140px]">
                    <option value="all">All Groups</option>
                    {zones.map(z => <option key={z.id || z._id} value={z.id || z._id}>{z.name}</option>)}
                </select>
            </div>

            <div className="overflow-y-auto space-y-2 pr-2 custom-scrollbar border border-slate-200 dark:border-white/5 rounded-2xl p-4 bg-white dark:bg-black/20 max-h-[440px]">
                {filteredSites.map((site) => {
                    const roleInfo = getRoleBadgeInfo(site.role);
                    const isSelected = selectedTargetIds.has(site.siteId);
                    const canSelect = roleInfo.canClone;
                    const toggleSite = () => {
                        if (!canSelect) return;
                        const newSet = new Set(selectedTargetIds);
                        if (isSelected) newSet.delete(site.siteId); else newSet.add(site.siteId);
                        setSelectedTargetIds(newSet);
                    };
                    return (
                        <div key={site.siteId} onClick={toggleSite}
                            className={`p-3.5 rounded-xl border flex items-center justify-between transition-all cursor-pointer ${isSelected
                                ? 'bg-rose-500/10 border-rose-500 shadow-sm'
                                : !canSelect ? 'opacity-40 grayscale bg-slate-100 dark:bg-white/5' : 'bg-white dark:bg-black/40 border-slate-200 dark:border-white/10 hover:border-slate-300'}`}>
                            <div className="flex items-center gap-4">
                                <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${isSelected ? 'bg-rose-500 border-rose-500 text-white' : 'border-slate-300 dark:border-white/10'}`}>
                                    {isSelected && <CheckCircle size={14} />}
                                </div>
                                <div className="flex flex-col">
                                    <div className="flex items-center gap-2">
                                        <span className={`text-sm font-bold ${isSelected ? 'text-rose-900 dark:text-rose-400' : 'text-slate-700 dark:text-slate-300'}`}>{site.siteName}</span>
                                        <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ${roleInfo.classes}`}>{roleInfo.text}</span>
                                    </div>
                                    <span className="text-[9px] font-mono text-slate-500">{site.siteId}</span>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default SiteSelect;
