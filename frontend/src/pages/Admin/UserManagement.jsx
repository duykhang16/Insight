import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Users, Plus, Trash2, KeyRound, ShieldCheck, AlertTriangle, CheckCircle, Lock, X } from 'lucide-react';
import apiClient from '../../api/apiClient';
import { useLanguage } from '../../context/LanguageContext';

const TENANT_ADMIN_CREATABLE_ROLES = ['manager', 'viewer'];

const ROLE_LABEL = {
    manager: 'Manager',
    viewer:  'Viewer',
};

const ROLE_BADGE = {
    manager: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    viewer:  'bg-slate-700/50 text-slate-500 border-slate-700',
};

// ── Email autocomplete (same domain) ─────────────────────────────────────────

const getDomain = (email) => { const i = email.indexOf('@'); return i >= 0 ? email.slice(i) : ''; };

function EmailInput({ value, onChange, existingEmails, placeholder }) {
    const [suggestions, setSuggestions] = useState([]);
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, []);

    const handleChange = (e) => {
        const v = e.target.value;
        onChange(v);
        if (v.includes('@')) {
            const domain = getDomain(v);
            const prefix = v.split('@')[0].toLowerCase();
            const matches = existingEmails.filter(
                em => em !== v && getDomain(em) === domain && em.split('@')[0].toLowerCase().startsWith(prefix)
            );
            setSuggestions(matches.slice(0, 6));
            setOpen(matches.length > 0);
        } else {
            setSuggestions([]);
            setOpen(false);
        }
    };

    return (
        <div ref={ref} className="relative">
            <input
                type="email"
                required
                value={value}
                onChange={handleChange}
                onFocus={() => { if (suggestions.length) setOpen(true); }}
                className="w-full bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                placeholder={placeholder}
                autoComplete="off"
            />
            {open && (
                <ul className="absolute top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-700 rounded shadow-xl z-50 max-h-40 overflow-y-auto">
                    {suggestions.map(s => (
                        <li
                            key={s}
                            className="px-3 py-2 text-sm text-slate-300 hover:bg-slate-700 cursor-pointer"
                            onMouseDown={() => { onChange(s); setOpen(false); }}
                        >
                            {s}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

// ── Alert banner ──────────────────────────────────────────────────────────────

const Alert = ({ type, message, onClose }) => {
    const base = type === 'error'
        ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
        : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400';
    const Icon = type === 'error' ? AlertTriangle : CheckCircle;
    return (
        <div className={`flex items-start gap-2 border rounded-lg px-4 py-3 mb-4 text-sm ${base}`}>
            <Icon className="w-4 h-4 mt-0.5 shrink-0" />
            <span className="flex-1">{message}</span>
            {onClose && <button onClick={onClose} className="text-current opacity-60 hover:opacity-100 ml-2">&times;</button>}
        </div>
    );
};

// ── Main component ────────────────────────────────────────────────────────────

const UserManagement = () => {
    const { t } = useLanguage();
    const currentUserEmail = sessionStorage.getItem('insight_user_email') || '';

    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [alert, setAlert] = useState(null);

    // Create form
    const [showCreate, setShowCreate] = useState(false);
    const [formEmail, setFormEmail] = useState('');
    const [formRole, setFormRole] = useState('viewer');
    const [creating, setCreating] = useState(false);

    // Reset-password confirm modal
    const [resetTarget, setResetTarget] = useState(null);
    const [resetting, setResetting] = useState(false);

    const showAlert = (type, message) => {
        setAlert({ type, message });
        setTimeout(() => setAlert(null), 5000);
    };

    const fetchUsers = useCallback(async () => {
        setLoading(true);
        try {
            const res = await apiClient.get('/admin/users');
            setUsers(res.data);
        } catch (err) {
            showAlert('error', err.response?.data?.detail || t('admin.users.error_load_failed'));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchUsers(); }, [fetchUsers]);

    const handleRoleChange = async (userId, role, isApproved) => {
        try {
            await apiClient.put(`/admin/users/${userId}`, { role, isApproved });
            setUsers(prev => prev.map(u => u.id === userId ? { ...u, role, isApproved } : u));
        } catch (err) {
            showAlert('error', err.response?.data?.detail || t('admin.users.error_update_failed'));
        }
    };

    const handleApprovalToggle = (user) => {
        handleRoleChange(user.id, user.role, !user.isApproved);
    };

    const handleDelete = async (user) => {
        if (!confirm(`${t('admin.users.delete_success')} ${user.email}?`)) return;
        try {
            await apiClient.delete(`/admin/users/${user.id}`);
            setUsers(prev => prev.filter(u => u.id !== user.id));
            showAlert('success', `${t('admin.users.delete_success')} ${user.email}.`);
        } catch (err) {
            showAlert('error', err.response?.data?.detail || t('admin.users.error_delete_failed'));
        }
    };

    const handleCreate = async (e) => {
        e.preventDefault();
        setCreating(true);
        try {
            await apiClient.post('/admin/users', { email: formEmail, role: formRole });
            showAlert('success', `${t('admin.users.create_success')} ${formEmail} ${t('admin.users.create_success_suffix')}`);
            setFormEmail('');
            setFormRole('viewer');
            setShowCreate(false);
            fetchUsers();
        } catch (err) {
            showAlert('error', err.response?.data?.detail || t('admin.users.error_create_failed'));
        } finally {
            setCreating(false);
        }
    };

    const handleResetPassword = async () => {
        setResetting(true);
        try {
            await apiClient.post(`/admin/users/${resetTarget.id}/reset-password`, {});
            showAlert('success', `${t('admin.users.reset_password_confirm')} ${resetTarget.email}. ${t('admin.users.reset_password_note')}`);
            setResetTarget(null);
        } catch (err) {
            showAlert('error', err.response?.data?.detail || t('admin.users.error_reset_failed'));
        } finally {
            setResetting(false);
        }
    };

    const allEmails = users.map(u => u.email);

    // Only show sub-accounts (manager/viewer belong to this tenant_admin)
    const subUsers = users.filter(u => u.email !== currentUserEmail);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
            </div>
        );
    }

    return (
        <div className="p-6 max-w-4xl">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <Users className="w-5 h-5 text-blue-400" />
                    <h1 className="text-lg font-semibold text-white">{t('admin.users.title')}</h1>
                    <span className="text-xs text-slate-500 bg-slate-800 border border-slate-700 rounded px-2 py-0.5">
                        {subUsers.length} {subUsers.length !== 1 ? t('admin.users.sub_accounts') : t('admin.users.sub_account')}
                    </span>
                </div>
                <button
                    onClick={() => { setShowCreate(!showCreate); setFormEmail(''); setFormRole('viewer'); }}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                >
                    <Plus className="w-4 h-4" />
                    {t('admin.users.create_user')}
                </button>
            </div>

            {alert && <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)} />}

            {/* Create user panel */}
            {showCreate && (
                <div className="bg-[#0F172A] border border-slate-700 rounded-xl p-5 mb-6">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-sm font-semibold text-white">{t('admin.users.create_new_account')}</h2>
                        <button onClick={() => setShowCreate(false)} className="text-slate-500 hover:text-white">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                    <form onSubmit={handleCreate} className="flex flex-wrap gap-3 items-end">
                        <div className="flex-1 min-w-[220px]">
                            <label className="block text-xs text-slate-400 mb-1">{t('admin.users.email_label')} *</label>
                            <EmailInput
                                value={formEmail}
                                onChange={setFormEmail}
                                existingEmails={allEmails}
                                placeholder={t('admin.users.email_placeholder')}
                            />
                        </div>
                        <div className="w-36">
                            <label className="block text-xs text-slate-400 mb-1">{t('admin.users.role_label')} *</label>
                            <select
                                value={formRole}
                                onChange={e => setFormRole(e.target.value)}
                                className="w-full bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                            >
                                {TENANT_ADMIN_CREATABLE_ROLES.map(r => (
                                    <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                                ))}
                            </select>
                        </div>
                        <div className="flex gap-2">
                            <button
                                type="submit"
                                disabled={creating || !formEmail}
                                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm rounded-lg transition-colors disabled:opacity-50"
                            >
                                {creating ? t('admin.users.creating_button') : t('admin.users.create_button')}
                            </button>
                        </div>
                    </form>
                    <p className="text-[11px] text-slate-500 mt-3">
                        {t('admin.users.password_note')}
                    </p>
                </div>
            )}

            {/* Reset-password confirm modal */}
            {resetTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="bg-[#0F172A] border border-slate-700 rounded-xl p-6 w-full max-w-sm mx-4">
                        <div className="flex items-center gap-2 mb-3">
                            <KeyRound className="w-4 h-4 text-amber-400" />
                            <h3 className="text-sm font-semibold text-white">{t('admin.users.reset_password_title')}</h3>
                        </div>
                        <p className="text-sm text-slate-300 mb-1">
                            {t('admin.users.reset_password_confirm')} <span className="font-semibold text-white">{resetTarget.email}</span>?
                        </p>
                        <p className="text-xs text-slate-500 mb-5">
                            {t('admin.users.reset_password_note')}
                        </p>
                        <div className="flex gap-2">
                            <button
                                onClick={handleResetPassword}
                                disabled={resetting}
                                className="flex-1 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm rounded-lg transition-colors disabled:opacity-50"
                            >
                                {resetting ? t('admin.users.resetting_button') : t('admin.users.reset_confirm_button')}
                            </button>
                            <button
                                onClick={() => setResetTarget(null)}
                                className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm rounded-lg transition-colors"
                            >
                                {t('admin.users.cancel')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* User table */}
            <div className="bg-[#0F172A] border border-slate-700 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-slate-800 text-left">
                            <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('admin.users.table_email')}</th>
                            <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('admin.users.table_role')}</th>
                            <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('admin.users.table_status')}</th>
                            <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('admin.users.table_joined')}</th>
                            <th className="px-4 py-3"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                        {subUsers.map(user => {
                            const isLocked = !!user.is_locked;
                            const isOutOfScope = ['super_admin', 'tenant_admin'].includes(user.role);
                            const isDisabled = isLocked || isOutOfScope;
                            return (
                                <tr key={user.id} className={`hover:bg-slate-800/30 transition-colors ${isDisabled ? 'opacity-50' : ''}`}>
                                    <td className="px-4 py-3 text-slate-200 font-mono text-xs">
                                        {user.email}
                                        {user.must_set_password && (
                                            <span className="ml-2 text-[10px] bg-yellow-900/40 text-yellow-400 px-1.5 py-0.5 rounded">
                                                {t('admin.users.not_set_password')}
                                            </span>
                                        )}
                                        {isLocked && <Lock className="w-3 h-3 text-amber-500 inline ml-1.5" title="Locked" />}
                                    </td>
                                    <td className="px-4 py-3">
                                        {isOutOfScope ? (
                                            <span className={`text-xs border rounded px-2 py-1 bg-transparent ${ROLE_BADGE[user.role] || 'text-slate-400 border-slate-700'}`}>
                                                {ROLE_LABEL[user.role] || user.role}
                                            </span>
                                        ) : (
                                            <select
                                                value={user.role}
                                                onChange={e => handleRoleChange(user.id, e.target.value, user.isApproved)}
                                                disabled={isDisabled}
                                                className={`text-xs border rounded px-2 py-1 bg-transparent focus:outline-none cursor-pointer disabled:cursor-not-allowed ${ROLE_BADGE[user.role] || ROLE_BADGE.viewer}`}
                                            >
                                                {TENANT_ADMIN_CREATABLE_ROLES.map(r => (
                                                    <option key={r} value={r} className="bg-slate-900 text-slate-200">{ROLE_LABEL[r]}</option>
                                                ))}
                                            </select>
                                        )}
                                    </td>
                                    <td className="px-4 py-3">
                                        <button
                                            onClick={() => handleApprovalToggle(user)}
                                            disabled={isDisabled}
                                            className={`flex items-center gap-1.5 text-xs border rounded px-2 py-1 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                                                user.isApproved
                                                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                                                    : 'bg-slate-700/50 text-slate-500 border-slate-700 hover:bg-slate-700'
                                            }`}
                                        >
                                            <ShieldCheck className="w-3 h-3" />
                                            {user.isApproved ? t('admin.users.approved') : t('admin.users.pending')}
                                        </button>
                                    </td>
                                    <td className="px-4 py-3 text-slate-500 text-xs">
                                        {user.created_at ? new Date(user.created_at).toLocaleDateString('vi-VN') : '—'}
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-1 justify-end">
                                            <button
                                                onClick={() => setResetTarget(user)}
                                                disabled={isDisabled}
                                                title={t('admin.users.reset_password_title')}
                                                className="p-1.5 text-slate-500 hover:text-amber-400 hover:bg-amber-500/10 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                            >
                                                <KeyRound className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(user)}
                                                disabled={isDisabled}
                                                title={t('admin.users.delete_success')}
                                                className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                        {subUsers.length === 0 && (
                            <tr>
                                <td colSpan={5} className="px-4 py-8 text-center text-slate-600 text-sm">
                                    {t('admin.users.no_subaccounts')}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default UserManagement;
