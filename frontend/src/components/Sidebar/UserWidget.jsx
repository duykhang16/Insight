import React, { useState, useRef, useEffect, useMemo } from 'react';
import { LogOut, RefreshCw, ChevronsUpDown, Moon, Sun, Languages, KeyRound, Eye, EyeOff, CheckCircle, AlertTriangle, X, Shield } from 'lucide-react';
import { useSite } from '../../context/SiteContext';
import { useSettings } from '../../context/SettingsContext';
import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '../../context/ThemeContext';
import apiClient from '../../api/apiClient';

// Deterministic avatar system - same email always produces same color & shape
const AVATAR_GRADIENTS = [
    'from-rose-500 to-orange-400',
    'from-amber-500 to-yellow-400',
    'from-emerald-500 to-teal-400',
    'from-cyan-500 to-blue-400',
    'from-blue-500 to-indigo-500',
    'from-fuchsia-500 to-pink-400',
    'from-teal-500 to-emerald-400',
    'from-orange-500 to-rose-400',
    'from-sky-500 to-cyan-400',
    'from-lime-500 to-green-400',
    'from-pink-500 to-rose-400',
    'from-indigo-500 to-blue-400',
];

// SVG shape patterns for avatar overlay
const AVATAR_SHAPES = [
    // Triangle
    (s) => `<polygon points="${s/2},${s*0.15} ${s*0.85},${s*0.85} ${s*0.15},${s*0.85}" fill="white" opacity="0.12"/>`,
    // Circle
    (s) => `<circle cx="${s*0.65}" cy="${s*0.35}" r="${s*0.22}" fill="white" opacity="0.1"/>`,
    // Diamond
    (s) => `<polygon points="${s/2},${s*0.1} ${s*0.85},${s/2} ${s/2},${s*0.9} ${s*0.15},${s/2}" fill="white" opacity="0.08"/>`,
    // Dots
    (s) => `<circle cx="${s*0.25}" cy="${s*0.75}" r="${s*0.08}" fill="white" opacity="0.15"/><circle cx="${s*0.75}" cy="${s*0.25}" r="${s*0.06}" fill="white" opacity="0.12"/>`,
    // Slash lines
    (s) => `<line x1="${s*0.7}" y1="0" x2="${s}" y2="${s*0.3}" stroke="white" stroke-width="1.5" opacity="0.1"/><line x1="${s*0.8}" y1="0" x2="${s}" y2="${s*0.2}" stroke="white" stroke-width="1" opacity="0.08"/>`,
    // Half circle
    (s) => `<circle cx="${s}" cy="${s}" r="${s*0.4}" fill="white" opacity="0.08"/>`,
];

function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0;
    }
    return Math.abs(hash);
}

function getAvatarProps(email) {
    const hash = hashString(email || 'default');
    const gradient = AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length];
    const shape = AVATAR_SHAPES[(hash >> 4) % AVATAR_SHAPES.length];
    return { gradient, shape };
}

// Avatar component with initial letter + random gradient + shape overlay
const UserAvatar = ({ email, name, size = 'md' }) => {
    const { gradient, shape } = useMemo(() => getAvatarProps(email), [email]);
    const initial = (name || email || '?')[0].toUpperCase();
    const sizeClasses = size === 'sm'
        ? 'w-8 h-8 text-xs'
        : 'w-9 h-9 text-sm';
    const px = size === 'sm' ? 32 : 36;
    const svgShape = shape(px);

    return (
        <div className={`${sizeClasses} rounded-lg bg-gradient-to-br ${gradient} flex items-center justify-center text-white font-bold shrink-0 shadow-sm relative overflow-hidden group-hover:shadow-md transition-shadow select-none`}>
            {/* Shape overlay */}
            <svg
                className="absolute inset-0 w-full h-full pointer-events-none"
                viewBox={`0 0 ${px} ${px}`}
                xmlns="http://www.w3.org/2000/svg"
                dangerouslySetInnerHTML={{ __html: svgShape }}
            />
            {/* Letter */}
            <span className="relative z-10 drop-shadow-sm">{initial}</span>
        </div>
    );
};

// Sync status indicator
const SyncIndicator = ({ isSyncing, lastUpdated }) => {
    const { t } = useLanguage();

    const formattedTime = lastUpdated instanceof Date
        ? lastUpdated.toLocaleTimeString()
        : (lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : '--:--:--');

    return (
        <div className="flex items-center gap-1.5 mt-0.5">
            <div className="relative flex items-center justify-center">
                {isSyncing ? (
                    <RefreshCw size={8} className="text-blue-400 animate-spin" />
                ) : (
                    <>
                        <span className="absolute inline-flex h-2 w-2 rounded-full bg-emerald-500/20 animate-ping"></span>
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500 shadow-[0_0_4px_rgba(16,185,129,0.5)]"></span>
                    </>
                )}
            </div>
            <span className="text-[10px] font-medium th-text-muted whitespace-nowrap">
                {isSyncing ? t('common.syncing') : 'Live'}
            </span>
            <span className="text-[10px] font-mono th-text-muted opacity-50">
                {formattedTime}
            </span>
        </div>
    );
};

// Change Password Modal
const ChangePasswordModal = ({ onClose }) => {
    const { t } = useLanguage();
    const [form, setForm] = useState({ old_password: '', new_password: '', confirm_password: '' });
    const [showOld, setShowOld] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        if (form.new_password.length < 8) {
            setError(t('account.password_min_length') || 'Mật khẩu mới phải ít nhất 8 ký tự.');
            return;
        }
        if (form.new_password !== form.confirm_password) {
            setError(t('account.password_mismatch') || 'Mật khẩu xác nhận không khớp.');
            return;
        }

        setLoading(true);
        try {
            const res = await apiClient.post('/auth/change-password', {
                old_password: form.old_password,
                new_password: form.new_password,
            });
            setSuccess(res.data.message || t('account.password_changed') || 'Đổi mật khẩu thành công.');
            setForm({ old_password: '', new_password: '', confirm_password: '' });
            setTimeout(() => onClose(), 1500);
        } catch (err) {
            setError(err.response?.data?.detail || t('account.password_change_failed') || 'Đổi mật khẩu thất bại.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="th-bg-surface border th-border rounded-2xl w-full max-w-md shadow-2xl"
                style={{ animation: 'modalSlideIn 0.2s ease-out forwards' }}>
                <style>{`
                    @keyframes modalSlideIn {
                        from { opacity: 0; transform: translateY(12px) scale(0.96); }
                        to { opacity: 1; transform: translateY(0) scale(1); }
                    }
                `}</style>

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b th-border">
                    <div className="flex items-center gap-2">
                        <KeyRound className="w-4 h-4 text-blue-400" />
                        <h2 className="text-sm font-semibold th-text-primary">
                            {t('account.change_password') || 'Đổi mật khẩu'}
                        </h2>
                    </div>
                    <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 transition-colors">
                        <X className="w-4 h-4 th-text-secondary" />
                    </button>
                </div>

                {/* Body */}
                <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
                    {error && (
                        <div className="flex items-start gap-2 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2.5 text-xs text-rose-400">
                            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}
                    {success && (
                        <div className="flex items-start gap-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-2.5 text-xs text-emerald-400">
                            <CheckCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                            <span>{success}</span>
                        </div>
                    )}

                    {/* Old password */}
                    <div>
                        <label className="block text-xs th-text-secondary mb-1.5">
                            {t('account.old_password') || 'Mật khẩu hiện tại'}
                        </label>
                        <div className="relative">
                            <input
                                type={showOld ? 'text' : 'password'}
                                required
                                value={form.old_password}
                                onChange={(e) => setForm({ ...form, old_password: e.target.value })}
                                className="w-full th-bg-elevated border th-border th-text-primary rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 pr-10"
                                placeholder="••••••••"
                            />
                            <button
                                type="button"
                                onClick={() => setShowOld(!showOld)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 th-text-muted hover:th-text-primary transition-colors"
                            >
                                {showOld ? <EyeOff size={14} /> : <Eye size={14} />}
                            </button>
                        </div>
                    </div>

                    {/* New password */}
                    <div>
                        <label className="block text-xs th-text-secondary mb-1.5">
                            {t('account.new_password') || 'Mật khẩu mới'}
                        </label>
                        <div className="relative">
                            <input
                                type={showNew ? 'text' : 'password'}
                                required
                                value={form.new_password}
                                onChange={(e) => setForm({ ...form, new_password: e.target.value })}
                                className="w-full th-bg-elevated border th-border th-text-primary rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 pr-10"
                                placeholder="Ít nhất 8 ký tự"
                            />
                            <button
                                type="button"
                                onClick={() => setShowNew(!showNew)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 th-text-muted hover:th-text-primary transition-colors"
                            >
                                {showNew ? <EyeOff size={14} /> : <Eye size={14} />}
                            </button>
                        </div>
                    </div>

                    {/* Confirm password */}
                    <div>
                        <label className="block text-xs th-text-secondary mb-1.5">
                            {t('account.confirm_password') || 'Xác nhận mật khẩu mới'}
                        </label>
                        <input
                            type="password"
                            required
                            value={form.confirm_password}
                            onChange={(e) => setForm({ ...form, confirm_password: e.target.value })}
                            className="w-full th-bg-elevated border th-border th-text-primary rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500"
                            placeholder="Nhập lại mật khẩu mới"
                        />
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={loading}
                            className="flex-1 px-4 py-2.5 text-sm th-text-secondary border th-border hover:border-slate-500 rounded-lg transition-colors disabled:opacity-50"
                        >
                            {t('common.cancel') || 'Hủy'}
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
                        >
                            {loading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                            {loading ? (t('common.saving') || 'Đang lưu...') : (t('account.save_password') || 'Lưu mật khẩu')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const TwoFactorModal = ({ onClose }) => {
    const { t } = useLanguage();
    const userEmail = sessionStorage.getItem('insight_user_email') || 'user@insight.local';
    const [loadingStatus, setLoadingStatus] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [status, setStatus] = useState({
        two_factor_enabled: false,
        label_email: userEmail,
        has_pending_setup: false,
    });
    const [labelEmail, setLabelEmail] = useState(userEmail);
    const [currentPassword, setCurrentPassword] = useState('');
    const [otp, setOtp] = useState('');
    const [qrSvg, setQrSvg] = useState('');
    const [provisioningUri, setProvisioningUri] = useState('');
    const [mode, setMode] = useState('setup');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    useEffect(() => {
        let active = true;

        const loadStatus = async () => {
            try {
                const res = await apiClient.get('/auth/2fa/status');
                if (!active) return;
                const nextStatus = {
                    two_factor_enabled: Boolean(res.data?.two_factor_enabled),
                    label_email: res.data?.label_email || userEmail,
                    has_pending_setup: Boolean(res.data?.has_pending_setup),
                };
                setStatus(nextStatus);
                setLabelEmail(nextStatus.label_email);
                setMode(nextStatus.two_factor_enabled ? 'disable' : 'setup');
            } catch (err) {
                if (!active) return;
                setError(err.response?.data?.detail || 'Không thể tải trạng thái 2FA.');
            } finally {
                if (active) setLoadingStatus(false);
            }
        };

        loadStatus();
        return () => {
            active = false;
        };
    }, [userEmail]);

    const resetTransientState = () => {
        setCurrentPassword('');
        setOtp('');
        setQrSvg('');
        setProvisioningUri('');
        setError('');
    };

    const handleSetup = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setError('');
        setSuccess('');

        try {
            const res = await apiClient.post('/auth/2fa/setup', {
                current_password: currentPassword,
                label_email: labelEmail,
            });
            setQrSvg(res.data?.qr_svg || '');
            setProvisioningUri(res.data?.provisioning_uri || '');
            setMode('confirm');
            setOtp('');
            setSuccess('');
        } catch (err) {
            setError(err.response?.data?.detail || 'Không thể tạo QR 2FA.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleConfirm = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setError('');
        setSuccess('');

        try {
            const res = await apiClient.post('/auth/2fa/confirm', { otp });
            setStatus((prev) => ({
                ...prev,
                two_factor_enabled: true,
                label_email: labelEmail,
                has_pending_setup: false,
            }));
            setMode('disable');
            setQrSvg('');
            setProvisioningUri('');
            setCurrentPassword('');
            setOtp('');
            setSuccess(res.data?.message || t('account.two_factor_setup_success') || 'Two-factor authentication enabled successfully.');
        } catch (err) {
            setError(err.response?.data?.detail || 'Không thể xác nhận 2FA.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDisable = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setError('');
        setSuccess('');

        try {
            const res = await apiClient.post('/auth/2fa/disable', {
                current_password: currentPassword,
                otp,
            });
            setStatus((prev) => ({
                ...prev,
                two_factor_enabled: false,
                has_pending_setup: false,
            }));
            setMode('setup');
            resetTransientState();
            setSuccess(res.data?.message || t('account.two_factor_disable_success') || 'Two-factor authentication disabled successfully.');
        } catch (err) {
            setError(err.response?.data?.detail || 'Không thể tắt 2FA.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleBackToSetup = () => {
        setMode('setup');
        setQrSvg('');
        setProvisioningUri('');
        setOtp('');
        setError('');
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="th-bg-surface border th-border rounded-2xl w-full max-w-md shadow-2xl"
                style={{ animation: 'modalSlideIn 0.2s ease-out forwards' }}>
                <style>{`
                    @keyframes modalSlideIn {
                        from { opacity: 0; transform: translateY(12px) scale(0.96); }
                        to { opacity: 1; transform: translateY(0) scale(1); }
                    }
                `}</style>

                <div className="flex items-center justify-between px-6 py-4 border-b th-border">
                    <div className="flex items-center gap-2">
                        <Shield className="w-4 h-4 text-blue-400" />
                        <h2 className="text-sm font-semibold th-text-primary">
                            {t('account.two_factor') || 'Two-Factor Authentication'}
                        </h2>
                    </div>
                    <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 transition-colors">
                        <X className="w-4 h-4 th-text-secondary" />
                    </button>
                </div>

                <div className="px-6 py-5 space-y-4">
                    {error && (
                        <div className="flex items-start gap-2 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2.5 text-xs text-rose-400">
                            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}
                    {success && (
                        <div className="flex items-start gap-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-3 py-2.5 text-xs text-emerald-400">
                            <CheckCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                            <span>{success}</span>
                        </div>
                    )}

                    {loadingStatus ? (
                        <div className="flex items-center justify-center gap-2 py-10 text-sm th-text-secondary">
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            <span>{t('common.loading') || 'Loading...'}</span>
                        </div>
                    ) : (
                        <>
                            <div className="rounded-xl border th-border px-4 py-3 th-bg-elevated">
                                <div className="text-xs uppercase tracking-[0.18em] th-text-muted mb-2">Status</div>
                                <div className={`text-sm font-semibold ${status.two_factor_enabled ? 'text-emerald-400' : 'th-text-primary'}`}>
                                    {status.two_factor_enabled
                                        ? (t('account.two_factor_enabled') || 'Two-factor authentication is enabled.')
                                        : (t('account.two_factor_disabled') || 'Two-factor authentication is disabled.')}
                                </div>
                                <div className="mt-2 text-xs th-text-muted break-all">
                                    {status.label_email || userEmail}
                                </div>
                            </div>

                            {!status.two_factor_enabled && mode === 'setup' && (
                                <form onSubmit={handleSetup} className="space-y-4">
                                    <div>
                                        <label className="block text-xs th-text-secondary mb-1.5">
                                            {t('account.two_factor_label_email') || 'Authenticator Label Email'}
                                        </label>
                                        <input
                                            type="email"
                                            required
                                            value={labelEmail}
                                            onChange={(e) => setLabelEmail(e.target.value)}
                                            className="w-full th-bg-elevated border th-border th-text-primary rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500"
                                            placeholder="name@example.com"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs th-text-secondary mb-1.5">
                                            {t('account.two_factor_current_password') || 'Current Password'}
                                        </label>
                                        <input
                                            type="password"
                                            required
                                            value={currentPassword}
                                            onChange={(e) => setCurrentPassword(e.target.value)}
                                            className="w-full th-bg-elevated border th-border th-text-primary rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500"
                                            placeholder="••••••••"
                                        />
                                    </div>
                                    {status.has_pending_setup && (
                                        <p className="text-xs th-text-muted">
                                            A pending 2FA setup already exists. Creating a new QR will replace it.
                                        </p>
                                    )}
                                    <div className="flex items-center gap-3 pt-1">
                                        <button
                                            type="button"
                                            onClick={onClose}
                                            disabled={submitting}
                                            className="flex-1 px-4 py-2.5 text-sm th-text-secondary border th-border hover:border-slate-500 rounded-lg transition-colors disabled:opacity-50"
                                        >
                                            {t('common.cancel') || 'Hủy'}
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={submitting}
                                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
                                        >
                                            {submitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                                            {t('account.two_factor_setup') || 'Set Up 2FA'}
                                        </button>
                                    </div>
                                </form>
                            )}

                            {!status.two_factor_enabled && mode === 'confirm' && (
                                <form onSubmit={handleConfirm} className="space-y-4">
                                    <p className="text-xs th-text-secondary leading-relaxed">
                                        {t('account.two_factor_scan_qr') || 'Scan this QR code with your authenticator app, then enter the 6-digit code to confirm.'}
                                    </p>
                                    <div className="rounded-xl border th-border bg-white p-4 flex items-center justify-center">
                                        {qrSvg ? (
                                            <div
                                                className="w-48 h-48 [&>svg]:w-full [&>svg]:h-full"
                                                dangerouslySetInnerHTML={{ __html: qrSvg }}
                                            />
                                        ) : (
                                            <div className="text-xs text-slate-500">QR unavailable</div>
                                        )}
                                    </div>
                                    {provisioningUri && (
                                        <textarea
                                            readOnly
                                            value={provisioningUri}
                                            className="w-full h-24 th-bg-elevated border th-border th-text-primary rounded-lg px-3 py-2.5 text-[11px] focus:outline-none"
                                        />
                                    )}
                                    <div>
                                        <label className="block text-xs th-text-secondary mb-1.5">
                                            {t('account.two_factor_otp') || 'Authenticator Code'}
                                        </label>
                                        <input
                                            type="text"
                                            inputMode="numeric"
                                            autoComplete="one-time-code"
                                            maxLength={6}
                                            required
                                            value={otp}
                                            onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                            className="w-full th-bg-elevated border th-border th-text-primary rounded-lg px-3 py-2.5 text-sm font-mono tracking-[0.35em] focus:outline-none focus:border-blue-500"
                                            placeholder="123456"
                                        />
                                    </div>
                                    <div className="flex items-center gap-3 pt-1">
                                        <button
                                            type="button"
                                            onClick={handleBackToSetup}
                                            disabled={submitting}
                                            className="flex-1 px-4 py-2.5 text-sm th-text-secondary border th-border hover:border-slate-500 rounded-lg transition-colors disabled:opacity-50"
                                        >
                                            {t('common.cancel') || 'Hủy'}
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={submitting || otp.length !== 6}
                                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
                                        >
                                            {submitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                                            {t('account.two_factor_confirm') || 'Confirm 2FA'}
                                        </button>
                                    </div>
                                </form>
                            )}

                            {status.two_factor_enabled && (
                                <form onSubmit={handleDisable} className="space-y-4">
                                    <div>
                                        <label className="block text-xs th-text-secondary mb-1.5">
                                            {t('account.two_factor_current_password') || 'Current Password'}
                                        </label>
                                        <input
                                            type="password"
                                            required
                                            value={currentPassword}
                                            onChange={(e) => setCurrentPassword(e.target.value)}
                                            className="w-full th-bg-elevated border th-border th-text-primary rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500"
                                            placeholder="••••••••"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs th-text-secondary mb-1.5">
                                            {t('account.two_factor_otp') || 'Authenticator Code'}
                                        </label>
                                        <input
                                            type="text"
                                            inputMode="numeric"
                                            autoComplete="one-time-code"
                                            maxLength={6}
                                            required
                                            value={otp}
                                            onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                            className="w-full th-bg-elevated border th-border th-text-primary rounded-lg px-3 py-2.5 text-sm font-mono tracking-[0.35em] focus:outline-none focus:border-blue-500"
                                            placeholder="123456"
                                        />
                                    </div>
                                    <div className="flex items-center gap-3 pt-1">
                                        <button
                                            type="button"
                                            onClick={onClose}
                                            disabled={submitting}
                                            className="flex-1 px-4 py-2.5 text-sm th-text-secondary border th-border hover:border-slate-500 rounded-lg transition-colors disabled:opacity-50"
                                        >
                                            {t('common.cancel') || 'Hủy'}
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={submitting || otp.length !== 6}
                                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm bg-rose-600 hover:bg-rose-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
                                        >
                                            {submitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                                            {t('account.two_factor_disable') || 'Disable 2FA'}
                                        </button>
                                    </div>
                                </form>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

const UserWidget = ({ onLogout }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [showChangePassword, setShowChangePassword] = useState(false);
    const [showTwoFactorModal, setShowTwoFactorModal] = useState(false);
    const { selectedSiteId, sites, lastUpdated, loadingSites } = useSite();
    const { isAutoRefreshEnabled } = useSettings();
    const { t, language, toggleLanguage } = useLanguage();
    const { theme, toggleTheme } = useTheme();
    const dropdownRef = useRef(null);

    const userRole = sessionStorage.getItem('userRole') || 'viewer';
    const userEmail = sessionStorage.getItem('insight_user_email') || 'user@insight.local';
    const userName = userEmail.split('@')[0];
    const userInitial = userName[0]?.toUpperCase() || '?';

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <>
            {showChangePassword && (
                <ChangePasswordModal onClose={() => setShowChangePassword(false)} />
            )}
            {showTwoFactorModal && (
                <TwoFactorModal onClose={() => setShowTwoFactorModal(false)} />
            )}

            <div className="relative mx-2 mb-2" ref={dropdownRef}>
                {/* Dropdown Menu */}
                {isOpen && (
                    <div
                        className="absolute bottom-full left-0 w-full mb-1.5 z-50"
                        style={{ animation: 'userDropdownIn 0.15s ease-out forwards' }}
                    >
                        <style>{`
                            @keyframes userDropdownIn {
                                from { opacity: 0; transform: translateY(4px) scale(0.97); }
                                to { opacity: 1; transform: translateY(0) scale(1); }
                            }
                        `}</style>
                        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 shadow-lg dark:shadow-2xl dark:shadow-black/30 rounded-xl overflow-hidden">
                            {/* User info header */}
                            <div className="px-3 py-3 border-b border-slate-100 dark:border-white/5">
                                <div className="flex items-center gap-3">
                                    <UserAvatar email={userEmail} name={userName} size="sm" />
                                    <div className="min-w-0">
                                        <p className="text-xs font-semibold text-slate-800 dark:text-white truncate">{userName}</p>
                                        <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate">{userEmail}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Settings: Theme & Language & Password */}
                            <div className="p-1 border-b border-slate-100 dark:border-white/5">
                                {/* Theme toggle */}
                                <button
                                    onClick={toggleTheme}
                                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors group"
                                >
                                    {theme === 'dark' ? (
                                        <Sun size={14} className="opacity-60 group-hover:opacity-100 group-hover:text-amber-500 transition-all" />
                                    ) : (
                                        <Moon size={14} className="opacity-60 group-hover:opacity-100 group-hover:text-blue-500 transition-all" />
                                    )}
                                    <span className="flex-1 text-left">
                                        {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
                                    </span>
                                </button>

                                {/* Language toggle */}
                                <button
                                    onClick={toggleLanguage}
                                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors group"
                                >
                                    <Languages size={14} className="opacity-60 group-hover:opacity-100 transition-opacity" />
                                    <span className="flex-1 text-left">
                                        {language === 'vi' ? 'English' : 'Tiếng Việt'}
                                    </span>
                                    <span className="text-[10px] font-bold uppercase text-slate-400 dark:text-slate-500">
                                        {language}
                                    </span>
                                </button>

                                {/* Change Password */}
                                <button
                                    onClick={() => {
                                        setIsOpen(false);
                                        setShowChangePassword(true);
                                    }}
                                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors group"
                                >
                                    <KeyRound size={14} className="opacity-60 group-hover:opacity-100 group-hover:text-blue-500 transition-all" />
                                    <span className="flex-1 text-left">
                                        {t('account.change_password') || 'Đổi mật khẩu'}
                                    </span>
                                </button>

                                <button
                                    onClick={() => {
                                        setIsOpen(false);
                                        setShowTwoFactorModal(true);
                                    }}
                                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors group"
                                >
                                    <Shield size={14} className="opacity-60 group-hover:opacity-100 group-hover:text-blue-500 transition-all" />
                                    <span className="flex-1 text-left">
                                        {t('account.two_factor') || 'Two-Factor Authentication'}
                                    </span>
                                </button>

                            </div>

                            {/* Logout */}
                            <div className="p-1">
                                <button
                                    onClick={() => {
                                        setIsOpen(false);
                                        onLogout();
                                    }}
                                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-400 transition-colors group"
                                >
                                    <LogOut size={14} className="opacity-60 group-hover:opacity-100 transition-opacity" />
                                    {t('common.logout')}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Widget Button */}
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className={`w-full p-2.5 flex items-center gap-3 rounded-xl transition-all duration-150 focus:outline-none group ${
                        isOpen
                            ? 'bg-slate-100 dark:bg-white/5'
                            : 'hover:bg-slate-100 dark:hover:bg-white/5'
                    }`}
                >
                    <UserAvatar email={userEmail} name={userName} size="md" />
                    <div className="flex-1 min-w-0 text-left">
                        <div className="text-xs font-semibold th-text-primary truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                            {userName}
                        </div>
                        <SyncIndicator isSyncing={loadingSites} lastUpdated={lastUpdated} />
                    </div>
                    <ChevronsUpDown
                        size={16}
                        className="th-text-muted opacity-40 group-hover:opacity-70 transition-opacity shrink-0"
                    />
                </button>
            </div>
        </>
    );
};

export default UserWidget;
