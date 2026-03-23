import React from 'react';
import { Check, Lock } from 'lucide-react';

const WizardShell = ({ steps, currentStepIndex, children, title, subtitle }) => {
    return (
        <div className="min-h-screen bg-slate-950 p-6 md:p-8 text-slate-100">
            <div className="mx-auto max-w-4xl space-y-8">
                {/* Header */}
                <div>
                    <div className="text-xs font-black uppercase tracking-[0.28em] text-slate-400">
                        Create Network
                    </div>
                    <h1 className="mt-2 text-4xl font-black text-white">
                        {title || 'New Network'}
                    </h1>
                    {subtitle && (
                        <p className="mt-2 text-sm text-slate-400">{subtitle}</p>
                    )}
                </div>

                {/* Step Indicator */}
                <div className="flex items-center gap-1">
                    {steps.map((step, index) => {
                        const isDone = index < currentStepIndex;
                        const isCurrent = index === currentStepIndex;
                        const isLocked = index > currentStepIndex;

                        return (
                            <React.Fragment key={step.key}>
                                <div
                                    className={`
                                        flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider
                                        transition-all duration-300
                                        ${isCurrent
                                            ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shadow-[0_0_20px_rgba(16,185,129,0.1)]'
                                            : isDone
                                                ? 'bg-emerald-500/10 text-emerald-400/70 border border-emerald-500/15'
                                                : 'bg-slate-900/60 text-slate-600 border border-white/5'}
                                    `}
                                >
                                    <span className={`
                                        flex items-center justify-center w-5 h-5 rounded-md text-[10px] font-black
                                        ${isCurrent
                                            ? 'bg-emerald-500/25 text-emerald-300'
                                            : isDone
                                                ? 'bg-emerald-500/20 text-emerald-400'
                                                : 'bg-slate-800 text-slate-600'}
                                    `}>
                                        {isDone ? <Check size={10} strokeWidth={3} /> : isLocked ? <Lock size={9} /> : step.number}
                                    </span>
                                    <span className="hidden sm:inline">{step.label}</span>
                                </div>
                                {index < steps.length - 1 && (
                                    <div className={`
                                        w-6 h-px
                                        ${index < currentStepIndex ? 'bg-emerald-500/40' : 'bg-slate-800'}
                                    `} />
                                )}
                            </React.Fragment>
                        );
                    })}
                </div>

                {/* Step Content */}
                <div className="rounded-[2rem] border border-white/10 bg-slate-900/90 p-6 md:p-10 shadow-2xl">
                    {children}
                </div>
            </div>
        </div>
    );
};

export default WizardShell;
