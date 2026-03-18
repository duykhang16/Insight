import React, { useState, useEffect, useRef } from 'react';
import apiClient from '../../../api/apiClient';
import { useLanguage } from '../../../context/LanguageContext';
import { toast } from 'sonner';
import WizardLayout, { PhaseSummaryCard } from '../../../components/WizardLayout';
import Spinner from '../../../components/Spinner';
import {
    Wifi, Search, KeyRound, AlertCircle, CheckCircle, XCircle,
    Rocket, Activity, Server, Sliders, ChevronRight, ArrowLeft, Database, RotateCcw
} from 'lucide-react';
import SSIDSelector from '../Update/SSIDSelector';

const REQUIRED_PASSKEY = 'AITC-ADMIN';

const DeleteSSID = () => {
    const { t } = useLanguage();

    // Passkey lock
    const [isUnlocked, setIsUnlocked] = useState(false);
    const [passkeyInput, setPasskeyInput] = useState('');
    const [passkeyError, setPasskeyError] = useState(false);

    // Step flow (0-indexed for WizardLayout)
    const [currentStep, setCurrentStep] = useState(0);
    const [liveSites, setLiveSites] = useState([]);
    const [zones, setZones] = useState([]);
    const [selectedZone, setSelectedZone] = useState('all');
    const [searchTargetTerm, setSearchTargetTerm] = useState('');
    const [selectedTargetIds, setSelectedTargetIds] = useState(new Set());

    // Analysis
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [hasAnalyzed, setHasAnalyzed] = useState(false);
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

    useEffect(() => {
        if (isUnlocked) { loadLiveSites(); loadZones(); }
    }, [isUnlocked]);

    const loadLiveSites = async () => {
        try {
            const res = await apiClient.get('/overview/sites');
            const list = Array.isArray(res.data) ? res.data : (res.data?.sites || []);
            setLiveSites(list.sort((a, b) => a.siteName.localeCompare(b.siteName)));
        } catch (error) { setLiveSites([]); }
    };

    const loadZones = async () => {
        try {
            const userRole = sessionStorage.getItem('userRole') || 'viewer';
            const endpoint = (userRole === 'tenant_admin') ? '/zones' : '/zones/my';
            const res = await apiClient.get(endpoint);
            setZones(res.data || []);
        } catch (error) { console.error("Failed to load zones:", error); }
    };

    const getRoleBadgeInfo = (roleStr) => {
        const role = (roleStr || 'UNKNOWN').toLowerCase();
        switch (role) {
            case 'administrator': case 'admin':
                return { text: 'ADMIN', classes: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-700/50', canClone: true };
            case 'operator': case 'op':
                return { text: 'OPERATOR', classes: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-700/50', canClone: false };
            default:
                return { text: role.toUpperCase(), classes: 'bg-slate-100 dark:bg-slate-800/40 text-slate-500 dark:text-slate-500 border-slate-200 dark:border-slate-700/50', canClone: false };
        }
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
                } catch (err) { results.push({ siteId: siteIds[i], data: [] }); }
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
            setHasAnalyzed(true);
            setCurrentStep(1);
        } catch (e) { toast.error('Đã xảy ra lỗi khi phân tích các Sites.'); }
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

    // Filtered sites
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

    const handleUnlock = (e) => {
        e.preventDefault();
        if (passkeyInput === REQUIRED_PASSKEY) { setIsUnlocked(true); setPasskeyError(false); }
        else { setPasskeyError(true); setPasskeyInput(''); }
    };

    // --- Step Navigation ---
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

    // --- WIZARD CONFIG ---
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

    // ── Main UI ──
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
                {/* ═══════════════ PHASE 1: Select Sites ═══════════════ */}
                {currentStep === 0 && (
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
                            {filteredTargetSites.map((site) => {
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
                )}

                {/* ═══════════════ PHASE 2: Choose SSID ═══════════════ */}
                {currentStep === 1 && (
                    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                        <div className="lg:col-span-2 space-y-6">
                            <div className="bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 rounded-2xl p-6 shadow-lg">
                                <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-6 flex items-center gap-2">
                                    <Sliders size={16} className="text-rose-500" /> Select SSID to Delete
                                </h3>
                                <div className="space-y-6">
                                    <div className="space-y-3">
                                        <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500">Target SSID</label>
                                        <SSIDSelector compiledSSIDs={compiledSSIDs} value={selectedSSIDName} onChange={setSelectedSSIDName} />
                                    </div>
                                    <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-start gap-3">
                                        <AlertCircle className="text-rose-500 mt-0.5 shrink-0" size={16} />
                                        <div>
                                            <h4 className="text-xs font-black text-rose-700 dark:text-rose-400 uppercase mb-0.5">Warning</h4>
                                            <p className="text-[11px] text-rose-600 dark:text-rose-500/80 leading-relaxed">
                                                Hành động xóa SSID sẽ gỡ bỏ hoàn toàn mạng này khỏi các site mục tiêu. Kết nối người dùng sẽ bị ngắt lập tức.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Mapping Analysis */}
                        <div className="lg:col-span-3 bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 rounded-2xl overflow-hidden flex flex-col shadow-lg max-h-[500px]">
                            <div className="px-5 py-4 border-b border-slate-200 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.04] flex flex-wrap justify-between items-center gap-3 shrink-0">
                                <div className="flex items-center gap-3">
                                    <div className="w-7 h-7 rounded-lg bg-rose-500/10 flex items-center justify-center">
                                        <Activity size={14} className="text-rose-500" />
                                    </div>
                                    <div>
                                        <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-200">Conflict & Matching</h3>
                                        <p className="text-[10px] text-slate-400 font-medium mt-0.5">{selectedTargetIds.size} sites</p>
                                    </div>
                                </div>
                                {selectedSSIDName && (
                                    <div className="flex items-center gap-2">
                                        <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20">
                                            <XCircle size={12} /> {compiledSSIDs.find(s => s.networkName === selectedSSIDName)?.foundInSites || 0} Delete
                                        </span>
                                        <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-slate-50 dark:bg-white/5 text-slate-500 border border-slate-200 dark:border-white/10">
                                            <CheckCircle size={12} /> {selectedTargetIds.size - (compiledSSIDs.find(s => s.networkName === selectedSSIDName)?.foundInSites || 0)} Skip
                                        </span>
                                    </div>
                                )}
                            </div>
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
                                        <div key={siteId} className={`grid grid-cols-[40px_1fr_100px_1fr] gap-2 items-center px-3.5 py-3 rounded-xl border-l-[3px] transition-all ${
                                            isMatch ? 'border-l-rose-500 bg-rose-50/60 dark:bg-rose-500/[0.06] border border-rose-100 dark:border-rose-500/10'
                                            : 'border-l-slate-300 bg-slate-50/40 dark:bg-white/[0.02] border border-slate-100/60 dark:border-white/5 opacity-75'}`}>
                                            <span className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-500 shrink-0">{idx + 1}</span>
                                            <div className="min-w-0">
                                                <div className="font-bold text-[13px] text-slate-800 dark:text-slate-100 truncate">{site?.siteName || siteId}</div>
                                                <div className="text-[10px] font-mono text-slate-400 truncate mt-0.5">{siteId}</div>
                                            </div>
                                            <div className="flex justify-center">
                                                {selectedSSIDName ? (
                                                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase border ${
                                                        isMatch ? 'bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-500/25'
                                                        : 'bg-slate-100 dark:bg-white/5 text-slate-500 border-slate-200 dark:border-white/10'}`}>
                                                        {isMatch ? <XCircle size={11} /> : <CheckCircle size={11} />} {isMatch ? 'Delete' : 'Skip'}
                                                    </span>
                                                ) : <span className="text-slate-400 text-[10px] font-bold px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10">Pending</span>}
                                            </div>
                                            <div className="min-w-0">
                                                <span className={`text-xs font-medium ${isMatch ? 'text-rose-500/80' : 'text-slate-500'}`}>
                                                    {selectedSSIDName ? (isMatch ? 'SSID will be permanently removed.' : 'SSID not found.') : 'Select an SSID.'}
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
                        {/* Confirm card */}
                        {!executionLoading && !executionResult && !confirmReady && (
                            <div className="max-w-2xl mx-auto">
                                <div className="bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 rounded-2xl p-8 shadow-lg border-l-4 border-l-rose-500 space-y-6">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 bg-rose-500/10 rounded-xl flex items-center justify-center text-rose-500"><Rocket size={24} /></div>
                                        <div>
                                            <p className="text-[10px] font-black uppercase tracking-widest text-rose-500 mb-0.5">DELETION REVIEW</p>
                                            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Delete Execution Summary</h3>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 gap-3">
                                        {[
                                            { label: 'Action', value: 'Bulk Delete SSID' },
                                            { label: 'Target SSID', value: selectedSSIDName || '—' },
                                            { label: 'Sites affected', value: `${selectedTargetIds.size} sites` },
                                        ].map(row => (
                                            <div key={row.label} className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-white/5 last:border-0">
                                                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{row.label}</span>
                                                <span className={`text-sm font-bold ${row.label === 'Target SSID' ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 px-3 py-1 rounded-full border border-rose-500/20' : 'text-slate-800 dark:text-white'}`}>{row.value}</span>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Site list */}
                                    {selectedSSIDName && (() => {
                                        const ssidEntry = compiledSSIDs.find(s => s.networkName === selectedSSIDName);
                                        const matchSiteIds = ssidEntry ? ssidEntry.foundInSiteIds : [];
                                        const targetArr = Array.from(selectedTargetIds);
                                        const matchSites = targetArr.filter(id => matchSiteIds.includes(id));
                                        const skipSites = targetArr.filter(id => !matchSiteIds.includes(id));
                                        return (
                                            <div className="rounded-xl border border-slate-200 dark:border-white/5 overflow-hidden">
                                                <div className="px-4 py-2.5 bg-slate-50 dark:bg-white/[0.03] border-b border-slate-200 dark:border-white/5 flex items-center justify-between">
                                                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Target Sites</span>
                                                    <div className="flex items-center gap-2">
                                                        <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20">
                                                            <XCircle size={11} /> {matchSites.length} Delete
                                                        </span>
                                                        {skipSites.length > 0 && (
                                                            <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg bg-slate-50 dark:bg-white/5 text-slate-400 border border-slate-200 dark:border-white/10">
                                                                <CheckCircle size={11} /> {skipSites.length} Skip
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="max-h-[200px] overflow-y-auto custom-scrollbar p-2 space-y-1">
                                                    {matchSites.map(siteId => {
                                                        const site = liveSites.find(s => s.siteId === siteId);
                                                        return (
                                                            <div key={siteId} className="flex items-center gap-3 px-3.5 py-2.5 rounded-lg bg-rose-50/50 dark:bg-rose-500/[0.04] border border-rose-100/50 dark:border-rose-500/10">
                                                                <div className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
                                                                <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate flex-1">{site?.siteName || siteId}</span>
                                                                <span className="text-[9px] font-black uppercase text-rose-600 dark:text-rose-400 bg-rose-100 dark:bg-rose-500/15 px-2 py-0.5 rounded-md">DELETE</span>
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

                                    <div className="flex items-start gap-3 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
                                        <AlertCircle size={14} className="text-rose-500 shrink-0 mt-0.5" />
                                        <p className="text-[11px] text-rose-600 dark:text-rose-400 leading-relaxed font-medium">⚠️ CẢNH BÁO: Xóa SSID sẽ gỡ bỏ hoàn toàn mạng này. Hành động không thể hoàn tác.</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Progress */}
                        {(confirmReady || executionLoading || executionResult) && (
                            <div className="space-y-4">
                                <div className="flex justify-between items-end">
                                    <span className="text-xs font-black uppercase text-slate-400">
                                        {executionResult ? 'Execution Complete' : executionLoading ? 'Deleting...' : 'Ready to Execute'}
                                    </span>
                                    <span className="text-lg font-mono font-black text-rose-500">{progress}%</span>
                                </div>
                                <div className="w-full h-3 bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden border border-slate-200 dark:border-white/5">
                                    <div className="h-full bg-gradient-to-r from-rose-500 to-red-400 transition-all duration-500 shadow-[0_0_10px_rgba(225,29,72,0.5)]" style={{ width: `${progress}%` }} />
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
                                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Deletion Logs</span>
                                    </div>
                                </div>
                                <div className="flex-1 overflow-y-auto p-3 space-y-1.5 custom-scrollbar">
                                    {executionLogs.length === 0 && (
                                        <div className="text-slate-500 animate-pulse italic text-xs p-4 text-center">Awaiting deletion signal...</div>
                                    )}
                                    {executionLogs.map((log, idx) => (
                                        <div key={idx} className={`flex items-start gap-3 p-3.5 rounded-xl text-xs border transition-colors ${
                                            log.status === 'SUCCESS' ? 'bg-emerald-50 dark:bg-emerald-500/[0.06] border-emerald-100 dark:border-emerald-500/10' :
                                            log.status === 'ERROR' ? 'bg-rose-50 dark:bg-rose-500/[0.06] border-rose-100 dark:border-rose-500/10' :
                                            log.status === 'SKIPPED' ? 'bg-white dark:bg-white/[0.02] border-slate-100 dark:border-white/5' :
                                            log.status === 'STOPPED' ? 'bg-amber-50 dark:bg-amber-500/[0.06] border-amber-100 dark:border-amber-500/10' :
                                            'bg-blue-50 dark:bg-blue-500/[0.04] border-blue-100 dark:border-blue-500/10'
                                        }`}>
                                            <span className="shrink-0 mt-0.5">
                                                {log.status === 'SUCCESS' && <CheckCircle size={14} className="text-emerald-500" />}
                                                {log.status === 'ERROR' && <XCircle size={14} className="text-rose-500" />}
                                                {log.status === 'SKIPPED' && <XCircle size={14} className="text-slate-400" />}
                                                {log.status === 'RETRYING' && <Spinner size="sm" className="text-amber-500" />}
                                                {log.status === 'STOPPED' && <AlertCircle size={14} className="text-amber-500" />}
                                            </span>
                                            <div className="flex-1 min-w-0">
                                                <span className="font-bold text-[13px] text-slate-800 dark:text-slate-200">{log.siteName}</span>
                                                <span className="mx-2 text-slate-300 dark:text-slate-600">·</span>
                                                <span className="text-[11px] text-slate-500">{log.detail}</span>
                                            </div>
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
