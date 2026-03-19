import React, { useState, useEffect, useRef } from 'react';
import apiClient from '../../../api/apiClient';
import { useLanguage } from '../../../context/LanguageContext';
import { toast } from 'sonner';
import WizardLayout, { PhaseSummaryCard } from '../../../components/WizardLayout';
import Spinner from '../../../components/Spinner';
import {
    Wifi, Search, KeyRound, Server, Sliders, Rocket,
    ChevronRight, ArrowLeft, RotateCcw,
} from 'lucide-react';

import { getRoleBadgeInfo, loadSitesFromApi, loadZonesFromApi } from '../utils';
import { SiteSelect, SSIDSelect, DeleteExecution } from './phases';

const REQUIRED_PASSKEY = 'AITC-ADMIN';

const DeleteSSID = () => {
    const { t } = useLanguage();

    // Passkey lock
    const [isUnlocked, setIsUnlocked] = useState(false);
    const [passkeyInput, setPasskeyInput] = useState('');
    const [passkeyError, setPasskeyError] = useState(false);

    // Step flow
    const [currentStep, setCurrentStep] = useState(0);
    const [liveSites, setLiveSites] = useState([]);
    const [zones, setZones] = useState([]);
    const [selectedZone, setSelectedZone] = useState('all');
    const [searchTargetTerm, setSearchTargetTerm] = useState('');
    const [selectedTargetIds, setSelectedTargetIds] = useState(new Set());

    // Analysis
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [compiledSSIDs, setCompiledSSIDs] = useState([]);
    const [selectedSSIDName, setSelectedSSIDName] = useState('');

    // Execution
    const [confirmReady, setConfirmReady] = useState(false);
    const [executionLoading, setExecutionLoading] = useState(false);
    const [executionResult, setExecutionResult] = useState(null);
    const [executionLogs, setExecutionLogs] = useState([]);
    const [progress, setProgress] = useState(0);
    const [isStopping, setIsStopping] = useState(false);
    const stopRef = useRef(false);

    // ── Init ──
    useEffect(() => {
        if (isUnlocked) {
            loadSitesFromApi(apiClient).then(setLiveSites).catch(() => setLiveSites([]));
            loadZonesFromApi(apiClient).then(setZones).catch(() => {});
        }
    }, [isUnlocked]);

    // ── Derived ──
    const filteredTargetSites = liveSites.filter(site => {
        const matchesSearch = site.siteName.toLowerCase().includes(searchTargetTerm.toLowerCase());
        let matchesZone = true;
        if (selectedZone !== 'all') {
            const zoneObj = zones.find(z => String(z.id || z._id) === selectedZone);
            matchesZone = zoneObj ? (zoneObj.site_ids || []).includes(site.siteId) : false;
        }
        return matchesSearch && matchesZone;
    });
    const validFilteredSiteIds = filteredTargetSites.filter(s => getRoleBadgeInfo(s.role).canClone).map(s => s.siteId);
    const allFilteredValid = validFilteredSiteIds.length > 0 && validFilteredSiteIds.every(id => selectedTargetIds.has(id));

    // ── Handlers ──
    const handleUnlock = (e) => {
        e.preventDefault();
        if (passkeyInput === REQUIRED_PASSKEY) { setIsUnlocked(true); setPasskeyError(false); }
        else { setPasskeyError(true); setPasskeyInput(''); }
    };

    const handleAnalyzeSites = async () => {
        if (selectedTargetIds.size === 0) { toast.error('Vui lòng chọn ít nhất 1 Site.'); return; }
        setIsAnalyzing(true);
        setCompiledSSIDs([]);
        setSelectedSSIDName('');

        try {
            const siteIds = Array.from(selectedTargetIds);
            const results = [];
            for (let i = 0; i < siteIds.length; i++) {
                try {
                    const res = await apiClient.get(`/cloner/sites/${siteIds[i]}/ssids`);
                    results.push({ siteId: siteIds[i], data: res.data || [] });
                } catch { results.push({ siteId: siteIds[i], data: [] }); }
                if (i < siteIds.length - 1) await new Promise(r => setTimeout(r, 100));
            }

            const uniqueSSIDMap = new Map();
            results.forEach((item) => {
                const siteInfo = liveSites.find(s => s.siteId === item.siteId);
                const siteName = siteInfo ? siteInfo.siteName : item.siteId;
                item.data.forEach(ssid => {
                    const name = ssid.networkName || ssid.name;
                    if (!uniqueSSIDMap.has(name)) {
                        uniqueSSIDMap.set(name, { networkName: name, security: ssid.security, isGuestPortalEnabled: ssid.isGuestPortalEnabled, foundInSites: 1, foundInSiteIds: [item.siteId], foundInSiteNames: [siteName] });
                    } else {
                        const entry = uniqueSSIDMap.get(name);
                        entry.foundInSites += 1;
                        entry.foundInSiteIds.push(item.siteId);
                        entry.foundInSiteNames.push(siteName);
                    }
                });
            });

            setCompiledSSIDs(Array.from(uniqueSSIDMap.values()).sort((a, b) => a.networkName.localeCompare(b.networkName)));
            setCurrentStep(1);
        } catch { toast.error('Đã xảy ra lỗi khi phân tích các Sites.'); }
        finally { setIsAnalyzing(false); }
    };

    const handleProceedToExecution = () => {
        if (!selectedSSIDName) { toast.error('Vui lòng chọn một SSID.'); return; }
        setConfirmReady(false);
        setCurrentStep(2);
    };

    const handleExecuteDelete = async () => {
        if (selectedTargetIds.size === 0) return;
        setConfirmReady(false);
        setExecutionLoading(true);
        setExecutionResult(null);
        setExecutionLogs([]);
        setProgress(0);
        setIsStopping(false);
        stopRef.current = false;

        const targetIds = Array.from(selectedTargetIds);
        const results = [];

        for (let i = 0; i < targetIds.length; i++) {
            if (stopRef.current) {
                setExecutionLogs(prev => [{ siteName: "SYSTEM", status: "STOPPED", detail: "Thao tác đã bị dừng bởi người dùng." }, ...prev]);
                break;
            }
            const siteId = targetIds[i];
            const siteInfo = liveSites.find(s => s.siteId === siteId);
            const siteName = siteInfo ? siteInfo.siteName : siteId;
            const ssidEntry = compiledSSIDs.find(s => s.networkName === selectedSSIDName);
            if (!ssidEntry || !ssidEntry.foundInSiteIds.includes(siteId)) {
                const skipLog = { siteName, status: "SKIPPED", detail: `SSID '${selectedSSIDName}' không tồn tại trên site này.` };
                results.push(skipLog);
                setExecutionLogs(prev => [skipLog, ...prev]);
                setProgress(Math.round(((i + 1) / targetIds.length) * 100));
                continue;
            }

            let attempt = 0, success = false, lastError = null;
            while (attempt < 2 && !success && !stopRef.current) {
                attempt++;
                try {
                    const res = await apiClient.post('/cloner/sync-delete', { source_network_name: selectedSSIDName, target_site_ids: [siteId] });
                    const siteResult = res.data.results[0];
                    if (siteResult.status === 'SUCCESS') {
                        success = true;
                        const okLog = { siteName, status: "SUCCESS", detail: siteResult.detail || "SSID đã bị xóa." };
                        results.push(okLog);
                        setExecutionLogs(prev => [okLog, ...prev]);
                    } else {
                        lastError = siteResult.detail;
                        if (attempt < 2) {
                            setExecutionLogs(prev => [{ siteName, status: "RETRYING", detail: `Lần thử ${attempt}/2 thất bại.` }, ...prev]);
                            await new Promise(r => setTimeout(r, 1500));
                        }
                    }
                } catch (err) {
                    lastError = err.response?.data?.detail || err.message;
                    if (attempt < 2) {
                        setExecutionLogs(prev => [{ siteName, status: "RETRYING", detail: `Lỗi kết nối lần ${attempt}.` }, ...prev]);
                        await new Promise(r => setTimeout(r, 2000));
                    }
                }
            }
            if (!success && !stopRef.current) {
                const errLog = { siteName, status: "ERROR", detail: lastError || "Thất bại sau 2 lần thử." };
                results.push(errLog);
                setExecutionLogs(prev => [errLog, ...prev]);
            }
            setProgress(Math.round(((i + 1) / targetIds.length) * 100));
            if (i < targetIds.length - 1) await new Promise(r => setTimeout(r, 400));
        }

        setExecutionResult(results);
        setExecutionLoading(false);
        if (!stopRef.current) {
            const successCount = results.filter(r => r.status === 'SUCCESS').length;
            const errorCount = results.filter(r => r.status === 'ERROR').length;
            if (errorCount === 0) toast.success(`Xóa SSID hoàn tất · ${successCount} ✅`, { duration: 6000 });
            else toast.warning(`Xóa SSID xong với lỗi · ${successCount} ✅ · ${errorCount} ❌`, { duration: 8000 });
        }
    };

    const handleStop = () => { if (executionLoading) { setIsStopping(true); stopRef.current = true; } };

    // ── Step Navigation ──
    const handleStepClick = (stepIdx) => {
        if (stepIdx < currentStep && !executionLoading) {
            if (stepIdx === 0) setCurrentStep(0);
            else if (stepIdx === 1) {
                setExecutionResult(null);
                setExecutionLogs([]);
                setProgress(0);
                setConfirmReady(false);
                setCurrentStep(1);
            }
        }
    };

    // ── Passkey Lock Screen ──
    if (!isUnlocked) {
        return (
            <div className="w-full min-h-[700px] flex items-center justify-center bg-slate-50 dark:bg-[#020617] rounded-xl border border-slate-200 dark:border-gray-800 shadow-xl p-8 relative overflow-hidden">
                <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden rounded-xl">
                    <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-rose-600/5 dark:bg-rose-600/10 blur-[120px] rounded-full" />
                    <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-red-600/5 dark:bg-red-600/10 blur-[120px] rounded-full" />
                </div>
                <form onSubmit={handleUnlock} className="relative z-10 max-w-sm w-full bg-white dark:bg-slate-900 p-8 rounded-3xl shadow-2xl border border-rose-100 dark:border-rose-900/30 flex flex-col items-center gap-6">
                    <div className="w-16 h-16 bg-rose-100 dark:bg-rose-500/20 rounded-full flex items-center justify-center text-rose-600 dark:text-rose-400">
                        <KeyRound size={32} />
                    </div>
                    <div className="text-center">
                        <h2 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-wider">{t('batch_delete.restricted_area') || 'Restricted Area'}</h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">{t('batch_delete.passkey_prompt') || 'Enter passkey to access this tool'}</p>
                    </div>
                    <div className="w-full relative">
                        <input type="password" value={passkeyInput}
                            onChange={e => { setPasskeyInput(e.target.value); setPasskeyError(false); }}
                            placeholder={t('batch_delete.enter_passkey') || 'Enter passkey'} autoFocus
                            className={`w-full text-center bg-slate-50 dark:bg-black/50 border-2 rounded-xl px-4 py-3 text-lg font-bold text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none transition-colors ${passkeyError ? 'border-rose-500 animate-shake' : 'border-slate-200 dark:border-slate-800 focus:border-rose-500'}`} />
                        {passkeyError && <p className="text-[10px] text-rose-500 font-bold text-center mt-2 absolute w-full -bottom-5">{t('batch_delete.incorrect_passkey') || 'Incorrect passkey'}</p>}
                    </div>
                    <button type="submit" disabled={!passkeyInput}
                        className="w-full h-12 mt-2 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 disabled:from-slate-300 disabled:to-slate-300 text-white font-black uppercase tracking-widest text-xs rounded-xl shadow-lg active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                        {t('batch_delete.unlock_tool') || 'Unlock'}
                    </button>
                </form>
            </div>
        );
    }

    // ── Wizard Config ──
    const wizardSteps = [
        { label: 'Select Sites', icon: Server },
        { label: 'Choose SSID', icon: Sliders },
        { label: 'Delete Execution', icon: Rocket },
    ];

    const buildSummaryCards = () => {
        const cards = [];
        if (currentStep >= 1) {
            cards.push(
                <PhaseSummaryCard key="ph1" phaseNumber={1} phaseLabel="Select Sites" icon={Server} accentColor="rose"
                    onBack={!executionLoading ? () => handleStepClick(0) : undefined}>
                    <div className="mt-2 flex items-center gap-3 text-xs">
                        <span className="text-slate-500">Sites:</span>
                        <span className="font-bold text-slate-700 dark:text-slate-200">{selectedTargetIds.size} selected</span>
                    </div>
                </PhaseSummaryCard>
            );
        }
        if (currentStep >= 2) {
            cards.push(
                <PhaseSummaryCard key="ph2" phaseNumber={2} phaseLabel="Choose SSID" icon={Sliders} accentColor="rose"
                    onBack={!executionLoading ? () => handleStepClick(1) : undefined}>
                    <div className="mt-2 flex items-center gap-3 text-xs">
                        <span className="text-slate-500">SSID:</span>
                        <span className="font-bold text-rose-600 dark:text-rose-400 bg-rose-500/10 px-2.5 py-0.5 rounded-lg border border-rose-500/20">{selectedSSIDName || '—'}</span>
                        <span className="text-slate-500 ml-2">Action:</span>
                        <span className="font-bold text-rose-600 dark:text-rose-400">DELETE</span>
                    </div>
                </PhaseSummaryCard>
            );
        }
        return cards;
    };

    const buildFooter = () => {
        if (currentStep === 0) {
            return (
                <div className="flex justify-between items-center">
                    <button onClick={() => {
                        if (allFilteredValid) {
                            const newSet = new Set(selectedTargetIds);
                            validFilteredSiteIds.forEach(id => newSet.delete(id));
                            setSelectedTargetIds(newSet);
                        } else {
                            setSelectedTargetIds(prev => new Set([...prev, ...validFilteredSiteIds]));
                        }
                    }} className="px-4 h-11 rounded-xl font-bold text-xs bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 transition-colors">
                        {allFilteredValid ? "Deselect Filtered" : "Select All Valid"}
                    </button>
                    <button onClick={handleAnalyzeSites} disabled={isAnalyzing || selectedTargetIds.size === 0}
                        className="px-8 h-12 bg-gradient-to-r from-rose-600 to-red-600 text-white font-black uppercase tracking-[0.15em] text-xs rounded-2xl shadow-xl hover:scale-[1.02] transition-all active:scale-95 disabled:opacity-30 flex items-center gap-2">
                        {isAnalyzing ? <Spinner size="sm" /> : <Search size={16} />}
                        Analyze Selection
                    </button>
                </div>
            );
        }
        if (currentStep === 1) {
            return (
                <div className="flex justify-between items-center">
                    <button onClick={() => handleStepClick(0)} className="flex items-center gap-2 px-5 h-11 text-sm font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-white/5 transition-all">
                        <ArrowLeft size={16} /> Select Sites
                    </button>
                    <button onClick={handleProceedToExecution} disabled={!selectedSSIDName}
                        className="px-8 h-12 bg-gradient-to-r from-rose-600 to-red-600 text-white font-black uppercase tracking-[0.15em] text-xs rounded-2xl shadow-xl hover:scale-[1.02] transition-all active:scale-95 disabled:opacity-30 flex items-center gap-2">
                        Next: Delete Review <ChevronRight size={16} />
                    </button>
                </div>
            );
        }
        if (currentStep === 2) {
            return (
                <div className="flex justify-between items-center">
                    {!executionLoading && (
                        <button onClick={() => handleStepClick(1)} className="flex items-center gap-2 px-5 h-11 text-sm font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-white/5 transition-all">
                            <ArrowLeft size={16} /> Back to SSID Selection
                        </button>
                    )}
                    <div className="flex items-center gap-3 ml-auto">
                        {executionLoading && (
                            <button onClick={handleStop} disabled={isStopping}
                                className="px-5 h-11 rounded-xl font-bold text-xs bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/20 transition-all disabled:opacity-30">
                                {isStopping ? "Stopping..." : "Emergency Stop"}
                            </button>
                        )}
                        {!executionLoading && !executionResult && !confirmReady && (
                            <button onClick={() => setConfirmReady(true)}
                                className="px-6 h-11 bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 font-bold text-xs rounded-xl border border-rose-500/20 transition-all">
                                Confirm Deletion
                            </button>
                        )}
                        {confirmReady && !executionLoading && !executionResult && (
                            <button onClick={handleExecuteDelete}
                                className="px-8 h-12 bg-gradient-to-r from-rose-600 to-red-600 text-white font-black uppercase tracking-[0.15em] text-xs rounded-2xl shadow-xl hover:scale-[1.02] transition-all active:scale-95 flex items-center gap-2 animate-pulse">
                                <Rocket size={16} /> Execute Deletion Now
                            </button>
                        )}
                        {executionResult && (
                            <button onClick={() => window.location.reload()}
                                className="px-6 h-11 bg-slate-700 hover:bg-slate-600 text-white font-bold text-xs rounded-xl flex items-center gap-2">
                                Done / Reload <RotateCcw size={14} />
                            </button>
                        )}
                    </div>
                </div>
            );
        }
        return null;
    };

    // ── Render ──
    return (
        <div className="relative w-full h-full min-h-[700px]">
            <WizardLayout
                steps={wizardSteps}
                currentStep={currentStep}
                onStepClick={handleStepClick}
                accentColor="rose"
                title="Bulk Delete SSID"
                subtitle="Remove an SSID from multiple sites at once. This action cannot be undone."
                titleIcon={Wifi}
                summaryCards={buildSummaryCards()}
                footer={buildFooter()}
            >
                {currentStep === 0 && (
                    <SiteSelect
                        liveSites={liveSites}
                        selectedTargetIds={selectedTargetIds}
                        setSelectedTargetIds={setSelectedTargetIds}
                        searchTargetTerm={searchTargetTerm}
                        setSearchTargetTerm={setSearchTargetTerm}
                        zones={zones}
                        selectedZone={selectedZone}
                        setSelectedZone={setSelectedZone}
                    />
                )}

                {currentStep === 1 && (
                    <SSIDSelect
                        compiledSSIDs={compiledSSIDs}
                        selectedSSIDName={selectedSSIDName}
                        setSelectedSSIDName={setSelectedSSIDName}
                        selectedTargetIds={selectedTargetIds}
                        liveSites={liveSites}
                    />
                )}

                {currentStep === 2 && (
                    <DeleteExecution
                        selectedSSIDName={selectedSSIDName}
                        selectedTargetIds={selectedTargetIds}
                        compiledSSIDs={compiledSSIDs}
                        liveSites={liveSites}
                        confirmReady={confirmReady}
                        executionLoading={executionLoading}
                        executionResult={executionResult}
                        executionLogs={executionLogs}
                        progress={progress}
                    />
                )}
            </WizardLayout>

            <style>{`
                @keyframes fade-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
                .animate-fade-in { animation: fade-in 0.4s ease-out forwards; }
                .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.1); border-radius: 10px; }
                .dark .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.05); }
                @keyframes shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-5px); } 75% { transform: translateX(5px); } }
                .animate-shake { animation: shake 0.3s ease; }
            `}</style>
        </div>
    );
};

export default DeleteSSID;
