import React, { useState, useEffect, useRef } from 'react';
import apiClient from '../../../api/apiClient';
import styles from './Update.module.css';
import { useLanguage } from '../../../context/LanguageContext';
import { toast } from 'sonner';
import WizardLayout, { PhaseSummaryCard } from '../../../components/WizardLayout';
import Spinner from '../../../components/Spinner';
import {
    Activity, Shield, Rocket, Server, Sliders, CheckCircle, Wifi, Search, XCircle, Lock, Network, RotateCcw, Layers, Database, ChevronRight, AlertCircle, ArrowLeft, Globe
} from 'lucide-react';
import SSIDSelector from './SSIDSelector';
import SiteSelector from './SiteSelector';

const SmartSync = () => {
    const { t } = useLanguage();

    // --- 1. State Management ---
    const [currentStep, setCurrentStep] = useState(0); // 0-indexed for WizardLayout
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

    // State for Config Sync Mode
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

    // --- 2. Init ---
    useEffect(() => {
        loadLiveSites();
        loadZones();
    }, []);

    const loadLiveSites = async () => {
        try {
            const res = await apiClient.get('/overview/sites');
            const list = Array.isArray(res.data) ? res.data : (res.data?.sites || []);
            setLiveSites(list.sort((a, b) => a.siteName.localeCompare(b.siteName)));
        } catch (error) {
            console.error(error);
            setLiveSites([]);
        }
    };

    const loadZones = async () => {
        try {
            const userRole = sessionStorage.getItem('userRole') || 'viewer';
            const endpoint = (userRole === 'tenant_admin') ? '/zones' : '/zones/my';
            const res = await apiClient.get(endpoint);
            setZones(res.data || []);
        } catch (error) {
            console.error("Failed to load zones:", error);
        }
    };

    const getRoleBadgeInfo = (roleStr) => {
        const role = (roleStr || 'UNKNOWN').toLowerCase();
        switch (role) {
            case 'administrator':
            case 'admin':
                return { text: 'ADMIN', classes: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-700/50', canClone: true };
            case 'operator':
            case 'op':
                return { text: 'OPERATOR', classes: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-700/50', canClone: false };
            case 'viewer':
            case 'view':
                return { text: 'VIEWER', classes: 'bg-slate-200 dark:bg-slate-700/40 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-600/50', canClone: false };
            case 'guest':
                return { text: 'GUEST', classes: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-700/50', canClone: false };
            default:
                return { text: role.toUpperCase(), classes: 'bg-slate-100 dark:bg-slate-800/40 text-slate-500 dark:text-slate-500 border-slate-200 dark:border-slate-700/50', canClone: false };
        }
    };

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

    // --- 3. Logic ---
    const handleAnalyzeSites = async () => {
        if (selectedTargetIds.size === 0) {
            toast.error('Vui lòng chọn ít nhất 1 Site.');
            return;
        }

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
                const ssids = item.data;
                ssids.forEach(ssid => {
                    const name = ssid.networkName || ssid.name;
                    if (!uniqueSSIDMap.has(name)) {
                        uniqueSSIDMap.set(name, {
                            networkName: name, security: ssid.security,
                            isGuestPortalEnabled: ssid.isGuestPortalEnabled,
                            foundInSites: 1, foundInSiteIds: [siteId], foundInSiteNames: [siteName]
                        });
                    } else {
                        const entry = uniqueSSIDMap.get(name);
                        entry.foundInSites += 1;
                        entry.foundInSiteIds.push(siteId);
                        entry.foundInSiteNames.push(siteName);
                    }
                });
            });

            const compiledList = Array.from(uniqueSSIDMap.values()).sort((a, b) => a.networkName.localeCompare(b.networkName));
            setCompiledSSIDs(compiledList);
            setHasAnalyzed(true);
            setCurrentStep(1); // -> Phase 2
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
            const names = unauthorizedTargets.map(s => s.siteName).join(', ');
            toast.error(`Không có quyền Administrator trên: ${names}`);
            return;
        }

        if (selectedAction === 'update_ssid_password') {
            if (!selectedSSIDName) { toast.error('Vui lòng chọn một SSID.'); return; }
            const selectedSSID = compiledSSIDs.find(s => s.networkName === selectedSSIDName);
            if (selectedSSID && selectedSSID.isGuestPortalEnabled) {
                toast.error('Không thể đổi mật khẩu cho Guest Portal SSID.'); return;
            }
            if (!newPassword || newPassword.length < 8) { toast.error('Mật khẩu phải từ 8 ký tự trở lên.'); return; }
        } else if (selectedAction === 'update_ssid_config') {
            if (!selectedSSIDName) { toast.error('Vui lòng chọn một SSID.'); return; }
            if (!selectedSourceSiteId) { toast.error('Vui lòng chọn Origin Site.'); return; }
        }

        setConfirmReady(false);
        setCurrentStep(2); // -> Phase 3
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
                            source_network_name: selectedSSIDName, new_password: newPassword, target_site_ids: singleSiteRef
                        });
                    } else if (selectedAction === 'update_ssid_config') {
                        res = await apiClient.post('/cloner/sync-config', {
                            source_site_id: selectedSourceSiteId, source_network_name: selectedSSIDName, target_site_ids: singleSiteRef
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

    const handleStop = () => {
        if (executionLoading) { setIsStopping(true); stopRef.current = true; }
    };

    const generateRandomPassword = () => {
        const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+";
        let retVal = "";
        for (let i = 0, n = charset.length; i < 12; ++i) {
            retVal += charset.charAt(Math.floor(Math.random() * n));
        }
        setNewPassword(retVal);
    };

    // Computed
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

    // Helpers
    const actionLabel = selectedAction === 'update_ssid_password' ? 'Update Wireless PSK' : 'Clone Deep Config';
    const selectedTargetsCount = selectedTargetIds.size;

    // --- Step Navigation ---
    const handleStepClick = (stepIdx) => {
        if (stepIdx < currentStep && !executionLoading) {
            if (stepIdx === 0) {
                setCurrentStep(0);
            } else if (stepIdx === 1) {
                setExecutionResult(null);
                setExecutionLogs([]);
                setProgress(0);
                setConfirmReady(false);
                setCurrentStep(1);
            }
        }
    };

    // --- WIZARD ---
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

    // --- 4. Render ---
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
                {/* ═══════════════ PHASE 1: Scope & Target ═══════════════ */}
                {currentStep === 0 && (
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
                )}

                {/* ═══════════════ PHASE 2: Analysis & Configuration ═══════════════ */}
                {currentStep === 1 && (
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
                )}

                {/* ═══════════════ PHASE 3: Execution ═══════════════ */}
                {currentStep === 2 && (
                    <div className="space-y-6">
                        {/* Confirm card or progress */}
                        {!executionLoading && !executionResult && !confirmReady && (
                            <div className="max-w-2xl mx-auto">
                                <div className="bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 rounded-2xl p-8 shadow-lg border-l-4 border-l-emerald-500 space-y-6">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-500"><Rocket size={24} /></div>
                                        <div>
                                            <p className="text-[10px] font-black uppercase tracking-widest text-emerald-500 mb-0.5">DEPLOYMENT REVIEW</p>
                                            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Sync Execution Summary</h3>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 gap-3">
                                        {[
                                            { label: 'Action', value: actionLabel },
                                            { label: 'Target SSID', value: selectedSSIDName || '—' },
                                            { label: 'Sites affected', value: `${selectedTargetIds.size} sites` },
                                        ].map(row => (
                                            <div key={row.label} className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-white/5 last:border-0">
                                                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{row.label}</span>
                                                <span className={`text-sm font-bold ${row.label === 'Target SSID' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-3 py-1 rounded-full border border-emerald-500/20' : 'text-slate-800 dark:text-white'}`}>{row.value}</span>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Site execution list */}
                                    {selectedSSIDName && (() => {
                                        const ssidEntry = compiledSSIDs.find(s => s.networkName === selectedSSIDName);
                                        const matchSiteIds = ssidEntry ? ssidEntry.foundInSiteIds : [];
                                        const targetArr = Array.from(selectedTargetIds);
                                        const matchSites = targetArr.filter(id => matchSiteIds.includes(id));
                                        const skipSites = targetArr.filter(id => !matchSiteIds.includes(id));
                                        return (
                                            <div className="rounded-xl border border-slate-200 dark:border-white/5 overflow-hidden">
                                                <div className="px-4 py-2.5 bg-slate-50 dark:bg-white/[0.03] border-b border-slate-200 dark:border-white/5 flex items-center justify-between">
                                                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Target Sites Detail</span>
                                                    <div className="flex items-center gap-2">
                                                        <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20">
                                                            <CheckCircle size={11} /> {matchSites.length} Execute
                                                        </span>
                                                        {skipSites.length > 0 && (
                                                            <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg bg-slate-50 dark:bg-white/5 text-slate-400 border border-slate-200 dark:border-white/10">
                                                                <XCircle size={11} /> {skipSites.length} Skip
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="max-h-[200px] overflow-y-auto custom-scrollbar p-2 space-y-1">
                                                    {matchSites.map(siteId => {
                                                        const site = liveSites.find(s => s.siteId === siteId);
                                                        return (
                                                            <div key={siteId} className="flex items-center gap-3 px-3.5 py-2.5 rounded-lg bg-emerald-50/50 dark:bg-emerald-500/[0.04] border border-emerald-100/50 dark:border-emerald-500/10">
                                                                <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                                                                <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate flex-1">{site?.siteName || siteId}</span>
                                                                <span className="text-[9px] font-black uppercase text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-500/15 px-2 py-0.5 rounded-md">EXECUTE</span>
                                                            </div>
                                                        );
                                                    })}
                                                    {skipSites.map(siteId => {
                                                        const site = liveSites.find(s => s.siteId === siteId);
                                                        return (
                                                            <div key={siteId} className="flex items-center gap-3 px-3.5 py-2.5 rounded-lg bg-slate-50/50 dark:bg-white/[0.02] border border-slate-100/50 dark:border-white/5 opacity-60">
                                                                <div className="w-2 h-2 rounded-full bg-slate-400 shrink-0" />
                                                                <span className="text-xs font-semibold text-slate-500 truncate flex-1">{site?.siteName || siteId}</span>
                                                                <span className="text-[9px] font-black uppercase text-slate-400 bg-slate-100 dark:bg-white/5 px-2 py-0.5 rounded-md">SKIP</span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    })()}

                                    <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                                        <AlertCircle size={14} className="text-amber-500 shrink-0 mt-0.5" />
                                        <p className="text-[11px] text-amber-600 dark:text-amber-400 leading-relaxed">Sites không có SSID này sẽ tự động bỏ qua (SKIPPED).</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Progress */}
                        {(confirmReady || executionLoading || executionResult) && (
                            <div className="space-y-4">
                                <div className="flex justify-between items-end">
                                    <span className="text-xs font-black uppercase text-slate-400">Transmission Progress</span>
                                    <span className="text-lg font-mono font-black text-emerald-500">{progress}%</span>
                                </div>
                                <div className="w-full h-3 bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden border border-slate-200 dark:border-white/5">
                                    <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500 shadow-[0_0_15px_rgba(16,185,129,0.5)]"
                                        style={{ width: `${progress}%` }} />
                                </div>
                            </div>
                        )}

                        {/* Execution Terminal */}
                        {(confirmReady || executionLoading || executionResult || executionLogs.length > 0) && (
                            <div className="bg-white dark:bg-[#0c111b] border border-slate-200 dark:border-white/10 rounded-2xl overflow-hidden flex flex-col h-[400px] shadow-lg">
                                <div className="px-5 py-3 bg-slate-50 dark:bg-white/5 border-b border-slate-200 dark:border-white/5 flex items-center justify-between shrink-0">
                                    <div className="flex items-center gap-3">
                                        <div className="flex gap-1.5">
                                            <div className="w-3 h-3 rounded-full bg-rose-500" />
                                            <div className="w-3 h-3 rounded-full bg-amber-500" />
                                            <div className="w-3 h-3 rounded-full bg-emerald-500" />
                                        </div>
                                        <div className="w-6 h-6 rounded-lg bg-slate-200 dark:bg-white/5 flex items-center justify-center">
                                            <Database size={12} className="text-slate-400" />
                                        </div>
                                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Execution Logs</span>
                                    </div>
                                    <div className="text-[10px] font-mono text-slate-400">{new Date().toLocaleTimeString()}</div>
                                </div>
                                <div className="flex-1 overflow-y-auto p-3 space-y-1.5 custom-scrollbar">
                                    {executionLogs.length === 0 && (
                                        <div className="text-slate-500 animate-pulse italic text-xs p-4 text-center">Awaiting deployment signal...</div>
                                    )}
                                    {executionLogs.map((log, idx) => (
                                        <div key={idx} className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors ${
                                            log.status === 'SUCCESS' ? 'bg-emerald-50 dark:bg-emerald-500/[0.06] border-emerald-100 dark:border-emerald-500/10' :
                                            log.status === 'ERROR' ? 'bg-rose-50 dark:bg-rose-500/[0.06] border-rose-100 dark:border-rose-500/10' :
                                            log.status === 'SKIPPED' ? 'bg-white dark:bg-white/[0.02] border-slate-100 dark:border-white/5' :
                                            'bg-amber-50 dark:bg-amber-500/[0.04] border-amber-100 dark:border-amber-500/10'
                                        }`}>
                                            <span className="text-[10px] font-mono text-slate-400 shrink-0">[{new Date().toLocaleTimeString([], { hour12: false })}]</span>
                                            <span className={`text-[9px] font-black uppercase tracking-wider shrink-0 px-2 py-1 rounded-md border ${
                                                log.status === 'SUCCESS' ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20' :
                                                log.status === 'ERROR' ? 'text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/20' :
                                                log.status === 'SKIPPED' ? 'text-slate-400 bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10' :
                                                'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20'
                                            }`}>{log.status}</span>
                                            <span className="text-slate-700 dark:text-slate-200 font-bold text-[13px] shrink-0">{log.siteName}</span>
                                            <span className="text-slate-500 text-[11px]">{log.detail}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
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
