import React from 'react';
import { SUBNET_MASK_OPTIONS, DEFAULT_INTERNAL_SUBNET_MASK } from '../constants';
import { isValidIpv4Address } from '../normalizers';
import { LabeledField, ActionButtons } from '../components/Panel';

const WirelessIpAssignment = ({
    form,
    isDirty,
    saving,
    isUpdateDisabled,
    dnsValidation,
    wiredOptions,
    setField,
    handleSpecificNetworkMode,
    handleSave,
    handleCancel,
}) => {
    if (!form) return null;

    const isSpecificToThisNetwork = form.ipAddressingMode === 'internal';
    const dnsIsStatic = form.dnsServerAssignationMode === 'static';

    const formatAvailableIpAddresses = () => {
        if (form.subnetMask === '255.255.255.0') return '253';
        if (form.subnetMask === '255.255.0.0') return '65533';
        if (form.subnetMask === '255.0.0.0') return '16777213';
        return '—';
    };

    return (
        <div className="rounded-[2rem] border border-white/10 bg-slate-900/90 p-6 md:p-8 shadow-2xl">
            <div className="grid gap-10 xl:grid-cols-[1fr,0.95fr]">
                <div className="space-y-8">
                    <div>
                        <h2 className="text-3xl font-black text-white">IP Addressing</h2>
                        <p className="mt-2 text-sm text-slate-300">
                            IP addressing for clients and devices connecting to this network.
                        </p>
                    </div>

                    <div className="max-w-md rounded-2xl border border-white/10 bg-slate-950 p-4">
                        <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">IP Address Assignment</div>
                        <div className="mt-4 space-y-3">
                            <label className="flex items-center gap-3 text-sm font-semibold text-slate-200">
                                <input
                                    type="radio"
                                    name="ip_assignment_mode"
                                    checked={form.ipAddressingMode !== 'internal'}
                                    onChange={() => setField('ipAddressingMode', 'external')}
                                    className="h-4 w-4 border-slate-500 bg-slate-900 text-cyan-400 focus:ring-cyan-500"
                                />
                                Same as a Local Network (default)
                            </label>
                            <label className="flex items-center gap-3 text-sm font-semibold text-slate-200">
                                <input
                                    type="radio"
                                    name="ip_assignment_mode"
                                    checked={isSpecificToThisNetwork}
                                    onChange={handleSpecificNetworkMode}
                                    className="h-4 w-4 border-slate-500 bg-slate-900 text-cyan-400 focus:ring-cyan-500"
                                />
                                Specific to This Network
                            </label>
                        </div>
                    </div>

                    {isSpecificToThisNetwork ? (
                        <div className="space-y-5">
                            <LabeledField label="Network Address">
                                <input
                                    value={form.networkAddress}
                                    onChange={(event) => setField('networkAddress', event.target.value)}
                                    className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white focus:outline-none focus:border-cyan-400"
                                />
                            </LabeledField>

                            <LabeledField label="Subnet Mask">
                                <select
                                    value={SUBNET_MASK_OPTIONS.includes(form.subnetMask) ? form.subnetMask : `${DEFAULT_INTERNAL_SUBNET_MASK} (/24)`}
                                    onChange={(event) => setField('subnetMask', event.target.value.split(' ')[0])}
                                    className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white focus:outline-none focus:border-cyan-400"
                                >
                                    {SUBNET_MASK_OPTIONS.map((option) => (
                                        <option key={option} value={option}>
                                            {option}
                                        </option>
                                    ))}
                                </select>
                            </LabeledField>

                            <div className="space-y-4 pt-2">
                                <div>
                                    <h3 className="text-2xl font-black text-white">Automatic IP Address Assignment</h3>
                                    <p className="mt-2 max-w-xl text-sm text-slate-300">
                                        Automatically assign IP addresses to clients and devices connecting to this network.
                                    </p>
                                </div>
                                <div className="space-y-5 text-sm">
                                    <div>
                                        <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Start IP Address</div>
                                        <div className="mt-2 font-semibold text-white">172.16.0.1</div>
                                    </div>
                                    <div>
                                        <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">End IP Address</div>
                                        <div className="mt-2 font-semibold text-white">172.16.0.254</div>
                                    </div>
                                    <div>
                                        <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Available IP Addresses</div>
                                        <div className="mt-2 font-semibold text-white">{formatAvailableIpAddresses()}</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <LabeledField label="Wired Network">
                            <select
                                value={form.wiredNetworkId}
                                onChange={(event) => setField('wiredNetworkId', event.target.value)}
                                className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white focus:outline-none focus:border-cyan-400"
                            >
                                <option value="">Choose wired network</option>
                                {wiredOptions.map((network) => (
                                    <option key={network.id} value={network.id}>
                                        {network.displayName}
                                    </option>
                                ))}
                            </select>
                        </LabeledField>
                    )}
                </div>

                <div className="space-y-5">
                    <div>
                        <h2 className="text-3xl font-black text-white">DNS Resolution</h2>
                        <p className="mt-2 text-sm text-slate-300">
                            Domains and hostname resolution for clients and devices connecting to this network.
                        </p>
                    </div>

                    <div className="max-w-md rounded-2xl border border-white/10 bg-slate-950 p-4">
                        <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">DNS Servers</div>
                        <div className="mt-4 space-y-3">
                            <label className="flex items-center gap-3 text-sm font-semibold text-slate-200">
                                <input
                                    type="radio"
                                    name="dns_resolution_mode"
                                    checked={!dnsIsStatic}
                                    onChange={() => setField('dnsServerAssignationMode', 'automatic')}
                                    className="h-4 w-4 border-slate-500 bg-slate-900 text-cyan-400 focus:ring-cyan-500"
                                />
                                Automatic (default)
                            </label>
                            <label className="flex items-center gap-3 text-sm font-semibold text-slate-200">
                                <input
                                    type="radio"
                                    name="dns_resolution_mode"
                                    checked={dnsIsStatic}
                                    onChange={() => setField('dnsServerAssignationMode', 'static')}
                                    className="h-4 w-4 border-slate-500 bg-slate-900 text-cyan-400 focus:ring-cyan-500"
                                />
                                Static
                            </label>
                        </div>
                    </div>

                    <LabeledField label="Primary DNS Server">
                        <input
                            value={dnsIsStatic ? form.primaryDnsServer : '-'}
                            onChange={(event) => setField('primaryDnsServer', event.target.value)}
                            disabled={!dnsIsStatic}
                            placeholder={dnsIsStatic ? '' : '-'}
                            className={`w-full max-w-md rounded-2xl border bg-slate-950 px-4 py-3 text-white focus:outline-none disabled:cursor-not-allowed disabled:text-slate-500 ${
                                dnsValidation.primary
                                    ? 'border-rose-500/60 focus:border-rose-400'
                                    : 'border-white/10 focus:border-cyan-400'
                            }`}
                        />
                        {dnsValidation.primary && (
                            <p className="mt-2 text-sm font-medium text-rose-300">{dnsValidation.primary}</p>
                        )}
                    </LabeledField>

                    <LabeledField label="Secondary DNS Server">
                        <input
                            value={dnsIsStatic ? form.secondaryDnsServer : '-'}
                            onChange={(event) => setField('secondaryDnsServer', event.target.value)}
                            disabled={!dnsIsStatic}
                            placeholder={dnsIsStatic ? '' : '-'}
                            className={`w-full max-w-md rounded-2xl border bg-slate-950 px-4 py-3 text-white focus:outline-none disabled:cursor-not-allowed disabled:text-slate-500 ${
                                dnsValidation.secondary
                                    ? 'border-rose-500/60 focus:border-rose-400'
                                    : 'border-white/10 focus:border-cyan-400'
                            }`}
                        />
                        {dnsValidation.secondary && (
                            <p className="mt-2 text-sm font-medium text-rose-300">{dnsValidation.secondary}</p>
                        )}
                    </LabeledField>
                </div>
            </div>
            {isDirty && <ActionButtons onUpdate={handleSave} onCancel={handleCancel} saving={saving} disabled={isUpdateDisabled} />}
        </div>
    );
};

export default WirelessIpAssignment;
