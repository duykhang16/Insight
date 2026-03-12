import React, { useState, useEffect, useRef } from 'react';
import apiClient from '../../../api/apiClient';
import { useLanguage } from '../../../context/LanguageContext';
import { toast } from 'sonner';
import {
    Wifi, Search, KeyRound, AlertCircle, CheckCircle, XCircle,
    Rocket, Activity, Server, Sliders, ChevronRight, ArrowLeft,
    MapPin, Shield, Globe
} from 'lucide-react';
import SSIDSelector from '../Update/SSIDSelector';

const REQUIRED_PASSKEY = 'AITC-ADMIN';

const DeleteSSID = () => {
    const { t } = useLanguage();

    // Passkey lock
    const [isUnlocked, setIsUnlocked] = useState(false);
    const [passkeyInput, setPasskeyInput] = useState('');
    const [passkeyError, setPasskeyError] = useState(false);

    // Step flow
    const [currentStep, setCurrentStep] = useState(1);
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
        if (isUnlocked) {
            loadLiveSites();
            loadZones();
        }
    }, [isUnlocked]);

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
            const endpoint = (userRole === 'admin' || userRole === 'super_admin') ? '/zones' : '/zones/my';
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
            default:
                return { text: role.toUpperCase(), classes: 'bg-slate-100 dark:bg-slate-800/40 text-slate-500 dark:text-slate-500 border-slate-200 dark:border-slate-700/50', canClone: false };
        }
    };

    // Reset downstream when selection changes
    useEffect(() => {
        if (currentStep > 1) {
            setHasAnalyzed(false);
            setCurrentStep(1);
            setExecutionResult(null);
            setCompiledSSIDs([]);
            setSelectedSSIDName('');
            setExecutionLogs([]);
            setProgress(0);
        }
    }, [selectedTargetIds]);

    const handleAnalyzeSites = async () => {
        if (selectedTargetIds.size === 0) {
            toast.error('Vui lòng chọn ít nhất 1 Site.');
            return;
        }

        setIsAnalyzing(true);
        setCompiledSSIDs([]);
        setSelectedSSIDName('');

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
                            networkName: name,
                            security: ssid.security,
                            isGuestPortalEnabled: ssid.isGuestPortalEnabled,
                            foundInSites: 1,
                            foundInSiteIds: [siteId],
                            foundInSiteNames: [siteName]
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
            setCurrentStep(2);
        } catch (e) {
            console.error("Error analyzing sites", e);
            toast.error('Đã xảy ra lỗi khi phân tích các Sites.');
        } finally {
            setIsAnalyzing(false);
        }
    };

    const handleProceedToExecution = () => {
        if (!selectedSSIDName) { toast.error('Vui lòng chọn một SSID.'); return; }
        setConfirmReady(false);
        setCurrentStep(3);
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

            let attempt = 0;
            let success = false;
            let lastError = null;

            while (attempt < 2 && !success && !stopRef.current) {
                attempt++;
                try {
                    const res = await apiClient.post('/cloner/sync-delete', {
                        source_network_name: selectedSSIDName,
                        target_site_ids: [siteId]
                    });

                    const siteResult = res.data.results[0];
                    if (siteResult.status === 'SUCCESS') {
                        success = true;
                        const okLog = { siteName, status: "SUCCESS", detail: siteResult.detail || "SSID đã bị xóa." };
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
            const errorCount = results.filter(r => r.status === 'ERROR').length;
            if (errorCount === 0) {
                toast.success(`Xóa SSID hoàn tất · ${successCount} ✅`, { duration: 6000 });
            } else {
                toast.warning(`Xóa SSID xong với lỗi · ${successCount} ✅ · ${errorCount} ❌`, { duration: 8000 });
            }
        }
    };

    const handleStop = () => {
        if (executionLoading) {
            setIsStopping(true);
            stopRef.current = true;
        }
    };

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
        if (passkeyInput === REQUIRED_PASSKEY) {
            setIsUnlocked(true);
            setPasskeyError(false);
        } else {
            setPasskeyError(true);
            setPasskeyInput('');
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
                        <input
                            type="password"
                            value={passkeyInput}
                            onChange={e => { setPasskeyInput(e.target.value); setPasskeyError(false); }}
                            placeholder={t('batch_delete.enter_passkey') || 'Enter passkey'}
                            autoFocus
                            className={`w-full text-center bg-slate-50 dark:bg-black/50 border-2 rounded-xl px-4 py-3 text-lg font-bold text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none transition-colors ${passkeyError ? 'border-rose-500 dark:border-rose-500/80 animate-shake' : 'border-slate-200 dark:border-slate-800 focus:border-rose-500 dark:focus:border-rose-500'}`}
                        />
                        {passkeyError && (
                            <p className="text-[10px] text-rose-500 font-bold text-center mt-2 absolute w-full -bottom-5">{t('batch_delete.incorrect_passkey') || 'Incorrect passkey'}</p>
                        )}
                    </div>
                    <button
                        type="submit"
                        disabled={!passkeyInput}
                        className="w-full h-12 mt-2 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 disabled:from-slate-300 disabled:to-slate-300 dark:disabled:from-slate-800 dark:disabled:to-slate-800 th-text-primary font-black uppercase tracking-widest text-xs rounded-xl shadow-[0_10px_30px_rgba(225,29,72,0.2)] active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none flex items-center justify-center gap-2"
                    >
                        {t('batch_delete.unlock_tool') || 'Unlock'}
                    </button>
                </form>
            </div>
        );
    }

    // ── Main UI ──
    return (
        <div className="relative w-full min-h-[800px] h-full bg-slate-50 dark:bg-[#020617] text-slate-800 dark:text-slate-200 font-sans overflow-x-hidden rounded-xl border border-slate-200 dark:border-gray-800 shadow-xl dark:shadow-2xl">
            {/* Background Orbs */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none rounded-xl">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-rose-600/5 dark:bg-rose-600/10 blur-[120px] rounded-full"></div>
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-red-600/5 dark:bg-red-600/10 blur-[120px] rounded-full"></div>
            </div>

            <div className="relative z-10 w-full h-full p-8 space-y-12">
                {/* Horizontal Progress Stepper */}
                <div className="bg-white/80 dark:bg-[#020617]/80 backdrop-blur-xl py-6 border-b border-slate-200 dark:border-white/5 -mx-8 px-12 mb-10 transition-all duration-300">
                    <div className="max-w-4xl mx-auto relative px-4">
                        <div className="flex justify-between items-center relative z-10">
                            {['Select Sites', 'Choose SSID', 'Delete Execution'].map((step, idx) => {
                                const stepNum = idx + 1;
                                const isActive = currentStep >= stepNum;
                                const isCurrent = currentStep === stepNum;
                                return (
                                    <div key={idx} className="flex flex-col items-center">
                                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-500 border ${isCurrent ? 'bg-rose-600 border-rose-400 shadow-[0_0_20px_rgba(225,29,72,0.4)] scale-110 th-text-primary' :
                                            isActive ? 'bg-white dark:bg-slate-900 border-rose-200 dark:border-rose-500/50 text-rose-500 dark:text-rose-400' : 'bg-slate-100 dark:bg-[#020617] border-slate-200 dark:border-white/5 text-slate-400 dark:text-slate-700'
                                            }`}>
                                            {isActive && !isCurrent ? <CheckCircle size={20} /> :
                                                idx === 0 ? <Server size={20} /> :
                                                    idx === 1 ? <Sliders size={20} /> : <Rocket size={20} />}
                                        </div>
                                        <span className={`mt-3 text-[9px] font-black uppercase tracking-[0.2em] ${isCurrent ? 'text-rose-700 dark:text-white' : 'text-slate-500 dark:text-slate-600'}`}>
                                            {step}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="absolute top-6 left-0 w-full h-[2px] bg-slate-200 dark:bg-white/5 -z-0"></div>
                        <div
                            className="absolute top-6 left-0 h-[2px] bg-gradient-to-r from-rose-500 to-red-400 dark:from-rose-600 dark:to-red-500 -z-0 transition-all duration-1000 shadow-[0_0_10px_rgba(225,29,72,0.3)]"
                            style={{ width: `${((currentStep - 1) / 2) * 100}%` }}
                        ></div>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-12 max-w-6xl mx-auto flex-1">

                    {/* Step 1: Select Target Sites */}
                    {currentStep === 1 && (
                        <section className="animate-fade-in">
                            <div className="backdrop-blur-2xl bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 rounded-3xl p-10 shadow-xl dark:shadow-2xl">
                                <div className="flex items-center gap-4 mb-10">
                                    <div className="w-12 h-12 bg-rose-50 dark:bg-rose-500/10 rounded-xl flex items-center justify-center text-rose-500 dark:text-rose-400 border border-rose-100 dark:border-rose-500/20">
                                        <Wifi size={24} />
                                    </div>
                                    <div>
                                        <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                                            Bulk Delete SSID
                                            <span className="bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-400 text-[9px] font-black uppercase px-2 py-0.5 rounded border border-rose-200 dark:border-rose-500/30">Destructive</span>
                                        </h2>
                                        <p className="text-sm text-slate-500">Remove an SSID from multiple sites at once. This action cannot be undone.</p>
                                    </div>
                                </div>

                                <div className="flex flex-col h-[500px]">
                                    <div className="flex justify-between items-end mb-4">
                                        <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500">Select Target Sites</label>
                                        <span className="text-[10px] font-black text-rose-500 bg-rose-500/10 px-3 py-1 rounded-full border border-rose-500/20">
                                            Selected: {selectedTargetIds.size}
                                        </span>
                                    </div>

                                    <div className="flex gap-3 mb-4 shrink-0">
                                        <div className="relative flex-1">
                                            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                                            <input
                                                type="text"
                                                placeholder="Search sites..."
                                                value={searchTargetTerm}
                                                onChange={(e) => setSearchTargetTerm(e.target.value)}
                                                className="w-full text-sm bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-2xl py-3 pl-12 pr-4 text-slate-800 dark:text-white focus:outline-none focus:border-rose-500/50"
                                            />
                                        </div>
                                        <select
                                            value={selectedZone}
                                            onChange={(e) => setSelectedZone(e.target.value)}
                                            className="h-12 bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-2xl px-6 text-slate-800 dark:text-white text-sm font-bold focus:outline-none appearance-none min-w-[160px]"
                                        >
                                            <option value="all">All Groups</option>
                                            {zones.map(z => <option key={z.id || z._id} value={z.id || z._id}>{z.name}</option>)}
                                        </select>
                                    </div>

                                    <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar border border-slate-200 dark:border-white/5 rounded-2xl p-4 bg-slate-50/50 dark:bg-black/20">
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
                                                <div
                                                    key={site.siteId}
                                                    onClick={toggleSite}
                                                    className={`p-4 rounded-xl border flex items-center justify-between transition-all cursor-pointer ${isSelected
                                                        ? 'bg-rose-500/10 border-rose-500 shadow-sm'
                                                        : !canSelect ? 'opacity-40 grayscale bg-slate-100 dark:bg-white/5' : 'bg-white dark:bg-black/40 border-slate-200 dark:border-white/10 hover:border-slate-300'}`}
                                                >
                                                    <div className="flex items-center gap-4">
                                                        <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${isSelected ? 'bg-rose-500 border-rose-500 th-text-primary' : 'border-slate-300 dark:border-white/10'}`}>
                                                            {isSelected && <CheckCircle size={14} />}
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <div className="flex items-center gap-2">
                                                                <span className={`text-sm font-bold ${isSelected ? 'text-rose-900 dark:text-rose-400' : 'text-slate-700 dark:text-slate-300'}`}>{site.siteName}</span>
                                                                <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ${roleInfo.classes}`}>
                                                                    {roleInfo.text}
                                                                </span>
                                                            </div>
                                                            <span className="text-[9px] font-mono text-slate-500 dark:text-slate-500">{site.siteId}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    <div className="mt-6 flex gap-4">
                                        <button
                                            onClick={() => {
                                                if (allFilteredValid) {
                                                    const newSet = new Set(selectedTargetIds);
                                                    validFilteredSiteIds.forEach(id => newSet.delete(id));
                                                    setSelectedTargetIds(newSet);
                                                } else {
                                                    setSelectedTargetIds(prev => new Set([...prev, ...validFilteredSiteIds]));
                                                }
                                            }}
                                            className="px-6 h-12 rounded-2xl font-bold text-xs bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 transition-colors"
                                        >
                                            {allFilteredValid ? "Deselect Filtered" : "Select All Valid"}
                                        </button>
                                        <button
                                            onClick={handleAnalyzeSites}
                                            disabled={isAnalyzing || selectedTargetIds.size === 0}
                                            className="flex-1 h-12 rounded-2xl bg-gradient-to-r from-rose-600 to-red-600 th-text-primary font-black uppercase tracking-widest shadow-lg hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-30 disabled:hover:scale-100 flex items-center justify-center gap-2"
                                        >
                                            {isAnalyzing ? <Activity size={18} className="animate-spin" /> : <Search size={18} />}
                                            Analyze Selection
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </section>
                    )}

                    {/* Step 2: Choose SSID to Delete */}
                    {currentStep === 2 && (
                        <section className="animate-fade-in grid grid-cols-1 lg:grid-cols-5 gap-10">
                            <div className="lg:col-span-2 space-y-8">
                                <div className="backdrop-blur-2xl bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 rounded-3xl p-8 shadow-xl">
                                    <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-8 flex items-center gap-2">
                                        <Sliders size={16} className="text-rose-500" /> Select SSID to Delete
                                    </h3>

                                    <div className="space-y-8">
                                        <div className="space-y-3">
                                            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500">Target SSID</label>
                                            <SSIDSelector
                                                compiledSSIDs={compiledSSIDs}
                                                value={selectedSSIDName}
                                                onChange={setSelectedSSIDName}
                                            />
                                        </div>

                                        <div className="p-6 bg-rose-500/10 border border-rose-500/20 rounded-3xl flex items-start gap-4">
                                            <AlertCircle className="text-rose-500 mt-1" size={20} />
                                            <div>
                                                <h4 className="text-sm font-black text-rose-700 dark:text-rose-400 uppercase tracking-widest mb-1">Warning</h4>
                                                <p className="text-[11px] text-rose-600 dark:text-rose-500/80 leading-relaxed">
                                                    Hành động xóa SSID sẽ gỡ bỏ hoàn toàn mạng này khỏi các site mục tiêu. Kết nối người dùng sẽ bị ngắt lập tức.
                                                </p>
                                            </div>
                                        </div>

                                        <button
                                            onClick={handleProceedToExecution}
                                            disabled={!selectedSSIDName}
                                            className="w-full h-14 bg-gradient-to-r from-rose-600 to-red-600 th-text-primary font-black uppercase tracking-widest rounded-2xl shadow-xl hover:scale-[1.02] active:scale-98 transition-all disabled:opacity-30 flex items-center justify-center gap-2 mt-4"
                                        >
                                            Next: Delete Review <ChevronRight size={18} />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Mapping Analysis */}
                            <div className="lg:col-span-3 backdrop-blur-2xl bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 rounded-3xl overflow-hidden flex flex-col shadow-xl">
                                <div className="p-8 border-b border-slate-200 dark:border-white/5 bg-slate-50/50 dark:bg-white/5 flex justify-between items-center">
                                    <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                                        <Activity size={16} className="text-rose-500" /> Conflict & Matching Analysis
                                    </h3>
                                    {selectedSSIDName && (
                                        <div className="flex items-center gap-4 text-xs font-bold">
                                            <span className="flex items-center gap-1 text-emerald-500">
                                                <CheckCircle size={14} /> {compiledSSIDs.find(s => s.networkName === selectedSSIDName)?.foundInSites || 0} Will Delete
                                            </span>
                                            <span className="flex items-center gap-1 text-slate-400">
                                                <XCircle size={14} /> {selectedTargetIds.size - (compiledSSIDs.find(s => s.networkName === selectedSSIDName)?.foundInSites || 0)} Skip
                                            </span>
                                        </div>
                                    )}
                                </div>
                                <div className="flex-1 overflow-y-auto custom-scrollbar">
                                    <table className="w-full text-left">
                                        <thead className="sticky top-0 bg-white dark:bg-[#0F172A] z-10">
                                            <tr className="border-b border-slate-200 dark:border-white/5">
                                                <th className="p-4 text-[10px] font-black uppercase text-slate-400">Target Site</th>
                                                <th className="p-4 text-[10px] font-black uppercase text-slate-400 text-center">Status</th>
                                                <th className="p-4 text-[10px] font-black uppercase text-slate-400">Note</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                                            {Array.from(selectedTargetIds).map(siteId => {
                                                const site = liveSites.find(s => s.siteId === siteId);
                                                const ssidEntry = compiledSSIDs.find(s => s.networkName === selectedSSIDName);
                                                const isMatch = !!(ssidEntry && ssidEntry.foundInSiteIds.includes(siteId));

                                                return (
                                                    <tr key={siteId} className={`transition-all duration-300 ${isMatch ? 'bg-rose-500/5 hover:bg-rose-500/10' : 'bg-slate-500/5 hover:bg-slate-500/10 opacity-70'}`}>
                                                        <td className="p-4 border-l-4 border-transparent transition-all" style={{ borderLeftColor: isMatch ? '#f43f5e' : '#94a3b8' }}>
                                                            <div className="font-bold text-sm text-slate-700 dark:text-slate-200">{site?.siteName || siteId}</div>
                                                            <div className="text-[9px] font-mono text-slate-400">{siteId}</div>
                                                        </td>
                                                        <td className="p-4 text-center">
                                                            {selectedSSIDName ? (
                                                                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${isMatch ? 'bg-rose-100 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400' : 'bg-slate-100 dark:bg-slate-500/20 text-slate-600 dark:text-slate-400'}`}>
                                                                    {isMatch ? <XCircle size={10} /> : <CheckCircle size={10} />} {isMatch ? 'Delete' : 'Skip'}
                                                                </span>
                                                            ) : (
                                                                <span className="text-slate-400 text-[10px] font-bold">Awaiting Selection</span>
                                                            )}
                                                        </td>
                                                        <td className="p-4 italic">
                                                            <span className={`text-[11px] font-medium ${isMatch ? 'text-rose-500/80' : 'text-slate-500 dark:text-slate-400'}`}>
                                                                {selectedSSIDName
                                                                    ? (isMatch ? `SSID will be permanently removed.` : `SSID not found. Skipped.`)
                                                                    : 'Select an SSID on the left panel.'}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </section>
                    )}

                    {/* Step 3: Execution */}
                    {currentStep === 3 && (
                        <section className="animate-fade-in flex flex-col gap-10 pb-20">
                            <div className="backdrop-blur-2xl bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 rounded-3xl p-10 shadow-xl flex flex-col items-center gap-10">

                                {/* Confirm card */}
                                {!executionLoading && !executionResult && !confirmReady && (
                                    <div className="w-full max-w-2xl animate-fade-in">
                                        <div className="rounded-2xl border-l-4 border-rose-500 bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 p-8 flex flex-col gap-6 shadow-lg">
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 bg-rose-500/10 rounded-xl flex items-center justify-center text-rose-500">
                                                    <Rocket size={24} />
                                                </div>
                                                <div>
                                                    <p className="text-[10px] font-black uppercase tracking-widest text-rose-500 mb-0.5">STEP 3 · DELETION REVIEW</p>
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

                                            {/* Site execution detail */}
                                            {selectedSSIDName && (() => {
                                                const ssidEntry = compiledSSIDs.find(s => s.networkName === selectedSSIDName);
                                                const matchSiteIds = ssidEntry ? ssidEntry.foundInSiteIds : [];
                                                const targetArr = Array.from(selectedTargetIds);
                                                const matchSites = targetArr.filter(id => matchSiteIds.includes(id));
                                                const skipSites = targetArr.filter(id => !matchSiteIds.includes(id));

                                                return (
                                                    <div className="rounded-xl border border-slate-200 dark:border-white/5 overflow-hidden">
                                                        <div className="px-4 py-2.5 bg-slate-100/80 dark:bg-white/[0.03] border-b border-slate-200 dark:border-white/5 flex items-center justify-between">
                                                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Target Sites Detail</span>
                                                            <div className="flex items-center gap-3 text-[9px] font-black">
                                                                <span className="flex items-center gap-1 text-rose-500">
                                                                    <XCircle size={10} /> {matchSites.length} Delete
                                                                </span>
                                                                {skipSites.length > 0 && (
                                                                    <span className="flex items-center gap-1 text-slate-400">
                                                                        <CheckCircle size={10} /> {skipSites.length} Skip
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <div className="max-h-[200px] overflow-y-auto custom-scrollbar divide-y divide-slate-100 dark:divide-white/5">
                                                            {matchSites.map(siteId => {
                                                                const site = liveSites.find(s => s.siteId === siteId);
                                                                return (
                                                                    <div key={siteId} className="flex items-center gap-3 px-4 py-2 bg-rose-500/[0.03]">
                                                                        <div className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                                                                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate flex-1">{site?.siteName || siteId}</span>
                                                                        <span className="text-[8px] font-black uppercase tracking-wider text-rose-600 dark:text-rose-400 bg-rose-500/10 px-1.5 py-0.5 rounded border border-rose-500/15">DELETE</span>
                                                                    </div>
                                                                );
                                                            })}
                                                            {skipSites.map(siteId => {
                                                                const site = liveSites.find(s => s.siteId === siteId);
                                                                return (
                                                                    <div key={siteId} className="flex items-center gap-3 px-4 py-2 opacity-50">
                                                                        <div className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0" />
                                                                        <span className="text-xs font-semibold text-slate-500 dark:text-slate-500 truncate flex-1">{site?.siteName || siteId}</span>
                                                                        <span className="text-[8px] font-black uppercase tracking-wider text-slate-400 bg-slate-500/10 px-1.5 py-0.5 rounded border border-slate-500/10">SKIP</span>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                );
                                            })()}

                                            <div className="flex items-start gap-3 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20">
                                                <AlertCircle size={18} className="text-rose-500 shrink-0 mt-0.5" />
                                                <p className="text-[11px] text-rose-600 dark:text-rose-400 leading-relaxed font-medium">⚠️ CẢNH BÁO: Xóa SSID sẽ gỡ bỏ hoàn toàn mạng này và ngắt kết nối người dùng ngay lập tức. Hành động không thể hoàn tác.</p>
                                            </div>
                                            <div className="flex gap-4 pt-2">
                                                <button
                                                    onClick={() => setCurrentStep(2)}
                                                    className="flex items-center gap-2 px-6 h-12 rounded-2xl border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-400 font-bold text-sm hover:bg-slate-100 dark:hover:bg-white/5 transition-all"
                                                >
                                                    <ArrowLeft size={16} /> Quay lại
                                                </button>
                                                <button
                                                    onClick={() => setConfirmReady(true)}
                                                    className="flex-1 h-12 rounded-2xl font-black uppercase tracking-widest text-sm th-text-primary transition-all hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2 shadow-lg bg-gradient-to-r from-rose-600 to-red-600 shadow-rose-500/20"
                                                >
                                                    <Rocket size={16} /> Xác nhận xóa SSID
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Progress UI */}
                                {(confirmReady || executionLoading || executionResult) && (
                                    <>
                                        <div className="flex flex-col items-center gap-4">
                                            <div className="w-16 h-16 bg-rose-500/10 rounded-2xl flex items-center justify-center text-rose-500">
                                                <Activity size={32} className={executionLoading ? "animate-spin" : ""} />
                                            </div>
                                            <div className="text-center">
                                                <p className="text-[10px] font-black uppercase tracking-widest text-rose-500 mb-1">
                                                    {executionResult ? 'EXECUTION COMPLETE' : executionLoading ? 'DELETING...' : 'READY TO EXECUTE'}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="w-full max-w-2xl space-y-4">
                                            {/* Progress bar */}
                                            <div className="w-full bg-slate-200 dark:bg-white/5 rounded-full h-3 overflow-hidden">
                                                <div className="h-full bg-gradient-to-r from-rose-500 to-red-400 transition-all duration-500 shadow-[0_0_10px_rgba(225,29,72,0.5)]" style={{ width: `${progress}%` }} />
                                            </div>
                                            <div className="flex justify-between items-center">
                                                <span className="text-[10px] font-black uppercase text-slate-500">{progress}%</span>
                                                {executionLoading && (
                                                    <button onClick={handleStop} disabled={isStopping} className="text-[10px] font-black uppercase text-rose-500 hover:underline disabled:opacity-50">
                                                        {isStopping ? 'Stopping...' : 'Stop'}
                                                    </button>
                                                )}
                                            </div>

                                            {/* Start button */}
                                            {confirmReady && !executionLoading && !executionResult && (
                                                <button
                                                    onClick={handleExecuteDelete}
                                                    className="w-full h-14 bg-gradient-to-r from-rose-600 to-red-600 th-text-primary font-black uppercase tracking-widest rounded-2xl shadow-xl hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2 animate-pulse"
                                                >
                                                    <Rocket size={20} /> Execute Deletion Now
                                                </button>
                                            )}

                                            {/* Execution logs */}
                                            <div className="space-y-2 max-h-[400px] overflow-y-auto custom-scrollbar">
                                                {executionLogs.map((log, idx) => (
                                                    <div key={idx} className={`flex items-start gap-3 p-3 rounded-xl text-xs border transition-colors ${
                                                        log.status === 'SUCCESS' ? 'bg-emerald-500/5 border-emerald-500/10' :
                                                        log.status === 'ERROR' ? 'bg-rose-500/5 border-rose-500/10' :
                                                        log.status === 'SKIPPED' ? 'bg-slate-500/5 border-slate-500/10' :
                                                        log.status === 'STOPPED' ? 'bg-amber-500/5 border-amber-500/10' :
                                                        'bg-blue-500/5 border-blue-500/10'
                                                    }`}>
                                                        <span className="shrink-0 mt-0.5">
                                                            {log.status === 'SUCCESS' && <CheckCircle size={14} className="text-emerald-500" />}
                                                            {log.status === 'ERROR' && <XCircle size={14} className="text-rose-500" />}
                                                            {log.status === 'SKIPPED' && <XCircle size={14} className="text-slate-400" />}
                                                            {log.status === 'RETRYING' && <Activity size={14} className="text-amber-500 animate-spin" />}
                                                            {log.status === 'STOPPED' && <AlertCircle size={14} className="text-amber-500" />}
                                                        </span>
                                                        <div className="flex-1 min-w-0">
                                                            <span className="font-bold text-slate-700 dark:text-slate-300">{log.siteName}</span>
                                                            <span className="mx-2 text-slate-400">·</span>
                                                            <span className="text-slate-500 dark:text-slate-400">{log.detail}</span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        </section>
                    )}
                </div>
            </div>
        </div>
    );
};

export default DeleteSSID;
