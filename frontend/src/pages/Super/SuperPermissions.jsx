import React, { useState, useEffect } from 'react';
import apiClient from '../../api/apiClient';
import { ShieldCheck, Save, RefreshCw, KeyRound, Check, X } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

const ROLES = ['tenant_admin', 'manager', 'viewer'];

const SuperPermissions = () => {
    const { t } = useLanguage();

    const FEATURES = [
        { key: 'full_clone', label: t('super.permissions.feature_full_clone') },
        { key: 'smart_sync', label: t('super.permissions.feature_smart_sync') },
        { key: 'batch_provision', label: t('super.permissions.feature_batch_provision') },
        { key: 'batch_access', label: t('super.permissions.feature_batch_access') },
        { key: 'batch_delete', label: t('super.permissions.feature_batch_delete') },
    ];

    const [permissions, setPermissions] = useState({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState({ text: '', type: '' });

    const fetchPermissions = async () => {
        setLoading(true);
        try {
            const res = await apiClient.get('/super/permissions');
            const permsMap = {};
            res.data.forEach(p => {
                permsMap[p.role] = p.permissions;
            });
            // Ensure all roles exist
            ROLES.forEach(r => {
                if (!permsMap[r]) permsMap[r] = {};
            });
            setPermissions(permsMap);
        } catch (err) {
            setMessage({ text: t('super.permissions.toast_error'), type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPermissions();
    }, []);

    const handleToggle = (role, featureKey) => {
        setPermissions(prev => ({
            ...prev,
            [role]: {
                ...prev[role],
                [featureKey]: !prev[role]?.[featureKey]
            }
        }));
    };

    const handleSave = async (role) => {
        setSaving(true);
        setMessage({ text: '', type: '' });
        try {
            await apiClient.put(`/super/permissions/${role}`, {
                permissions: permissions[role]
            });
            setMessage({ text: t('super.permissions.toast_success'), type: 'success' });
            setTimeout(() => setMessage({ text: '', type: '' }), 4000);
        } catch (err) {
            setMessage({ text: t('super.permissions.toast_error'), type: 'error' });
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full p-20">
                <RefreshCw size={32} className="animate-spin text-blue-500" />
            </div>
        );
    }

    return (
        <div className="p-6 max-w-5xl mx-auto">
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-blue-500/10 rounded-xl flex items-center justify-center text-blue-500 border border-blue-500/20">
                        <KeyRound size={24} />
                    </div>
                    <div>
                        <h1 className="text-xl font-black text-slate-800 dark:text-white uppercase tracking-wider">{t('super.permissions.title')}</h1>
                        <p className="text-sm text-slate-500 mt-1">{t('super.permissions.subtitle')}</p>
                    </div>
                </div>
                <button
                    onClick={fetchPermissions}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition"
                >
                    <RefreshCw size={16} /> {t('super.permissions.button_refresh')}
                </button>
            </div>

            {message.text && (
                <div className="fixed top-24 left-1/2 transform -translate-x-1/2 z-50">
                    <div className={`px-6 py-4 rounded-xl shadow-2xl text-sm font-semibold flex items-center gap-3 backdrop-blur-md ${message.type === 'success' ? 'bg-emerald-500/90 th-text-primary border border-emerald-400/50' : 'bg-rose-500/90 th-text-primary border border-rose-400/50'}`}>
                        {message.type === 'success' ? <Check size={20} /> : <X size={20} />}
                        {message.text}
                    </div>
                </div>
            )}

            <div className="space-y-6">
                {ROLES.map(role => (
                    <div key={role} className="bg-white dark:th-bg-surface border border-slate-200 dark:th-border rounded-2xl p-6 shadow-sm">
                        <div className="flex items-center justify-between mb-6 border-b border-slate-100 dark:th-border pb-4">
                            <div className="flex items-center gap-3">
                                <ShieldCheck size={20} className={role === 'super_admin' ? 'text-rose-500' : role === 'tenant_admin' ? 'text-violet-500' : role === 'manager' ? 'text-amber-500' : 'text-blue-500'} />
                                <h3 className="text-lg font-black text-slate-800 dark:text-white uppercase tracking-wider">{t(`super.permissions.role_header_label`)}: {role.replace('_', ' ')}</h3>
                                {role === 'super_admin' && (
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-rose-500 bg-rose-500/10 px-2 py-1 rounded ml-2">{t('super.permissions.role_read_only_badge')}</span>
                                )}
                            </div>
                            {role !== 'super_admin' && (
                                <button
                                    onClick={() => handleSave(role)}
                                    disabled={saving}
                                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 th-text-primary font-semibold rounded-lg text-sm transition disabled:opacity-50"
                                >
                                    <Save size={16} /> {t('super.permissions.button_save')}
                                </button>
                            )}
                        </div>
                        <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 ${role === 'super_admin' ? 'opacity-60 pointer-events-none grayscale' : ''}`}>
                            {FEATURES.map(feat => {
                                const isEnabled = permissions[role]?.[feat.key] || false;
                                return (
                                    <div
                                        key={feat.key}
                                        onClick={() => handleToggle(role, feat.key)}
                                        className={`flex flex-col gap-2 p-4 rounded-xl border-2 cursor-pointer transition select-none ${isEnabled ? 'bg-emerald-500/5 border-emerald-500/30' : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:th-border hover:border-slate-300 dark:hover:th-border'}`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className={`text-sm font-bold ${isEnabled ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-400'}`}>
                                                {feat.label}
                                            </span>
                                            <div className={`w-8 h-4 rounded-full flex items-center p-0.5 transition-colors ${isEnabled ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'}`}>
                                                <div className={`w-3 h-3 rounded-full bg-white transition-transform ${isEnabled ? 'translate-x-4' : 'translate-x-0'}`} />
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
            <div className="mt-8 text-center text-xs text-slate-500">
                {t('super.permissions.footer_note')}
            </div>
        </div>
    );
};

export default SuperPermissions;
