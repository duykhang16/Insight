import React, { useState, useEffect, useCallback } from 'react';
import { Shield, AlertCircle, Clock } from 'lucide-react';
import apiClient from '../../api/apiClient';
import { formatAction } from '../../utils/logFormatter';
import { useLanguage } from '../../context/LanguageContext';

const METHOD_STYLE = {
    GET: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    POST: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    PUT: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    PATCH: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    DELETE: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
};

const AdminPage = () => {
    const { t } = useLanguage();
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchLogs = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await apiClient.get('/admin/logs');
            setLogs(res.data);
        } catch (err) {
            setError(err.response?.status === 403
                ? t('admin.logs.access_denied')
                : t('admin.logs.fetch_failed'));
        } finally {
            setLoading(false);
        }
    }, [t]);

    useEffect(() => { fetchLogs(); }, [fetchLogs]);

    return (
        <div className="p-8 pb-32 min-h-screen th-bg-base">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                    <Shield className="w-5 h-5 text-blue-400" />
                    <div>
                        <h1 className="text-2xl font-black th-text-primary tracking-tight italic uppercase">{t('admin.logs.title')}</h1>
                        <p className="text-sm text-slate-400 mt-0.5">{t('admin.logs.subtitle')}</p>
                    </div>
                </div>
                <button
                    onClick={fetchLogs}
                    disabled={loading}
                    className="px-3 py-2 th-bg-elevated hover:bg-slate-700 th-text-secondary text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
                >
                    {loading ? t('admin.logs.loading') : t('admin.logs.refresh')}
                </button>
            </div>

            {error && (
                <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-center gap-3 text-rose-400 mb-6">
                    <AlertCircle size={18} />
                    <span className="text-sm font-bold">{error}</span>
                </div>
            )}

            {loading ? (
                <div className="flex items-center justify-center py-24">
                    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500" />
                </div>
            ) : (
                <div className="th-bg-surface rounded-2xl border border-white/5 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[900px] text-left text-xs whitespace-nowrap">
                            <thead className="th-bg-surface-alt border-b border-white/5 sticky top-0 z-10">
                                <tr>
                                    {[t('admin.logs.table_timestamp'), t('admin.logs.table_actor'), t('admin.logs.table_action'), t('admin.logs.table_method'), t('admin.logs.table_endpoint'), t('admin.logs.table_status')].map(h => (
                                        <th key={h} className="px-5 py-4 font-black uppercase tracking-widest text-[9px] text-slate-400">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/[0.04] th-text-secondary">
                                {logs.length > 0 ? logs.map(log => (
                                    <tr key={log.id} className="hover:bg-white/[0.02] transition-colors">
                                        <td className="px-5 py-3.5 font-mono text-slate-400 text-[10px]">
                                            <div className="flex items-center gap-1.5">
                                                <Clock size={10} className="text-slate-600 shrink-0" />
                                                {log.timestamp}
                                            </div>
                                        </td>
                                        <td className="px-5 py-3.5 font-bold th-text-primary text-[11px]">{log.actor_email || '—'}</td>
                                        <td className="px-5 py-3.5">
                                            <span className="px-2 py-0.5 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded text-[9px] font-black uppercase tracking-widest text-wrap max-w-[150px] inline-block" title={formatAction(log.method, log.endpoint, log.action, log.payload)}>
                                                {formatAction(log.method, log.endpoint, log.action, log.payload)}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3.5">
                                            <span className={`px-2 py-0.5 rounded border text-[9px] font-black uppercase tracking-widest ${METHOD_STYLE[log.method] || 'bg-slate-700 text-slate-400 border-white/5'}`}>
                                                {log.method}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3.5 font-mono text-slate-400 text-[10px] max-w-[280px] truncate" title={log.endpoint}>
                                            {log.endpoint}
                                        </td>
                                        <td className="px-5 py-3.5">
                                            <span className={`font-black text-xs ${log.statusCode >= 400 ? 'text-rose-400' : 'text-emerald-400'}`}>
                                                {log.statusCode}
                                            </span>
                                        </td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan={6} className="px-6 py-16 text-center">
                                            <p className="text-sm font-black text-slate-600 uppercase tracking-widest">{t('admin.logs.no_logs')}</p>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminPage;
