import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../../api/apiClient';
import styles from './Cloner.module.css';
import { useLanguage } from '../../context/LanguageContext';
import {
    Download, LayoutDashboard, CheckSquare, FileJson,
    ArrowRight, Server, Rocket, Activity, Code, Network, Search, CheckCircle, Wifi, Cable, Users
} from 'lucide-react';

const Cloner = () => {
    const { t } = useLanguage();
    // --- 1. Quản lý State ---
    const [sourceMode, setSourceMode] = useState('live');
    const [sourceSites, setSourceSites] = useState([]);
    const [selectedSourceId, setSelectedSourceId] = useState('');
    const [fetchLoading, setFetchLoading] = useState(false);
    const [fetchError, setFetchError] = useState('');

    const [previewOps, setPreviewOps] = useState([]);
    const [selectedOpsIndices, setSelectedOpsIndices] = useState(new Set());
    const [showPreview, setShowPreview] = useState(false);

    const [targetSites, setTargetSites] = useState([]);
    const [selectedTargetIds, setSelectedTargetIds] = useState(new Set());
    const [searchTargetTerm, setSearchTargetTerm] = useState('');
    const [zones, setZones] = useState([]);
    const [selectedZone, setSelectedZone] = useState('all');
    const [executionLoading, setExecutionLoading] = useState(false);
    const [executionResult, setExecutionResult] = useState(null);

    const [modalData, setModalData] = useState(null);
    const [currentStep, setCurrentStep] = useState(1);

    // --- 2. Khởi tạo & Đồng bộ hóa ---
    useEffect(() => {
        loadSourceSites(sourceMode);
        loadTargetSites();
        loadZones();
    }, []);

    useEffect(() => {
        loadSourceSites(sourceMode);
        setSelectedSourceId('');
        setShowPreview(false);
    }, [sourceMode]);

    useEffect(() => {
        if (executionResult) setCurrentStep(3);
        else if (showPreview) setCurrentStep(2);
        else setCurrentStep(1);
    }, [showPreview, executionResult]);

    // --- 3. Các hàm Logic xử lý API ---
    const loadSourceSites = async (mode) => {
        try {
            const res = await apiClient.get('/overview/sites');
            const list = Array.isArray(res.data) ? res.data : (res.data?.sites || []);
            setSourceSites(list);
        } catch (error) {
            setSourceSites([]);
        }
    };

    const loadTargetSites = async () => {
        try {
            const res = await apiClient.get('/overview/sites');
            const list = Array.isArray(res.data) ? res.data : (res.data?.sites || []);
            setTargetSites(list);
        } catch (error) {
            console.error("Failed to load target sites:", error);
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

    const handleFetchConfig = async () => {
        if (!selectedSourceId) return;
        setFetchLoading(true);
        setFetchError('');
        try {
            const res = await apiClient.post('/cloner/preview', {
                site_id: selectedSourceId,
                source: sourceMode
            });
            const ops = Array.isArray(res.data?.operations) ? res.data.operations : [];
            setPreviewOps(ops);
            setSelectedOpsIndices(new Set());
            setShowPreview(true);
        } catch (error) {
            setFetchError(error.response?.data?.detail || "Lỗi khi lấy cấu hình.");
        } finally {
            setFetchLoading(false);
        }
    };

    const handleExecuteClone = async () => {
        if (selectedTargetIds.size === 0) return alert("Vui lòng chọn ít nhất 1 Site đích.");

        const hasReadOnlyTarget = Array.from(selectedTargetIds).some(id => {
            const site = targetSites.find(s => s.siteId === id);
            const role = (site?.role || '').toLowerCase();
            return role !== 'administrator' && role !== 'admin';
        });
        if (hasReadOnlyTarget) return alert("Bạn không có quyền Administrator hoặc Operator trên Site đích đã chọn.");

        const opsToRun = previewOps.filter((_, i) => selectedOpsIndices.has(i));
        if (!confirm(`Xác nhận áp dụng ${opsToRun.length} lệnh?`)) return;

        setExecutionLoading(true);
        try {
            const res = await apiClient.post('/cloner/apply', {
                target_site_ids: Array.from(selectedTargetIds),
                operations: opsToRun
            });
            setExecutionResult(res.data);
        } catch (error) {
            alert("Lỗi thực thi: " + (error.response?.data?.detail || error.message));
        } finally {
            setExecutionLoading(false);
        }
    };

    const toggleSetItem = (setObj, item) => {
        const newSet = new Set(setObj);
        if (newSet.has(item)) newSet.delete(item);
        else newSet.add(item);
        return newSet;
    };

    const getOpIcon = (type) => {
        if (type.includes('WIRELESS')) return <Wifi size={16} className="text-orange-500" />;
        if (type.includes('WIRED')) return <Cable size={16} className="text-blue-500" />;
        if (type.includes('GUEST')) return <Users size={16} className="text-emerald-500" />;
        return <Activity size={16} className="text-slate-400" />;
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
            case 'delegate':
                return { text: 'DELEGATE', classes: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-700/50', canClone: false };
            case 'viewer':
            case 'view':
                return { text: 'VIEWER', classes: 'bg-slate-200 dark:bg-slate-700/40 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-600/50', canClone: false };
            default:
                return { text: role.toUpperCase(), classes: 'bg-slate-100 dark:bg-slate-800/40 text-slate-500 dark:text-slate-500 border-slate-200 dark:border-slate-700/50', canClone: false };
        }
    };

    // --- 4. Giao diện ---
    return (
        <div className={`relative w-full min-h-[800px] h-full bg-slate-50 dark:bg-[#020617] text-slate-800 dark:text-slate-200 font-sans overflow-x-hidden rounded-xl border border-slate-200 dark:border-gray-800 shadow-xl dark:shadow-2xl ${styles.clonerWrapper}`}>
            {/* Background Orbs */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none rounded-xl">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/5 dark:bg-blue-600/10 blur-[120px] rounded-full"></div>
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-600/5 dark:bg-indigo-600/10 blur-[120px] rounded-full"></div>
            </div>

            <div className="relative z-10 w-full h-full p-8 space-y-12">
                {/* Horizontal Progress Stepper */}
                <div className="bg-white/80 dark:bg-[#020617]/80 backdrop-blur-xl py-6 border-b border-slate-200 dark:border-white/5 -mx-8 px-12 mb-10 transition-all duration-300">
                    <div className="max-w-4xl mx-auto relative px-4">
                        <div className="flex justify-between items-center relative z-10">
                            {[t('cloner.steps.source'), t('cloner.steps.review'), t('cloner.steps.execute')].map((step, idx) => {
                                const stepNum = idx + 1;
                                const isActive = currentStep >= stepNum;
                                const isCurrent = currentStep === stepNum;
                                return (
                                    <div key={idx} className="flex flex-col items-center">
                                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all duration-500 border ${isCurrent ? 'bg-blue-600 border-blue-400 shadow-[0_0_20px_rgba(37,99,235,0.4)] scale-110 text-white' :
                                            isActive ? 'bg-white dark:bg-slate-900 border-blue-200 dark:border-blue-500/50 text-blue-500 dark:text-blue-400' : 'bg-slate-100 dark:bg-slate-950 border-slate-200 dark:border-white/5 text-slate-400 dark:text-slate-700'
                                            }`}>
                                            {isActive && !isCurrent ? <CheckCircle size={20} /> :
                                                idx === 0 ? <Server size={20} /> :
                                                    idx === 1 ? <CheckSquare size={20} /> : <Rocket size={20} />}
                                        </div>
                                        <span className={`mt-3 text-[9px] font-black uppercase tracking-[0.2em] ${isCurrent ? 'text-blue-700 dark:text-white' : 'text-slate-500 dark:text-slate-600'}`}>
                                            {step}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="absolute top-6 left-0 w-full h-[2px] bg-slate-200 dark:bg-white/5 -z-0"></div>
                        <div
                            className="absolute top-6 left-0 h-[2px] bg-gradient-to-r from-blue-500 to-cyan-400 dark:from-blue-600 dark:to-cyan-500 -z-0 transition-all duration-1000 shadow-[0_0_10px_rgba(37,99,235,0.3)] dark:shadow-[0_0_10px_rgba(37,99,235,0.5)]"
                            style={{ width: `${((currentStep - 1) / 2) * 100}%` }}
                        ></div>
                    </div>
                </div>

                {/* Workflow Cards */}
                <div className="grid grid-cols-1 gap-12 max-w-6xl mx-auto">
                    {/* Step 1: Source Selection */}
                    <section className={`relative transition-all duration-700 ${currentStep > 1 ? 'opacity-40 blur-[1px]' : ''}`}>
                        <div className="backdrop-blur-2xl bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 rounded-3xl p-10 shadow-xl dark:shadow-2xl">
                            <div className="flex items-center gap-4 mb-10">
                                <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-500/10 rounded-xl flex items-center justify-center text-indigo-500 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-500/20">
                                    <Download size={24} />
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">{t('cloner.title')}</h2>
                                    <p className="text-sm text-slate-500">{t('cloner.subtitle')}</p>
                                </div>
                            </div>

                            <div className="max-w-2xl mx-auto flex flex-col gap-6">
                                <div className="relative">
                                    <select
                                        value={selectedSourceId}
                                        onChange={e => setSelectedSourceId(e.target.value)}
                                        className="w-full h-16 bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-2xl px-6 text-slate-800 dark:text-white text-lg font-bold appearance-none focus:outline-none focus:border-blue-500/50"
                                    >
                                        <option value="">{t('cloner.origin_site')}</option>
                                        {sourceSites.map(site => (
                                            <option key={site.siteId} value={site.siteId} className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200">{site.siteName}</option>
                                        ))}
                                    </select>
                                    <ArrowRight className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-600 rotate-90" size={20} />
                                </div>
                                <button
                                    onClick={handleFetchConfig}
                                    disabled={!selectedSourceId || fetchLoading}
                                    className="h-16 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-black uppercase tracking-[0.2em] rounded-2xl shadow-xl dark:shadow-2xl hover:scale-[1.02] transition-all active:scale-95 disabled:opacity-30"
                                >
                                    {fetchLoading ? t('cloner.decoding') : t('cloner.decode')}
                                </button>
                                {fetchError && <p className="text-rose-500 text-xs font-bold text-center italic">{fetchError}</p>}
                            </div>
                        </div>
                    </section>

                    {/* Step 2: Review & Execution */}
                    {showPreview && (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 animate-fade-in pb-20">

                            {/* Operation Preview List */}
                            <div className="backdrop-blur-2xl bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 rounded-3xl p-8 flex flex-col max-h-[550px] shadow-xl dark:shadow-none">
                                <div className="flex justify-between items-center mb-8">
                                    <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400 flex items-center gap-2">
                                        <Activity size={16} className="text-blue-500" /> {t('cloner.blueprint_elements')}
                                    </h3>
                                    <div className="flex items-center gap-3">
                                        <button
                                            onClick={() => {
                                                if (selectedOpsIndices.size === previewOps.length) {
                                                    setSelectedOpsIndices(new Set());
                                                } else {
                                                    setSelectedOpsIndices(new Set(previewOps.map((_, i) => i)));
                                                }
                                            }}
                                            className="px-3 py-1 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-white rounded-md text-[10px] font-black uppercase tracking-widest transition-colors border border-slate-200 dark:border-white/10"
                                        >
                                            {selectedOpsIndices.size === previewOps.length && previewOps.length > 0 ? t('cloner.deselect_all') : t('cloner.select_all')}
                                        </button>
                                        <span className="px-3 py-1 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-md text-[10px] font-black border border-blue-200 dark:border-blue-500/20">{previewOps.length} {t('cloner.detected')}</span>
                                    </div>
                                </div>
                                <div className="flex-1 overflow-y-auto pr-3 space-y-3 custom-scrollbar">
                                    {previewOps.map((op, idx) => (
                                        <div key={idx} className="p-4 bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-2xl flex items-center justify-between group hover:border-slate-300 dark:hover:border-white/20 transition-all">
                                            <div className="flex items-center gap-4">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedOpsIndices.has(idx)}
                                                    onChange={() => setSelectedOpsIndices(prev => toggleSetItem(prev, idx))}
                                                    className="w-5 h-5 rounded border-slate-300 dark:border-white/10 bg-white dark:bg-white/5 text-blue-600 focus:ring-0"
                                                />
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        {getOpIcon(op.type)}
                                                        <span className="text-sm font-bold text-slate-800 dark:text-white">{op.name}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <span className="text-[9px] font-mono text-slate-500 dark:text-slate-600 uppercase tracking-widest">{op.type}</span>
                                                        {op.payload?._guest_portal_settings && (
                                                            <span className="px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[8px] font-bold border border-emerald-200 dark:border-emerald-500/20 uppercase tracking-widest flex items-center gap-1">
                                                                <FileJson size={8} /> + GUEST SETTINGS
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            <button onClick={() => setModalData(op)} className="p-2 opacity-0 group-hover:opacity-100 text-slate-400 dark:text-slate-500 hover:text-blue-500 dark:hover:text-blue-400 transition-all">
                                                <Code size={14} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Target Selection & Action */}
                            <div className="backdrop-blur-2xl bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 rounded-3xl p-8 flex flex-col max-h-[550px] shadow-xl dark:shadow-none">
                                <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400 mb-6 flex items-center gap-2">
                                    <Network size={16} className="text-emerald-500" /> {t('cloner.target_deployment')}
                                </h3>

                                {/* Search Bar & Zone Filter for Targets */}
                                <div className="flex gap-3 mb-4 shrink-0">
                                    <div className="relative flex-1">
                                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                            <Search size={16} className="text-slate-400 dark:text-slate-500" />
                                        </div>
                                        <input
                                            type="text"
                                            placeholder={t('cloner.search_destination')}
                                            value={searchTargetTerm}
                                            onChange={(e) => setSearchTargetTerm(e.target.value)}
                                            className="w-full text-sm bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl py-3 pl-10 pr-4 text-slate-800 dark:text-white focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 transition-all placeholder:text-slate-400 dark:placeholder:text-slate-600"
                                        />
                                    </div>
                                    <select
                                        value={selectedZone}
                                        onChange={(e) => setSelectedZone(e.target.value)}
                                        className="h-[46px] bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl px-4 text-slate-800 dark:text-white text-sm font-bold focus:outline-none min-w-[150px] md:max-w-[200px]"
                                    >
                                        <option value="all">Tất cả Group (Zone)</option>
                                        {zones.map(z => (
                                            <option key={z.id || z._id} value={z.id || z._id}>{z.name}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="flex-1 overflow-y-auto pr-3 space-y-3 custom-scrollbar">
                                    {targetSites.filter(site => {
                                        const matchesSearch = site.siteName.toLowerCase().includes(searchTargetTerm.toLowerCase());
                                        let matchesZone = true;
                                        if (selectedZone !== 'all') {
                                            const zoneObj = zones.find(z => String(z.id || z._id) === selectedZone);
                                            matchesZone = zoneObj ? (zoneObj.site_ids || []).includes(site.siteId) : false;
                                        }
                                        return matchesSearch && matchesZone;
                                    }).map(site => {
                                        const roleInfo = getRoleBadgeInfo(site.role);
                                        const isReadOnly = !roleInfo.canClone;
                                        return (
                                            <label key={site.siteId} className={`p-4 rounded-2xl border flex items-center justify-between transition-all ${isReadOnly ? 'opacity-50 cursor-not-allowed bg-slate-100/50 dark:bg-white/5 border-slate-200 dark:border-white/5 grayscale' : selectedTargetIds.has(site.siteId) ? 'bg-emerald-50 dark:bg-emerald-600/10 border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.1)] dark:shadow-[0_0_15px_rgba(16,185,129,0.2)] scale-[1.02] cursor-pointer' : 'bg-slate-50 dark:bg-black/40 border-slate-200 dark:border-white/5 hover:border-slate-300 dark:hover:border-white/10 cursor-pointer'}`}>
                                                <div className="flex flex-col">
                                                    <div className="flex items-center gap-2">
                                                        <span className={`text-sm font-bold ${selectedTargetIds.has(site.siteId) ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-300'}`}>{site.siteName}</span>
                                                        <span className={`px-2 py-0.5 rounded-md border text-[9px] font-black uppercase tracking-widest flex items-center gap-1 ${roleInfo.classes}`}>
                                                            {roleInfo.text}
                                                        </span>
                                                    </div>
                                                    <span className="text-[9px] font-mono text-slate-500 dark:text-slate-600 mt-0.5">{site.siteId}</span>

                                                    {executionResult?.results?.[site.siteId] && (
                                                        <div className="text-[10px] font-bold mt-2 text-emerald-500 flex items-center gap-1">
                                                            <CheckCircle size={12} /> Clone Applied Successfully
                                                        </div>
                                                    )}
                                                </div>
                                                <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${selectedTargetIds.has(site.siteId) ? 'border-emerald-500 bg-emerald-100 dark:bg-emerald-500/20' : 'border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-black/50'}`}>
                                                    {selectedTargetIds.has(site.siteId) && <div className="w-3 h-3 rounded-sm bg-emerald-500 dark:bg-emerald-400"></div>}
                                                </div>
                                                <input
                                                    type="checkbox"
                                                    disabled={isReadOnly}
                                                    checked={selectedTargetIds.has(site.siteId)}
                                                    onChange={(e) => {
                                                        if (!isReadOnly) {
                                                            const newSet = new Set(selectedTargetIds);
                                                            if (e.target.checked) newSet.add(site.siteId);
                                                            else newSet.delete(site.siteId);
                                                            setSelectedTargetIds(newSet);
                                                        }
                                                    }}
                                                    className="hidden"
                                                />
                                            </label>
                                        );
                                    })}
                                </div>
                                <div className="mt-8 flex gap-4">
                                    <button
                                        onClick={() => {
                                            const validSites = targetSites.filter(s => getRoleBadgeInfo(s.role).canClone).map(s => s.siteId);
                                            if (selectedTargetIds.size === validSites.length && validSites.length > 0) {
                                                setSelectedTargetIds(new Set());
                                            } else {
                                                setSelectedTargetIds(new Set(validSites));
                                            }
                                        }}
                                        className="px-6 py-4 rounded-2xl font-bold text-sm bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 transition-colors"
                                    >
                                        {selectedTargetIds.size > 0 ? "Deselect All" : "Select All Valid"}
                                    </button>
                                    <button
                                        onClick={handleExecuteClone}
                                        disabled={executionLoading || selectedTargetIds.size === 0}
                                        className="flex-1 h-14 bg-gradient-to-r from-emerald-500 to-teal-500 dark:from-emerald-600 dark:to-teal-600 text-white font-black uppercase tracking-[0.3em] rounded-2xl shadow-[0_10px_30px_rgba(16,185,129,0.2)] dark:shadow-[0_10px_40px_rgba(16,185,129,0.3)] hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-20"
                                    >
                                        {executionLoading ? t('cloner.deploying') : t('cloner.initiate')}
                                    </button>
                                </div>
                                {executionResult && (
                                    <div className="mt-4 p-4 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-xl">
                                        <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-2"><CheckCircle size={14} /> {t('cloner.completed')}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div >

            {/* Modal: JSON Inspector */}
            {
                modalData && (
                    <div className="absolute inset-0 z-[100] flex items-center justify-center p-8 bg-slate-900/60 dark:bg-black/90 backdrop-blur-md animate-fade-in rounded-xl">
                        <div className="w-full max-w-4xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-3xl overflow-hidden shadow-2xl flex flex-col scale-in-center">
                            <div className="p-6 border-b border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-white/5 flex justify-between items-center">
                                <span className="text-[10px] font-black uppercase tracking-widest text-blue-600 dark:text-blue-400 flex items-center gap-2"><Code size={16} /> {t('cloner.payload_inspector')}</span>
                                <button onClick={() => setModalData(null)} className="text-xs font-bold text-slate-500 hover:text-slate-800 dark:hover:text-white transition-colors">{t('common.close')}</button>
                            </div>
                            <div className="flex-1 p-8 bg-slate-50 dark:bg-black/40 overflow-auto font-mono text-[11px] text-blue-600 dark:text-blue-300 leading-relaxed custom-scrollbar max-h-[65vh]">
                                <pre>{JSON.stringify(modalData.payload, null, 2)}</pre>
                            </div>
                            <div className="p-6 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-white/5 flex justify-end">
                                <button onClick={() => setModalData(null)} className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold uppercase rounded-lg transition-all">{t('common.done')}</button>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
};

export default Cloner;
