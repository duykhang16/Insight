import React, { useState } from 'react';
import { ChevronRight, ChevronDown, ChevronUp, CheckCircle, ArrowLeft } from 'lucide-react';

/**
 * PhaseSummaryCard — Collapsed summary of a completed phase.
 * Shows a mini summary with expand/collapse for details.
 */
export const PhaseSummaryCard = ({ phaseNumber, phaseLabel, icon: Icon, children, onBack, accentColor = 'blue' }) => {
    const [expanded, setExpanded] = useState(false);

    const colorMap = {
        blue: 'border-blue-500/20 bg-blue-500/[0.03]',
        emerald: 'border-emerald-500/20 bg-emerald-500/[0.03]',
        amber: 'border-amber-500/20 bg-amber-500/[0.03]',
        rose: 'border-rose-500/20 bg-rose-500/[0.03]',
        teal: 'border-teal-500/20 bg-teal-500/[0.03]',
        indigo: 'border-indigo-500/20 bg-indigo-500/[0.03]',
    };

    const badgeColorMap = {
        blue: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
        emerald: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
        amber: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
        rose: 'bg-rose-500/10 text-rose-500 border-rose-500/20',
        teal: 'bg-teal-500/10 text-teal-500 border-teal-500/20',
        indigo: 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20',
    };

    return (
        <div className={`rounded-2xl border ${colorMap[accentColor] || colorMap.blue} transition-all duration-300`}>
            <button
                onClick={() => setExpanded(!expanded)}
                className="w-full flex items-center justify-between px-5 py-3.5 group"
            >
                <div className="flex items-center gap-3">
                    <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black border ${badgeColorMap[accentColor] || badgeColorMap.blue}`}>
                        {phaseNumber}
                    </span>
                    {Icon && <Icon size={16} className="text-slate-400" />}
                    <span className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                        {phaseLabel}
                    </span>
                    <CheckCircle size={14} className="text-emerald-500" />
                </div>
                <div className="flex items-center gap-2">
                    {onBack && (
                        <span
                            onClick={(e) => { e.stopPropagation(); onBack(); }}
                            className="text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-white/50 dark:hover:bg-white/5 transition-all"
                        >
                            <ArrowLeft size={12} /> Edit
                        </span>
                    )}
                    {expanded ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                </div>
            </button>
            {expanded && (
                <div className="px-5 pb-4 pt-0 border-t border-white/5 animate-fade-in">
                    {children}
                </div>
            )}
        </div>
    );
};


/**
 * WizardLayout — Full-page wizard with phase indicator, summary cards, and navigation.
 *
 * Props:
 *   steps        — [{label, icon: LucideIcon}]
 *   currentStep  — number (0-indexed)
 *   onStepClick  — (stepIndex) => void (only for completed steps)
 *   accentColor  — 'blue' | 'emerald' | 'amber' | 'rose' | 'teal' | 'indigo'
 *   summaryCards — ReactNode[] (one per previous phase, rendered above content)
 *   children     — current phase content
 *   footer       — ReactNode (back/next buttons)
 *   title        — string (wizard title)
 *   subtitle     — string (wizard subtitle)
 *   titleIcon    — LucideIcon
 */
const WizardLayout = ({
    steps = [],
    currentStep = 0,
    onStepClick,
    accentColor = 'blue',
    summaryCards,
    children,
    footer,
    title,
    subtitle,
    titleIcon: TitleIcon,
}) => {
    const accentMap = {
        blue: {
            active: 'bg-blue-600 border-blue-400 shadow-[0_0_20px_rgba(37,99,235,0.4)] text-white',
            done: 'bg-white dark:bg-slate-900 border-blue-200 dark:border-blue-500/50 text-blue-500 dark:text-blue-400',
            locked: 'bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-white/5 text-slate-400 dark:text-slate-600',
            line: 'from-blue-500 to-cyan-400',
            text: 'text-blue-700 dark:text-white',
        },
        emerald: {
            active: 'bg-emerald-600 border-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.4)] text-white',
            done: 'bg-white dark:bg-slate-900 border-emerald-200 dark:border-emerald-500/50 text-emerald-500 dark:text-emerald-400',
            locked: 'bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-white/5 text-slate-400 dark:text-slate-600',
            line: 'from-emerald-500 to-teal-400',
            text: 'text-emerald-700 dark:text-white',
        },
        amber: {
            active: 'bg-amber-600 border-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.4)] text-white',
            done: 'bg-white dark:bg-slate-900 border-amber-200 dark:border-amber-500/50 text-amber-500 dark:text-amber-400',
            locked: 'bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-white/5 text-slate-400 dark:text-slate-600',
            line: 'from-amber-500 to-orange-400',
            text: 'text-amber-700 dark:text-white',
        },
        rose: {
            active: 'bg-rose-600 border-rose-400 shadow-[0_0_20px_rgba(225,29,72,0.4)] text-white',
            done: 'bg-white dark:bg-slate-900 border-rose-200 dark:border-rose-500/50 text-rose-500 dark:text-rose-400',
            locked: 'bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-white/5 text-slate-400 dark:text-slate-600',
            line: 'from-rose-500 to-red-400',
            text: 'text-rose-700 dark:text-white',
        },
        teal: {
            active: 'bg-teal-600 border-teal-400 shadow-[0_0_20px_rgba(20,184,166,0.4)] text-white',
            done: 'bg-white dark:bg-slate-900 border-teal-200 dark:border-teal-500/50 text-teal-500 dark:text-teal-400',
            locked: 'bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-white/5 text-slate-400 dark:text-slate-600',
            line: 'from-teal-500 to-cyan-400',
            text: 'text-teal-700 dark:text-white',
        },
        indigo: {
            active: 'bg-indigo-600 border-indigo-400 shadow-[0_0_20px_rgba(99,102,241,0.4)] text-white',
            done: 'bg-white dark:bg-slate-900 border-indigo-200 dark:border-indigo-500/50 text-indigo-500 dark:text-indigo-400',
            locked: 'bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-white/5 text-slate-400 dark:text-slate-600',
            line: 'from-indigo-500 to-blue-400',
            text: 'text-indigo-700 dark:text-white',
        },
    };

    const colors = accentMap[accentColor] || accentMap.blue;


    return (
        <div className="w-full h-full flex flex-col bg-slate-50 dark:bg-[#020617] rounded-xl border border-slate-200 dark:border-gray-800 shadow-xl dark:shadow-2xl overflow-hidden">
            {/* Sticky Header: Title + Phase Indicator */}
            <div className="shrink-0 bg-white/80 dark:bg-[#020617]/80 backdrop-blur-xl border-b border-slate-200 dark:border-white/5">
                {/* Title */}
                {title && (
                    <div className="px-8 pt-6 pb-2 flex items-center gap-4">
                        {TitleIcon && (
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${colors.active} border`}>
                                <TitleIcon size={20} />
                            </div>
                        )}
                        <div>
                            <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">{title}</h2>
                            {subtitle && <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">{subtitle}</p>}
                        </div>
                    </div>
                )}

                {/* Phase Indicator — Segmented Pill Control */}
                <div className="px-6 py-3">
                    <div className="flex items-center justify-center gap-2">
                        {steps.map((step, idx) => {
                            const StepIcon = step.icon;
                            const isCurrent = currentStep === idx;
                            const isDone = currentStep > idx;
                            const isLocked = currentStep < idx;

                            // Pill style based on state
                            const pillClass = isCurrent
                                ? `${colors.active} shadow-lg`
                                : isDone
                                    ? 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                                    : 'bg-white/[0.02] border-white/5 text-slate-600 cursor-not-allowed';

                            return (
                                <button
                                    key={idx}
                                    onClick={() => isDone && onStepClick?.(idx)}
                                    disabled={isLocked || isCurrent}
                                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-[10px] font-black uppercase tracking-[0.1em] transition-all duration-300 ${pillClass} ${isDone ? 'cursor-pointer' : ''}`}
                                >
                                    {isDone ? (
                                        <CheckCircle size={14} className="text-emerald-400" />
                                    ) : StepIcon ? (
                                        <StepIcon size={14} />
                                    ) : (
                                        <span className="w-4 h-4 rounded-md bg-white/10 flex items-center justify-center text-[9px]">{idx + 1}</span>
                                    )}
                                    {step.label}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
                <div className="p-6 space-y-4">
                    {/* Previous Phase Summary Cards */}
                    {summaryCards && summaryCards.length > 0 && (
                        <div className="space-y-2">
                            {summaryCards}
                        </div>
                    )}

                    {/* Current Phase Content — keyed for transition on step change */}
                    <div
                        key={`phase-${currentStep}`}
                        style={{
                            animation: 'wizardSlideIn 0.4s ease-out both',
                        }}
                    >
                        <style>{`
                            @keyframes wizardSlideIn {
                                from {
                                    opacity: 0;
                                    transform: translateY(12px);
                                }
                                to {
                                    opacity: 1;
                                    transform: translateY(0);
                                }
                            }
                        `}</style>
                        {children}
                    </div>
                </div>
            </div>

            {/* Footer Navigation */}
            {footer && (
                <div className="shrink-0 px-6 py-4 border-t border-slate-200 dark:border-white/5 bg-white/80 dark:bg-[#020617]/80 backdrop-blur-xl">
                    {footer}
                </div>
            )}
        </div>
    );
};

export default WizardLayout;
