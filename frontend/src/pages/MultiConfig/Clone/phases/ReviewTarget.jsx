import React from 'react';
import {
    Activity, Network, Search, Code, FileJson,
    Wifi, Cable, Users, CheckCircle,
} from 'lucide-react';
import { getRoleBadgeInfo } from '../../utils';

const getOpIcon = (type) => {
    if (type.includes('WIRELESS')) return <Wifi size={16} className="text-orange-500" />;
    if (type.includes('WIRED')) return <Cable size={16} className="text-blue-500" />;
    if (type.includes('GUEST')) return <Users size={16} className="text-emerald-500" />;
    return <Activity size={16} className="text-slate-400" />;
};

/**
 * CloneConfig Phase 2 — Operations review + target site selection.
 */
const ReviewTarget = ({
    previewOps,
    selectedOpsIndices,
    setSelectedOpsIndices,
    targetSites,
    selectedTargetIds,
    setSelectedTargetIds,
    searchTargetTerm,
    setSearchTargetTerm,
    zones,
    selectedZone,
    setSelectedZone,
    setModalData,
    t,
}) => {
    const toggleSetItem = (setObj, item) => {
        const newSet = new Set(setObj);
        if (newSet.has(item)) newSet.delete(item);
        else newSet.add(item);
        return newSet;
    };

    const filteredTargets = targetSites.filter(site => {
        const matchesSearch = site.siteName.toLowerCase().includes(searchTargetTerm.toLowerCase());
        let matchesZone = true;
        if (selectedZone !== 'all') {
            const zoneObj = zones.find(z => String(z.id || z._id) === selectedZone);
            matchesZone = zoneObj ? (zoneObj.site_ids || []).includes(site.siteId) : false;
        }
        return matchesSearch && matchesZone;
    });

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Operation Preview List */}
            <div className="bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 rounded-2xl p-6 flex flex-col max-h-[500px]">
                <div className="flex justify-between items-center mb-5">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 flex items-center gap-2">
                        <Activity size={14} className="text-blue-500" /> {t('cloner.blueprint_elements')}
                    </h3>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => {
                                if (selectedOpsIndices.size === previewOps.length) setSelectedOpsIndices(new Set());
                                else setSelectedOpsIndices(new Set(previewOps.map((_, i) => i)));
                            }}
                            className="px-3 py-1.5 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-white rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors border border-slate-200 dark:border-white/10"
                        >
                            {selectedOpsIndices.size === previewOps.length && previewOps.length > 0 ? t('cloner.deselect_all') : t('cloner.select_all')}
                        </button>
                        <span className="px-2.5 py-1 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-lg text-[10px] font-black border border-blue-200 dark:border-blue-500/20">
                            {previewOps.length} {t('cloner.detected')}
                        </span>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto pr-2 space-y-2 custom-scrollbar">
                    {previewOps.map((op, idx) => (
                        <div key={idx} className="p-3.5 bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl flex items-center justify-between group hover:border-slate-300 dark:hover:border-white/20 transition-all">
                            <div className="flex items-center gap-3">
                                <input
                                    type="checkbox"
                                    checked={selectedOpsIndices.has(idx)}
                                    onChange={() => setSelectedOpsIndices(prev => toggleSetItem(prev, idx))}
                                    className="w-4 h-4 rounded border-slate-300 dark:border-white/10 bg-white dark:bg-white/5 text-blue-600 focus:ring-0"
                                />
                                <div>
                                    <div className="flex items-center gap-2">
                                        {getOpIcon(op.type)}
                                        <span className="text-sm font-bold text-slate-800 dark:text-white">{op.name}</span>
                                    </div>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        <span className="text-[9px] font-mono text-slate-500 dark:text-slate-600 uppercase tracking-widest">{op.type}</span>
                                        {op.payload?._guest_portal_settings && (
                                            <span className="px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[8px] font-bold border border-emerald-200 dark:border-emerald-500/20 uppercase tracking-widest flex items-center gap-1">
                                                <FileJson size={8} /> + GUEST
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <button onClick={() => setModalData(op)} className="p-2 opacity-0 group-hover:opacity-100 text-slate-400 dark:text-slate-500 hover:text-blue-500 dark:hover:text-blue-400 transition-all">
                                <Code size={14} />
                            </button>
                        </div>
                    ))}
                </div>
            </div>

            {/* Target Selection */}
            <div className="bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 rounded-2xl p-6 flex flex-col max-h-[500px]">
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 mb-4 flex items-center gap-2">
                    <Network size={14} className="text-emerald-500" /> {t('cloner.target_deployment')}
                </h3>

                <div className="flex gap-2 mb-3 shrink-0">
                    <div className="relative flex-1">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            placeholder={t('cloner.search_destination')}
                            value={searchTargetTerm}
                            onChange={(e) => setSearchTargetTerm(e.target.value)}
                            className="w-full h-10 text-sm bg-white dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl pl-9 pr-4 text-slate-800 dark:text-white focus:outline-none focus:border-emerald-500/50 transition-all placeholder:text-slate-400"
                        />
                    </div>
                    <select
                        value={selectedZone}
                        onChange={(e) => setSelectedZone(e.target.value)}
                        className="h-10 bg-white dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl px-3 text-slate-800 dark:text-white text-xs font-bold focus:outline-none min-w-[130px]"
                    >
                        <option value="all">All Zones</option>
                        {zones.map(z => (
                            <option key={z.id || z._id} value={z.id || z._id}>{z.name}</option>
                        ))}
                    </select>
                </div>

                <div className="flex-1 overflow-y-auto pr-2 space-y-2 custom-scrollbar">
                    {filteredTargets.map(site => {
                        const roleInfo = getRoleBadgeInfo(site.role);
                        const isReadOnly = !roleInfo.canClone;
                        return (
                            <label key={site.siteId} className={`p-3.5 rounded-xl border flex items-center justify-between transition-all ${isReadOnly ? 'opacity-50 cursor-not-allowed bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/5 grayscale' : selectedTargetIds.has(site.siteId) ? 'bg-emerald-50 dark:bg-emerald-600/10 border-emerald-500 shadow-sm cursor-pointer' : 'bg-white dark:bg-black/40 border-slate-200 dark:border-white/5 hover:border-slate-300 dark:hover:border-white/10 cursor-pointer'}`}>
                                <div className="flex flex-col min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className={`text-sm font-bold truncate ${selectedTargetIds.has(site.siteId) ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-300'}`}>{site.siteName}</span>
                                        <span className={`px-2 py-0.5 rounded-md border text-[9px] font-black uppercase tracking-widest ${roleInfo.classes}`}>{roleInfo.text}</span>
                                    </div>
                                    <span className="text-[9px] font-mono text-slate-400 dark:text-slate-600 mt-0.5">{site.siteId}</span>
                                </div>
                                <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${selectedTargetIds.has(site.siteId) ? 'border-emerald-500 bg-emerald-100 dark:bg-emerald-500/20' : 'border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-black/50'}`}>
                                    {selectedTargetIds.has(site.siteId) && <div className="w-3 h-3 rounded-sm bg-emerald-500 dark:bg-emerald-400" />}
                                </div>
                                <input
                                    type="checkbox"
                                    disabled={isReadOnly}
                                    checked={selectedTargetIds.has(site.siteId)}
                                    onChange={(e) => {
                                        if (!isReadOnly) {
                                            const newSet = new Set(selectedTargetIds);
                                            if (e.target.checked) newSet.add(site.siteId);
                                            else newSet.delete(site.siteId);
                                            setSelectedTargetIds(newSet);
                                        }
                                    }}
                                    className="hidden"
                                />
                            </label>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default ReviewTarget;
