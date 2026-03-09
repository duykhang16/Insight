import React, { useState, useEffect } from 'react';
import apiClient from '../../api/apiClient'; // still needed for POST /auth/login
import { ShieldCheck, KeyRound } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

const Login = ({ onLoginSuccess }) => {
    const { t } = useLanguage();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [checkingAuth, setCheckingAuth] = useState(true);

    // First-login password setup state
    const [setupMode, setSetupMode] = useState(false);
    const [setupToken, setSetupToken] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    // Auto-check: nếu token đã có trong sessionStorage thì bỏ qua màn hình login
    useEffect(() => {
        const storedToken = sessionStorage.getItem('token');
        if (storedToken) {
            onLoginSuccess();
        } else {
            setCheckingAuth(false);
        }
    }, [onLoginSuccess]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const res = await apiClient.post('/auth/login', { email, password });
            const data = res.data;

            // First-login flow: backend signals must_set_password
            if (data.status === 'must_set_password') {
                setSetupToken(data.setup_token);
                setSetupMode(true);
                setLoading(false);
                return;
            }

            sessionStorage.setItem('token', data.access_token);
            sessionStorage.setItem('userRole', data.role || 'viewer');
            sessionStorage.setItem('insight_user_email', data.email || email);
            sessionStorage.setItem('isZoneAdmin', String(data.is_zone_admin === true));

            // Do not setLoading(false) here, let it spin until unmount
            onLoginSuccess();
        } catch (err) {
            setLoading(false); // Only stop loading on error
            // Always show the backend detail message when available (covers 401, 403, 422+)
            setError(err.response?.data?.detail || t('login.error_failed'));
        }
    };

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
            sessionStorage.setItem('token', data.access_token);
            sessionStorage.setItem('userRole', data.role || 'viewer');
            sessionStorage.setItem('insight_user_email', data.email || email);
            sessionStorage.setItem('isZoneAdmin', String(data.is_zone_admin === true));
            onLoginSuccess();
        } catch (err) {
            setLoading(false);
            setError(err.response?.data?.detail || 'Đặt mật khẩu thất bại.');
        }
    };

    if (checkingAuth) {
        return (
            <div className="min-h-screen bg-slate-50 dark:bg-[#020617] flex items-center justify-center text-blue-500">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
            </div>
        );
    }

    const bgOrbs = (
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/10 blur-[120px] rounded-full"></div>
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-600/10 blur-[120px] rounded-full"></div>
        </div>
    );

    // ── First-login: set password ─────────────────────────────────────────────
    if (setupMode) {
        return (
            <div className="relative min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#020617] text-slate-800 dark:text-slate-200 overflow-hidden px-4">
                {bgOrbs}
                <div className="relative z-10 w-full max-w-md">
                    <div className="backdrop-blur-2xl bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 rounded-3xl p-10 shadow-2xl dark:shadow-none">
                        <div className="flex items-center gap-4 mb-8">
                            <div className="w-12 h-12 bg-amber-500/10 rounded-xl flex items-center justify-center text-amber-400 border border-amber-500/20">
                                <KeyRound size={24} />
                            </div>
                            <div>
                                <h2 className="text-xl font-black italic uppercase text-slate-800 dark:text-white tracking-tight">Đặt Mật Khẩu</h2>
                                <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mt-1">Lần đăng nhập đầu tiên</p>
                            </div>
                        </div>
                        <p className="text-xs text-slate-400 mb-6 leading-relaxed">
                            Tài khoản của bạn chưa có mật khẩu. Vui lòng đặt mật khẩu mới để tiếp tục (tối thiểu 8 ký tự).
                        </p>
                        <form onSubmit={handleSetPassword} className="flex flex-col gap-5">
                            <div className="space-y-3">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Mật khẩu mới</label>
                                <input
                                    type="password"
                                    autoFocus
                                    className="w-full h-14 bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl px-5 text-slate-800 dark:text-white focus:outline-none focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10 transition-all font-mono"
                                    value={newPassword}
                                    onChange={e => setNewPassword(e.target.value)}
                                    placeholder="Tối thiểu 8 ký tự"
                                />
                            </div>
                            <div className="space-y-3">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Xác nhận mật khẩu</label>
                                <input
                                    type="password"
                                    className="w-full h-14 bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl px-5 text-slate-800 dark:text-white focus:outline-none focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10 transition-all font-mono"
                                    value={confirmPassword}
                                    onChange={e => setConfirmPassword(e.target.value)}
                                    placeholder="Nhập lại mật khẩu"
                                />
                            </div>
                            <div className="pt-2">
                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full h-14 bg-blue-600 dark:bg-white text-white dark:text-black font-black uppercase tracking-widest rounded-xl hover:bg-blue-700 dark:hover:bg-blue-500 dark:hover:text-white transition-all shadow-xl shadow-blue-500/10 active:scale-95 disabled:opacity-50 flex items-center justify-center"
                                >
                                    {loading ? <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-current mr-3"></div> : null}
                                    {loading ? 'Đang lưu...' : 'Xác nhận & Đăng nhập'}
                                </button>
                            </div>
                        </form>
                        {error && <p className="mt-6 p-4 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-xl text-rose-600 dark:text-rose-500 text-xs font-bold text-center leading-relaxed">{error}</p>}
                    </div>
                </div>
            </div>
        );
    }

    // ── Normal login ──────────────────────────────────────────────────────────
    return (
        <div className="relative min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#020617] text-slate-800 dark:text-slate-200 overflow-hidden px-4">
            {bgOrbs}

            <div className="relative z-10 w-full max-w-md">
                <div className="backdrop-blur-2xl bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 rounded-3xl p-10 shadow-2xl dark:shadow-none">
                    <div className="flex items-center gap-4 mb-8">
                        <div className="w-12 h-12 bg-blue-50 dark:bg-blue-500/10 rounded-xl flex items-center justify-center text-blue-500 dark:text-blue-400 border border-blue-100 dark:border-blue-500/20">
                            <ShieldCheck size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-black italic uppercase text-slate-800 dark:text-white tracking-tight">{t('login.title')}</h2>
                            <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mt-1">{t('login.subtitle')}</p>
                        </div>
                    </div>

                    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
                        <div className="space-y-3">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">{t('login.email')}</label>
                            <input
                                type="email"
                                className="w-full h-14 bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl px-5 text-slate-800 dark:text-white focus:outline-none focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10 transition-all font-mono"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                            />
                        </div>
                        <div className="space-y-3">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">{t('login.password')}</label>
                            <input
                                type="password"
                                className="w-full h-14 bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl px-5 text-slate-800 dark:text-white focus:outline-none focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/10 transition-all font-mono"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                            />
                        </div>

                        <div className="pt-2">
                            <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-600 text-center mb-4">
                                {t('login.powered_by')}
                            </div>
                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full h-14 bg-blue-600 dark:bg-white text-white dark:text-black font-black uppercase tracking-widest rounded-xl hover:bg-blue-700 dark:hover:bg-blue-500 dark:hover:text-white transition-all shadow-xl shadow-blue-500/10 active:scale-95 disabled:opacity-50 flex items-center justify-center border border-transparent hover:border-blue-400/50"
                            >
                                {loading ? (
                                    <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-current mr-3"></div>
                                ) : null}
                                {loading ? t('common.loading') : t('login.sign_in')}
                            </button>
                        </div>
                    </form>
                    {error && <p className="mt-6 p-4 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-xl text-rose-600 dark:text-rose-500 text-xs font-bold text-center leading-relaxed">{error}</p>}
                </div>
            </div>
        </div>
    );
};

export default Login;
