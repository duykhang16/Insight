import React, { useState, useEffect, useRef } from 'react';
import useRealisticProgress from '../../../hooks/useRealisticProgress';
import apiClient from '../../../api/apiClient';
import styles from './Clone.module.css';
import { useLanguage } from '../../../context/LanguageContext';
import { toast } from 'sonner';
import WizardLayout, { PhaseSummaryCard } from '../../../components/WizardLayout';
import Spinner from '../../../components/Spinner';
import {
    Download, CheckSquare, ArrowRight, Server, Rocket, Code,
    ArrowLeft,
} from 'lucide-react';

import { getRoleBadgeInfo, loadSitesFromApi, loadZonesFromApi } from '../utils';
import { SourceSelect, ReviewTarget, CloneExecution } from './phases';

const Cloner = () => {
    const { t } = useLanguage();

    // ── State ──
    const [currentStep, setCurrentStep] = useState(0);

    // Phase 1: Source Selection
    const [sourceSites, setSourceSites] = useState([]);
    const [selectedSourceId, setSelectedSourceId] = useState('');
    const [sourceZoneFilter, setSourceZoneFilter] = useState('all');
    const [sourceSearchTerm, setSourceSearchTerm] = useState('');
    const [fetchLoading, setFetchLoading] = useState(false);
    const [fetchError, setFetchError] = useState('');

    // Phase 2: Review & Target
    const [previewOps, setPreviewOps] = useState([]);
    const [selectedOpsIndices, setSelectedOpsIndices] = useState(new Set());
    const [targetSites, setTargetSites] = useState([]);
    const [selectedTargetIds, setSelectedTargetIds] = useState(new Set());
    const [searchTargetTerm, setSearchTargetTerm] = useState('');
    const [zones, setZones] = useState([]);
    const [selectedZone, setSelectedZone] = useState('all');
    const [modalData, setModalData] = useState(null);

    // Phase 3: Execution
    const [executionLoading, setExecutionLoading] = useState(false);
    const [executionResult, setExecutionResult] = useState(null);
    const prog = useRealisticProgress();
    const [executionLogs, setExecutionLogs] = useState([]);
    const [isStopping, setIsStopping] = useState(false);
    const stopRef = useRef(false);

    // ── Init ──
    useEffect(() => {
        loadSitesFromApi(apiClient).then(setSourceSites).catch(() => setSourceSites([]));
        loadSitesFromApi(apiClient).then(setTargetSites).catch(() => setTargetSites([]));
        loadZonesFromApi(apiClient).then(setZones).catch(() => {});
    }, []);

    // ── Derived ──
    const sourceSiteName = sourceSites.find(s => s.siteId === selectedSourceId)?.siteName || selectedSourceId;
    const selectedOpsCount = selectedOpsIndices.size;
    const selectedTargetsCount = selectedTargetIds.size;

    // ── API Handlers ──
    const handleFetchConfig = async () => {
        if (!selectedSourceId) return;
        setFetchLoading(true);
        setFetchError('');
        try {
            const res = await apiClient.post('/cloner/preview', { site_id: selectedSourceId, source: 'live' });
            const ops = Array.isArray(res.data?.operations) ? res.data.operations : [];
            setPreviewOps(ops);
            setSelectedOpsIndices(new Set(ops.map((_, i) => i)));
            setCurrentStep(1);
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

        setCurrentStep(2);
        setExecutionLoading(true);
        prog.start();
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

            prog.setMilestone(Math.round(((i + 1) / targetIds.length) * 100));
            if (i < targetIds.length - 1) await new Promise(r => setTimeout(r, 500));
        }

        setExecutionResult({ results: batchResults });
        setExecutionLoading(false);
        prog.finish();

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

    // ── Step Navigation ──
    const handleStepClick = (stepIdx) => {
        if (stepIdx < currentStep) {
            if (stepIdx === 0) setCurrentStep(0);
            else if (stepIdx === 1) {
                setExecutionLoading(false);
                setExecutionResult(null);
                setExecutionLogs([]);
                prog.reset();
                setCurrentStep(1);
            }
        }
    };

    // ── Wizard Config ──
    const wizardSteps = [
        { label: t('cloner.steps.source'), icon: Server },
        { label: t('cloner.steps.review'), icon: CheckSquare },
        { label: t('cloner.steps.execute'), icon: Rocket },
    ];

    // ── Summary Cards ──
    const buildSummaryCards = () => {
        const cards = [];
        if (currentStep >= 1) {
            cards.push(
                <PhaseSummaryCard key="ph1" phaseNumber={1} phaseLabel={t('cloner.steps.source')} icon={Server} accentColor="indigo"
                    onBack={!executionLoading ? () => handleStepClick(0) : undefined}>
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
        if (currentStep >= 2) {
            cards.push(
                <PhaseSummaryCard key="ph2" phaseNumber={2} phaseLabel={t('cloner.steps.review')} icon={CheckSquare} accentColor="emerald"
                    onBack={!executionLoading ? () => handleStepClick(1) : undefined}>
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

    // ── Footer ──
    const buildFooter = () => {
        if (currentStep === 0) {
            return (
                <div className="flex justify-end">
                    <button onClick={handleFetchConfig} disabled={!selectedSourceId || fetchLoading}
                        className="px-8 h-12 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-black uppercase tracking-[0.15em] text-xs rounded-2xl shadow-xl hover:scale-[1.02] transition-all active:scale-95 disabled:opacity-30 flex items-center gap-2">
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
                    <button onClick={() => handleStepClick(0)}
                        className="flex items-center gap-2 px-5 h-11 text-sm font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-white/5 transition-all">
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
                            className="px-4 h-11 rounded-xl font-bold text-xs bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-slate-600 dark:text-slate-300 transition-colors">
                            {selectedTargetIds.size > 0 ? `Deselect All (${selectedTargetIds.size})` : "Select All Valid"}
                        </button>
                        <button onClick={handleExecuteClone}
                            disabled={executionLoading || selectedTargetIds.size === 0 || selectedOpsIndices.size === 0}
                            className="px-8 h-12 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-black uppercase tracking-[0.15em] text-xs rounded-2xl shadow-xl hover:scale-[1.02] transition-all active:scale-95 disabled:opacity-30 flex items-center gap-2">
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
                        <button onClick={() => handleStepClick(1)}
                            className="flex items-center gap-2 px-5 h-11 text-sm font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-white/5 transition-all">
                            <ArrowLeft size={16} /> Back to Review
                        </button>
                    )}
                    <div className="flex items-center gap-3 ml-auto">
                        {executionLoading && (
                            <button onClick={handleStop} disabled={isStopping}
                                className="px-5 h-11 rounded-xl font-bold text-xs bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/20 transition-all disabled:opacity-30">
                                {isStopping ? 'Stopping...' : 'Emergency Stop'}
                            </button>
                        )}
                        {executionResult && (
                            <button onClick={() => window.location.reload()}
                                className="px-6 h-11 bg-slate-700 hover:bg-slate-600 text-white font-bold text-xs rounded-xl flex items-center gap-2">
                                Done / Reload
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
                accentColor="blue"
                title={t('cloner.title')}
                subtitle={t('cloner.subtitle')}
                titleIcon={Download}
                summaryCards={buildSummaryCards()}
                footer={buildFooter()}
            >
                {currentStep === 0 && (
                    <SourceSelect
                        sourceSites={sourceSites}
                        selectedSourceId={selectedSourceId}
                        setSelectedSourceId={setSelectedSourceId}
                        sourceZoneFilter={sourceZoneFilter}
                        setSourceZoneFilter={setSourceZoneFilter}
                        sourceSearchTerm={sourceSearchTerm}
                        setSourceSearchTerm={setSourceSearchTerm}
                        zones={zones}
                        fetchError={fetchError}
                        t={t}
                    />
                )}

                {currentStep === 1 && (
                    <ReviewTarget
                        previewOps={previewOps}
                        selectedOpsIndices={selectedOpsIndices}
                        setSelectedOpsIndices={setSelectedOpsIndices}
                        targetSites={targetSites}
                        selectedTargetIds={selectedTargetIds}
                        setSelectedTargetIds={setSelectedTargetIds}
                        searchTargetTerm={searchTargetTerm}
                        setSearchTargetTerm={setSearchTargetTerm}
                        zones={zones}
                        selectedZone={selectedZone}
                        setSelectedZone={setSelectedZone}
                        setModalData={setModalData}
                        t={t}
                    />
                )}

                {currentStep === 2 && (
                    <CloneExecution
                        executionLogs={executionLogs}
                        executionProgress={prog.progress}
                        executionLoading={executionLoading}
                        executionResult={executionResult}
                    />
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
