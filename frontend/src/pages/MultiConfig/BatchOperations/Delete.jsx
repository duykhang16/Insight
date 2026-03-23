import React, { useState } from 'react';
import apiClient from '../../../api/apiClient';
import { useLanguage } from '../../../context/LanguageContext';
import { toast } from 'sonner';
import {
    Trash2, AlertTriangle, KeyRound, Eraser,
} from 'lucide-react';

import useZoneSiteLoader from '../hooks/useZoneSiteLoader';
import useRealisticProgress from '../../../hooks/useRealisticProgress';
import { PasskeyLock, ZoneSiteSelector, ExecutionLogPanel } from './phases';

const CHALLENGE_WORD = 'DELETE';
const CLEAR_CHALLENGE_WORD = 'CLEAR';
const REQUIRED_PASSKEY = 'AITC-ADMIN';

const BatchDelete = () => {
    const { t } = useLanguage();

    // Zone & Site data (admin-only sites for destructive ops)
    const zs = useZoneSiteLoader({ adminOnly: true });

    // Passkey
    const [isUnlocked, setIsUnlocked] = useState(false);
    const [passkeyInput, setPasskeyInput] = useState('');
    const [passkeyError, setPasskeyError] = useState(false);

    // Modals
    const [showModal, setShowModal] = useState(false);
    const [challengeInput, setChallengeInput] = useState('');
    const [showClearModal, setShowClearModal] = useState(false);
    const [clearChallengeInput, setClearChallengeInput] = useState('');

    const [isRunning, setIsRunning] = useState(false);
    const [logs, setLogs] = useState([]);
    const prog = useRealisticProgress();

    // ── Derived ──
    const canConfirmDestruction = challengeInput === CHALLENGE_WORD && !isRunning;
    const canConfirmClear = clearChallengeInput === CLEAR_CHALLENGE_WORD && !isRunning;

    // ── Passkey ──
    const handleUnlock = (e) => {
        e.preventDefault();
        if (passkeyInput === REQUIRED_PASSKEY) { setIsUnlocked(true); setPasskeyError(false); }
        else { setPasskeyError(true); setPasskeyInput(''); }
    };

    // ── Resolve targets helper ──
    const resolveTargets = () => {
        const adminSiteIds = new Set(zs.sites.map(s => s.id));
        const finalTargets = new Set(zs.selectedSites);
        let skipCount = 0;
        zs.targetZones.forEach(z => {
            (z.site_ids || []).forEach(sid => {
                if (adminSiteIds.has(sid)) finalTargets.add(sid);
                else skipCount++;
            });
        });
        return { finalTargets: Array.from(finalTargets).filter(id => typeof id === 'string' && id.length > 0), skipCount };
    };

    // ── Delete execution ──
    const handleStart = async () => {
        setIsRunning(true);
        prog.start();

        const { finalTargets, skipCount } = resolveTargets();
        const initialLogs = [];
        if (skipCount > 0) {
            initialLogs.push({ id: 'security-skip', status: 'error', msg: `Security Notice: Automatically skipped ${skipCount} sites with insufficient permissions (Viewer).` });
        }

        if (finalTargets.length === 0) {
            setLogs([...initialLogs, { id: 'done', status: 'error', msg: 'Zero authorized targets found from selected Zones/Sites. Aborting.' }]);
            setIsRunning(false);
            prog.fail();
            return;
        }

        setLogs([...initialLogs, { id: 'init', status: 'running', msg: `Initiating batch deletion for ${finalTargets.length} sites...` }]);

        try {
            const res = await apiClient.post('/cloner/batch-site-delete', { target_zone_ids: [], target_site_ids: finalTargets });
            if (!zs.mountedRef.current) return;

            if (res.data?.status === 'success') {
                const results = res.data.results || [];
                clearInterval(progressRef.current);
                prog.finish();
                const formattedLogs = results.map((r, idx) => ({
                    id: `res-${idx}`, status: r.status === 'SUCCESS' ? 'ok' : 'error',
                    msg: `Site ${r.target}: ${r.status === 'SUCCESS' ? 'Deleted Successfully' : (r.detail?.message || r.detail || 'Failed')}`
                }));
                setLogs([{ id: 'done', status: 'ok', msg: `Batch deletion completed. Processed ${results.length} sites.` }, ...formattedLogs]);
                toast.error(`💥 ${successCount} sites đã bị xóa`, { description: 'Hành động này không thể hoàn tác.', duration: 8000 });
            } else {
                prog.fail();
                setLogs([{ id: 'err', status: 'error', msg: `API returned unexpected status: ${res.data?.status}` }]);
                toast.error('Batch deletion gặp lỗi.');
            }
        } catch (err) {
            prog.fail();
            const errMsg = err.response?.data?.detail || err.message;
            setLogs([{ id: 'err-catch', status: 'error', msg: `Critical Error: ${errMsg}` }]);
            toast.error(`Batch deletion thất bại: ${errMsg}`);
        } finally {
            if (zs.mountedRef.current) { setIsRunning(false); zs.refresh(); }
        }
    };

    // ── Clear execution ──
    const handleClearStart = async () => {
        setIsRunning(true);
        prog.start();

        const { finalTargets, skipCount } = resolveTargets();
        const initialLogs = [];
        if (skipCount > 0) initialLogs.push({ id: 'security-skip', status: 'error', msg: `Skipped ${skipCount} sites with insufficient permissions.` });

        if (finalTargets.length === 0) {
            setLogs([...initialLogs, { id: 'done', status: 'error', msg: 'Zero authorized targets. Aborting.' }]);
            setIsRunning(false);
            prog.fail();
            return;
        }

        setLogs([...initialLogs, { id: 'init', status: 'running', msg: `🧹 Clearing networks from ${finalTargets.length} sites...` }]);

        try {
            const res = await apiClient.post('/cloner/batch-site-clear', { target_zone_ids: [], target_site_ids: finalTargets });
            prog.finish();

            if (res.data?.status === 'success') {
                const results = res.data.results || [];
                const successCount = results.filter(r => r.status === 'SUCCESS').length;
                const totalSSIDs = results.reduce((sum, r) => sum + (r.ssids_deleted || 0), 0);
                const totalWired = results.reduce((sum, r) => sum + (r.wired_deleted || 0), 0);
                const gpResetCount = results.filter(r => r.guest_portal_reset).length;
                const formattedLogs = results.map((r, idx) => ({ id: `res-${idx}`, status: r.status === 'SUCCESS' ? 'ok' : 'error', msg: `Site ${r.target}: ${r.detail}` }));
                setLogs([{ id: 'done', status: 'ok', msg: `✅ Full wipe done. ${successCount}/${results.length} sites — ${totalSSIDs} SSIDs xóa, ${totalWired} wired xóa, ${gpResetCount} guest portal reset.` }, ...formattedLogs]);
                toast.success(`🧹 Wiped ${totalSSIDs} SSIDs + ${totalWired} wired from ${successCount} sites`, { duration: 6000 });
            } else {
                setLogs([{ id: 'err', status: 'error', msg: `Unexpected status: ${res.data?.status}` }]);
            }
        } catch (err) {
            prog.fail();
            const errMsg = err.response?.data?.detail || err.message;
            setLogs([{ id: 'err-catch', status: 'error', msg: `Error: ${errMsg}` }]);
            toast.error(`Clear failed: ${errMsg}`);
        } finally {
            if (zs.mountedRef.current) setIsRunning(false);
        }
    };

    // ── Passkey gate ──
    if (!isUnlocked) {
        return (
            <PasskeyLock
                passkeyInput={passkeyInput} setPasskeyInput={setPasskeyInput}
                passkeyError={passkeyError} setPasskeyError={setPasskeyError}
                onUnlock={handleUnlock} t={t} i18nPrefix="batch_delete"
            />
        );
    }

    // ── Viewer skip calculation ──
    const adminSiteIds = new Set(zs.sites.map(s => s.id));
    let skippedViewerCount = 0;
    zs.targetZones.forEach(z => { (z.site_ids || []).forEach(sid => { if (!adminSiteIds.has(sid)) skippedViewerCount++; }); });

    return (
        <div className="relative w-full min-h-[700px] bg-slate-50 dark:bg-[#020617] text-slate-800 dark:text-slate-200 rounded-xl border border-slate-200 dark:border-gray-800 shadow-xl overflow-hidden">
            <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden rounded-xl">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-rose-600/5 dark:bg-rose-600/10 blur-[120px] rounded-full" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-red-600/5 dark:bg-red-600/10 blur-[120px] rounded-full" />
            </div>

            <div className="relative z-10 p-8">
                {/* Header */}
                <div className="flex items-center gap-4 mb-8">
                    <div className="w-12 h-12 bg-rose-50 dark:bg-rose-500/10 rounded-xl flex items-center justify-center text-rose-500 dark:text-rose-400 border border-rose-100 dark:border-rose-500/20">
                        <Trash2 size={24} />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                            {t('batch_delete.title')}
                            <span className="bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-400 text-[9px] font-black uppercase px-2 py-0.5 rounded border border-rose-200 dark:border-rose-500/30">{t('batch_delete.high_risk')}</span>
                        </h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400">{t('batch_delete.subtitle')}</p>
                    </div>
                </div>

                {/* Preview Summary */}
                {(zs.selectedZones.size > 0 || zs.selectedSites.length > 0) && !isRunning && (
                    <div className="p-4 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 rounded-2xl mb-4 animate-fade-in">
                        <h4 className="text-sm font-bold text-rose-800 dark:text-rose-300 mb-1">{t('batch_delete.execution_preview')}</h4>
                        <p className="text-xs text-rose-600 dark:text-rose-400 leading-relaxed">
                            {t('batch_delete.summary')} <strong className="text-rose-700 dark:text-rose-300">{zs.selectedZones.size}</strong> {t('batch_delete.summary_zones')} <strong className="text-rose-700 dark:text-rose-300">{zs.selectedSites.length}</strong> {t('batch_delete.summary_sites')}
                            {t('batch_delete.system_delete_total')} <strong className="text-rose-700 dark:text-rose-300">{zs.totalExecutionSites}</strong> {t('batch_delete.system_delete_total_sites')}
                        </p>
                        {skippedViewerCount > 0 && (
                            <div className="mt-2 flex items-start gap-2 p-2 bg-white dark:bg-black/20 rounded-lg border border-rose-200 dark:border-rose-500/20">
                                <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />
                                <p className="text-[10px] text-amber-600 dark:text-amber-400 font-bold">
                                    {t('batch_delete.warning_viewer_sites')} {skippedViewerCount} {t('batch_delete.warning_viewer_skipped')}
                                </p>
                            </div>
                        )}
                    </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Panel 1: Zone & Site Selection */}
                    <div className="flex flex-col gap-4">
                        <ZoneSiteSelector
                            zones={zs.zones} selectedZones={zs.selectedZones} setSelectedZones={zs.setSelectedZones}
                            sites={zs.sites} selectedSites={zs.selectedSites} setSelectedSites={zs.setSelectedSites}
                            activeTab={zs.activeTab} setActiveTab={zs.setActiveTab}
                            searchTargetTerm={zs.searchTargetTerm} setSearchTargetTerm={zs.setSearchTargetTerm}
                            selectedZoneFilter={zs.selectedZoneFilter} setSelectedZoneFilter={zs.setSelectedZoneFilter}
                            isLoadingZones={zs.isLoadingZones} isLoadingSites={zs.isLoadingSites}
                            disabled={isRunning}
                            onRefresh={zs.refresh}
                            accentColor="rose" t={t} i18nPrefix="batch_delete"
                        />
                        <div className="flex gap-3">
                            <button onClick={() => { setClearChallengeInput(''); setShowClearModal(true); }}
                                disabled={(zs.selectedZones.size === 0 && zs.selectedSites.length === 0) || isRunning}
                                className="flex-1 h-12 bg-gradient-to-r from-amber-500 to-orange-500 th-text-primary font-black uppercase tracking-[0.15em] text-xs rounded-2xl shadow-[0_10px_30px_rgba(245,158,11,0.2)] hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-25 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                                <Eraser size={16} /> Clear {zs.totalExecutionSites} sites
                            </button>
                            <button onClick={() => { setChallengeInput(''); setShowModal(true); }}
                                disabled={(zs.selectedZones.size === 0 && zs.selectedSites.length === 0) || isRunning}
                                className="flex-1 h-12 bg-gradient-to-r from-rose-600 to-red-600 th-text-primary font-black uppercase tracking-[0.15em] text-xs rounded-2xl shadow-[0_10px_30px_rgba(225,29,72,0.2)] hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-25 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                                <Trash2 size={16} /> {t('batch_delete.delete_sites')} {zs.totalExecutionSites} {t('batch_delete.sites')}
                            </button>
                        </div>
                    </div>

                    {/* Panel 2: Execution Log */}
                    <ExecutionLogPanel
                        logs={logs} isRunning={isRunning} progress={prog.progress}
                        accentColor="rose" title={t('batch_delete.execution_log')}
                        emptyText={t('batch_delete.ready_for_destruction')}
                    />
                </div>
            </div>

            {/* DELETE Confirmation Modal */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/80 backdrop-blur-md">
                    <div className="bg-white dark:bg-slate-900 max-w-md w-full rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col animate-fade-in relative">
                        <div className="h-2 w-full bg-gradient-to-r from-rose-500 via-red-500 to-rose-500" />
                        <div className="p-6 pb-2">
                            <div className="w-12 h-12 bg-rose-100 dark:bg-rose-500/20 rounded-full flex items-center justify-center text-rose-600 dark:text-rose-400 mb-4 mx-auto shadow-[0_0_20px_rgba(225,29,72,0.3)]">
                                <AlertTriangle size={24} />
                            </div>
                            <h2 className="text-xl font-black text-center text-slate-900 dark:text-white mb-2">{t('batch_delete.confirm_destruction')}</h2>
                            <p className="text-sm text-center text-slate-600 dark:text-slate-400 mb-6">
                                {t('batch_delete.about_to_delete')} <strong className="text-rose-600 dark:text-rose-400">{zs.totalExecutionSites}</strong> {t('batch_delete.selected_sites')}
                            </p>
                            <div className="flex flex-col gap-2 mb-4">
                                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 text-center">
                                    {t('batch_delete.type_to_proceed')} <span className="font-mono bg-rose-100 dark:bg-rose-900/50 text-rose-700 dark:text-rose-300 px-1 py-0.5 rounded select-all">{CHALLENGE_WORD}</span> {t('batch_delete.to_proceed')}
                                </label>
                                <input type="text" value={challengeInput} onChange={e => setChallengeInput(e.target.value)} placeholder={CHALLENGE_WORD}
                                    className="w-full text-center bg-white dark:bg-black/50 border-2 border-slate-300 dark:border-slate-800 focus:border-rose-500 dark:focus:border-rose-500 rounded-xl px-4 py-3 text-lg font-black tracking-widest text-slate-900 dark:text-rose-500 placeholder:th-text-secondary dark:placeholder:text-slate-700 focus:outline-none transition-colors" />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3 p-6 bg-slate-50 dark:bg-slate-800/30 border-t border-slate-100 dark:border-white/5">
                            <button onClick={() => { setShowModal(false); setChallengeInput(''); }}
                                className="h-12 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-600 font-bold rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 active:scale-95 transition-all">
                                {t('batch_delete.cancel')}
                            </button>
                            <button onClick={handleStart} disabled={!canConfirmDestruction}
                                className="h-12 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 th-text-primary font-black uppercase tracking-widest text-xs rounded-xl shadow-lg active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                                <KeyRound size={16} className={canConfirmDestruction ? 'animate-pulse' : ''} /> {t('batch_delete.destroy')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* CLEAR Confirmation Modal */}
            {showClearModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/80 backdrop-blur-md">
                    <div className="bg-white dark:bg-slate-900 max-w-md w-full rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col animate-fade-in relative">
                        <div className="h-2 w-full bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500" />
                        <div className="p-6 pb-2">
                            <div className="w-12 h-12 bg-amber-100 dark:bg-amber-500/20 rounded-full flex items-center justify-center text-amber-600 dark:text-amber-400 mb-4 mx-auto shadow-[0_0_20px_rgba(245,158,11,0.3)]">
                                <Eraser size={24} />
                            </div>
                            <h2 className="text-xl font-black text-center text-slate-900 dark:text-white mb-2">Clear All Networks</h2>
                            <p className="text-sm text-center text-slate-600 dark:text-slate-400 mb-2">
                                Xóa trắng tất cả SSIDs/Networks trên <strong className="text-amber-600 dark:text-amber-400">{zs.totalExecutionSites}</strong> sites.
                            </p>
                            <p className="text-xs text-center text-slate-500 dark:text-slate-400 mb-6">
                                Sites vẫn tồn tại, chỉ config bên trong bị xóa. Dùng để test áp Template.
                            </p>
                            <div className="flex flex-col gap-2 mb-4">
                                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 text-center">
                                    Nhập <span className="font-mono bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 px-1 py-0.5 rounded select-all">{CLEAR_CHALLENGE_WORD}</span> để xác nhận
                                </label>
                                <input type="text" value={clearChallengeInput} onChange={e => setClearChallengeInput(e.target.value)} placeholder={CLEAR_CHALLENGE_WORD} autoFocus
                                    className="w-full text-center bg-white dark:bg-black/50 border-2 border-slate-300 dark:border-slate-800 focus:border-amber-500 dark:focus:border-amber-500 rounded-xl px-4 py-3 text-lg font-black tracking-widest text-slate-900 dark:text-amber-500 placeholder:th-text-secondary dark:placeholder:text-slate-700 focus:outline-none transition-colors" />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3 p-6 bg-slate-50 dark:bg-slate-800/30 border-t border-slate-100 dark:border-white/5">
                            <button onClick={() => setShowClearModal(false)}
                                className="h-12 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-600 font-bold rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 active:scale-95 transition-all">
                                Hủy
                            </button>
                            <button onClick={handleClearStart} disabled={!canConfirmClear}
                                className="h-12 bg-amber-500 hover:bg-amber-600 disabled:bg-slate-300 dark:disabled:bg-slate-700 th-text-primary font-black uppercase tracking-widest text-xs rounded-xl shadow-lg active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                                <Eraser size={16} className={canConfirmClear ? 'animate-pulse' : ''} /> Clear Now
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BatchDelete;
