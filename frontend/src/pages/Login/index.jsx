import React, { useState, useEffect, useRef } from 'react';
import apiClient from '../../api/apiClient';
<<<<<<< HEAD
import { Sun, Moon, ArrowLeft, Loader2 } from 'lucide-react';
import { ShieldCheck, Key, Envelope, Lock } from '@phosphor-icons/react';
=======
import { ShieldCheck, KeyRound, Sun, Moon, ArrowLeft, Mail, Lock, Loader2 } from 'lucide-react';
>>>>>>> parent of 30b1732 (Delete frontend directory)
import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '../../context/ThemeContext';
import SplashScreen from '../../components/SplashScreen';

// Prefetch zones + sites in parallel — runs immediately after auth
const prefetchAllData = async () => {
    try {
        const [zonesResult, sitesResult] = await Promise.allSettled([
            // Zones: get list then fetch details for each
            apiClient.get('/zones/my').then(async (res) => {
                const zoneList = res.data || [];
                const details = await Promise.all(
                    zoneList.map(z => apiClient.get(`/zones/${z.id}`).then(r => r.data).catch(() => null))
                );
                return details.filter(Boolean);
            }),
            // Sites: simple list fetch
            apiClient.get('/overview/sites').then(res => {
                return Array.isArray(res.data) ? res.data : (res.data.sites || []);
            }),
        ]);

        return {
            zones: zonesResult.status === 'fulfilled' ? zonesResult.value : null,
            sites: sitesResult.status === 'fulfilled' ? sitesResult.value : null,
        };
    } catch (err) {
        console.warn('Prefetch failed:', err);
        return { zones: null, sites: null };
    }
};

// Login steps
const STEP_EMAIL = 'email';
const STEP_PASSWORD = 'password';
<<<<<<< HEAD
const STEP_OTP = 'otp';
=======
>>>>>>> parent of 30b1732 (Delete frontend directory)
const STEP_SET_PASSWORD = 'set_password';

const Login = ({ onLoginSuccess }) => {
    const { t } = useLanguage();
    const { theme, toggleTheme } = useTheme();
    const [step, setStep] = useState(STEP_EMAIL);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
<<<<<<< HEAD
    const [otp, setOtp] = useState('');
    const [otpChallengeToken, setOtpChallengeToken] = useState('');
=======
>>>>>>> parent of 30b1732 (Delete frontend directory)
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [checkingAuth, setCheckingAuth] = useState(true);

    // Splash screen phase — renders SplashScreen INSIDE Login
    const [splashPhase, setSplashPhase] = useState(false);
    const [splashPrefetchPromise, setSplashPrefetchPromise] = useState(null);
    const [splashEmail, setSplashEmail] = useState('');

    // First-login password setup state
    const [setupToken, setSetupToken] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    // Animation
    const [slideDirection, setSlideDirection] = useState('right');
    const [isAnimating, setIsAnimating] = useState(false);

    const passwordRef = useRef(null);
<<<<<<< HEAD
    const otpRef = useRef(null);
=======
>>>>>>> parent of 30b1732 (Delete frontend directory)
    const emailRef = useRef(null);

    // Auto-check: nếu token đã có trong sessionStorage thì bỏ qua màn hình login
    useEffect(() => {
        const storedToken = sessionStorage.getItem('token');
        if (storedToken) {
            onLoginSuccess();
        } else {
            setCheckingAuth(false);
        }
    }, [onLoginSuccess]);

    // Auto-focus password input when entering step 2
    useEffect(() => {
        if (step === STEP_PASSWORD && passwordRef.current) {
            setTimeout(() => passwordRef.current?.focus(), 350);
        }
<<<<<<< HEAD
        if (step === STEP_OTP && otpRef.current) {
            setTimeout(() => otpRef.current?.focus(), 350);
        }
=======
>>>>>>> parent of 30b1732 (Delete frontend directory)
        if (step === STEP_EMAIL && emailRef.current) {
            setTimeout(() => emailRef.current?.focus(), 350);
        }
    }, [step]);

    // Helper: transition between steps
    const transitionTo = (newStep, direction = 'right') => {
        setSlideDirection(direction);
        setIsAnimating(true);
        setTimeout(() => {
            setStep(newStep);
            setError('');
            setIsAnimating(false);
        }, 200);
    };

<<<<<<< HEAD
    // Helper: enter splash phase after auth
    const enterSplashPhase = (userEmail) => {
=======
    // Helper: enter splash phase after auth (skip for super_admin — no zone/site data needed)
    const enterSplashPhase = (userEmail) => {
        const role = sessionStorage.getItem('userRole');
        if (role === 'super_admin') {
            // super_admin has separate UI — skip prefetch & splash entirely
            onLoginSuccess(null);
            return;
        }
>>>>>>> parent of 30b1732 (Delete frontend directory)
        const prefetchPromise = prefetchAllData();
        setSplashEmail(userEmail);
        setSplashPrefetchPromise(prefetchPromise);
        setSplashPhase(true);
    };

<<<<<<< HEAD
    const completeLogin = (data, fallbackEmail = email) => {
        sessionStorage.setItem('token', data.access_token);
        sessionStorage.setItem('userRole', data.role || 'viewer');
        sessionStorage.setItem('insight_user_email', data.email || fallbackEmail);
        sessionStorage.setItem('isZoneAdmin', String(data.is_zone_admin === true));
        if (data.permissions) {
            sessionStorage.setItem('rolePermissions', JSON.stringify(data.permissions));
        }
        enterSplashPhase(data.email || fallbackEmail);
    };

=======
>>>>>>> parent of 30b1732 (Delete frontend directory)
    // ── Step 1: Check email ───────────────────────────────────────────
    const handleCheckEmail = async (e) => {
        e.preventDefault();
        if (!email.trim()) return;
        setLoading(true);
        setError('');

        try {
            const res = await apiClient.post('/auth/check-email', { email: email.trim() });
            const data = res.data;

            if (data.next_step === 'must_set_password') {
                setSetupToken(data.setup_token);
                setLoading(false);
                transitionTo(STEP_SET_PASSWORD);
                return;
            }

            // next_step === 'enter_password'
            setLoading(false);
            transitionTo(STEP_PASSWORD);
        } catch (err) {
            setLoading(false);
            setError(err.response?.data?.detail || t('login.error_failed'));
        }
    };

    // ── Step 2: Login with password ───────────────────────────────────
    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const res = await apiClient.post('/auth/login', { email, password });
            const data = res.data;

            // First-login flow: backend signals must_set_password (fallback)
            if (data.status === 'must_set_password') {
                setSetupToken(data.setup_token);
                setLoading(false);
                transitionTo(STEP_SET_PASSWORD);
                return;
            }

<<<<<<< HEAD
            if (data.status === 'otp_required') {
                setOtp('');
                setOtpChallengeToken(data.otp_challenge_token || '');
                setLoading(false);
                transitionTo(STEP_OTP);
                return;
            }

            completeLogin(data);
        } catch (err) {
            setLoading(false);
            setError(err.response?.data?.detail || t('login.error_failed'));
        }
    };

    const handleVerifyOtp = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const res = await apiClient.post('/auth/verify-otp', {
                otp_challenge_token: otpChallengeToken,
                otp,
            });
            completeLogin(res.data);
=======
            sessionStorage.setItem('token', data.access_token);
            sessionStorage.setItem('userRole', data.role || 'viewer');
            sessionStorage.setItem('insight_user_email', data.email || email);
            sessionStorage.setItem('isZoneAdmin', String(data.is_zone_admin === true));
            if (data.permissions) {
                sessionStorage.setItem('rolePermissions', JSON.stringify(data.permissions));
            }

            enterSplashPhase(data.email || email);
>>>>>>> parent of 30b1732 (Delete frontend directory)
        } catch (err) {
            setLoading(false);
            setError(err.response?.data?.detail || t('login.error_failed'));
        }
    };

    // ── Set password (first login) ────────────────────────────────────
    const handleSetPassword = async (e) => {
        e.preventDefault();
        setError('');
        if (newPassword.length < 8) {
            setError('Mật khẩu phải ít nhất 8 ký tự.');
            return;
        }
        if (newPassword !== confirmPassword) {
            setError('Mật khẩu xác nhận không khớp.');
            return;
        }
        setLoading(true);
        try {
            const res = await apiClient.post('/auth/set-password', {
                setup_token: setupToken,
                new_password: newPassword,
            });
            const data = res.data;
<<<<<<< HEAD
            if (data.status === 'otp_required') {
                setOtp('');
                setOtpChallengeToken(data.otp_challenge_token || '');
                setLoading(false);
                transitionTo(STEP_OTP);
                return;
            }
            completeLogin(data);
=======
            sessionStorage.setItem('token', data.access_token);
            sessionStorage.setItem('userRole', data.role || 'viewer');
            sessionStorage.setItem('insight_user_email', data.email || email);
            sessionStorage.setItem('isZoneAdmin', String(data.is_zone_admin === true));
            if (data.permissions) {
                sessionStorage.setItem('rolePermissions', JSON.stringify(data.permissions));
            }
            enterSplashPhase(data.email || email);
>>>>>>> parent of 30b1732 (Delete frontend directory)
        } catch (err) {
            setLoading(false);
            setError(err.response?.data?.detail || 'Đặt mật khẩu thất bại.');
        }
    };

    // ── Use another account ───────────────────────────────────────────
    const handleUseAnotherAccount = () => {
        setPassword('');
<<<<<<< HEAD
        setOtp('');
        setOtpChallengeToken('');
=======
>>>>>>> parent of 30b1732 (Delete frontend directory)
        setError('');
        setNewPassword('');
        setConfirmPassword('');
        setSetupToken('');
        transitionTo(STEP_EMAIL, 'left');
    };

    // ── Splash Phase ──────────────────────────────────────────────────
    if (splashPhase) {
        return (
            <SplashScreen
                prefetchPromise={splashPrefetchPromise}
                email={splashEmail}
                onComplete={(data) => {
                    onLoginSuccess(data);
                }}
            />
        );
    }

    if (checkingAuth) {
        return (
            <div className="min-h-screen bg-slate-50 dark:bg-[#020617] flex items-center justify-center text-blue-500">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
            </div>
        );
    }

    // ── CSS animation classes ─────────────────────────────────────────
    const animationClass = isAnimating
        ? `login-slide-out-${slideDirection}`
        : `login-slide-in-${slideDirection}`;

    // ── Render ────────────────────────────────────────────────────────
    return (
        <div className="relative min-h-screen bg-slate-50 dark:bg-[#020617] text-slate-800 dark:text-slate-200 overflow-hidden">
            {/* Inline styles for slide animations */}
            <style>{`
                @keyframes slideInFromRight {
                    from { opacity: 0; transform: translateX(24px); }
                    to { opacity: 1; transform: translateX(0); }
                }
                @keyframes slideInFromLeft {
                    from { opacity: 0; transform: translateX(-24px); }
                    to { opacity: 1; transform: translateX(0); }
                }
                @keyframes slideOutToLeft {
                    from { opacity: 1; transform: translateX(0); }
                    to { opacity: 0; transform: translateX(-24px); }
                }
                @keyframes slideOutToRight {
                    from { opacity: 1; transform: translateX(0); }
                    to { opacity: 0; transform: translateX(24px); }
                }
                .login-slide-in-right { animation: slideInFromRight 0.3s ease-out forwards; }
                .login-slide-in-left { animation: slideInFromLeft 0.3s ease-out forwards; }
                .login-slide-out-right { animation: slideOutToLeft 0.2s ease-in forwards; }
                .login-slide-out-left { animation: slideOutToRight 0.2s ease-in forwards; }

                @keyframes fadeInUp {
                    from { opacity: 0; transform: translateY(12px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .login-fade-in { animation: fadeInUp 0.4s ease-out forwards; }
                .login-fade-in-delay { animation: fadeInUp 0.4s ease-out 0.1s forwards; opacity: 0; }

                .login-input-focus {
                    transition: all 0.2s ease;
                }
                .login-input-focus:focus {
                    border-color: rgba(59, 130, 246, 0.5);
                    box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.08);
                }

                .login-brand-gradient {
                    background: linear-gradient(135deg, #3b82f6 0%, #6366f1 50%, #8b5cf6 100%);
                }
            `}</style>

            {/* Theme toggle — top right */}
            <button
                onClick={toggleTheme}
                className="absolute top-6 right-6 z-50 p-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white/80 dark:bg-white/5 backdrop-blur-xl shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all text-slate-500 dark:text-slate-400 hover:text-amber-500 dark:hover:text-blue-400"
                title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
                {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
            </button>

            {/* Background orbs */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/10 blur-[120px] rounded-full"></div>
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-600/10 blur-[120px] rounded-full"></div>
            </div>

            {/* ── Centered floating card ─────────────────────────────────── */}
            <div className="min-h-screen flex items-center justify-center px-4 py-12 relative z-10">
                <div className="w-full max-w-[420px] bg-white dark:bg-slate-900/80 dark:backdrop-blur-2xl border border-slate-200 dark:border-white/10 rounded-2xl shadow-xl dark:shadow-2xl dark:shadow-black/20 p-8 sm:p-10">
                    {/* Logo — single instance */}
                    <div className="flex items-center justify-center gap-3 mb-2 login-fade-in">
                        <div className="w-11 h-11 bg-blue-50 dark:bg-blue-500/10 rounded-xl flex items-center justify-center text-blue-500 dark:text-blue-400 border border-blue-100 dark:border-blue-500/20">
<<<<<<< HEAD
                            <ShieldCheck size={22} weight="duotone" />
=======
                            <ShieldCheck size={22} />
>>>>>>> parent of 30b1732 (Delete frontend directory)
                        </div>
                        <span className="text-2xl font-black tracking-wide text-slate-800 dark:text-white">INSIGHT</span>
                    </div>

                    {/* ── STEP 1: Email ────────────────────────────────────── */}
                    {step === STEP_EMAIL && (
                        <div className={animationClass}>
                            <div className="text-center mb-6">
                                <p className="text-sm text-slate-500 dark:text-slate-400">
                                    {t('login.email_subtitle')}
                                </p>
                            </div>

                            <form onSubmit={handleCheckEmail} className="flex flex-col gap-4">
                                <div className="space-y-2">
                                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                                        {t('login.email')}
                                    </label>
                                    <div className="relative">
<<<<<<< HEAD
                                        <Envelope size={16} weight="duotone" className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none" />
=======
                                        <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none" />
>>>>>>> parent of 30b1732 (Delete frontend directory)
                                        <input
                                            ref={emailRef}
                                            id="login-email"
                                            type="email"
                                            autoFocus
                                            autoComplete="email"
                                            className="login-input-focus w-full h-12 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg pl-11 pr-4 text-slate-800 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none transition-all text-sm"
                                            value={email}
                                            onChange={e => setEmail(e.target.value)}
                                            placeholder="name@example.com"
                                        />
                                    </div>
                                </div>

                                <button
                                    id="login-continue-btn"
                                    type="submit"
                                    disabled={loading || !email.trim()}
                                    className="w-full h-12 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-semibold rounded-lg hover:bg-slate-800 dark:hover:bg-slate-100 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm"
                                >
                                    {loading && <Loader2 size={16} className="animate-spin" />}
                                    {loading ? t('login.checking_email') : t('login.continue')}
                                </button>
                            </form>

                            {/* Divider */}
                            <div className="relative my-6">
                                <div className="absolute inset-0 flex items-center">
                                    <div className="w-full border-t border-slate-200 dark:border-white/10"></div>
                                </div>
                                <div className="relative flex justify-center text-xs">
                                    <span className="bg-white dark:bg-slate-900/80 px-3 text-slate-400 dark:text-slate-500 uppercase tracking-widest font-medium">
                                        {t('login.powered_by')}
                                    </span>
                                </div>
                            </div>

                            {error && (
                                <div className="p-3.5 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-lg text-rose-600 dark:text-rose-400 text-xs font-medium text-center leading-relaxed login-fade-in">
                                    {error}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── STEP 2: Password ─────────────────────────────────── */}
                    {step === STEP_PASSWORD && (
                        <div className={animationClass}>
                            <div className="text-center mb-8">
                                <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                                    {t('login.step_password_title')}
                                </h1>
                                <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
                                    {t('login.step_password_subtitle')}
                                </p>
                            </div>

                            {/* Email badge — read-only */}
                            <div className="mb-6">
                                <div className="flex items-center gap-3 p-3 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg">
                                    <div className="w-9 h-9 bg-blue-50 dark:bg-blue-500/10 rounded-full flex items-center justify-center text-blue-500 dark:text-blue-400 shrink-0">
<<<<<<< HEAD
                                        <Envelope size={16} weight="duotone" />
=======
                                        <Mail size={16} />
>>>>>>> parent of 30b1732 (Delete frontend directory)
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-slate-800 dark:text-white truncate">{email}</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleUseAnotherAccount}
                                        className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline transition-colors whitespace-nowrap"
                                    >
                                        {t('login.use_another_account')}
                                    </button>
                                </div>
                            </div>

                            <form onSubmit={handleLogin} className="flex flex-col gap-4">
                                <div className="space-y-2">
                                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                                        {t('login.password')}
                                    </label>
                                    <div className="relative">
<<<<<<< HEAD
                                        <Lock size={16} weight="duotone" className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none" />
=======
                                        <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none" />
>>>>>>> parent of 30b1732 (Delete frontend directory)
                                        <input
                                            ref={passwordRef}
                                            id="login-password"
                                            type="password"
                                            autoComplete="current-password"
                                            className="login-input-focus w-full h-12 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg pl-11 pr-4 text-slate-800 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none transition-all text-sm"
                                            value={password}
                                            onChange={e => setPassword(e.target.value)}
                                            placeholder="••••••••"
                                        />
                                    </div>
                                </div>

                                <button
                                    id="login-submit-btn"
                                    type="submit"
                                    disabled={loading || !password}
                                    className="w-full h-12 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-semibold rounded-lg hover:bg-slate-800 dark:hover:bg-slate-100 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm"
                                >
                                    {loading && <Loader2 size={16} className="animate-spin" />}
                                    {loading ? t('common.loading') : t('login.sign_in')}
                                </button>
                            </form>

                            {/* Back link */}
                            <div className="mt-5 text-center">
                                <button
                                    type="button"
                                    onClick={handleUseAnotherAccount}
                                    className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
                                >
                                    <ArrowLeft size={14} />
                                    {t('login.use_another_account')}
                                </button>
                            </div>

                            {error && (
                                <div className="mt-4 p-3.5 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-lg text-rose-600 dark:text-rose-400 text-xs font-medium text-center leading-relaxed login-fade-in">
                                    {error}
                                </div>
                            )}
                        </div>
                    )}

<<<<<<< HEAD
                    {/* ── STEP 3: OTP ─────────────────────────────────────── */}
                    {step === STEP_OTP && (
                        <div className={animationClass}>
                            <div className="text-center mb-8">
                                <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                                    {t('login.step_otp_title') || 'Two-Factor Authentication'}
                                </h1>
                                <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
                                    {t('login.step_otp_subtitle') || 'Enter the 6-digit code from your authenticator app'}
                                </p>
                            </div>

                            <div className="mb-6">
                                <div className="flex items-center gap-3 p-3 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg">
                                    <div className="w-9 h-9 bg-blue-50 dark:bg-blue-500/10 rounded-full flex items-center justify-center text-blue-500 dark:text-blue-400 shrink-0">
                                        <Envelope size={16} weight="duotone" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-slate-800 dark:text-white truncate">{email}</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleUseAnotherAccount}
                                        className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 hover:underline transition-colors whitespace-nowrap"
                                    >
                                        {t('login.use_another_account')}
                                    </button>
                                </div>
                            </div>

                            <form onSubmit={handleVerifyOtp} className="flex flex-col gap-4">
                                <div className="space-y-2">
                                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                                        {t('login.otp') || 'One-Time Password'}
                                    </label>
                                    <div className="relative">
                                        <Key size={16} weight="duotone" className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none" />
                                        <input
                                            ref={otpRef}
                                            type="text"
                                            inputMode="numeric"
                                            autoComplete="one-time-code"
                                            maxLength={6}
                                            className="login-input-focus w-full h-12 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg pl-11 pr-4 text-slate-800 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none transition-all text-sm tracking-[0.4em] font-mono"
                                            value={otp}
                                            onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                            placeholder={t('login.otp_placeholder') || '123456'}
                                        />
                                    </div>
                                </div>

                                <button
                                    type="submit"
                                    disabled={loading || otp.length !== 6 || !otpChallengeToken}
                                    className="w-full h-12 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-semibold rounded-lg hover:bg-slate-800 dark:hover:bg-slate-100 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm"
                                >
                                    {loading && <Loader2 size={16} className="animate-spin" />}
                                    {loading ? t('common.loading') : (t('login.verify_otp') || 'Verify OTP')}
                                </button>
                            </form>

                            <div className="mt-5 text-center">
                                <button
                                    type="button"
                                    onClick={handleUseAnotherAccount}
                                    className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
                                >
                                    <ArrowLeft size={14} />
                                    {t('login.use_another_account')}
                                </button>
                            </div>

                            {error && (
                                <div className="mt-4 p-3.5 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-lg text-rose-600 dark:text-rose-400 text-xs font-medium text-center leading-relaxed login-fade-in">
                                    {error}
                                </div>
                            )}
                        </div>
                    )}

=======
>>>>>>> parent of 30b1732 (Delete frontend directory)
                    {/* ── STEP: Set Password (first login) ─────────────────── */}
                    {step === STEP_SET_PASSWORD && (
                        <div className={animationClass}>
                            <div className="text-center mb-8">
                                <div className="w-14 h-14 bg-amber-50 dark:bg-amber-500/10 rounded-2xl flex items-center justify-center text-amber-500 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20 mx-auto mb-4">
<<<<<<< HEAD
                                    <Key size={24} weight="duotone" />
=======
                                    <KeyRound size={24} />
>>>>>>> parent of 30b1732 (Delete frontend directory)
                                </div>
                                <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                                    Đặt Mật Khẩu
                                </h1>
                                <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
                                    Lần đăng nhập đầu tiên
                                </p>
                            </div>

                            {/* Email badge — read-only */}
                            <div className="mb-4">
                                <div className="flex items-center gap-3 p-3 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg">
                                    <div className="w-9 h-9 bg-blue-50 dark:bg-blue-500/10 rounded-full flex items-center justify-center text-blue-500 dark:text-blue-400 shrink-0">
<<<<<<< HEAD
                                        <Envelope size={16} weight="duotone" />
=======
                                        <Mail size={16} />
>>>>>>> parent of 30b1732 (Delete frontend directory)
                                    </div>
                                    <p className="flex-1 text-sm font-medium text-slate-800 dark:text-white truncate">{email}</p>
                                </div>
                            </div>

                            <p className="text-xs text-slate-400 dark:text-slate-500 mb-5 leading-relaxed text-center">
                                Tài khoản của bạn chưa có mật khẩu. Vui lòng đặt mật khẩu mới để tiếp tục (tối thiểu 8 ký tự).
                            </p>

                            <form onSubmit={handleSetPassword} className="flex flex-col gap-4">
                                <div className="space-y-2">
                                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Mật khẩu mới</label>
                                    <div className="relative">
<<<<<<< HEAD
                                        <Lock size={16} weight="duotone" className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none" />
=======
                                        <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none" />
>>>>>>> parent of 30b1732 (Delete frontend directory)
                                        <input
                                            type="password"
                                            autoFocus
                                            className="login-input-focus w-full h-12 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg pl-11 pr-4 text-slate-800 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none transition-all text-sm font-mono"
                                            value={newPassword}
                                            onChange={e => setNewPassword(e.target.value)}
                                            placeholder="Tối thiểu 8 ký tự"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Xác nhận mật khẩu</label>
                                    <div className="relative">
<<<<<<< HEAD
                                        <Lock size={16} weight="duotone" className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none" />
=======
                                        <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none" />
>>>>>>> parent of 30b1732 (Delete frontend directory)
                                        <input
                                            type="password"
                                            className="login-input-focus w-full h-12 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg pl-11 pr-4 text-slate-800 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none transition-all text-sm font-mono"
                                            value={confirmPassword}
                                            onChange={e => setConfirmPassword(e.target.value)}
                                            placeholder="Nhập lại mật khẩu"
                                        />
                                    </div>
                                </div>

                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full h-12 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-semibold rounded-lg hover:bg-slate-800 dark:hover:bg-slate-100 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm"
                                >
                                    {loading && <Loader2 size={16} className="animate-spin" />}
                                    {loading ? 'Đang lưu...' : 'Xác nhận & Đăng nhập'}
                                </button>
                            </form>

                            {/* Back link */}
                            <div className="mt-5 text-center">
                                <button
                                    type="button"
                                    onClick={handleUseAnotherAccount}
                                    className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
                                >
                                    <ArrowLeft size={14} />
                                    {t('login.use_another_account')}
                                </button>
                            </div>

                            {error && (
                                <div className="mt-4 p-3.5 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-lg text-rose-600 dark:text-rose-400 text-xs font-medium text-center leading-relaxed login-fade-in">
                                    {error}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Footer — only show on password/set_password steps where divider is hidden */}
                    {step !== STEP_EMAIL && (
                        <p className="text-center text-[10px] text-slate-400 dark:text-slate-600 mt-6 tracking-wide uppercase font-medium">
                            {t('login.powered_by')}
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Login;
