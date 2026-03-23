/**
 * Step 3 of 3 — IP Assignment
 * IP mode + VLAN + Specific network config
 * Final step — "Create Network" button instead of "Next"
 * Matches HPE portal Step 3 exactly.
 */
import React from 'react';
import { FieldLabel, TextInput, WizardNav, ErrorBanner } from '../components/FieldCards';
import { SUBNET_MASK_OPTIONS, calculateDhcpRange } from '../constants';

const RadioOption = ({ label, checked, onChange }) => (
    <label className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-white/[0.02] transition-colors">
        <div
            className={`flex items-center justify-center w-5 h-5 rounded-full border-2 shrink-0 transition-all ${
                checked ? 'border-emerald-400 bg-emerald-400' : 'border-slate-600'
            }`}
        >
            {checked && <div className="w-2 h-2 rounded-full bg-slate-950" />}
        </div>
        <span className={`text-sm font-bold ${checked ? 'text-emerald-300' : 'text-white'}`}>
            {label}
        </span>
    </label>
);

const StepAdvanced = ({ form, setField, errors, onBack, onSubmit, loading, apiError }) => {
    const isSpecific = form.ipAssignment === 'specific';
    const dhcp = isSpecific ? calculateDhcpRange(form.networkAddress, form.subnetMask) : null;

    return (
        <div className="space-y-8">
            <div>
                <p className="text-sm font-bold text-emerald-400 mb-1">Step 3 of 3</p>
                <h2 className="text-3xl font-black text-white">IP Assignment</h2>
                <p className="mt-2 text-sm text-slate-400">
                    Determine how clients and devices obtain IP addresses when connecting to this network.
                </p>
            </div>

            <div className="max-w-lg space-y-6">
                {/* IP Address Assignment mode */}
                <div>
                    <FieldLabel>IP Address Assignment</FieldLabel>
                    <div className="mt-2 rounded-2xl border border-white/10 bg-slate-950/60 overflow-hidden divide-y divide-white/5">
                        <RadioOption
                            label="Same as a Local Network (default)"
                            checked={form.ipAssignment === 'local'}
                            onChange={() => setField('ipAssignment', 'local')}
                        />
                        <RadioOption
                            label="Specific to This Network"
                            checked={form.ipAssignment === 'specific'}
                            onChange={() => setField('ipAssignment', 'specific')}
                        />
                    </div>
                </div>

                {/* VLAN */}
                {!isSpecific && (
                    <div className="space-y-2">
                        <FieldLabel error={errors.vlanId}>VLAN</FieldLabel>
                        <TextInput
                            value={form.vlanId}
                            onChange={(v) => setField('vlanId', v)}
                            placeholder="Optional (1–4094)"
                            error={errors.vlanId}
                            type="number"
                            min={1}
                            max={4094}
                        />
                    </div>
                )}

                {/* Specific network config */}
                {isSpecific && (
                    <div className="space-y-5 rounded-2xl border border-white/10 bg-slate-950/40 p-5">
                        <div className="space-y-2">
                            <FieldLabel error={errors.networkAddress}>Network Address</FieldLabel>
                            <TextInput
                                value={form.networkAddress}
                                onChange={(v) => setField('networkAddress', v)}
                                placeholder="e.g. 172.16.0.0"
                                error={errors.networkAddress}
                            />
                        </div>

                        <div className="space-y-2">
                            <FieldLabel>Subnet Mask</FieldLabel>
                            <select
                                value={form.subnetMask}
                                onChange={(e) => setField('subnetMask', e.target.value)}
                                className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white focus:outline-none focus:border-emerald-400/60"
                            >
                                {SUBNET_MASK_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {dhcp && (
                            <div className="space-y-3 pt-2">
                                <h3 className="text-lg font-black text-white">
                                    Automatic IP Address Assignment
                                </h3>
                                <p className="text-xs text-slate-500">
                                    Automatically assign IP addresses to clients and devices connecting to this network.
                                </p>
                                <div className="grid grid-cols-3 gap-4">
                                    <div>
                                        <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                            Start IP Address
                                        </div>
                                        <div className="mt-1 text-sm font-bold text-white">{dhcp.startIp}</div>
                                    </div>
                                    <div>
                                        <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                            End IP Address
                                        </div>
                                        <div className="mt-1 text-sm font-bold text-white">{dhcp.endIp}</div>
                                    </div>
                                    <div>
                                        <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                            Available IPs
                                        </div>
                                        <div className="mt-1 text-sm font-bold text-emerald-400">{dhcp.available}</div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            <ErrorBanner message={apiError} />
            <WizardNav
                onBack={onBack}
                onNext={onSubmit}
                nextLabel="Create Network"
                loading={loading}
            />
        </div>
    );
};

export default StepAdvanced;
