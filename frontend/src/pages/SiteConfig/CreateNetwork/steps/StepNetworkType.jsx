/**
 * Step 1 of 3 — Network Identification
 * Just a Name field. Matches HPE portal exactly.
 */
import React from 'react';
import { FieldLabel, TextInput, WizardNav } from '../components/FieldCards';

const StepNetworkType = ({ form, setField, errors, onNext }) => (
    <div className="space-y-8">
        <div>
            <p className="text-sm font-bold text-emerald-400 mb-1">Step 1 of 3</p>
            <h2 className="text-3xl font-black text-white">Network Identification</h2>
            <p className="mt-2 text-sm text-slate-400">Give a name to the network.</p>
        </div>

        <div className="max-w-md space-y-2">
            <FieldLabel error={errors.networkName}>Name</FieldLabel>
            <TextInput
                value={form.networkName}
                onChange={(v) => setField('networkName', v)}
                placeholder="e.g. Office Wi-Fi"
                error={errors.networkName}
                maxLength={32}
                autoFocus
            />
        </div>

        <WizardNav onNext={onNext} nextLabel="Next" isFirst />
    </div>
);

export default StepNetworkType;
