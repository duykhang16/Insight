/**
 * Step 2 of 3 — Network Properties
 * Usage + Security (dynamic) + Password / RADIUS + Options
 * Matches HPE portal Step 2 exactly.
 */
import React from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { FieldLabel, WizardNav, ErrorBanner } from '../components/FieldCards';
import {
    EMPLOYEE_SECURITY_OPTIONS,
    GUEST_SECURITY_OPTIONS,
    SECURITY_NEEDS_PSK,
    DEFAULT_SECURITY_BY_USAGE,
} from '../constants';

const RadioOption = ({ label, checked, onChange, disabled, hint }) => (
    <label
        className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${
            disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-white/[0.02]'
        }`}
    >
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
        {hint && <span className="text-[10px] text-slate-600 ml-auto">{hint}</span>}
    </label>
);

const CheckboxOption = ({ label, checked, onChange, disabled }) => (
    <label
        className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${
            disabled ? 'opacity-60 cursor-not-allowed' : 'hover:bg-white/[0.02]'
        }`}
    >
        <input
            type="checkbox"
            checked={checked}
            onChange={(e) => !disabled && onChange(e.target.checked)}
            disabled={disabled}
            className="h-4 w-4 rounded border-slate-500 bg-slate-900 text-emerald-400 focus:ring-emerald-500 cursor-pointer"
        />
        <span className={`text-sm font-bold ${checked ? 'text-emerald-300' : 'text-white'}`}>
            {label}
        </span>
    </label>
);

const StepSecurity = ({ form, setField, errors, onNext, onBack }) => {
    const [showPassword, setShowPassword] = React.useState(false);

    const isGuest = form.usage === 'guest';
    const securityOptions = isGuest ? GUEST_SECURITY_OPTIONS : EMPLOYEE_SECURITY_OPTIONS;
    const needsPsk = SECURITY_NEEDS_PSK.has(form.securityOption);

    const handleUsageChange = (usage) => {
        setField('usage', usage);
        // Switch security to default for the new usage
        const newDefault = DEFAULT_SECURITY_BY_USAGE[usage];
        setField('securityOption', newDefault);
        // Auto-enable guest portal when switching to guest
        if (usage === 'guest') {
            setField('isGuestPortalEnabled', true);
        } else {
            setField('isGuestPortalEnabled', false);
        }
    };

    const handleSecurityChange = (secOption) => {
        if (securityOptions.find((o) => o.value === secOption)?.disabled) return;
        setField('securityOption', secOption);
    };

    return (
        <div className="space-y-8">
            <div>
                <p className="text-sm font-bold text-emerald-400 mb-1">Step 2 of 3</p>
                <h2 className="text-3xl font-black text-white">Network Properties</h2>
                <p className="mt-2 text-sm text-slate-400">
                    Define the basic properties of this network.
                </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* ── Left column ── */}
                <div className="space-y-6">
                    {/* Network Usage */}
                    <div>
                        <FieldLabel>Network Usage</FieldLabel>
                        <div className="mt-2 rounded-2xl border border-white/10 bg-slate-950/60 overflow-hidden divide-y divide-white/5">
                            <RadioOption
                                label="Employee"
                                checked={form.usage === 'employee'}
                                onChange={() => handleUsageChange('employee')}
                            />
                            <RadioOption
                                label="Guest"
                                checked={form.usage === 'guest'}
                                onChange={() => handleUsageChange('guest')}
                            />
                        </div>
                    </div>

                    {/* Security */}
                    <div>
                        <h3 className="text-xl font-black text-white mb-1">Security</h3>
                        <FieldLabel>Network Security</FieldLabel>
                        <div className="mt-2 rounded-2xl border border-white/10 bg-slate-950/60 overflow-hidden divide-y divide-white/5">
                            {securityOptions.map((opt) => (
                                <RadioOption
                                    key={opt.value}
                                    label={opt.label}
                                    checked={form.securityOption === opt.value}
                                    onChange={() => handleSecurityChange(opt.value)}
                                    disabled={opt.disabled}
                                    hint={opt.hint}
                                />
                            ))}
                        </div>
                    </div>

                    {/* Network Options */}
                    <div>
                        <FieldLabel>Network Options</FieldLabel>
                        <div className="mt-2 rounded-2xl border border-white/10 bg-slate-950/60 overflow-hidden divide-y divide-white/5">
                            {isGuest && (
                                <CheckboxOption
                                    label="Guest Portal"
                                    checked={form.isGuestPortalEnabled}
                                    onChange={(v) => setField('isGuestPortalEnabled', v)}
                                />
                            )}
                            <CheckboxOption
                                label="Hidden Network"
                                checked={form.isSsidHidden}
                                onChange={(v) => setField('isSsidHidden', v)}
                            />
                        </div>
                    </div>
                </div>

                {/* ── Right column — conditional auth panel ── */}
                <div>
                    {needsPsk && (
                        <div className="space-y-3">
                            <h3 className="text-xl font-black text-white">Network Password (PSK)</h3>
                            <p className="text-sm text-slate-400">
                                Users need to authenticate with the password below.
                            </p>
                            <FieldLabel error={errors.preSharedKey}>Network Password *</FieldLabel>
                            <div className="relative">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={form.preSharedKey}
                                    onChange={(e) => setField('preSharedKey', e.target.value)}
                                    placeholder="Min. 8 characters"
                                    maxLength={63}
                                    className={`w-full rounded-2xl border px-4 py-3 pr-12 text-white bg-slate-950 focus:outline-none transition-colors ${
                                        errors.preSharedKey
                                            ? 'border-rose-500/50 focus:border-rose-400'
                                            : 'border-white/10 focus:border-emerald-400/60'
                                    }`}
                                />
                                <button
                                    type="button"
                                    tabIndex={-1}
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors"
                                >
                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                            {form.preSharedKey && (
                                <div className="flex items-center gap-2">
                                    <div className="flex-1 h-1 rounded-full bg-slate-800 overflow-hidden">
                                        <div
                                            className={`h-full rounded-full transition-all ${
                                                form.preSharedKey.length >= 12
                                                    ? 'bg-emerald-400 w-full'
                                                    : form.preSharedKey.length >= 8
                                                        ? 'bg-amber-400 w-2/3'
                                                        : 'bg-rose-400 w-1/3'
                                            }`}
                                            style={{ width: form.preSharedKey.length >= 12 ? '100%' : form.preSharedKey.length >= 8 ? '66%' : '33%' }}
                                        />
                                    </div>
                                    <span className="text-[10px] font-bold text-slate-500">
                                        {form.preSharedKey.length >= 12 ? 'Strong' : form.preSharedKey.length >= 8 ? 'Good' : 'Weak'}
                                    </span>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <ErrorBanner message={errors.preSharedKey} />
            <WizardNav onBack={onBack} onNext={onNext} nextLabel="Next" />
        </div>
    );
};

export default StepSecurity;
