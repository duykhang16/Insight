import React from 'react';
import {
    Activity, Sliders, Lock, Rocket, CheckCircle, XCircle, Globe,
} from 'lucide-react';
import SSIDSelector from '../SSIDSelector';
import SiteSelector from '../SiteSelector';

/**
 * Phase 2 – Filter & Config: SSID selector, password input, and conflict analysis table.
 */
const FilterConfig = ({
    selectedAction,
    compiledSSIDs,
    selectedSSIDName,
    setSelectedSSIDName,
    newPassword,
    setNewPassword,
    selectedSourceSiteId,
    setSelectedSourceSiteId,
    liveSites,
    selectedTargetIds,
    generateRandomPassword,
}) => (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Config Panel */}
        <div className="lg:col-span-2 space-y-6">
            <div className="bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 rounded-2xl p-6 shadow-lg">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-6 flex items-center gap-2">
                    <Sliders size={16} className="text-emerald-500" /> Action Configuration
                </h3>
                <div className="space-y-6">
                    <div className="space-y-3">
                        <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500">Target SSID</label>
                        <SSIDSelector compiledSSIDs={compiledSSIDs} value={selectedSSIDName} onChange={setSelectedSSIDName} />
                    </div>

                    {selectedAction === 'update_ssid_config' && (
                        <div className="space-y-3">
                            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500">Source Site (Origin)</label>
                            <SiteSelector
                                sites={liveSites}
                                value={selectedSourceSiteId}
                                onChange={setSelectedSourceSiteId}
                                placeholder="-- Choose Source Site --"
                                accentColor="teal"
                            />
                            <div className="p-3 bg-blue-500/5 border border-blue-500/10 rounded-xl">
                                <p className="text-[11px] text-blue-600 dark:text-blue-400 leading-relaxed italic">
                                    Deep Config sẽ sao chép toàn bộ thuộc tính của SSID từ Site mẫu (VLAN, Radio, Rate, Isolation,...) đè lên các Site đích.
                                </p>
                            </div>
                            {selectedSSIDName && compiledSSIDs.find(s => s.networkName === selectedSSIDName)?.isGuestPortalEnabled && (
                                <div className="p-3 bg-indigo-500/5 border border-indigo-500/15 rounded-xl flex items-start gap-3">
                                    <Globe size={14} className="text-indigo-500 shrink-0 mt-0.5" />
                                    <div>
                                        <p className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 mb-0.5">Guest Portal Detected</p>
                                        <p className="text-[10px] text-indigo-500/80 dark:text-indigo-400/70 leading-relaxed">
                                            Guest Portal config sẽ được đồng bộ từ Site nguồn sang các Site đích.
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {selectedAction === 'update_ssid_password' && (
                        <div className="space-y-3">
                            <div className="flex justify-between items-center">
                                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500">New Password (PSK)</label>
                                <button onClick={generateRandomPassword} className="text-[10px] font-black uppercase text-emerald-500 hover:underline flex items-center gap-1">
                                    <Rocket size={12} /> Auto Gen
                                </button>
                            </div>
                            <div className="relative">
                                <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input type="text" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                                    className="w-full h-12 bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-xl pl-12 pr-4 font-mono text-base focus:border-emerald-500/50 outline-none"
                                    placeholder="Min 8 characters" />
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>

        {/* Mapping Analysis */}
        <div className="lg:col-span-3 bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 rounded-2xl overflow-hidden flex flex-col shadow-lg max-h-[500px]">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.04] flex flex-wrap justify-between items-center gap-3 shrink-0">
                <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center">
                        <Activity size={14} className="text-blue-500" />
                    </div>
                    <div>
                        <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-200">Conflict & Matching Analysis</h3>
                        <p className="text-[10px] text-slate-400 font-medium mt-0.5">{selectedTargetIds.size} sites analyzed</p>
                    </div>
                </div>
                {selectedSSIDName && (
                    <div className="flex items-center gap-2">
                        <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20">
                            <CheckCircle size={12} /> {compiledSSIDs.find(s => s.networkName === selectedSSIDName)?.foundInSites || 0} Match
                        </span>
                        <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20">
                            <XCircle size={12} /> {selectedTargetIds.size - (compiledSSIDs.find(s => s.networkName === selectedSSIDName)?.foundInSites || 0)} Skip
                        </span>
                    </div>
                )}
            </div>
            {/* Column headers */}
            <div className="grid grid-cols-[40px_1fr_100px_1fr] gap-2 px-5 py-2.5 border-b border-slate-100 dark:border-white/5 bg-slate-50/30 dark:bg-white/[0.02] shrink-0">
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">#</span>
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Target Site</span>
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 text-center">Status</span>
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Note</span>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-2.5 space-y-1.5">
                {Array.from(selectedTargetIds).map((siteId, idx) => {
                    const site = liveSites.find(s => s.siteId === siteId);
                    const ssidEntry = compiledSSIDs.find(s => s.networkName === selectedSSIDName);
                    const isMatch = !!(ssidEntry && ssidEntry.foundInSiteIds.includes(siteId));
                    return (
                        <div key={siteId}
                            className={`grid grid-cols-[40px_1fr_100px_1fr] gap-2 items-center px-3.5 py-3 rounded-xl border-l-[3px] transition-all ${
                                isMatch ? 'border-l-emerald-500 bg-emerald-50/60 dark:bg-emerald-500/[0.06] border border-emerald-100 dark:border-emerald-500/10'
                                : 'border-l-rose-400 bg-rose-50/40 dark:bg-rose-500/[0.04] border border-rose-100/60 dark:border-rose-500/10 opacity-80'
                            }`}>
                            <span className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-500 shrink-0">{idx + 1}</span>
                            <div className="min-w-0">
                                <div className="font-bold text-[13px] text-slate-800 dark:text-slate-100 truncate">{site?.siteName || siteId}</div>
                                <div className="text-[10px] font-mono text-slate-400 truncate mt-0.5">{siteId}</div>
                            </div>
                            <div className="flex justify-center">
                                {selectedSSIDName ? (
                                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase border ${
                                        isMatch ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/25'
                                        : 'bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-500/25'}`}>
                                        {isMatch ? <CheckCircle size={11} /> : <XCircle size={11} />} {isMatch ? 'Match' : 'Skip'}
                                    </span>
                                ) : (
                                    <span className="text-slate-400 text-[10px] font-bold px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10">Pending</span>
                                )}
                            </div>
                            <div className="min-w-0">
                                <span className={`text-xs font-medium leading-relaxed ${isMatch ? 'text-slate-600 dark:text-slate-400' : 'text-rose-500/80'}`}>
                                    {selectedSSIDName ? (isMatch ? 'SSID found. Will be executed.' : 'SSID not found. Will be skipped.') : 'Select an SSID to preview.'}
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    </div>
);

export default FilterConfig;
