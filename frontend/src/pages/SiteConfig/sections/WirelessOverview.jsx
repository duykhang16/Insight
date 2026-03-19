import React from 'react';
import { Eye, EyeOff, LoaderCircle, Trash2 } from 'lucide-react';
import { SECURITY_OPTIONS } from '../constants';
import { LabeledField, Panel, ActionButtons } from '../components/Panel';

const WirelessOverview = ({
    form,
    isDirty,
    saving,
    deleting,
    showPassword,
    isUpdateDisabled,
    setField,
    handleSecurityChange,
    setShowPassword,
    handleSave,
    handleCancel,
    handleDelete,
}) => {
    if (!form) return null;

    return (
        <div className="space-y-6">
            <div className="rounded-[2rem] border border-white/10 bg-slate-900/90 p-6 md:p-8 shadow-2xl">
                <div className="grid gap-10 xl:grid-cols-[1fr,0.95fr]">
                    <Panel title="Identification">
                        <LabeledField label="Name">
                            <input
                                value={form.networkName}
                                onChange={(event) => setField('networkName', event.target.value)}
                                className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white focus:outline-none focus:border-cyan-400"
                            />
                        </LabeledField>
                        <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white">
                            <input
                                type="checkbox"
                                checked={form.isEnabled}
                                onChange={(event) => setField('isEnabled', event.target.checked)}
                                className="h-4 w-4 rounded border-slate-500 bg-slate-900 text-cyan-400 focus:ring-cyan-500"
                            />
                            <span className="font-semibold">Enabled</span>
                        </label>
                        <div className="space-y-4 text-sm">
                            <div>
                                <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Health</div>
                                <div className="mt-2 flex items-center gap-2 text-emerald-300 font-semibold">
                                    <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400"></span>
                                    {form.health}
                                </div>
                            </div>
                            <div>
                                <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">State</div>
                                <div className="mt-2 font-semibold text-white">{form.state}</div>
                            </div>
                            <div>
                                <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Network Usage</div>
                                <div className="mt-2 font-semibold text-white capitalize">{form.type}</div>
                            </div>
                        </div>
                    </Panel>

                    <Panel title="Security">
                        <div className="rounded-2xl border border-white/10 bg-slate-950 p-4">
                            <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Network Security</div>
                            <div className="mt-4 space-y-3">
                                {SECURITY_OPTIONS.map((option) => (
                                    <label
                                        key={option.id}
                                        className={`flex items-center gap-3 text-sm font-semibold ${option.supported ? 'text-slate-200' : 'text-slate-500'}`}
                                    >
                                        <input
                                            type="radio"
                                            name="network_security"
                                            checked={form.securityOption === option.id}
                                            onChange={() => handleSecurityChange(option.id)}
                                            disabled={!option.supported}
                                            className="h-4 w-4 border-slate-500 bg-slate-900 text-cyan-400 focus:ring-cyan-500 disabled:opacity-50"
                                        />
                                        {option.label}
                                    </label>
                                ))}
                            </div>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-slate-950 p-4">
                            <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Network Options</div>
                            <div className="mt-4">
                                <label className="flex items-center gap-3 text-sm font-semibold text-slate-200">
                                    <input
                                        type="checkbox"
                                        checked={form.isSsidHidden}
                                        onChange={(event) => setField('isSsidHidden', event.target.checked)}
                                        className="h-4 w-4 rounded border-slate-500 bg-slate-900 text-cyan-400 focus:ring-cyan-500"
                                    />
                                    Hidden Network
                                </label>
                            </div>
                        </div>
                        <div className="space-y-3">
                            <div>
                                <h3 className="text-2xl font-black text-white">Network Password (PSK)</h3>
                                <p className="mt-1 text-sm text-slate-400">Users need to authenticate with the password below.</p>
                            </div>
                            <LabeledField label="Network Password">
                                <div className="relative">
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        value={form.preSharedKey}
                                        onChange={(event) => setField('preSharedKey', event.target.value)}
                                        className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 pr-12 text-white focus:outline-none focus:border-cyan-400"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword((current) => !current)}
                                        className="absolute right-3 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-800 hover:text-white"
                                        aria-label={showPassword ? 'Hide network password' : 'Show network password'}
                                    >
                                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                    </button>
                                </div>
                            </LabeledField>
                        </div>
                        <div className="flex items-center justify-between gap-4 rounded-2xl border border-rose-500/20 bg-rose-500/5 p-4">
                            <div>
                                <h3 className="text-2xl font-black text-white">Delete Network</h3>
                                <p className="mt-1 text-sm text-slate-400">Permanently deletes the network.</p>
                            </div>
                            <button
                                type="button"
                                onClick={handleDelete}
                                disabled={saving || deleting}
                                className="inline-flex items-center gap-2 rounded-xl border border-cyan-400/50 px-4 py-2 text-sm font-black text-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {deleting ? <LoaderCircle size={15} className="animate-spin" /> : <Trash2 size={15} />}
                                Delete
                            </button>
                        </div>
                    </Panel>
                </div>
            </div>
            {isDirty && <ActionButtons onUpdate={handleSave} onCancel={handleCancel} saving={saving} disabled={isUpdateDisabled} />}
        </div>
    );
};

export default WirelessOverview;
