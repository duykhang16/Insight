/**
 * Create Network Wizard — Orchestrator
 * 3-step wizard matching HPE Instant On portal flow.
 *
 * Wireless: Name → Properties → IP Assignment + Create
 * Wired:    Name → Properties → Review + Create
 */
import React, { useState, useMemo, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import apiClient from '../../../api/apiClient';
import { useSite } from '../../../context/SiteContext';
import {
    DEFAULT_WIRELESS_FORM,
    DEFAULT_WIRED_FORM,
    WIRELESS_STEPS,
    WIRED_STEPS,
    SECURITY_API_MAP,
    SECURITY_NEEDS_PSK,
} from './constants';
import { VALIDATORS } from './validators';
import WizardShell from './components/WizardShell';
import StepNetworkType from './steps/StepNetworkType';
import StepSecurity from './steps/StepSecurity';
import StepAdvanced from './steps/StepAdvanced';
import StepReview from './steps/StepReview';

const CreateNetworkWizard = () => {
    const { siteId } = useParams();
    const navigate = useNavigate();
    const { sites } = useSite();
    const siteName =
        sites.find((s) => String(s.siteId || s.id) === String(siteId))?.siteName || siteId;

    // ── State ──
    const [form, setForm] = useState({ ...DEFAULT_WIRELESS_FORM });
    const [stepIndex, setStepIndex] = useState(0);
    const [errors, setErrors] = useState({});
    const [submitting, setSubmitting] = useState(false);
    const [apiError, setApiError] = useState('');
    const [success, setSuccess] = useState(false);

    const steps = useMemo(
        () => (form.networkKind === 'wired' ? WIRED_STEPS : WIRELESS_STEPS),
        [form.networkKind],
    );
    const currentStep = steps[stepIndex];

    // ── Field setter ──
    const setField = useCallback(
        (field, value) => {
            setErrors((prev) => {
                if (!prev[field]) return prev;
                const next = { ...prev };
                delete next[field];
                return next;
            });
            setForm((prev) => {
                if (field === 'networkKind') {
                    const defaults =
                        value === 'wired' ? DEFAULT_WIRED_FORM : DEFAULT_WIRELESS_FORM;
                    return { ...defaults, networkName: prev.networkName };
                }
                return { ...prev, [field]: value };
            });
            if (field === 'networkKind' && stepIndex > 0) setStepIndex(0);
        },
        [stepIndex],
    );

    // ── Navigation ──
    const goNext = useCallback(() => {
        const validator = VALIDATORS[currentStep.key];
        if (validator) {
            const result = validator(form);
            if (!result.valid) {
                setErrors(result.errors);
                return;
            }
        }
        setErrors({});
        setApiError('');
        if (stepIndex < steps.length - 1) setStepIndex(stepIndex + 1);
    }, [currentStep, form, stepIndex, steps.length]);

    const goBack = useCallback(() => {
        if (stepIndex > 0) {
            setStepIndex(stepIndex - 1);
            setErrors({});
            setApiError('');
        }
    }, [stepIndex]);

    // ── Submit ──
    const handleSubmit = async () => {
        // Validate final step
        const validator = VALIDATORS[currentStep.key];
        if (validator) {
            const result = validator(form);
            if (!result.valid) {
                setErrors(result.errors);
                return;
            }
        }

        if (!siteId) return;
        setSubmitting(true);
        setApiError('');

        try {
            let body;

            if (form.networkKind === 'wireless') {
                const secMap = SECURITY_API_MAP[form.securityOption] || SECURITY_API_MAP.wpa2_wpa3;
                const needsPsk = SECURITY_NEEDS_PSK.has(form.securityOption);

                body = {
                    networkKind: 'wireless',
                    networkName: form.networkName.trim(),
                    usage: form.usage,
                    authentication: secMap.authentication,
                    security: secMap.security,
                    preSharedKey: needsPsk ? form.preSharedKey : '',
                    isSsidHidden: form.isSsidHidden,
                    isGuestPortalEnabled: form.isGuestPortalEnabled,
                    ipAssignment: form.ipAssignment,
                    useVlan: form.vlanId ? true : false,
                    vlanId: form.vlanId ? Number(form.vlanId) : null,
                    networkAddress:
                        form.ipAssignment === 'specific' ? form.networkAddress : null,
                    subnetMask:
                        form.ipAssignment === 'specific' ? form.subnetMask : null,
                };
            } else {
                body = {
                    networkKind: 'wired',
                    networkName: form.networkName.trim(),
                    usage: form.usage,
                    vlanId: Number(String(form.vlanId).trim()),
                    isIgmpSnoopingEnabled: form.isIgmpSnoopingEnabled,
                    isDhcpArpProtectionEnabled: form.isDhcpArpProtectionEnabled,
                };
            }

            const response = await apiClient.post(
                `/config/sites/${siteId}/individual/networks`,
                body,
            );

            const data = response.data;
            if (data?.status === 'success' || data?.status === 'partial') {
                setSuccess(true);
            } else {
                setApiError(
                    data?.message || data?.detail || 'Network creation failed.',
                );
            }
        } catch (err) {
            console.error('Create network error:', err);
            const detail = err?.response?.data?.detail;
            setApiError(
                typeof detail === 'string'
                    ? detail
                    : typeof detail === 'object'
                        ? JSON.stringify(detail)
                        : 'Failed to create network. Please try again.',
            );
        } finally {
            setSubmitting(false);
        }
    };

    // ── Success screen ──
    if (success) {
        return (
            <div className="min-h-screen bg-slate-950 p-6 md:p-8 text-slate-100">
                <div className="mx-auto max-w-2xl flex flex-col items-center justify-center pt-24 text-center space-y-6">
                    <div className="p-5 rounded-full bg-emerald-500/10 border-2 border-emerald-500/30">
                        <CheckCircle2 size={48} className="text-emerald-400" />
                    </div>
                    <h1 className="text-4xl font-black text-white">Network Created</h1>
                    <p className="text-slate-400 max-w-md">
                        <strong className="text-emerald-300">{form.networkName}</strong> has
                        been successfully created on{' '}
                        <strong className="text-white">{siteName}</strong>.
                        <br />
                        <span className="text-slate-500 text-sm">
                            You can now configure advanced settings like radio bands, access
                            control, and guest portal from the network configuration page.
                        </span>
                    </p>
                    <div className="flex items-center gap-3 pt-4">
                        <button
                            type="button"
                            onClick={() => navigate(`/site/${siteId}/networks`)}
                            className="inline-flex h-11 items-center justify-center rounded-xl border border-slate-600 px-6 text-sm font-black uppercase tracking-wider text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
                        >
                            View Networks
                        </button>
                        <button
                            type="button"
                            onClick={() =>
                                navigate(`/site/${siteId}/configuration/overview`)
                            }
                            className="inline-flex h-11 items-center justify-center rounded-xl bg-emerald-500 px-6 text-sm font-black uppercase tracking-wider text-slate-950 shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_8px_24px_rgba(16,185,129,0.35)] hover:bg-emerald-400 transition-colors"
                        >
                            Configure Network
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ── Render steps ──
    const renderStep = () => {
        switch (currentStep.key) {
            case 'name':
                return (
                    <StepNetworkType
                        form={form}
                        setField={setField}
                        errors={errors}
                        onNext={goNext}
                    />
                );
            case 'properties':
                return (
                    <StepSecurity
                        form={form}
                        setField={setField}
                        errors={errors}
                        onNext={goNext}
                        onBack={goBack}
                    />
                );
            case 'ip_assignment':
                return (
                    <StepAdvanced
                        form={form}
                        setField={setField}
                        errors={errors}
                        onBack={goBack}
                        onSubmit={handleSubmit}
                        loading={submitting}
                        apiError={apiError}
                    />
                );
            case 'wired_properties':
                return (
                    <StepSecurity
                        form={form}
                        setField={setField}
                        errors={errors}
                        onNext={goNext}
                        onBack={goBack}
                    />
                );
            case 'wired_review':
                return (
                    <StepReview
                        form={form}
                        onBack={goBack}
                        onSubmit={handleSubmit}
                        loading={submitting}
                        apiError={apiError}
                    />
                );
            default:
                return null;
        }
    };

    return (
        <WizardShell
            steps={steps}
            currentStepIndex={stepIndex}
            title={form.networkName || 'New Network'}
            subtitle={`Creating on ${siteName}`}
        >
            {renderStep()}
        </WizardShell>
    );
};

export default CreateNetworkWizard;
