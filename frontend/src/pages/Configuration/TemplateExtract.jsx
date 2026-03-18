import React, { useState } from 'react';
import apiClient from '../../api/apiClient';
import { toast } from 'sonner';
import WizardLayout, { PhaseSummaryCard } from '../../components/WizardLayout';
import Spinner from '../../components/Spinner';
import SiteSelector from './Update/SiteSelector';
import {
    Download, Server, Palette, FileCode, CheckCircle,
    ChevronRight, Info, Layout, ArrowLeft
} from 'lucide-react';

const PRESET_COLORS = [
    '#10B981', '#3B82F6', '#8B5CF6', '#F59E0B', '#EF4444',
    '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'
];

const TemplateExtract = ({ sites = [], onClose, onSuccess }) => {
    const [currentStep, setCurrentStep] = useState(0);

    const [selectedSourceId, setSelectedSourceId] = useState('');

    const [templateName, setTemplateName] = useState('');
    const [templateDesc, setTemplateDesc] = useState('');
    const [templateColor, setTemplateColor] = useState('#10B981');
    const [extracting, setExtracting] = useState(false);
    const [extractError, setExtractError] = useState('');
    const [extractSuccess, setExtractSuccess] = useState(false);

    const liveSites = (sites || []).map(s => ({
        siteId: s.siteId || s.id || s._id,
        siteName: s.siteName || s.name || 'Unnamed',
        role: s.role || 'unknown',
    })).sort((a, b) => a.siteName.localeCompare(b.siteName));

    const selectedSite = liveSites.find(s => s.siteId === selectedSourceId);

    const handleProceedToConfig = () => {
        if (!selectedSourceId) { toast.error('Vui lòng chọn site nguồn.'); return; }
        if (!templateName && selectedSite) {
            setTemplateName(`Template - ${selectedSite.siteName}`);
            setTemplateDesc(`Trích xuất từ ${selectedSite.siteName}`);
        }
        setCurrentStep(1);
    };

    const handleExtract = async () => {
        if (!templateName.trim()) { setExtractError('Tên template không được để trống.'); return; }
        setExtracting(true);
        setExtractError('');
        try {
            await apiClient.post('/templates/extract', {
                source_site_id: selectedSourceId,
                name: templateName.trim(),
                description: templateDesc,
                color: templateColor,
            });
            setExtractSuccess(true);
            toast.success('Trích xuất template thành công!', { duration: 4000 });
            onSuccess?.();
        } catch (err) {
            setExtractError(err.response?.data?.detail || 'Không thể trích xuất config từ site.');
        } finally {
            setExtracting(false);
        }
    };

    const handleStepClick = (stepIdx) => {
        if (stepIdx < currentStep && !extracting) {
            setExtractError('');
            setCurrentStep(stepIdx);
        }
    };

    const wizardSteps = [
        { label: 'Select Source', icon: Server },
        { label: 'Configure & Extract', icon: Download },
    ];

    const buildSummaryCards = () => {
        const cards = [];
        if (currentStep >= 1) {
            cards.push(
                <PhaseSummaryCard key="ph1" phaseNumber={1} phaseLabel="Select Source" icon={Server} accentColor="blue"
                    onBack={!extracting ? () => handleStepClick(0) : undefined}>
                    <div className="mt-1 flex items-center gap-2 text-xs">
                        <span className="text-slate-500">Source:</span>
                        <span className="font-bold text-blue-600 dark:text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-lg border border-blue-500/20 text-[11px]">
                            {selectedSite?.siteName || '—'}
                        </span>
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
                    <button onClick={onClose}
                        className="flex items-center gap-2 px-4 h-10 text-sm font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-white/5 transition-all">
                        <ArrowLeft size={16} /> Back
                    </button>
                    <button onClick={handleProceedToConfig} disabled={!selectedSourceId}
                        className="px-6 h-10 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-black uppercase tracking-[0.12em] text-[11px] rounded-xl shadow-lg hover:scale-[1.02] transition-all active:scale-95 disabled:opacity-30 flex items-center gap-2">
                        Next <ChevronRight size={14} />
                    </button>
                </div>
            );
        }
        if (currentStep === 1) {
            return (
                <div className="flex justify-between items-center">
                    <button onClick={() => handleStepClick(0)} disabled={extracting}
                        className="flex items-center gap-2 px-4 h-10 text-sm font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-white/5 transition-all disabled:opacity-30">
                        <ArrowLeft size={16} /> Back
                    </button>
                    {!extractSuccess ? (
                        <button onClick={handleExtract} disabled={extracting || !templateName.trim()}
                            className="px-6 h-10 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-black uppercase tracking-[0.12em] text-[11px] rounded-xl shadow-lg hover:scale-[1.02] transition-all active:scale-95 disabled:opacity-30 flex items-center gap-2">
                            {extracting ? <Spinner size="sm" /> : <Download size={14} />}
                            {extracting ? 'Extracting...' : 'Extract & Create'}
                        </button>
                    ) : (
                        <button onClick={onClose}
                            className="px-6 h-10 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-black uppercase tracking-[0.12em] text-[11px] rounded-xl shadow-lg hover:scale-[1.02] transition-all active:scale-95 flex items-center gap-2">
                            <CheckCircle size={14} /> Done
                        </button>
                    )}
                </div>
            );
        }
        return null;
    };

    return (
        <WizardLayout
            steps={wizardSteps}
            currentStep={currentStep}
            onStepClick={handleStepClick}
            accentColor="blue"
            title="Extract Template"
            subtitle="Đọc config từ site → Lưu thành reusable template."
            titleIcon={Download}
            summaryCards={buildSummaryCards()}
            footer={buildFooter()}
        >
            {/* ═══════ PHASE 1: Select Source ═══════ */}
            {currentStep === 0 && (
                <div className="space-y-4 max-w-xl mx-auto">
                    <div className="bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 rounded-2xl p-5 shadow-sm">
                        <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-4 flex items-center gap-2">
                            <Server size={14} className="text-blue-500" /> Select Source Site
                        </h3>

                        <SiteSelector
                            sites={liveSites}
                            value={selectedSourceId}
                            onChange={setSelectedSourceId}
                            placeholder="-- Select source site --"
                            accentColor="blue"
                        />

                        {selectedSourceId && selectedSite && (
                            <div className="mt-4 p-3 bg-blue-500/5 border border-blue-500/15 rounded-xl flex items-center gap-3">
                                <div className="w-8 h-8 bg-blue-500/10 rounded-lg flex items-center justify-center text-blue-500">
                                    <Server size={14} />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-bold text-slate-800 dark:text-white truncate">{selectedSite.siteName}</p>
                                    <p className="text-[9px] font-mono text-slate-400">{selectedSourceId}</p>
                                </div>
                                <CheckCircle size={14} className="text-blue-500 shrink-0" />
                            </div>
                        )}
                    </div>

                    <div className="flex items-start gap-2.5 p-3.5 bg-amber-500/5 border border-amber-500/10 rounded-xl">
                        <FileCode size={14} className="text-amber-500 mt-0.5 shrink-0" />
                        <p className="text-[10px] text-amber-600 dark:text-amber-400/80 leading-relaxed font-bold">
                            Hệ thống sẽ đọc <strong>networks</strong> (SSIDs, VLANs, security) và <strong>guest portal</strong> config.
                            Không lấy thông tin devices / client data.
                        </p>
                    </div>
                </div>
            )}

            {/* ═══════ PHASE 2: Configure & Extract ═══════ */}
            {currentStep === 1 && (
                <div className="space-y-4 max-w-xl mx-auto">
                    {extractError && (
                        <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-500 font-bold flex items-center gap-2">
                            <Info size={12} /> {extractError}
                        </div>
                    )}

                    {extractSuccess ? (
                        <div className="bg-white dark:bg-white/[0.03] border border-emerald-200 dark:border-emerald-500/20 rounded-2xl p-6 shadow-sm text-center space-y-4">
                            <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center text-emerald-500 mx-auto">
                                <CheckCircle size={32} />
                            </div>
                            <div>
                                <h3 className="text-lg font-black text-slate-900 dark:text-white">Trích xuất thành công!</h3>
                                <p className="text-xs text-slate-500 mt-1">Template "<strong>{templateName}</strong>" đã được tạo từ site {selectedSite?.siteName}.</p>
                            </div>
                            <div className="flex items-center justify-center gap-2">
                                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: templateColor }} />
                                <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border"
                                    style={{ borderColor: `${templateColor}50`, backgroundColor: `${templateColor}15`, color: templateColor }}>
                                    {templateName}
                                </span>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 rounded-2xl p-5 shadow-sm space-y-4">
                            <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                                <Layout size={14} className="text-blue-500" /> Template Configuration
                            </h3>

                            {/* Name */}
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Template Name *</label>
                                <input autoFocus required type="text" maxLength={80}
                                    className="w-full h-10 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl px-4 text-sm font-bold focus:border-blue-500/50 transition-all outline-none"
                                    placeholder="VD: Resort Standard, Office V1..."
                                    value={templateName} onChange={e => setTemplateName(e.target.value)} />
                            </div>

                            {/* Description */}
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Description</label>
                                <textarea rows={2}
                                    className="w-full p-3 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl text-sm font-bold focus:border-blue-500/50 transition-all outline-none resize-none"
                                    placeholder="Mô tả ngắn (tùy chọn)..."
                                    value={templateDesc} onChange={e => setTemplateDesc(e.target.value)} />
                            </div>

                            {/* Color picker */}
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
                                    <Palette size={11} /> Color
                                </label>
                                <div className="flex flex-wrap gap-1.5">
                                    {PRESET_COLORS.map(c => (
                                        <button key={c} type="button" onClick={() => setTemplateColor(c)}
                                            className={`w-7 h-7 rounded-lg transition-all border-2 ${templateColor === c ? 'border-white scale-110 shadow-lg' : 'border-transparent'}`}
                                            style={{ backgroundColor: c }} />
                                    ))}
                                    <input type="color" className="w-7 h-7 rounded-lg border-none cursor-pointer overflow-hidden bg-transparent"
                                        value={templateColor} onChange={e => setTemplateColor(e.target.value)} title="Custom" />
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Preview:</span>
                                    <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border"
                                        style={{ borderColor: `${templateColor}50`, backgroundColor: `${templateColor}15`, color: templateColor }}>
                                        {templateName || 'TEMPLATE'}
                                    </span>
                                </div>
                            </div>

                            {/* Summary */}
                            <div className="p-3 bg-blue-500/5 border border-blue-500/10 rounded-xl">
                                <p className="text-[9px] font-black uppercase tracking-widest text-blue-500 mb-1.5">Summary</p>
                                <div className="grid grid-cols-2 gap-1.5">
                                    {[
                                        { label: 'Source', value: selectedSite?.siteName || '—' },
                                        { label: 'Name', value: templateName || '—' },
                                    ].map(row => (
                                        <div key={row.label} className="flex flex-col">
                                            <span className="text-[8px] font-bold text-slate-400 uppercase">{row.label}</span>
                                            <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200 truncate">{row.value}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </WizardLayout>
    );
};

export default TemplateExtract;
