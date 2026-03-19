import React from 'react';
import { LoaderCircle, Save } from 'lucide-react';

export const LabeledField = ({ label, children }) => (
    <label className="block">
        <span className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">{label}</span>
        <div className="mt-2">{children}</div>
    </label>
);

export const Panel = ({ title, children }) => (
    <section className="space-y-5">
        <div>
            <h2 className="text-3xl font-black text-white">{title}</h2>
        </div>
        {children}
    </section>
);

export const EmptyState = ({ message }) => (
    <div className="rounded-[2rem] border border-white/10 bg-slate-900/90 p-10 shadow-2xl">
        <h2 className="text-3xl font-black text-white">No Network Selected</h2>
        <p className="mt-4 max-w-2xl text-sm text-slate-400">{message}</p>
    </div>
);

export const ActionButtons = ({ onUpdate, onCancel, saving, disabled, updateDisabled = false }) => (
    <div className="flex items-center justify-end gap-3 pt-6 border-t border-slate-800">
        <button
            type="button"
            onClick={onCancel}
            disabled={disabled || saving}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-600 px-5 text-sm font-black uppercase tracking-[0.16em] text-slate-300 transition-colors hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
            Cancel
        </button>
        <button
            type="button"
            onClick={onUpdate}
            disabled={disabled || saving || updateDisabled}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-emerald-400 px-5 text-sm font-black uppercase tracking-[0.16em] text-slate-950 shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_8px_24px_rgba(16,185,129,0.35)] transition-colors hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
            {saving ? <LoaderCircle size={14} className="animate-spin" /> : <Save size={14} />}
            Update
        </button>
    </div>
);
