import React, { useState, useEffect, useCallback } from 'react';
import { Shield, AlertCircle, Clock } from 'lucide-react';
import apiClient from '../../api/apiClient';
import { formatAction } from '../../utils/logFormatter';
import { useLanguage } from '../../context/LanguageContext';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';

const METHOD_VARIANT = {
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

    const columns = [
        {
            key: 'timestamp',
            label: t('admin.logs.table_timestamp'),
            sortable: true,
            className: 'font-mono text-slate-400 text-[10px]',
            render: (log) => (
                <div className="flex items-center gap-1.5">
                    <Clock size={10} className="text-slate-600 shrink-0" />
                    {log.timestamp}
                </div>
            ),
        },
        {
            key: 'actor_email',
            label: t('admin.logs.table_actor'),
            sortable: true,
            className: 'font-bold th-text-primary text-[11px]',
            render: (log) => log.actor_email || '—',
        },
        {
            key: 'action',
            label: t('admin.logs.table_action'),
            render: (log) => (
                <span
                    className="px-2 py-0.5 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded text-[9px] font-black uppercase tracking-widest text-wrap max-w-[150px] inline-block"
                    title={formatAction(log.method, log.endpoint, log.action, log.payload)}
                >
                    {formatAction(log.method, log.endpoint, log.action, log.payload)}
                </span>
            ),
        },
        {
            key: 'method',
            label: t('admin.logs.table_method'),
            sortable: true,
            render: (log) => (
                <span className={`px-2 py-0.5 rounded border text-[9px] font-black uppercase tracking-widest ${METHOD_VARIANT[log.method] || 'bg-slate-700 text-slate-400 border-white/5'}`}>
                    {log.method}
                </span>
            ),
        },
        {
            key: 'endpoint',
            label: t('admin.logs.table_endpoint'),
            className: 'font-mono text-slate-400 text-[10px] max-w-[280px] truncate',
            render: (log) => (
                <span title={log.endpoint}>{log.endpoint}</span>
            ),
        },
        {
            key: 'statusCode',
            label: t('admin.logs.table_status'),
            sortable: true,
            render: (log) => (
                <span className={`font-black text-xs ${log.statusCode >= 400 ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {log.statusCode}
                </span>
            ),
        },
    ];

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

            <DataTable
                columns={columns}
                data={logs}
                keyExtractor={log => log.id}
                emptyMessage={t('admin.logs.no_logs')}
                loading={loading}
                searchable
                searchKeys={['actor_email', 'endpoint', 'action', 'method']}
                searchPlaceholder={`${t('admin.logs.table_actor')}, ${t('admin.logs.table_endpoint')}...`}
                stickyHeader
            />
        </div>
    );
};

export default AdminPage;
