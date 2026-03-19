import React from 'react';
import { Search, Lock, RotateCcw, CheckCircle } from 'lucide-react';
import Spinner from '../../../../components/Spinner';

/**
 * Phase 1 – Scope & Target: action type + site selection grid.
 */
const ScopeTarget = ({
    liveSites,
    zones,
    selectedAction,
    setSelectedAction,
    searchTargetTerm,
    setSearchTargetTerm,
    selectedZone,
    setSelectedZone,
    selectedTargetIds,
    setSelectedTargetIds,
    filteredTargetSites,
    getRoleBadgeInfo,
}) => {
    const validFilteredSiteIds = filteredTargetSites
        .filter(s => getRoleBadgeInfo(s.role).canClone)
        .map(s => s.siteId);

    return (
        <div className="space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Action Type */}
                <div className="space-y-4">
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500">1. Select Action Type</label>
                    <div className="grid grid-cols-1 gap-3">
                        {[
                            { id: 'update_ssid_password', label: 'Update Wireless PSK', icon: Lock, color: 'text-emerald-500' },
                            { id: 'update_ssid_config', label: 'Clone Deep Config', icon: RotateCcw, color: 'text-blue-500' },
                        ].map(action => (
                            <button key={action.id} onClick={() => setSelectedAction(action.id)}
                                className={`p-4 rounded-2xl border transition-all flex items-center gap-4 text-left group ${selectedAction === action.id
                                    ? 'bg-emerald-500/10 border-emerald-500 shadow-lg shadow-emerald-500/5'
                                    : 'bg-white dark:bg-black/40 border-slate-200 dark:border-white/5 hover:border-slate-300 dark:hover:border-white/10'}`}>
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${selectedAction === action.id ? 'bg-emerald-500 text-white' : 'bg-slate-100 dark:bg-white/5 ' + action.color}`}>
                                    <action.icon size={20} />
                                </div>
                                <span className={`text-sm font-bold ${selectedAction === action.id ? 'text-emerald-900 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-400'}`}>
                                    {action.label}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Target sites */}
                <div className="lg:col-span-2 flex flex-col">
                    <div className="flex justify-between items-end mb-4">
                        <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500">2. Select Target Sites</label>
                        <span className="text-[10px] font-black text-emerald-500 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
                            Selected: {selectedTargetIds.size}
                        </span>
                    </div>

                    <div className="flex gap-3 mb-4 shrink-0">
                        <div className="relative flex-1">
                            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input type="text" placeholder="Search sites..." value={searchTargetTerm}
                                onChange={(e) => setSearchTargetTerm(e.target.value)}
                                className="w-full text-sm bg-white dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl py-3 pl-12 pr-4 text-slate-800 dark:text-white focus:outline-none focus:border-emerald-500/50" />
                        </div>
                        <select value={selectedZone} onChange={(e) => setSelectedZone(e.target.value)}
                            className="h-12 bg-white dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl px-4 text-slate-800 dark:text-white text-sm font-bold focus:outline-none appearance-none min-w-[140px]">
                            <option value="all">All Groups</option>
                            {zones.map(z => <option key={z.id || z._id} value={z.id || z._id}>{z.name}</option>)}
                        </select>
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar border border-slate-200 dark:border-white/5 rounded-2xl p-4 bg-white dark:bg-black/20 max-h-[440px]">
                        {filteredTargetSites.map((site) => {
                            const roleInfo = getRoleBadgeInfo(site.role);
                            const isSelected = selectedTargetIds.has(site.siteId);
                            const canSelect = roleInfo.canClone;
                            const toggleSite = () => {
                                if (!canSelect) return;
                                const newSet = new Set(selectedTargetIds);
                                if (isSelected) newSet.delete(site.siteId);
                                else newSet.add(site.siteId);
                                setSelectedTargetIds(newSet);
                            };
                            return (
                                <div key={site.siteId} onClick={toggleSite}
                                    className={`p-3.5 rounded-xl border flex items-center justify-between transition-all cursor-pointer ${isSelected
                                        ? 'bg-emerald-500/10 border-emerald-500 shadow-sm'
                                        : !canSelect ? 'opacity-40 grayscale bg-slate-100 dark:bg-white/5' : 'bg-white dark:bg-black/40 border-slate-200 dark:border-white/10 hover:border-slate-300'}`}>
                                    <div className="flex items-center gap-4">
                                        <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${isSelected ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300 dark:border-white/10'}`}>
                                            {isSelected && <CheckCircle size={14} />}
                                        </div>
                                        <div className="flex flex-col">
                                            <div className="flex items-center gap-2">
                                                <span className={`text-sm font-bold ${isSelected ? 'text-emerald-900 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-300'}`}>{site.siteName}</span>
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
            </div>
        </div>
    );
};

export default ScopeTarget;
