import React, { useState, useEffect, useRef } from 'react';
import apiClient from '../../../api/apiClient';
import styles from './Update.module.css';
import { useLanguage } from '../../../context/LanguageContext';
import { toast } from 'sonner';
import WizardLayout, { PhaseSummaryCard } from '../../../components/WizardLayout';
import Spinner from '../../../components/Spinner';
import {
    Server, Sliders, Rocket, Search, Wifi, ArrowLeft, ChevronRight, RotateCcw,
} from 'lucide-react';

import { getRoleBadgeInfo, generateRandomPassword as genPwd, loadSitesFromApi, loadZonesFromApi } from '../utils';
import { ScopeTarget, FilterConfig, Execution } from './phases';

const SmartSync = () => {
    const { t } = useLanguage();

    // ── State ──
    const [currentStep, setCurrentStep] = useState(0);
    const [liveSites, setLiveSites] = useState([]);

    // Phase 1: Scope & Target
    const [selectedAction, setSelectedAction] = useState('update_ssid_password');
    const [searchTargetTerm, setSearchTargetTerm] = useState('');
    const [selectedTargetIds, setSelectedTargetIds] = useState(new Set());
    const [zones, setZones] = useState([]);
    const [selectedZone, setSelectedZone] = useState('all');

    // Phase 2: Analysis & Configuration
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [hasAnalyzed, setHasAnalyzed] = useState(false);
    const [compiledSSIDs, setCompiledSSIDs] = useState([]);
    const [selectedSSIDName, setSelectedSSIDName] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [selectedSourceSiteId, setSelectedSourceSiteId] = useState('');
    const [sourceSSIDs, setSourceSSIDs] = useState([]);
    const [isLoadingSourceSSIDs, setIsLoadingSourceSSIDs] = useState(false);

    // Phase 3: Execution
    const [confirmReady, setConfirmReady] = useState(false);
    const [executionLoading, setExecutionLoading] = useState(false);
    const [executionResult, setExecutionResult] = useState(null);
    const [executionLogs, setExecutionLogs] = useState([]);
    const [progress, setProgress] = useState(0);
    const [isStopping, setIsStopping] = useState(false);
    const stopRef = useRef(false);

    // ── Init ──
    useEffect(() => {
        loadSitesFromApi(apiClient).then(setLiveSites).catch(() => setLiveSites([]));
        loadZonesFromApi(apiClient).then(setZones).catch(() => {});
    }, []);

    // Fetch SSIDs of Source Site
    useEffect(() => {
        setSourceSSIDs([]);
        if (!selectedSourceSiteId) return;
        const fetchSourceSSIDs = async () => {
            try {
                setIsLoadingSourceSSIDs(true);
                const res = await apiClient.get(`/cloner/sites/${selectedSourceSiteId}/ssids`);
                setSourceSSIDs(res.data || []);
            } catch (e) {
                console.error("Failed to fetch source SSIDs", e);
            } finally {
                setIsLoadingSourceSSIDs(false);
            }
        };
        fetchSourceSSIDs();
    }, [selectedSourceSiteId]);

    // ── Computed ──
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
    const actionLabel = selectedAction === 'update_ssid_password' ? 'Update Wireless PSK' : 'Clone Deep Config';
    const selectedTargetsCount = selectedTargetIds.size;

    // ── Handlers ──
    const handleAnalyzeSites = async () => {
        if (selectedTargetIds.size === 0) { toast.error('Vui lòng chọn ít nhất 1 Site.'); return; }
        setIsAnalyzing(true);
        setCompiledSSIDs([]);
        setSelectedSSIDName('');
        setSelectedSourceSiteId('');
        try {
            const siteIds = Array.from(selectedTargetIds);
            const results = [];
            for (let i = 0; i < siteIds.length; i++) {
                const siteId = siteIds[i];
                try {
                    const res = await apiClient.get(`/cloner/sites/${siteId}/ssids`);
                    results.push({ siteId, data: res.data || [] });
                } catch (err) {
                    console.warn(`Failed to fetch SSIDs for site ${siteId}`, err);
                    results.push({ siteId, data: [] });
                }
                if (i < siteIds.length - 1) await new Promise(r => setTimeout(r, 100));
            }
            const uniqueSSIDMap = new Map();
            results.forEach((item) => {
                const siteId = item.siteId;
                const siteInfo = liveSites.find(s => s.siteId === siteId);
                const siteName = siteInfo ? siteInfo.siteName : siteId;
                item.data.forEach(ssid => {
                    const name = ssid.networkName || ssid.name;
                    if (!uniqueSSIDMap.has(name)) {
                        uniqueSSIDMap.set(name, {
                            networkName: name, security: ssid.security,
                            isGuestPortalEnabled: ssid.isGuestPortalEnabled,
                            foundInSites: 1, foundInSiteIds: [siteId], foundInSiteNames: [siteName],
                        });
                    } else {
                        const entry = uniqueSSIDMap.get(name);
                        entry.foundInSites += 1;
                        entry.foundInSiteIds.push(siteId);
                        entry.foundInSiteNames.push(siteName);
                    }
                });
            });
            setCompiledSSIDs(Array.from(uniqueSSIDMap.values()).sort((a, b) => a.networkName.localeCompare(b.networkName)));
            setHasAnalyzed(true);
            setCurrentStep(1);
        } catch (e) {
            console.error("Error analyzing sites", e);
            toast.error('Đã xảy ra lỗi khi phân tích các Sites.');
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleProceedToExecution = () => {
        const unauthorizedTargets = Array.from(selectedTargetIds)
            .map(id => liveSites.find(s => s.siteId === id))
            .filter(s => s && !getRoleBadgeInfo(s.role).canClone);
        if (unauthorizedTargets.length > 0) {
            toast.error(`Không có quyền Administrator trên: ${unauthorizedTargets.map(s => s.siteName).join(', ')}`);
            return;
        }
        if (selectedAction === 'update_ssid_password') {
            if (!selectedSSIDName) { toast.error('Vui lòng chọn một SSID.'); return; }
            const selectedSSID = compiledSSIDs.find(s => s.networkName === selectedSSIDName);
            if (selectedSSID?.isGuestPortalEnabled) { toast.error('Không thể đổi mật khẩu cho Guest Portal SSID.'); return; }
            if (!newPassword || newPassword.length < 8) { toast.error('Mật khẩu phải từ 8 ký tự trở lên.'); return; }
        } else if (selectedAction === 'update_ssid_config') {
            if (!selectedSSIDName) { toast.error('Vui lòng chọn một SSID.'); return; }
            if (!selectedSourceSiteId) { toast.error('Vui lòng chọn Origin Site.'); return; }
        }
        setConfirmReady(false);
        setCurrentStep(2);
    };

    const handleExecuteSync = async () => {
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
                    let res;
                    const singleSiteRef = [siteId];
                    if (selectedAction === 'update_ssid_password') {
                        res = await apiClient.post('/cloner/sync-password', {
                            source_network_name: selectedSSIDName, new_password: newPassword, target_site_ids: singleSiteRef,
                        });
                    } else if (selectedAction === 'update_ssid_config') {
                        res = await apiClient.post('/cloner/sync-config', {
                            source_site_id: selectedSourceSiteId, source_network_name: selectedSSIDName, target_site_ids: singleSiteRef,
                        });
                    }
                    const siteResult = res.data.results[0];
                    if (siteResult.status === 'SUCCESS') {
                        success = true;
                        const okLog = { siteName, status: "SUCCESS", detail: siteResult.detail || "Cập nhật thành công." };
                        results.push(okLog);
                        setExecutionLogs(prev => [okLog, ...prev]);
                    } else {
                        lastError = siteResult.detail;
                        if (attempt < 2) {
                            setExecutionLogs(prev => [{ siteName, status: "RETRYING", detail: `Lần thử ${attempt}/2 thất bại. Đang thử lại...` }, ...prev]);
                            await new Promise(r => setTimeout(r, 1500));
                        }
                    }
                } catch (err) {
                    lastError = err.response?.data?.detail || err.message;
                    if (attempt < 2) {
                        setExecutionLogs(prev => [{ siteName, status: "RETRYING", detail: `Lỗi kết nối lần ${attempt}. Đang thử lại...` }, ...prev]);
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
            const skippedCount = results.filter(r => r.status === 'SKIPPED').length;
            const errorCount = results.filter(r => r.status === 'ERROR').length;
            if (errorCount === 0) {
                toast.success(`Sync hoàn tất · ${successCount} ✅ · ${skippedCount} bỏ qua`, { description: `Tác vụ đã được áp dụng thành công trên ${successCount} sites.`, duration: 6000 });
            } else {
                toast.warning(`Sync xong với lỗi · ${successCount} ✅ · ${errorCount} ❌ · ${skippedCount} bỏ qua`, { description: 'Kiểm tra execution log để biết chi tiết.', duration: 8000 });
            }
        }
    };

    const handleStop = () => { if (executionLoading) { setIsStopping(true); stopRef.current = true; } };
    const handleGeneratePassword = () => setNewPassword(genPwd(12));

    // ── Step navigation ──
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

    // ── Wizard ──
    const wizardSteps = [
        { label: 'Scope & Target', icon: Server },
        { label: 'Filter & Config', icon: Sliders },
        { label: 'Execution', icon: Rocket },
    ];

    const buildSummaryCards = () => {
        const cards = [];
        if (currentStep >= 1) {
            cards.push(
                <PhaseSummaryCard key="ph1" phaseNumber={1} phaseLabel="Scope & Target" icon={Server} accentColor="teal"
                    onBack={!executionLoading ? () => handleStepClick(0) : undefined}>
                    <div className="mt-2 flex items-center gap-4 text-xs">
                        <span className="text-slate-500">Action:</span>
                        <span className="font-bold text-slate-700 dark:text-slate-200">{actionLabel}</span>
                        <span className="text-slate-500 ml-4">Sites:</span>
                        <span className="font-bold text-slate-700 dark:text-slate-200">{selectedTargetsCount} selected</span>
                    </div>
                </PhaseSummaryCard>
            );
        }
        if (currentStep >= 2) {
            cards.push(
                <PhaseSummaryCard key="ph2" phaseNumber={2} phaseLabel="Filter & Config" icon={Sliders} accentColor="emerald"
                    onBack={!executionLoading ? () => handleStepClick(1) : undefined}>
                    <div className="mt-2 space-y-1.5 text-xs">
                        <div className="flex items-center gap-3">
                            <span className="text-slate-500">SSID:</span>
                            <span className="font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-lg border border-emerald-500/20">{selectedSSIDName || '—'}</span>
                        </div>
                        {selectedAction === 'update_ssid_config' && selectedSourceSiteId && (
                            <div className="flex items-center gap-3">
                                <span className="text-slate-500">Source:</span>
                                <span className="font-bold text-slate-700 dark:text-slate-200">{liveSites.find(s => s.siteId === selectedSourceSiteId)?.siteName || selectedSourceSiteId}</span>
                            </div>
                        )}
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
                        className="px-8 h-12 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-black uppercase tracking-[0.15em] text-xs rounded-2xl shadow-xl hover:scale-[1.02] transition-all active:scale-95 disabled:opacity-30 flex items-center gap-2">
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
                        <ArrowLeft size={16} /> Scope & Target
                    </button>
                    <button onClick={handleProceedToExecution}
                        disabled={selectedAction === 'update_ssid_password' ? (!selectedSSIDName || !newPassword || newPassword.length < 8) : (!selectedSSIDName || !selectedSourceSiteId)}
                        className="px-8 h-12 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-black uppercase tracking-[0.15em] text-xs rounded-2xl shadow-xl hover:scale-[1.02] transition-all active:scale-95 disabled:opacity-30 flex items-center gap-2">
                        Next: Deployment Review <ChevronRight size={16} />
                    </button>
                </div>
            );
        }
        if (currentStep === 2) {
            return (
                <div className="flex justify-between items-center">
                    {!executionLoading && (
                        <button onClick={() => handleStepClick(1)} className="flex items-center gap-2 px-5 h-11 text-sm font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-white/5 transition-all">
                            <ArrowLeft size={16} /> Back to Config
                        </button>
                    )}
                    <div className="flex items-center gap-3 ml-auto">
                        {executionLoading && (
                            <button onClick={handleStop} disabled={isStopping}
                                className="px-5 h-11 rounded-xl font-bold text-xs bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/20 transition-all disabled:opacity-30">
                                {isStopping ? "Stopping..." : "Emergency Stop"}
                            </button>
                        )}
                        {!executionLoading && !executionResult && (
                            <button onClick={() => setConfirmReady(true)}
                                className="px-6 h-11 bg-slate-200 dark:bg-white/5 hover:bg-slate-300 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 font-bold text-xs rounded-xl transition-all">
                                Confirm Details
                            </button>
                        )}
                        {confirmReady && !executionLoading && !executionResult && (
                            <button onClick={handleExecuteSync}
                                className="px-8 h-12 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-black uppercase tracking-[0.15em] text-xs rounded-2xl shadow-xl hover:scale-[1.02] transition-all active:scale-95 flex items-center gap-2">
                                <Rocket size={16} /> Start Deployment
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
        <div className={`relative w-full h-full min-h-[700px] ${styles.clonerWrapper}`}>
            <WizardLayout
                steps={wizardSteps}
                currentStep={currentStep}
                onStepClick={handleStepClick}
                accentColor="teal"
                title="Smart Synchronization"
                subtitle="Update configuration across multiple sites efficiently"
                titleIcon={Wifi}
                summaryCards={buildSummaryCards()}
                footer={buildFooter()}
            >
                {currentStep === 0 && (
                    <ScopeTarget
                        liveSites={liveSites}
                        zones={zones}
                        selectedAction={selectedAction}
                        setSelectedAction={setSelectedAction}
                        searchTargetTerm={searchTargetTerm}
                        setSearchTargetTerm={setSearchTargetTerm}
                        selectedZone={selectedZone}
                        setSelectedZone={setSelectedZone}
                        selectedTargetIds={selectedTargetIds}
                        setSelectedTargetIds={setSelectedTargetIds}
                        filteredTargetSites={filteredTargetSites}
                        getRoleBadgeInfo={getRoleBadgeInfo}
                    />
                )}

                {currentStep === 1 && (
                    <FilterConfig
                        selectedAction={selectedAction}
                        compiledSSIDs={compiledSSIDs}
                        selectedSSIDName={selectedSSIDName}
                        setSelectedSSIDName={setSelectedSSIDName}
                        newPassword={newPassword}
                        setNewPassword={setNewPassword}
                        selectedSourceSiteId={selectedSourceSiteId}
                        setSelectedSourceSiteId={setSelectedSourceSiteId}
                        liveSites={liveSites}
                        selectedTargetIds={selectedTargetIds}
                        generateRandomPassword={handleGeneratePassword}
                    />
                )}

                {currentStep === 2 && (
                    <Execution
                        liveSites={liveSites}
                        compiledSSIDs={compiledSSIDs}
                        selectedSSIDName={selectedSSIDName}
                        selectedTargetIds={selectedTargetIds}
                        selectedAction={selectedAction}
                        selectedSourceSiteId={selectedSourceSiteId}
                        actionLabel={actionLabel}
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
                @keyframes slide-up { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
                .animate-fade-in { animation: fade-in 0.4s ease-out forwards; }
                .animate-slide-up { animation: slide-up 0.3s ease-out forwards; }
                .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.1); border-radius: 10px; }
                .dark .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.05); }
            `}</style>
        </div>
    );
};

export default SmartSync;
