import React, { useState, useEffect, useRef } from 'react';
import apiClient from '../../api/apiClient';
import styles from './Cloner.module.css';
import { useLanguage } from '../../context/LanguageContext';
import {
    Activity, Shield, Rocket, Server, Sliders, CheckCircle, Wifi, Search, XCircle, Lock, Network, RotateCcw, Layers, Database, ChevronRight, AlertCircle
} from 'lucide-react';

const SmartSync = () => {
    const { t } = useLanguage();

    // --- 1. Quản lý State ---
    const [currentStep, setCurrentStep] = useState(1);
    const [liveSites, setLiveSites] = useState([]);

    // Step 1: Scope & Target
    const [selectedAction, setSelectedAction] = useState('update_ssid_password');
    const [searchTargetTerm, setSearchTargetTerm] = useState('');
    const [selectedTargetIds, setSelectedTargetIds] = useState(new Set());
    const [zones, setZones] = useState([]);
    const [selectedZone, setSelectedZone] = useState('all');

    // Step 2: Analysis & Configuration
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [hasAnalyzed, setHasAnalyzed] = useState(false);
    const [compiledSSIDs, setCompiledSSIDs] = useState([]); 
    const [selectedSSIDName, setSelectedSSIDName] = useState(''); 
    const [newPassword, setNewPassword] = useState('');

    // State for Config Sync Mode
    const [selectedSourceSiteId, setSelectedSourceSiteId] = useState('');
    const [sourceSSIDs, setSourceSSIDs] = useState([]);
    const [isLoadingSourceSSIDs, setIsLoadingSourceSSIDs] = useState(false);

    // Step 3: Execution
    const [executionLoading, setExecutionLoading] = useState(false);
    const [executionResult, setExecutionResult] = useState(null);
    const [executionLogs, setExecutionLogs] = useState([]);
    const [progress, setProgress] = useState(0);
    const [isStopping, setIsStopping] = useState(false);
    const stopRef = useRef(false);

    // --- 2. Khởi tạo ---
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
            case 'viewer':
            case 'view':
                return { text: 'VIEWER', classes: 'bg-slate-200 dark:bg-slate-700/40 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-600/50', canClone: false };
            case 'guest':
                return { text: 'GUEST', classes: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-700/50', canClone: false };
            default:
                return { text: role.toUpperCase(), classes: 'bg-slate-100 dark:bg-slate-800/40 text-slate-500 dark:text-slate-500 border-slate-200 dark:border-slate-700/50', canClone: false };
        }
    };

    // Auto-reset down-stream steps if Step 1 changes
    useEffect(() => {
        if (currentStep > 1) {
            setHasAnalyzed(false);
            setCurrentStep(1);
            setExecutionResult(null);
            setCompiledSSIDs([]);
            setSelectedSSIDName('');
            setSelectedSourceSiteId('');
            setSourceSSIDs([]);
            setNewPassword('');
            setExecutionLogs([]);
            setProgress(0);
        }
    }, [selectedTargetIds, selectedAction]);

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

    // --- 3. Logic xử lý API ---
    const handleAnalyzeSites = async () => {
        if (selectedTargetIds.size === 0) return alert("Vui lòng chọn ít nhất 1 Site.");

        setIsAnalyzing(true);
        setCompiledSSIDs([]);
        setSelectedSSIDName('');
        setSelectedSourceSiteId('');

        try {
            const siteIds = Array.from(selectedTargetIds);
            const results = [];
            
            // Process sequentially with small delay for stability on large zones
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
            alert("Đã xảy ra lỗi khi phân tích các Sites");
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
            return alert(`Unauthorized: Bạn không có quyền Administrator để ghi dữ liệu vào các site: ${names}`);
        }

        if (selectedAction === 'update_ssid_password') {
            if (!selectedSSIDName) return alert("Vui lòng chọn một SSID.");
            const selectedSSID = compiledSSIDs.find(s => s.networkName === selectedSSIDName);
            if (selectedSSID && selectedSSID.isGuestPortalEnabled) {
                return alert("Không thể đổi mật khẩu cho Guest Portal SSID.");
            }
            if (!newPassword || newPassword.length < 8) return alert("Mật khẩu phải từ 8 ký tự trở lên.");
        } else if (selectedAction === 'update_ssid_config') {
            if (!selectedSSIDName) return alert("Vui lòng chọn một SSID.");
            if (!selectedSourceSiteId) return alert("Vui lòng chọn Origin Site.");
        } else if (selectedAction === 'delete_ssid') {
            if (!selectedSSIDName) return alert("Vui lòng chọn một SSID.");
        }

        setCurrentStep(3);
    };

    const handleExecuteSync = async () => {
        if (selectedTargetIds.size === 0) return;
        
        let confirmMsg = `Xác nhận thực thi tác vụ trên ${selectedTargetIds.size} sites?`;
        if (selectedAction === 'delete_ssid') {
            confirmMsg = `⚠️ CẢNH BÁO NGUY HIỂM ⚠️\nBạn có chắc chắn muốn XÓA SSID "${selectedSSIDName}" trên ${selectedTargetIds.size} sites không?\nHành động này không thể hoàn tác!`;
        }
        if (!confirm(confirmMsg)) return;

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

            // Conflict Check: If SSID not in site, skip
            const ssidEntry = compiledSSIDs.find(s => s.networkName === selectedSSIDName);
            if (!ssidEntry || !ssidEntry.foundInSiteIds.includes(siteId)) {
                const skipLog = { siteName, status: "SKIPPED", detail: `SSID '${selectedSSIDName}' không tồn tại trên site này. Bỏ qua.` };
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
                    let res;
                    const singleSiteRef = [siteId];
                    if (selectedAction === 'update_ssid_password') {
                        res = await apiClient.post('/cloner/sync-password', {
                            source_network_name: selectedSSIDName,
                            new_password: newPassword,
                            target_site_ids: singleSiteRef
                        });
                    } else if (selectedAction === 'update_ssid_config') {
                        res = await apiClient.post('/cloner/sync-config', {
                            source_site_id: selectedSourceSiteId,
                            source_network_name: selectedSSIDName,
                            target_site_ids: singleSiteRef
                        });
                    } else if (selectedAction === 'delete_ssid') {
                        res = await apiClient.post('/cloner/sync-delete', {
                            source_network_name: selectedSSIDName,
                            target_site_ids: singleSiteRef
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

        // Auto refresh after 7s to reflect changes
        if (!stopRef.current) {
            setExecutionLogs(prev => [{ 
                siteName: "SYSTEM", 
                status: "INFO", 
                detail: "Tác vụ hoàn tất. Trang web sẽ tự động làm mới sau 7 giây..." 
            }, ...prev]);
            setTimeout(() => { window.location.reload(); }, 7000);
        }
    };

    const handleStop = () => {
        if (executionLoading) {
            setIsStopping(true);
            stopRef.current = true;
        }
    };

    const generateRandomPassword = () => {
        const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+";
        let retVal = "";
        for (let i = 0, n = charset.length; i < 12; ++i) {
            retVal += charset.charAt(Math.floor(Math.random() * n));
        }
        setNewPassword(retVal);
    };

    // --- 4. Giao diện ---
    return (
        <div className={`relative w-full min-h-[800px] h-full bg-slate-50 dark:bg-[#020617] text-slate-800 dark:text-slate-200 font-sans overflow-x-hidden rounded-xl border border-slate-200 dark:border-gray-800 shadow-xl dark:shadow-2xl ${styles.clonerWrapper}`}>
            {/* Background Orbs */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none rounded-xl">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-emerald-600/5 dark:bg-emerald-600/10 blur-[120px] rounded-full"></div>
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-teal-600/5 dark:bg-teal-600/10 blur-[120px] rounded-full"></div>
            </div>

            <div className="relative z-10 w-full h-full p-8 space-y-12">
                {/* Horizontal Progress Stepper */}
                <div className="bg-white/80 dark:bg-[#020617]/80 backdrop-blur-xl py-6 border-b border-slate-200 dark:border-white/5 -mx-8 px-12 mb-10 transition-all duration-300">
                    <div className="max-w-4xl mx-auto relative px-4">
                        <div className="flex justify-between items-center relative z-10">
                            {['Scope & Target', 'Filter & Config', 'Execution Log'].map((step, idx) => {
                                const stepNum = idx + 1;
                                const isActive = currentStep >= stepNum;
                                const isCurrent = currentStep === stepNum;
                                return (
                                    <div key={idx} className="flex flex-col items-center">
                                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-500 border ${isCurrent ? 'bg-emerald-600 border-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.4)] scale-110 text-white' :
                                            isActive ? 'bg-white dark:bg-slate-900 border-emerald-200 dark:border-emerald-500/50 text-emerald-500 dark:text-emerald-400' : 'bg-slate-100 dark:bg-slate-950 border-slate-200 dark:border-white/5 text-slate-400 dark:text-slate-700'
                                            }`}>
                                            {isActive && !isCurrent ? <CheckCircle size={20} /> :
                                                idx === 0 ? <Server size={20} /> :
                                                    idx === 1 ? <Sliders size={20} /> : <Rocket size={20} />}
                                        </div>
                                        <span className={`mt-3 text-[9px] font-black uppercase tracking-[0.2em] ${isCurrent ? 'text-emerald-700 dark:text-white' : 'text-slate-500 dark:text-slate-600'}`}>
                                            {step}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="absolute top-6 left-0 w-full h-[2px] bg-slate-200 dark:bg-white/5 -z-0"></div>
                        <div
                            className="absolute top-6 left-0 h-[2px] bg-gradient-to-r from-emerald-500 to-teal-400 dark:from-emerald-600 dark:to-teal-500 -z-0 transition-all duration-1000 shadow-[0_0_10px_rgba(16,185,129,0.3)] dark:shadow-[0_0_10px_rgba(16,185,129,0.5)]"
                            style={{ width: `${((currentStep - 1) / 2) * 100}%` }}
                        ></div>
                    </div>
                </div>

                {/* Workflow Cards */}
                <div className="grid grid-cols-1 gap-12 max-w-6xl mx-auto flex-1">

                    {/* Step 1: Scope & Target */}
                    {currentStep === 1 && (
                        <section className="animate-fade-in flex flex-col gap-10">
                            <div className="backdrop-blur-2xl bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 rounded-3xl p-10 shadow-xl dark:shadow-2xl">
                                <div className="flex items-center gap-4 mb-10">
                                    <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-500 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-500/20">
                                        <Wifi size={24} />
                                    </div>
                                    <div>
                                        <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">Smart Synchronization</h2>
                                        <p className="text-sm text-slate-500">Update configuration across multiple sites efficiently.</p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                                    {/* Action Type */}
                                    <div className="space-y-6">
                                        <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">1. Select Action Type</label>
                                        <div className="grid grid-cols-1 gap-3">
                                            {[
                                                { id: 'update_ssid_password', label: 'Update Wireless PSK', icon: Lock, color: 'text-emerald-500' },
                                                { id: 'update_ssid_config', label: 'Clone Deep Config', icon: RotateCcw, color: 'text-blue-500' },
                                                { id: 'delete_ssid', label: 'Bulk Delete SSID', icon: XCircle, color: 'text-rose-500' }
                                            ].map(action => (
                                                <button
                                                    key={action.id}
                                                    onClick={() => setSelectedAction(action.id)}
                                                    className={`p-4 rounded-2xl border transition-all flex items-center gap-4 text-left group ${selectedAction === action.id 
                                                        ? 'bg-emerald-500/10 border-emerald-500 shadow-lg shadow-emerald-500/5' 
                                                        : 'bg-white dark:bg-black/40 border-slate-200 dark:border-white/5 hover:border-slate-300 dark:hover:border-white/10'}`}
                                                >
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

                                    {/* Filter Targets */}
                                    <div className="lg:col-span-2 flex flex-col h-[500px]">
                                        <div className="flex justify-between items-end mb-4">
                                            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500">2. Select Target Sites</label>
                                            <span className="text-[10px] font-black text-emerald-500 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
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
                                                    className="w-full text-sm bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-2xl py-3 pl-12 pr-4 text-slate-800 dark:text-white focus:outline-none focus:border-emerald-500/50"
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
                                            {liveSites.filter(site => {
                                                const matchesSearch = site.siteName.toLowerCase().includes(searchTargetTerm.toLowerCase());
                                                let matchesZone = true;
                                                if (selectedZone !== 'all') {
                                                    const zoneObj = zones.find(z => String(z.id || z._id) === selectedZone);
                                                    matchesZone = zoneObj ? (zoneObj.site_ids || []).includes(site.siteId) : false;
                                                }
                                                return matchesSearch && matchesZone;
                                            }).map((site) => {
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
                                                            ? 'bg-emerald-500/10 border-emerald-500 shadow-sm' 
                                                            : !canSelect ? 'opacity-40 grayscale bg-slate-100 dark:bg-white/5' : 'bg-white dark:bg-black/40 border-slate-200 dark:border-white/10 hover:border-slate-300'}`}
                                                    >
                                                        <div className="flex items-center gap-4">
                                                            <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${isSelected ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300 dark:border-white/10'}`}>
                                                                {isSelected && <CheckCircle size={14} />}
                                                            </div>
                                                            <div className="flex flex-col">
                                                                <div className="flex items-center gap-2">
                                                                    <span className={`text-sm font-bold ${isSelected ? 'text-emerald-900 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-300'}`}>{site.siteName}</span>
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
                                                    const validSites = liveSites.filter(s => getRoleBadgeInfo(s.role).canClone).map(s => s.siteId);
                                                    setSelectedTargetIds(selectedTargetIds.size === validSites.length ? new Set() : new Set(validSites));
                                                }}
                                                className="px-6 h-12 rounded-2xl font-bold text-xs bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 transition-colors"
                                            >
                                                {selectedTargetIds.size > 0 ? "Deselect All" : "Select All Valid"}
                                            </button>
                                            <button
                                                onClick={handleAnalyzeSites}
                                                disabled={isAnalyzing || selectedTargetIds.size === 0}
                                                className="flex-1 h-12 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-black uppercase tracking-widest shadow-lg hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-30 disabled:hover:scale-100 flex items-center justify-center gap-2"
                                            >
                                                {isAnalyzing ? <Activity size={18} className="animate-spin" /> : <Search size={18} />}
                                                Analyze Selection
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </section>
                    )}

                    {/* Step 2: Action Details & Conflict Review */}
                    {currentStep === 2 && (
                        <section className="animate-fade-in grid grid-cols-1 lg:grid-cols-5 gap-10">
                            {/* Panel: Configuration */}
                            <div className="lg:col-span-2 space-y-8">
                                <div className="backdrop-blur-2xl bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 rounded-3xl p-8 shadow-xl">
                                    <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-8 flex items-center gap-2">
                                        <Sliders size={16} className="text-emerald-500" /> Action Configuration
                                    </h3>

                                    <div className="space-y-8">
                                        {/* SSID Selector */}
                                        <div className="space-y-3">
                                            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500">Target SSID</label>
                                            <select
                                                value={selectedSSIDName}
                                                onChange={e => setSelectedSSIDName(e.target.value)}
                                                className="w-full h-14 bg-slate-50 dark:bg-black/60 border border-slate-200 dark:border-white/10 rounded-2xl px-6 text-sm font-bold focus:border-emerald-500/50 outline-none"
                                            >
                                                <option value="">-- Choose Network --</option>
                                                {compiledSSIDs.map(ssid => (
                                                    <option key={ssid.networkName} value={ssid.networkName}>
                                                        {ssid.networkName} ({ssid.foundInSites} sites)
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

                                        {/* Source Site for Clone */}
                                        {selectedAction === 'update_ssid_config' && (
                                            <div className="space-y-3">
                                                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500">Source Site (Origin)</label>
                                                <select
                                                    value={selectedSourceSiteId}
                                                    onChange={e => setSelectedSourceSiteId(e.target.value)}
                                                    className="w-full h-14 bg-slate-50 dark:bg-black/60 border border-slate-200 dark:border-white/10 rounded-2xl px-6 text-sm font-bold focus:border-emerald-500/50 outline-none"
                                                >
                                                    <option value="">-- Choose Source --</option>
                                                    {liveSites.map(site => (
                                                        <option key={site.siteId} value={site.siteId}>{site.siteName}</option>
                                                    ))}
                                                </select>
                                                <div className="p-4 bg-blue-500/5 border border-blue-500/10 rounded-2xl">
                                                    <p className="text-[11px] text-blue-600 dark:text-blue-400 leading-relaxed italic">
                                                        Deep Config sẽ sao chép toàn bộ thuộc tính của SSID từ Site mẫu (VLAN, Radio, Rate, Isolation,...) đè lên các Site đích.
                                                    </p>
                                                </div>
                                            </div>
                                        )}

                                        {/* Password Field */}
                                        {selectedAction === 'update_ssid_password' && (
                                            <div className="space-y-3">
                                                <div className="flex justify-between items-center">
                                                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500">New Password (PSK)</label>
                                                    <button 
                                                        onClick={generateRandomPassword}
                                                        className="text-[10px] font-black uppercase text-emerald-500 hover:underline flex items-center gap-1"
                                                    >
                                                        <Rocket size={12} /> Auto Gen
                                                    </button>
                                                </div>
                                                <div className="relative">
                                                    <Lock size={18} className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400" />
                                                    <input
                                                        type="text"
                                                        value={newPassword}
                                                        onChange={e => setNewPassword(e.target.value)}
                                                        className="w-full h-14 bg-slate-50 dark:bg-black/60 border border-slate-200 dark:border-white/10 rounded-2xl pl-14 pr-6 font-mono text-lg focus:border-emerald-500/50 outline-none"
                                                        placeholder="Min 8 characters"
                                                    />
                                                </div>
                                            </div>
                                        )}

                                        {selectedAction === 'delete_ssid' && (
                                            <div className="p-6 bg-rose-500/10 border border-rose-500/20 rounded-3xl flex items-start gap-4">
                                                <AlertCircle className="text-rose-500 mt-1" size={20} />
                                                <div>
                                                    <h4 className="text-sm font-black text-rose-700 dark:text-rose-400 uppercase tracking-widest mb-1">Warning</h4>
                                                    <p className="text-[11px] text-rose-600 dark:text-rose-500/80 leading-relaxed">
                                                        Hành động xóa SSID sẽ gỡ bỏ hoàn toàn mạng này khỏi các site mục tiêu. Kết nối người dùng sẽ bị ngắt lập tức.
                                                    </p>
                                                </div>
                                            </div>
                                        )}

                                        <button
                                            onClick={handleProceedToExecution}
                                            disabled={
                                                selectedAction === 'update_ssid_password' ? (!selectedSSIDName || !newPassword || newPassword.length < 8) : 
                                                selectedAction === 'delete_ssid' ? !selectedSSIDName : 
                                                (!selectedSSIDName || !selectedSourceSiteId)
                                            }
                                            className="w-full h-14 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-black uppercase tracking-widest rounded-2xl shadow-xl hover:scale-[1.02] active:scale-98 transition-all disabled:opacity-30 flex items-center justify-center gap-2 mt-4"
                                        >
                                            Next: Deployment Review <ChevronRight size={18} />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Panel: Mapping Analysis */}
                            <div className="lg:col-span-3 backdrop-blur-2xl bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 rounded-3xl overflow-hidden flex flex-col shadow-xl">
                                <div className="p-8 border-b border-slate-200 dark:border-white/5 bg-slate-50/50 dark:bg-white/5 flex justify-between items-center">
                                    <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                                        <Activity size={16} className="text-blue-500" /> Conflict & Matching Analysis
                                    </h3>
                                    {selectedSSIDName && (
                                        <div className="flex items-center gap-4 text-xs font-bold">
                                            <span className="flex items-center gap-1 text-emerald-500">
                                                <CheckCircle size={14} /> {compiledSSIDs.find(s => s.networkName === selectedSSIDName)?.foundInSites || 0} Matches
                                            </span>
                                            <span className="flex items-center gap-1 text-rose-500">
                                                <XCircle size={14} /> {selectedTargetIds.size - (compiledSSIDs.find(s => s.networkName === selectedSSIDName)?.foundInSites || 0)} Conflicts
                                            </span>
                                        </div>
                                    )}
                                </div>
                                <div className="flex-1 overflow-y-auto custom-scrollbar">
                                    <table className="w-full text-left">
                                        <thead className="sticky top-0 bg-white dark:bg-[#0f172a] z-10">
                                            <tr className="border-b border-slate-200 dark:border-white/5">
                                                <th className="p-4 text-[10px] font-black uppercase text-slate-400">Target Site</th>
                                                <th className="p-4 text-[10px] font-black uppercase text-slate-400 text-center">Status</th>
                                                <th className="p-4 text-[10px] font-black uppercase text-slate-400">Operational Note</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                                            {Array.from(selectedTargetIds).map(siteId => {
                                                const site = liveSites.find(s => s.siteId === siteId);
                                                const ssidEntry = compiledSSIDs.find(s => s.networkName === selectedSSIDName);
                                                const isMatch = !!(ssidEntry && ssidEntry.foundInSiteIds.includes(siteId));
                                                
                                                return (
                                                    <tr key={siteId} className={`transition-all duration-300 ${isMatch ? 'bg-emerald-500/5 hover:bg-emerald-500/10' : 'bg-rose-500/5 hover:bg-rose-500/10 opacity-70'}`}>
                                                        <td className="p-4 border-l-4 border-transparent transition-all" style={{ borderLeftColor: isMatch ? '#10b981' : '#f43f5e' }}>
                                                            <div className="font-bold text-sm text-slate-700 dark:text-slate-200">{site?.siteName || siteId}</div>
                                                            <div className="text-[9px] font-mono text-slate-400">{siteId}</div>
                                                        </td>
                                                        <td className="p-4 text-center">
                                                            {selectedSSIDName ? (
                                                                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${isMatch ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'bg-rose-100 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400'}`}>
                                                                    {isMatch ? <CheckCircle size={10} /> : <XCircle size={10} />} {isMatch ? 'Match' : 'Skip'}
                                                                </span>
                                                            ) : (
                                                                <span className="text-slate-400 text-[10px] font-bold">Awaiting Selection</span>
                                                            )}
                                                        </td>
                                                        <td className="p-4 italic">
                                                            <span className={`text-[11px] font-medium ${isMatch ? 'text-slate-500 dark:text-slate-400' : 'text-rose-500/80'}`}>
                                                                {selectedSSIDName 
                                                                    ? (isMatch ? `SSID found. Operation will be executed.` : `SSID not found. Action will be skipped.`)
                                                                    : 'Please select an SSID on the left panel.'}
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

                    {/* Step 3: Deployment Execution Log */}
                    {currentStep === 3 && (
                        <section className="animate-fade-in flex flex-col gap-10 pb-20">
                            <div className="backdrop-blur-2xl bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 rounded-3xl p-10 shadow-xl flex flex-col items-center gap-10">
                                <div className="flex flex-col items-center gap-4">
                                    <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-500">
                                        <Activity size={32} className={executionLoading ? "animate-spin" : ""} />
                                    </div>
                                    <div className="text-center">
                                        <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Sync Execution Progress</h3>
                                        <p className="text-sm text-slate-500">Processing changes across your site inventory.</p>
                                    </div>
                                </div>

                                <div className="w-full max-w-2xl space-y-4">
                                    <div className="flex justify-between items-end mb-1">
                                        <span className="text-xs font-black uppercase text-slate-400">Transmission Progress</span>
                                        <span className="text-lg font-mono font-black text-emerald-500">{progress}%</span>
                                    </div>
                                    <div className="w-full h-4 bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden border border-slate-200 dark:border-white/5">
                                        <div 
                                            className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500 shadow-[0_0_15px_rgba(16,185,129,0.5)]"
                                            style={{ width: `${progress}%` }}
                                        ></div>
                                    </div>
                                </div>

                                <div className="flex gap-4">
                                    {(!executionLoading && executionResult) ? (
                                        <button 
                                            onClick={() => window.location.reload()}
                                            className="px-10 h-14 bg-gradient-to-r from-slate-700 to-slate-900 text-white font-black uppercase tracking-widest rounded-2xl shadow-xl flex items-center gap-2"
                                        >
                                            Done / Reload <RotateCcw size={18} />
                                        </button>
                                    ) : (
                                        <>
                                            <button 
                                                onClick={handleExecuteSync}
                                                disabled={executionLoading}
                                                className="px-12 h-14 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-black uppercase tracking-widest rounded-2xl shadow-xl hover:scale-[1.05] transition-all disabled:opacity-30 flex items-center gap-3"
                                            >
                                                {executionLoading ? <Activity size={20} className="animate-spin" /> : <Rocket size={20} />}
                                                Start Deployment
                                            </button>
                                            {executionLoading && (
                                                <button 
                                                    onClick={handleStop}
                                                    disabled={isStopping}
                                                    className="px-8 h-14 bg-rose-500/10 border border-rose-500/20 text-rose-500 font-black uppercase tracking-widest rounded-2xl hover:bg-rose-500 hover:text-white transition-all disabled:opacity-30"
                                                >
                                                    {isStopping ? "Stopping..." : "Emergency Stop"}
                                                </button>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* Execution Terminal */}
                            <div className="backdrop-blur-2xl bg-[#0f172a] border border-white/10 rounded-3xl overflow-hidden shadow-2xl flex flex-col h-[400px]">
                                <div className="px-6 py-4 bg-white/5 border-b border-white/5 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="flex gap-1.5">
                                            <div className="w-2.5 h-2.5 rounded-full bg-rose-500"></div>
                                            <div className="w-2.5 h-2.5 rounded-full bg-amber-500"></div>
                                            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500"></div>
                                        </div>
                                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                                            <Database size={12} /> Execution Logs
                                        </span>
                                    </div>
                                    <div className="text-[9px] font-mono text-slate-500 tracking-wider">
                                        {new Date().toLocaleTimeString()}
                                    </div>
                                </div>
                                <div className="flex-1 overflow-y-auto p-6 font-mono text-[11px] space-y-3 custom-scrollbar">
                                    {executionLogs.length === 0 && (
                                        <div className="text-slate-600 animate-pulse italic">Awaiting deployment signal...</div>
                                    )}
                                    {executionLogs.map((log, idx) => (
                                        <div key={idx} className="flex gap-4 animate-slide-up border-b border-white/5 pb-2 last:border-0">
                                            <span className="text-slate-500 shrink-0">[{new Date().toLocaleTimeString([], { hour12: false })}]</span>
                                            <span className={`font-black tracking-widest shrink-0 w-24 ${
                                                log.status === 'SUCCESS' ? 'text-emerald-500' :
                                                log.status === 'ERROR' ? 'text-rose-500' :
                                                log.status === 'SKIPPED' ? 'text-slate-400' :
                                                'text-amber-500'
                                            }`}>
                                                {log.status}
                                            </span>
                                            <span className="text-slate-300 font-bold shrink-0">{log.siteName}:</span>
                                            <span className="text-slate-400 italic">{log.detail}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </section>
                    )}
                </div>
            </div>
            
            <style sx={{}}>{`
                @keyframes fade-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
                @keyframes slide-up { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
                .animate-fade-in { animation: fade-in 0.6s ease-out forwards; }
                .animate-slide-up { animation: slide-up 0.3s ease-out forwards; }
                .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.1); border-radius: 10px; }
                .dark .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.05); }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(16,185,129,0.3); }
            `}</style>
        </div>
    );
};

export default SmartSync;
