import React, { useState } from 'react';
import apiClient from '../../../api/apiClient';
import { useLanguage } from '../../../context/LanguageContext';
import { toast } from 'sonner';
import {
    Users, AlertTriangle, Mail, Tag, Shield, Play, RefreshCw,
} from 'lucide-react';

import useZoneSiteLoader from '../hooks/useZoneSiteLoader';
import { ZoneSiteSelector, ExecutionLogPanel } from './phases';

const AVAILABLE_ROLES = [
    { label: 'Administrator', value: 'administrator' },
    { label: 'Viewer', value: 'viewer' },
];

const BatchAccountAccess = () => {
    const { t } = useLanguage();

    // Zone & Site data (admin-only sites)
    const zs = useZoneSiteLoader({ adminOnly: true });

    const [email, setEmail] = useState('');
    const [selectedRole, setSelectedRole] = useState(AVAILABLE_ROLES[0].value);
    const [mode, setMode] = useState('add');

    const [isRunning, setIsRunning] = useState(false);
    const [isPrechecking, setIsPrechecking] = useState(false);
    const [showPrecheckModal, setShowPrecheckModal] = useState(false);
    const [existingSites, setExistingSites] = useState([]);
    const [logs, setLogs] = useState([]);

    // ── Derived ──
    const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    const canStart = isEmailValid && (zs.selectedZones.size > 0 || zs.selectedSites.length > 0) && !isRunning && !isPrechecking;

    // ── Pre-check ──
    const runPrecheck = async () => {
        setIsPrechecking(true);
        setLogs([{ id: 'precheck', status: 'running', msg: `Running Smart Pre-check for ${email}...` }]);
        try {
            const payload = { email, target_zone_ids: Array.from(zs.selectedZones), target_site_ids: Array.from(zs.selectedSites) };
            const res = await apiClient.post('/cloner/batch-account-access/precheck', payload);
            const found = res.data?.existing_sites || [];
            if (found.length > 0 && mode === 'add') {
                setExistingSites(found);
                setShowPrecheckModal(true);
                setLogs([{ id: 'precheck-done', status: 'ok', msg: `Pre-check found ${found.length} site(s) already containing the account.` }]);
            } else {
                handleStart([]);
            }
        } catch (err) {
            setLogs([{ id: 'err-precheck', status: 'error', msg: `Pre-check failed: ${err.message}` }]);
            handleStart([]);
        } finally {
            if (zs.mountedRef.current) setIsPrechecking(false);
        }
    };

    // ── Execute ──
    const handleStart = async (excludeIds = []) => {
        setShowPrecheckModal(false);
        setIsRunning(true);
        setLogs([]);

        const adminSiteIds = new Set(zs.sites.map(s => s.id));
        const initialTargets = new Set(zs.selectedSites);
        let skipCount = 0;

        zs.targetZones.forEach(z => {
            (z.site_ids || []).forEach(sid => {
                if (adminSiteIds.has(sid)) initialTargets.add(sid);
                else skipCount++;
            });
        });

        const finalTargets = Array.from(initialTargets).filter(sid => !excludeIds.includes(sid));

        const initialLogs = [{ id: 'security-check', status: 'ok', msg: `Security Check: Validated ${initialTargets.size} Administrator sites.` }];
        if (skipCount > 0) initialLogs.push({ id: 'security-skip', status: 'error', msg: `Security Notice: Automatically skipped ${skipCount} sites with insufficient permissions (Viewer).` });

        if (finalTargets.length === 0) {
            setLogs([...initialLogs, { id: 'done', status: 'error', msg: 'Zero authorized targets found after filtering and pre-check. Aborting.' }]);
            setIsRunning(false);
            return;
        }

        setLogs([...initialLogs, { id: 'init', status: 'running', msg: `Initiating batch sequence for ${finalTargets.length} sites...` }]);

        try {
            const payload = { action_type: mode, email, roleOnSite: selectedRole, target_zone_ids: [], target_site_ids: finalTargets, exclude_site_ids: [] };
            const res = await apiClient.post('/cloner/batch-account-access', payload);
            if (!zs.mountedRef.current) return;

            if (res.data?.status === 'success') {
                const results = res.data.results || [];
                const successCount = results.filter(r => r.status === 'SUCCESS').length;
                const formattedLogs = results.map((r, idx) => ({
                    id: `res-${idx}`, status: r.status === 'SUCCESS' ? 'ok' : 'error',
                    msg: `Site ${r.target}: ${r.status === 'SUCCESS' ? 'Operation Successful' : (r.detail?.message || r.detail || 'Failed')}`
                }));
                setLogs([
                    ...initialLogs,
                    { id: 'init-done', status: 'ok', msg: `Batch sequence for ${finalTargets.length} sites completed.` },
                    { id: 'done', status: 'ok', msg: `Processed ${results.length} sites — ${successCount} succeeded, ${results.length - successCount} failed.` },
                    ...formattedLogs
                ]);
                toast.success(
                    mode === 'add' ? `Đã cấp quyền cho ${successCount} sites` : `Đã thu hồi quyền trên ${successCount} sites`,
                    { description: `Batch ${mode === 'add' ? 'grant' : 'revoke'} hoàn tất. Processed ${results.length} sites.`, duration: 6000 }
                );
            } else {
                setLogs([{ id: 'err', status: 'error', msg: `API returned unexpected status: ${res.data?.status}` }]);
                toast.error('Operation gặp lỗi bất ngờ.');
            }
        } catch (err) {
            if (!zs.mountedRef.current) return;
            const errMsg = err.response?.data?.detail || err.message;
            setLogs([{ id: 'err-catch', status: 'error', msg: `Critical Error: ${errMsg}` }]);
            toast.error(`Batch operation thất bại: ${errMsg}`);
        } finally {
            if (zs.mountedRef.current) setIsRunning(false);
        }
    };

    // ── Viewer skip warning ──
    const adminSiteIds = new Set(zs.sites.map(s => s.siteId));
    let skippedViewerCount = 0;
    zs.targetZones.forEach(z => { (z.site_ids || []).forEach(sid => { if (!adminSiteIds.has(sid)) skippedViewerCount++; }); });

    return (
        <div className="relative w-full min-h-[700px] bg-slate-50 dark:bg-[#020617] text-slate-800 dark:text-slate-200 rounded-xl border border-slate-200 dark:border-gray-800 shadow-xl overflow-hidden">
            <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden rounded-xl">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/5 dark:bg-blue-600/10 blur-[120px] rounded-full" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-600/5 dark:bg-indigo-600/10 blur-[120px] rounded-full" />
            </div>

            <div className="relative z-10 p-8">
                {/* Header */}
                <div className="flex items-center gap-4 mb-8">
                    <div className="w-12 h-12 bg-blue-50 dark:bg-blue-500/10 rounded-xl flex items-center justify-center text-blue-500 dark:text-blue-400 border border-blue-100 dark:border-blue-500/20">
                        <Users size={24} />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">{t('batch_account.title')}</h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400">{t('batch_account.subtitle')}</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Panel 1: Configuration & Target */}
                    <div className="flex flex-col gap-6">
                        {/* Config Panel */}
                        <div className="backdrop-blur-2xl bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 rounded-3xl p-6 shadow-xl dark:shadow-none">
                            <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400 mb-6 flex items-center gap-2">
                                <Shield size={14} className="text-blue-500" /> {t('batch_account.identity_config')}
                            </h3>

                            {/* Mode Toggle */}
                            <div className="flex gap-2 mb-6 p-1 bg-slate-100 dark:bg-black/40 rounded-xl">
                                <button onClick={() => setMode('add')}
                                    className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${mode === 'add' ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm border border-slate-200 dark:border-white/10' : 'text-slate-500 hover:text-slate-700 dark:hover:th-text-secondary'}`}>
                                    {t('batch_account.grant_access')}
                                </button>
                                <button onClick={() => setMode('remove')}
                                    className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${mode === 'remove' ? 'bg-white dark:bg-slate-800 text-rose-600 dark:text-rose-400 shadow-sm border border-slate-200 dark:border-white/10' : 'text-slate-500 hover:text-slate-700 dark:hover:th-text-secondary'}`}>
                                    {t('batch_account.revoke_access')}
                                </button>
                            </div>

                            <div className="space-y-5">
                                <div>
                                    <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">
                                        <Mail size={12} className="text-slate-400" /> {t('batch_account.target_email')}
                                    </label>
                                    <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                                        placeholder={t('batch_account.email_placeholder')}
                                        className="w-full text-sm bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-xl py-3 px-4 text-slate-800 dark:text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-mono" />
                                </div>

                                <div className={`transition-all duration-300 ${mode === 'remove' ? 'opacity-30 pointer-events-none' : 'opacity-100'}`}>
                                    <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">
                                        <Tag size={12} className="text-slate-400" /> {t('batch_account.access_role')}
                                    </label>
                                    <select value={selectedRole} onChange={e => setSelectedRole(e.target.value)}
                                        className="w-full text-sm bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-xl py-3 px-4 text-slate-800 dark:text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-bold appearance-none">
                                        {AVAILABLE_ROLES.map(role => <option key={role.value} value={role.value}>{role.label}</option>)}
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* Target Panel */}
                        <ZoneSiteSelector
                            zones={zs.zones} selectedZones={zs.selectedZones} setSelectedZones={zs.setSelectedZones}
                            sites={zs.sites} selectedSites={zs.selectedSites} setSelectedSites={zs.setSelectedSites}
                            activeTab={zs.activeTab} setActiveTab={zs.setActiveTab}
                            searchTargetTerm={zs.searchTargetTerm} setSearchTargetTerm={zs.setSearchTargetTerm}
                            selectedZoneFilter={zs.selectedZoneFilter} setSelectedZoneFilter={zs.setSelectedZoneFilter}
                            isLoadingZones={zs.isLoadingZones} isLoadingSites={zs.isLoadingSites}
                            disabled={isRunning}
                            onRefresh={zs.refresh}
                            accentColor="blue" t={t} i18nPrefix="batch_account"
                        />
                    </div>

                    {/* Panel 2: Execution */}
                    <ExecutionLogPanel
                        logs={logs} isRunning={isRunning} accentColor="blue"
                        title={t('batch_account.execution_platform')}
                        emptyText={t('batch_account.awaiting_execution')}
                        headerExtra={
                            <>
                                {isPrechecking && (
                                    <div className="space-y-2 py-1 animate-fade-in">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] font-black uppercase tracking-widest text-amber-500">Running Smart Pre-check...</span>
                                            <RefreshCw size={12} className="animate-spin text-amber-500" />
                                        </div>
                                        <div className="w-full h-2 bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
                                            <div className="h-full bg-gradient-to-r from-amber-400 to-orange-400 rounded-full w-3/5" />
                                        </div>
                                    </div>
                                )}
                                {(zs.selectedZones.size > 0 || zs.selectedSites.length > 0) && !isRunning && !isPrechecking && (
                                    <div className={`p-4 rounded-xl border flex items-start gap-4 animate-fade-in ${mode === 'add'
                                        ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30'
                                        : 'bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/30'}`}>
                                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${mode === 'add' ? 'bg-white dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'bg-white dark:bg-rose-500/20 text-rose-600 dark:text-rose-400'}`}>
                                            <AlertTriangle size={20} />
                                        </div>
                                        <div className="flex-1">
                                            <h4 className={`text-sm font-bold ${mode === 'add' ? 'text-emerald-800 dark:text-emerald-300' : 'text-rose-800 dark:text-rose-300'}`}>
                                                {t('batch_account.execution_preview')}
                                            </h4>
                                            <p className={`text-xs mt-0.5 ${mode === 'add' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                                {t('batch_account.summary_zones')} <strong className="font-bold">{zs.selectedZones.size}</strong> {t('batch_account.summary_zones_count')} <strong className="font-bold">{zs.selectedSites.length}</strong> {t('batch_account.summary_sites_count')}
                                                {t('batch_account.summary_total_sites')} <strong className="font-bold">{zs.totalExecutionSites}</strong> {t('batch_account.summary_total_sites_count')}
                                            </p>
                                            {skippedViewerCount > 0 && (
                                                <div className="mt-2 flex items-start gap-1.5 p-2 bg-white/50 dark:bg-black/20 rounded-lg border border-amber-200 dark:border-amber-500/20">
                                                    <AlertTriangle size={12} className="text-amber-500 shrink-0 mt-0.5" />
                                                    <p className="text-[10px] text-amber-700 dark:text-amber-400 font-bold">
                                                        {t('batch_account.detected_viewer_sites')} {skippedViewerCount} {t('batch_account.viewer_sites_skipped')}
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </>
                        }
                    >
                        <div className="mt-2 text-center">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{mode === 'add' ? t('batch_account.grant_access') : t('batch_account.revoke_access')} {t('batch_account.mode_active')}</span>
                        </div>
                        <button onClick={runPrecheck} disabled={!canStart}
                            className={`w-full h-14 font-black uppercase tracking-[0.2em] text-xs rounded-2xl shadow-xl hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center justify-center gap-2 ${mode === 'add'
                                ? 'bg-gradient-to-r from-emerald-500 to-teal-500 th-text-primary shadow-emerald-500/20'
                                : 'bg-gradient-to-r from-rose-500 to-amber-500 th-text-primary shadow-rose-500/20'}`}>
                            {isRunning || isPrechecking ? (
                                <><RefreshCw size={16} className="animate-spin" /> {isPrechecking ? t('batch_account.running_precheck') : t('batch_account.processing')}</>
                            ) : (
                                <><Play size={16} /> {t('batch_account.execute_batch')} {mode === 'add' ? t('batch_account.add') : t('batch_account.remove')}</>
                            )}
                        </button>
                    </ExecutionLogPanel>
                </div>
            </div>

            {/* Smart Precheck Modal */}
            {showPrecheckModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/80 backdrop-blur-md">
                    <div className="bg-white dark:bg-slate-900 max-w-md w-full rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col animate-fade-in relative">
                        <div className="h-2 w-full bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500" />
                        <div className="p-6 pb-2">
                            <div className="w-12 h-12 bg-amber-100 dark:bg-amber-500/20 rounded-full flex items-center justify-center text-amber-600 dark:text-amber-400 mb-4 mx-auto shadow-[0_0_20px_rgba(245,158,11,0.3)]">
                                <AlertTriangle size={24} />
                            </div>
                            <h2 className="text-xl font-black text-center text-slate-900 dark:text-white mb-2">{t('batch_account.duplicate_accounts')}</h2>
                            <p className="text-sm text-center text-slate-600 dark:text-slate-400 mb-4">
                                {t('batch_account.duplicate_detected')} <strong>{existingSites.length}</strong> {t('batch_account.duplicate_email')} <strong className="text-blue-500">{email}</strong>.
                            </p>
                            <div className="bg-slate-50 dark:bg-black/30 p-3 rounded-xl border border-slate-100 dark:border-white/5 max-h-32 overflow-y-auto mb-4 custom-scrollbar">
                                <p className="text-xs font-mono text-slate-500 leading-relaxed">{existingSites.map(s => s.site_id).join(', ')}</p>
                            </div>
                            <p className="text-sm font-bold text-center text-slate-700 dark:text-slate-300 mb-6">{t('batch_account.duplicate_skip_continue')}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-3 p-6 bg-slate-50 dark:bg-slate-800/30 border-t border-slate-100 dark:border-white/5">
                            <button onClick={() => setShowPrecheckModal(false)}
                                className="h-12 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-600 font-bold rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 active:scale-95 transition-all">
                                {t('batch_account.cancel')}
                            </button>
                            <button onClick={() => handleStart(existingSites.map(s => s.site_id))}
                                className="h-12 bg-amber-500 hover:bg-amber-600 disabled:bg-slate-300 th-text-primary font-black tracking-widest text-xs rounded-xl shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2">
                                <Play size={16} /> {t('batch_account.skip_continue')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BatchAccountAccess;
