import React from 'react';

export const CardSelector = ({ options, value, onChange, columns = 2 }) => (
    <div className={`grid gap-3 ${columns === 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
        {options.map((option) => {
            const isSelected = value === option.id;
            return (
                <button
                    key={option.id}
                    type="button"
                    onClick={() => onChange(option.id)}
                    className={`
                        relative text-left p-5 rounded-2xl border-2 transition-all duration-200
                        ${isSelected
                            ? 'border-emerald-500/60 bg-emerald-500/8 shadow-[0_0_24px_rgba(16,185,129,0.08)]'
                            : 'border-white/8 bg-slate-950/60 hover:border-white/15 hover:bg-slate-900/80'}
                    `}
                >
                    <div className="flex items-start gap-3">
                        <div className={`
                            flex items-center justify-center w-5 h-5 rounded-full border-2 mt-0.5 shrink-0 transition-all
                            ${isSelected
                                ? 'border-emerald-400 bg-emerald-400'
                                : 'border-slate-600 bg-transparent'}
                        `}>
                            {isSelected && (
                                <div className="w-2 h-2 rounded-full bg-slate-950" />
                            )}
                        </div>
                        <div className="space-y-1 flex-1 min-w-0">
                            <div className={`text-sm font-black ${isSelected ? 'text-emerald-300' : 'text-white'}`}>
                                {option.label}
                            </div>
                            {option.description && (
                                <div className="text-xs text-slate-500 leading-relaxed">
                                    {option.description}
                                </div>
                            )}
                        </div>
                    </div>
                </button>
            );
        })}
    </div>
);

export const FieldLabel = ({ children, error }) => (
    <label className="block">
        <span className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">{children}</span>
        {error && <span className="text-xs text-rose-400 ml-2 font-bold">{error}</span>}
    </label>
);

export const TextInput = ({ value, onChange, placeholder, error, type = 'text', ...rest }) => (
    <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`
            w-full rounded-2xl border px-4 py-3 text-white bg-slate-950
            focus:outline-none transition-colors
            ${error
                ? 'border-rose-500/50 focus:border-rose-400'
                : 'border-white/10 focus:border-emerald-400/60'}
        `}
        {...rest}
    />
);

export const ToggleField = ({ label, description, checked, onChange }) => (
    <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-slate-950 px-5 py-4 cursor-pointer transition-colors hover:border-white/15">
        <input
            type="checkbox"
            checked={checked}
            onChange={(e) => onChange(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-500 bg-slate-900 text-emerald-400 focus:ring-emerald-500 cursor-pointer"
        />
        <div className="space-y-0.5">
            <span className="text-sm font-bold text-white">{label}</span>
            {description && <p className="text-xs text-slate-500">{description}</p>}
        </div>
    </label>
);

export const SectionTitle = ({ children, description }) => (
    <div className="mb-6">
        <h2 className="text-2xl font-black text-white">{children}</h2>
        {description && <p className="mt-1 text-sm text-slate-400">{description}</p>}
    </div>
);

export const ErrorBanner = ({ message }) => {
    if (!message) return null;
    return (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 text-sm font-bold">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0" />
            {message}
        </div>
    );
};

export const WizardNav = ({ onBack, onNext, nextLabel = 'Continue', backLabel = 'Back', nextDisabled = false, isFirst = false, loading = false }) => (
    <div className="flex items-center justify-between pt-8 mt-8 border-t border-white/5">
        {!isFirst ? (
            <button
                type="button"
                onClick={onBack}
                disabled={loading}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-600 px-6 text-sm font-black uppercase tracking-wider text-slate-300 transition-colors hover:bg-slate-800 hover:text-white disabled:opacity-50"
            >
                {backLabel}
            </button>
        ) : (
            <div />
        )}
        <button
            type="button"
            onClick={onNext}
            disabled={nextDisabled || loading}
            className={`
                inline-flex h-11 items-center justify-center gap-2 rounded-xl px-8 text-sm font-black uppercase tracking-wider transition-all
                ${loading
                    ? 'bg-emerald-500/60 text-white/80 cursor-wait'
                    : 'bg-emerald-500 text-slate-950 shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_8px_24px_rgba(16,185,129,0.35)] hover:bg-emerald-400'}
                disabled:opacity-50 disabled:cursor-not-allowed
            `}
        >
            {loading && (
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
            )}
            {nextLabel}
        </button>
    </div>
);
