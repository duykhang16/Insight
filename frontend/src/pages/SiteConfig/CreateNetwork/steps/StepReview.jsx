/**
 * Step 3 of 3 — Wired Network Review & Create
 * Summary of wired network settings before creation.
 */
import React from 'react';
import { WizardNav, ErrorBanner } from '../components/FieldCards';

const ReviewRow = ({ label, value }) => (
    <div className="flex items-center justify-between py-3 border-b border-white/5 last:border-0">
        <span className="text-sm text-slate-400">{label}</span>
        <span className="text-sm font-bold text-white">{value || '—'}</span>
    </div>
);

const StepReview = ({ form, onBack, onSubmit, loading, apiError }) => (
    <div className="space-y-8">
        <div>
            <p className="text-sm font-bold text-emerald-400 mb-1">Step 3 of 3</p>
            <h2 className="text-3xl font-black text-white">Review & Create</h2>
            <p className="mt-2 text-sm text-slate-400">
                Verify your wired network settings before creating.
            </p>
        </div>

        <div className="max-w-lg rounded-2xl border border-white/10 bg-slate-950/60 px-6 py-2">
            <ReviewRow label="Network Name" value={form.networkName} />
            <ReviewRow label="Type" value="Wired" />
            <ReviewRow label="Usage" value={form.usage === 'guest' ? 'Guest' : 'Employee'} />
            <ReviewRow label="VLAN ID" value={form.vlanId} />
            <ReviewRow label="IGMP Snooping" value={form.isIgmpSnoopingEnabled ? 'Enabled' : 'Disabled'} />
            <ReviewRow label="DHCP/ARP Protection" value={form.isDhcpArpProtectionEnabled ? 'Enabled' : 'Disabled'} />
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

export default StepReview;
