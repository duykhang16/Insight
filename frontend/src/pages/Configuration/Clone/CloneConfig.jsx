import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../../../api/apiClient';
import styles from './Clone.module.css';
import { useLanguage } from '../../../context/LanguageContext';
import { toast } from 'sonner';
import WizardLayout, { PhaseSummaryCard } from '../../../components/WizardLayout';
import Spinner from '../../../components/Spinner';
import {
    Download, LayoutDashboard, CheckSquare, FileJson,
    ArrowRight, Server, Rocket, Activity, Code, Network, Search, CheckCircle, Wifi, Cable, Users, ArrowLeft
} from 'lucide-react';


const Cloner = () => {
    const { t } = useLanguage();
    // --- 1. Quản lý State ---
    const [sourceSites, setSourceSites] = useState([]);
    const [selectedSourceId, setSelectedSourceId] = useState('');
    const [sourceZoneFilter, setSourceZoneFilter] = useState('all');
    const [sourceSearchTerm, setSourceSearchTerm] = useState('');
    const [fetchLoading, setFetchLoading] = useState(false);
    const [fetchError, setFetchError] = useState('');

    const [previewOps, setPreviewOps] = useState([]);
    const [selectedOpsIndices, setSelectedOpsIndices] = useState(new Set());

    const [targetSites, setTargetSites] = useState([]);
    const [selectedTargetIds, setSelectedTargetIds] = useState(new Set());
    const [searchTargetTerm, setSearchTargetTerm] = useState('');
    const [zones, setZones] = useState([]);
    const [selectedZone, setSelectedZone] = useState('all');
    const [executionLoading, setExecutionLoading] = useState(false);
    const [executionResult, setExecutionResult] = useState(null);
    const [executionProgress, setExecutionProgress] = useState(0);
    const [executionLogs, setExecutionLogs] = useState([]);
    const [isStopping, setIsStopping] = useState(false);
    const stopRef = useRef(false);

    const [modalData, setModalData] = useState(null);
    const [currentStep, setCurrentStep] = useState(0); // 0-indexed now

    // --- 2. Khởi tạo & Đồng bộ hóa ---
    useEffect(() => {
        loadSourceSites();
        loadTargetSites();
        loadZones();
    }, []);

    // --- 3. Các hàm Logic xử lý API ---
    const loadSourceSites = async () => {
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
            const endpoint = (userRole === 'tenant_admin') ? '/zones' : '/zones/my';
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
                source: 'live'
            });
            const ops = Array.isArray(res.data?.operations) ? res.data.operations : [];
            setPreviewOps(ops);
            setSelectedOpsIndices(new Set(ops.map((_, i) => i)));
            setCurrentStep(1); // Move to Phase 2
        } catch (error) {
            setFetchError(error.response?.data?.detail || 'Lỗi khi lấy cấu hình.');
        } finally {
            setFetchLoading(false);
        }
    };

    const handleExecuteClone = async () => {
        if (selectedTargetIds.size === 0) {
            toast.error('Vui lòng chọn ít nhất 1 Site đích.');
            return;
        }

        const hasReadOnlyTarget = Array.from(selectedTargetIds).some(id => {
            const site = targetSites.find(s => s.siteId === id);
            const role = (site?.role || '').toLowerCase();
            return role !== 'administrator' && role !== 'admin';
        });
        if (hasReadOnlyTarget) {
            toast.error('Bạn không có quyền Administrator trên Site đích đã chọn.');
            return;
        }

        const opsToRun = previewOps.filter((_, i) => selectedOpsIndices.has(i));
        const ssidNames = opsToRun.map(op => op.name || op.payload?.networkName || 'Unknown');
        const targetIds = Array.from(selectedTargetIds);

        const plan = targetIds.map((siteId, idx) => {
            const siteInfo = targetSites.find(s => s.siteId === siteId);
            return {
                queueNumber: idx + 1,
                siteId,
                siteName: siteInfo?.siteName || siteId,
                ssidNames: [...ssidNames],
                status: 'WAITING',
                detail: '',
                opResults: [],
            };
        });

        setCurrentStep(2); // Move to Phase 3
        setExecutionLoading(true);
        setExecutionProgress(0);
        setExecutionLogs(plan);
        setExecutionResult(null);
        setIsStopping(false);
        stopRef.current = false;

        const batchResults = {};
        let siteSuccess = 0, sitePartial = 0, siteFailed = 0, siteSkipped = 0;

        for (let i = 0; i < targetIds.length; i++) {
            if (stopRef.current) {
                setExecutionLogs(prev => prev.map((entry, idx) =>
                    idx >= i ? { ...entry, status: 'STOPPED', detail: 'Đã dừng bởi người dùng' } : entry
                ));
                break;
            }

            const siteId = targetIds[i];
            setExecutionLogs(prev => prev.map((entry, idx) =>
                idx === i ? { ...entry, status: 'RUNNING', detail: 'Đang xử lý...' } : entry
            ));

            try {
                const res = await apiClient.post('/cloner/apply', {
                    target_site_ids: [siteId],
                    operations: opsToRun,
                });

                const siteOps = res.data?.results?.[siteId] || [];
                batchResults[siteId] = siteOps;

                const networkOps = siteOps.filter(op => op.type !== 'GUEST_PORTAL');
                const opSuccess = networkOps.filter(op => (op.status || '').includes('SUCCESS')).length;
                const opSkipped = networkOps.filter(op => (op.status || '').includes('SKIPPED')).length;
                const opFailed = networkOps.length - opSuccess - opSkipped;

                let siteStatus, detail;
                if (opSuccess === networkOps.length) {
                    siteStatus = 'SUCCESS';
                    detail = `${opSuccess}/${networkOps.length} SSIDs cloned`;
                    siteSuccess++;
                } else if (opSkipped === networkOps.length) {
                    siteStatus = 'SKIPPED';
                    detail = `Tất cả ${opSkipped} SSIDs đã tồn tại`;
                    siteSkipped++;
                } else if (opSuccess > 0) {
                    siteStatus = 'PARTIAL';
                    detail = `${opSuccess} ✓ · ${opSkipped} skip · ${opFailed} fail`;
                    sitePartial++;
                } else {
                    siteStatus = 'ERROR';
                    detail = `${opSkipped} skip · ${opFailed} fail`;
                    siteFailed++;
                }

                const portalOp = siteOps.find(op => op.type === 'GUEST_PORTAL');
                if (portalOp) {
                    detail += portalOp.status.includes('SUCCESS') ? ' + Portal ✓' : ' + Portal ✕';
                }

                setExecutionLogs(prev => prev.map((entry, idx) =>
                    idx === i ? { ...entry, status: siteStatus, detail, opResults: networkOps } : entry
                ));
            } catch (err) {
                const errMsg = err.response?.data?.detail || err.message;
                setExecutionLogs(prev => prev.map((entry, idx) =>
                    idx === i ? { ...entry, status: 'ERROR', detail: errMsg } : entry
                ));
                siteFailed++;
            }

            setExecutionProgress(Math.round(((i + 1) / targetIds.length) * 100));
            if (i < targetIds.length - 1) await new Promise(r => setTimeout(r, 500));
        }

        setExecutionResult({ results: batchResults });
        setExecutionLoading(false);

        if (!stopRef.current) {
            const total = targetIds.length;
            if (siteFailed === 0 && siteSkipped === 0 && sitePartial === 0) {
                toast.success(`Clone hoàn tất · ${siteSuccess}/${total} sites thành công`, { description: 'Tất cả sites đã được áp dụng thành công.', duration: 6000 });
            } else if (siteSuccess > 0 || sitePartial > 0) {
                toast.warning(`Clone xong · ${siteSuccess + sitePartial} OK · ${siteSkipped} bỏ qua · ${siteFailed} lỗi / ${total} sites`, { description: 'Một số sites đã có SSID trùng tên hoặc gặp lỗi.', duration: 8000 });
            } else {
                toast.error(`Clone thất bại · ${siteSkipped} bỏ qua · ${siteFailed} lỗi / ${total} sites`, { description: 'Không có site nào được clone thành công.', duration: 8000 });
            }
        }
    };

    const handleStop = () => {
        if (executionLoading) {
            setIsStopping(true);
            stopRef.current = true;
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

    // -- Helpers --
    const sourceSiteName = sourceSites.find(s => s.siteId === selectedSourceId)?.siteName || selectedSourceId;
    const selectedOpsCount = selectedOpsIndices.size;
    const selectedTargetsCount = selectedTargetIds.size;

    // -- Step navigation --
    const handleStepClick = (stepIdx) => {
        if (stepIdx < currentStep) {
            // Going back — reset downstream state
            if (stepIdx === 0) {
                // Back to source — keep selections but allow re-configure
                setCurrentStep(0);
            } else if (stepIdx === 1) {
                // Back to review — reset execution
                setExecutionLoading(false);
                setExecutionResult(null);
                setExecutionLogs([]);
                setExecutionProgress(0);
                setCurrentStep(1);
            }
        }
    };

    // --- WIZARD STEPS ---
    const wizardSteps = [
        { label: t('cloner.steps.source'), icon: Server },
        { label: t('cloner.steps.review'), icon: CheckSquare },
        { label: t('cloner.steps.execute'), icon: Rocket },
    ];

    // --- SUMMARY CARDS ---
    const buildSummaryCards = () => {
        const cards = [];

        // Phase 1 summary (shown in Phase 2 and 3)
        if (currentStep >= 1) {
            cards.push(
                <PhaseSummaryCard
                    key="ph1"
                    phaseNumber={1}
                    phaseLabel={t('cloner.steps.source')}
                    icon={Server}
                    accentColor="indigo"
                    onBack={!executionLoading ? () => handleStepClick(0) : undefined}
                >
                    <div className="flex items-center gap-3 mt-2">
                        <div className="w-9 h-9 rounded-xl bg-indigo-500/10 flex items-center justify-center">
                            <Server size={16} className="text-indigo-500" />
                        </div>
                        <div>
                            <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{sourceSiteName}</p>
                            <p className="text-[10px] text-slate-400 font-mono">{selectedSourceId}</p>
                        </div>
                        <span className="ml-auto px-3 py-1 rounded-lg bg-blue-500/10 text-blue-500 text-[10px] font-black border border-blue-500/20">
                            {previewOps.length} ops detected
                        </span>
                    </div>
                </PhaseSummaryCard>
            );
        }

        // Phase 2 summary (shown in Phase 3)
        if (currentStep >= 2) {
            cards.push(
                <PhaseSummaryCard
                    key="ph2"
                    phaseNumber={2}
                    phaseLabel={t('cloner.steps.review')}
                    icon={CheckSquare}
                    accentColor="emerald"
                    onBack={!executionLoading ? () => handleStepClick(1) : undefined}
                >
                    <div className="mt-2 space-y-2">
                        <div className="flex items-center gap-4 text-xs">
                            <span className="text-slate-500">Operations:</span>
                            <span className="font-bold text-slate-700 dark:text-slate-200">{selectedOpsCount} / {previewOps.length} selected</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                            {previewOps.filter((_, i) => selectedOpsIndices.has(i)).slice(0, 6).map((op, i) => (
                                <span key={i} className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-white/5 text-[10px] font-bold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-white/10">
                                    {op.name}
                                </span>
                            ))}
                            {selectedOpsCount > 6 && <span className="text-[10px] text-slate-400 self-center">+{selectedOpsCount - 6} more</span>}
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                            <span className="text-slate-500">Targets:</span>
                            <span className="font-bold text-slate-700 dark:text-slate-200">{selectedTargetsCount} sites</span>
                        </div>
                    </div>
                </PhaseSummaryCard>
            );
        }

        return cards;
    };

    // --- FOOTER ---
    const buildFooter = () => {
        if (currentStep === 0) {
            return (
                <div className="flex justify-end">
                    <button
                        onClick={handleFetchConfig}
                        disabled={!selectedSourceId || fetchLoading}
                        className="px-8 h-12 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-black uppercase tracking-[0.15em] text-xs rounded-2xl shadow-xl hover:scale-[1.02] transition-all active:scale-95 disabled:opacity-30 flex items-center gap-2"
                    >
                        {fetchLoading ? <Spinner size="sm" /> : <Download size={16} />}
                        {fetchLoading ? t('cloner.decoding') : t('cloner.decode')}
                        <ArrowRight size={16} />
                    </button>
                </div>
            );
        }

        if (currentStep === 1) {
            return (
                <div className="flex justify-between items-center">
                    <button
                        onClick={() => handleStepClick(0)}
                        className="flex items-center gap-2 px-5 h-11 text-sm font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-white/5 transition-all"
                    >
                        <ArrowLeft size={16} /> {t('cloner.steps.source')}
                    </button>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => {
                                const filteredSites = targetSites.filter(site => {
                                    const matchesSearch = site.siteName.toLowerCase().includes(searchTargetTerm.toLowerCase());
                                    let matchesZone = true;
                                    if (selectedZone !== 'all') {
                                        const zoneObj = zones.find(z => String(z.id || z._id) === selectedZone);
                                        matchesZone = zoneObj ? (zoneObj.site_ids || []).includes(site.siteId) : false;
                                    }
                                    return matchesSearch && matchesZone;
                                });
                                const validSites = filteredSites.filter(s => getRoleBadgeInfo(s.role).canClone).map(s => s.siteId);
                                const allSelected = validSites.length > 0 && validSites.every(id => selectedTargetIds.has(id));
                                if (allSelected) {
                                    const newSet = new Set(selectedTargetIds);
                                    validSites.forEach(id => newSet.delete(id));
                                    setSelectedTargetIds(newSet);
                                } else {
                                    const newSet = new Set(selectedTargetIds);
                                    validSites.forEach(id => newSet.add(id));
                                    setSelectedTargetIds(newSet);
                                }
                            }}
                            className="px-4 h-11 rounded-xl font-bold text-xs bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 transition-colors"
                        >
                            {selectedTargetIds.size > 0 ? `Deselect All (${selectedTargetIds.size})` : "Select All Valid"}
                        </button>
                        <button
                            onClick={handleExecuteClone}
                            disabled={executionLoading || selectedTargetIds.size === 0 || selectedOpsIndices.size === 0}
                            className="px-8 h-12 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-black uppercase tracking-[0.15em] text-xs rounded-2xl shadow-xl hover:scale-[1.02] transition-all active:scale-95 disabled:opacity-30 flex items-center gap-2"
                        >
                            <Rocket size={16} /> {t('cloner.initiate')}
                        </button>
                    </div>
                </div>
            );
        }

        if (currentStep === 2) {
            return (
                <div className="flex justify-between items-center">
                    {!executionLoading && (
                        <button
                            onClick={() => handleStepClick(1)}
                            className="flex items-center gap-2 px-5 h-11 text-sm font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-white/5 transition-all"
                        >
                            <ArrowLeft size={16} /> Back to Review
                        </button>
                    )}
                    <div className="flex items-center gap-3 ml-auto">
                        {executionLoading && (
                            <button
                                onClick={handleStop}
                                disabled={isStopping}
                                className="px-5 h-11 rounded-xl font-bold text-xs bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/20 transition-all disabled:opacity-30"
                            >
                                {isStopping ? 'Stopping...' : 'Emergency Stop'}
                            </button>
                        )}
                        {executionResult && (
                            <button
                                onClick={() => window.location.reload()}
                                className="px-6 h-11 bg-slate-700 hover:bg-slate-600 text-white font-bold text-xs rounded-xl flex items-center gap-2"
                            >
                                Done / Reload
                            </button>
                        )}
                    </div>
                </div>
            );
        }
        return null;
    };

    // --- 4. Giao diện ---
    return (
        <div className={`relative w-full h-full min-h-[700px] ${styles.clonerWrapper}`}>
            <WizardLayout
                steps={wizardSteps}
                currentStep={currentStep}
                onStepClick={handleStepClick}
                accentColor="blue"
                title={t('cloner.title')}
                subtitle={t('cloner.subtitle')}
                titleIcon={Download}
                summaryCards={buildSummaryCards()}
                footer={buildFooter()}
            >
                {/* ═══════════════════════ PHASE 1: Source Selection ═══════════════════════ */}
                {currentStep === 0 && (
                    <div className="max-w-3xl mx-auto space-y-6">
                        {/* Source Site Selector */}
                        <div className="space-y-3">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                                <Server size={12} /> {t('cloner.origin_site') || 'Site nguồn'}
                            </label>

                            <div className="flex gap-2">
                                <select
                                    value={sourceZoneFilter}
                                    onChange={e => setSourceZoneFilter(e.target.value)}
                                    className="h-11 bg-white dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl px-3 text-slate-800 dark:text-white text-xs font-bold focus:outline-none min-w-[140px] appearance-none"
                                >
                                    <option value="all">All Zones</option>
                                    {zones.map(z => (
                                        <option key={z.id || z._id} value={z.id || z._id}>{z.name}</option>
                                    ))}
                                </select>
                                <div className="relative flex-1">
                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                        <Search size={14} className="text-slate-400" />
                                    </div>
                                    <input
                                        type="text"
                                        placeholder="Search source site..."
                                        value={sourceSearchTerm}
                                        onChange={e => setSourceSearchTerm(e.target.value)}
                                        className="w-full h-11 bg-white dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl pl-9 pr-4 text-slate-800 dark:text-white text-xs font-medium focus:outline-none focus:border-blue-500/50 transition-all"
                                    />
                                </div>
                            </div>

                            {/* Site list — full height */}
                            <div className="bg-white dark:bg-black/20 border border-slate-200 dark:border-white/5 rounded-2xl overflow-hidden max-h-[440px] overflow-y-auto custom-scrollbar">
                                {(() => {
                                    const filtered = sourceSites.filter(site => {
                                        const matchesSearch = (site.siteName || '').toLowerCase().includes(sourceSearchTerm.toLowerCase());
                                        let matchesZone = true;
                                        if (sourceZoneFilter !== 'all') {
                                            const zoneObj = zones.find(z => String(z.id || z._id) === sourceZoneFilter);
                                            matchesZone = zoneObj ? (zoneObj.site_ids || []).includes(site.siteId || site.id) : false;
                                        }
                                        return matchesSearch && matchesZone;
                                    }).sort((a, b) => (a.siteName || '').localeCompare(b.siteName || ''));
                                    if (filtered.length === 0) {
                                        return (
                                            <div className="p-6 text-center text-slate-400 dark:text-slate-600 text-xs">
                                                No sites found
                                            </div>
                                        );
                                    }
                                    return filtered.map(site => {
                                        const isSelected = selectedSourceId === site.siteId;
                                        const tpl = site.template;
                                        return (
                                            <div
                                                key={site.siteId}
                                                onClick={() => setSelectedSourceId(site.siteId)}
                                                className={`flex items-center justify-between px-4 py-3.5 cursor-pointer transition-all border-b border-slate-100 dark:border-white/5 last:border-b-0 ${
                                                    isSelected
                                                        ? 'bg-blue-50 dark:bg-blue-500/10'
                                                        : 'hover:bg-slate-50 dark:hover:bg-white/5'
                                                }`}
                                            >
                                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                                    <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                                                        isSelected ? 'bg-blue-500' : 'bg-slate-300 dark:bg-slate-600'
                                                    }`} />
                                                    <span className={`text-sm font-semibold truncate ${
                                                        isSelected ? 'text-blue-700 dark:text-blue-300' : 'text-slate-700 dark:text-slate-200'
                                                    }`}>
                                                        {site.siteName}
                                                    </span>
                                                    {tpl && (
                                                        <span
                                                            className="shrink-0 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border"
                                                            style={{
                                                                borderColor: `${tpl.color || '#6366f1'}30`,
                                                                backgroundColor: `${tpl.color || '#6366f1'}10`,
                                                                color: tpl.color || '#6366f1'
                                                            }}
                                                        >
                                                            {tpl.name}
                                                        </span>
                                                    )}
                                                </div>
                                                {isSelected && <CheckCircle size={16} className="text-blue-500 shrink-0" />}
                                            </div>
                                        );
                                    });
                                })()}
                            </div>

                            {selectedSourceId && (
                                <div className="flex items-center gap-2 text-[10px] font-bold text-blue-600 dark:text-blue-400">
                                    <CheckCircle size={12} />
                                    Selected: {sourceSiteName}
                                </div>
                            )}
                        </div>

                        {fetchError && <p className="text-rose-500 text-xs font-bold text-center italic">{fetchError}</p>}
                    </div>
                )}

                {/* ═══════════════════════ PHASE 2: Review & Target ═══════════════════════ */}
                {currentStep === 1 && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* Operation Preview List */}
                        <div className="bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 rounded-2xl p-6 flex flex-col max-h-[500px]">
                            <div className="flex justify-between items-center mb-5">
                                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 flex items-center gap-2">
                                    <Activity size={14} className="text-blue-500" /> {t('cloner.blueprint_elements')}
                                </h3>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => {
                                            if (selectedOpsIndices.size === previewOps.length) setSelectedOpsIndices(new Set());
                                            else setSelectedOpsIndices(new Set(previewOps.map((_, i) => i)));
                                        }}
                                        className="px-3 py-1.5 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-white rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors border border-slate-200 dark:border-white/10"
                                    >
                                        {selectedOpsIndices.size === previewOps.length && previewOps.length > 0 ? t('cloner.deselect_all') : t('cloner.select_all')}
                                    </button>
                                    <span className="px-2.5 py-1 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-lg text-[10px] font-black border border-blue-200 dark:border-blue-500/20">{previewOps.length} {t('cloner.detected')}</span>
                                </div>
                            </div>
                            <div className="flex-1 overflow-y-auto pr-2 space-y-2 custom-scrollbar">
                                {previewOps.map((op, idx) => (
                                    <div key={idx} className="p-3.5 bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl flex items-center justify-between group hover:border-slate-300 dark:hover:border-white/20 transition-all">
                                        <div className="flex items-center gap-3">
                                            <input
                                                type="checkbox"
                                                checked={selectedOpsIndices.has(idx)}
                                                onChange={() => setSelectedOpsIndices(prev => toggleSetItem(prev, idx))}
                                                className="w-4 h-4 rounded border-slate-300 dark:border-white/10 bg-white dark:bg-white/5 text-blue-600 focus:ring-0"
                                            />
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    {getOpIcon(op.type)}
                                                    <span className="text-sm font-bold text-slate-800 dark:text-white">{op.name}</span>
                                                </div>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    <span className="text-[9px] font-mono text-slate-500 dark:text-slate-600 uppercase tracking-widest">{op.type}</span>
                                                    {op.payload?._guest_portal_settings && (
                                                        <span className="px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[8px] font-bold border border-emerald-200 dark:border-emerald-500/20 uppercase tracking-widest flex items-center gap-1">
                                                            <FileJson size={8} /> + GUEST
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

                        {/* Target Selection */}
                        <div className="bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 rounded-2xl p-6 flex flex-col max-h-[500px]">
                            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 mb-4 flex items-center gap-2">
                                <Network size={14} className="text-emerald-500" /> {t('cloner.target_deployment')}
                            </h3>

                            <div className="flex gap-2 mb-3 shrink-0">
                                <div className="relative flex-1">
                                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input
                                        type="text"
                                        placeholder={t('cloner.search_destination')}
                                        value={searchTargetTerm}
                                        onChange={(e) => setSearchTargetTerm(e.target.value)}
                                        className="w-full h-10 text-sm bg-white dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl pl-9 pr-4 text-slate-800 dark:text-white focus:outline-none focus:border-emerald-500/50 transition-all placeholder:text-slate-400"
                                    />
                                </div>
                                <select
                                    value={selectedZone}
                                    onChange={(e) => setSelectedZone(e.target.value)}
                                    className="h-10 bg-white dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl px-3 text-slate-800 dark:text-white text-xs font-bold focus:outline-none min-w-[130px]"
                                >
                                    <option value="all">All Zones</option>
                                    {zones.map(z => (
                                        <option key={z.id || z._id} value={z.id || z._id}>{z.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="flex-1 overflow-y-auto pr-2 space-y-2 custom-scrollbar">
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
                                        <label key={site.siteId} className={`p-3.5 rounded-xl border flex items-center justify-between transition-all ${isReadOnly ? 'opacity-50 cursor-not-allowed bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/5 grayscale' : selectedTargetIds.has(site.siteId) ? 'bg-emerald-50 dark:bg-emerald-600/10 border-emerald-500 shadow-sm cursor-pointer' : 'bg-white dark:bg-black/40 border-slate-200 dark:border-white/5 hover:border-slate-300 dark:hover:border-white/10 cursor-pointer'}`}>
                                            <div className="flex flex-col min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className={`text-sm font-bold truncate ${selectedTargetIds.has(site.siteId) ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-300'}`}>{site.siteName}</span>
                                                    <span className={`px-2 py-0.5 rounded-md border text-[9px] font-black uppercase tracking-widest ${roleInfo.classes}`}>{roleInfo.text}</span>
                                                </div>
                                                <span className="text-[9px] font-mono text-slate-400 dark:text-slate-600 mt-0.5">{site.siteId}</span>
                                            </div>
                                            <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${selectedTargetIds.has(site.siteId) ? 'border-emerald-500 bg-emerald-100 dark:bg-emerald-500/20' : 'border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-black/50'}`}>
                                                {selectedTargetIds.has(site.siteId) && <div className="w-3 h-3 rounded-sm bg-emerald-500 dark:bg-emerald-400" />}
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
                        </div>
                    </div>
                )}

                {/* ═══════════════════════ PHASE 3: Execution ═══════════════════════ */}
                {currentStep === 2 && (
                    <div className="space-y-6">
                        {/* Progress */}
                        <div className="space-y-3">
                            <div className="flex justify-between items-end">
                                <span className="text-[10px] font-black uppercase text-slate-400">
                                    {executionLoading
                                        ? `Processing... (${executionLogs.filter(l => !['WAITING', 'RUNNING'].includes(l.status)).length}/${executionLogs.length} sites)`
                                        : executionResult ? `Done · ${executionLogs.filter(l => l.status === 'SUCCESS').length} success` : 'Ready to execute'}
                                </span>
                                <span className="text-lg font-mono font-black text-emerald-500">{executionProgress}%</span>
                            </div>
                            <div className="w-full h-3 bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden border border-slate-200 dark:border-white/5">
                                <div
                                    className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500 shadow-[0_0_10px_rgba(16,185,129,0.4)]"
                                    style={{ width: `${executionProgress}%` }}
                                />
                            </div>
                        </div>

                        {/* Summary Counters */}
                        {executionLogs.length > 0 && (
                            <div className="flex items-center gap-4 text-[9px] font-black uppercase tracking-widest">
                                <span className="text-slate-400 flex items-center gap-1"><Server size={10} /> {executionLogs.length} total</span>
                                <span className="text-emerald-500">{executionLogs.filter(l => l.status === 'SUCCESS').length} ✓</span>
                                <span className="text-amber-500">{executionLogs.filter(l => l.status === 'SKIPPED').length} skip</span>
                                <span className="text-blue-500">{executionLogs.filter(l => l.status === 'PARTIAL').length} partial</span>
                                <span className="text-rose-500">{executionLogs.filter(l => l.status === 'ERROR').length} ✕</span>
                                <span className="text-slate-400">{executionLogs.filter(l => l.status === 'WAITING').length} waiting</span>
                            </div>
                        )}

                        {/* Execution Queue */}
                        {executionLogs.length > 0 && (
                            <div className="bg-white dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-2xl overflow-hidden">
                                <div className="px-5 py-3 border-b border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-white/[0.03] flex items-center gap-3">
                                    <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                                        <Activity size={14} className="text-emerald-500" />
                                    </div>
                                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-300">
                                        Execution Queue
                                    </span>
                                </div>
                                <div className="max-h-[450px] overflow-y-auto custom-scrollbar p-2.5 space-y-2">
                                    {executionLogs.map((entry, idx) => {
                                        const statusConfig = {
                                            WAITING:  { badge: 'bg-slate-100 dark:bg-white/5 text-slate-400 border-slate-200 dark:border-white/10', dot: 'bg-slate-300 dark:bg-slate-600', label: 'Chờ', icon: '⏳' },
                                            RUNNING:  { badge: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20 animate-pulse', dot: 'bg-blue-500 animate-pulse', label: 'Đang xử lý', icon: '⚡' },
                                            SUCCESS:  { badge: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20', dot: 'bg-emerald-500', label: 'Thành công', icon: '✓' },
                                            SKIPPED:  { badge: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20', dot: 'bg-amber-500', label: 'Bỏ qua', icon: '⊘' },
                                            PARTIAL:  { badge: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20', dot: 'bg-blue-500', label: 'Một phần', icon: '◐' },
                                            ERROR:    { badge: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20', dot: 'bg-rose-500', label: 'Lỗi', icon: '✕' },
                                            STOPPED:  { badge: 'bg-slate-500/10 text-slate-500 border-slate-500/20', dot: 'bg-slate-400', label: 'Đã dừng', icon: '■' },
                                        };
                                        const cfg = statusConfig[entry.status] || statusConfig.WAITING;

                                        return (
                                            <div key={idx} className={`rounded-xl border transition-all duration-300 ${
                                                entry.status === 'RUNNING' ? 'bg-blue-50/70 dark:bg-blue-500/[0.06] border-blue-200 dark:border-blue-500/15' :
                                                entry.status === 'SUCCESS' ? 'bg-emerald-50/30 dark:bg-emerald-500/[0.03] border-emerald-100 dark:border-emerald-500/10' :
                                                entry.status === 'ERROR' ? 'bg-rose-50/30 dark:bg-rose-500/[0.03] border-rose-100 dark:border-rose-500/10' :
                                                'bg-white dark:bg-white/[0.02] border-slate-100 dark:border-white/5'
                                            }`}>
                                                <div className="flex items-center gap-3 px-4 py-3.5">
                                                    <span className="w-8 h-8 rounded-lg flex items-center justify-center text-[11px] font-black shrink-0 border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-600 dark:text-slate-300">
                                                        {entry.queueNumber}
                                                    </span>
                                                    <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${cfg.dot}`} />
                                                    <div className="flex-1 min-w-0">
                                                        <div className="text-[13px] font-bold text-slate-700 dark:text-slate-200 truncate">{entry.siteName}</div>
                                                        {entry.ssidNames?.length > 0 && (
                                                            <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 flex flex-wrap gap-x-1.5">
                                                                {entry.ssidNames.map((name, ni) => (
                                                                    <span key={ni}>{ni > 0 ? ' · ' : ''}{name}</span>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <span className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider border shrink-0 flex items-center gap-1.5 ${cfg.badge}`}>
                                                        <span>{cfg.icon}</span> {cfg.label}
                                                    </span>
                                                </div>
                                                {entry.detail && entry.status !== 'WAITING' && (
                                                    <div className="px-4 pb-3.5 ml-11">
                                                        <span className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">{entry.detail}</span>
                                                        {entry.opResults?.length > 0 && entry.status !== 'RUNNING' && (
                                                            <div className="mt-2 flex flex-wrap gap-1.5">
                                                                {entry.opResults.map((op, opIdx) => {
                                                                    const isOk = (op.status || '').includes('SUCCESS');
                                                                    const isSkip = (op.status || '').includes('SKIPPED');
                                                                    return (
                                                                        <span key={opIdx} className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[9px] font-bold border ${
                                                                            isOk ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20' :
                                                                            isSkip ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-500/20' :
                                                                            'bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-500/20'
                                                                        }`}>
                                                                            {isOk ? '✓' : isSkip ? '⊘' : '✕'} {op.name}
                                                                        </span>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </WizardLayout>

            {/* Modal: JSON Inspector */}
            {modalData && (
                <div className="absolute inset-0 z-[100] flex items-center justify-center p-8 bg-slate-900/60 dark:bg-black/90 backdrop-blur-md animate-fade-in rounded-xl">
                    <div className="w-full max-w-4xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-3xl overflow-hidden shadow-2xl flex flex-col">
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
            )}

            <style>{`
                @keyframes fade-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
                .animate-fade-in { animation: fade-in 0.4s ease-out forwards; }
                .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.1); border-radius: 10px; }
                .dark .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.05); }
            `}</style>
        </div>
    );
};

export default Cloner;
