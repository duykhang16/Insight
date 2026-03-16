import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Shield, AlertCircle, Clock, CheckCircle2, XCircle } from 'lucide-react';
import apiClient from '../../api/apiClient';
import { formatAction, formatTarget } from '../../utils/logFormatter';
import { useLanguage } from '../../context/LanguageContext';
import { useSite } from '../../context/SiteContext';
import { DataTable } from '@/components/ui/data-table';
import { en } from '../../locales/en';
import { vi } from '../../locales/vi';

const actionDicts = { en, vi };

const AdminPage = () => {
    const { t, language } = useLanguage();
    const { sites } = useSite();
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Translate action label via i18n actions map
    const translateAction = useCallback((actionLabel) => {
        const actions = actionDicts[language]?.admin?.logs?.actions;
        return actions?.[actionLabel] || actionLabel;
    }, [language]);

    // Build siteId → siteName map from SiteContext
    const siteMap = useMemo(() => {
        const map = {};
        if (Array.isArray(sites)) {
            sites.forEach(s => {
                const id = s.siteId || s._id || s.id;
                const name = s.siteName || s.name;
                if (id && name) map[id] = name;
            });
        }
        return map;
    }, [sites]);

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
            className: 'font-mono text-slate-400 text-[10px] whitespace-nowrap',
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
            render: (log) => {
                const rawAction = formatAction(log.method, log.endpoint, log.action, log.payload);
                const label = translateAction(rawAction);
                return (
                    <span
                        className="px-2 py-0.5 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded text-[9px] font-black uppercase tracking-widest text-wrap max-w-[180px] inline-block"
                        title={label}
                    >
                        {label}
                    </span>
                );
            },
        },
        {
            key: 'target',
            label: t('admin.logs.table_target'),
            className: 'text-slate-400 text-[10px] max-w-[260px]',
            render: (log) => {
                const target = formatTarget(log, siteMap);
                return target ? (
                    <span className="text-slate-300 text-[10px] truncate block max-w-[260px]" title={target}>{target}</span>
                ) : <span className="text-slate-600">—</span>;
            },
        },
        {
            key: 'statusCode',
            label: t('admin.logs.table_status'),
            sortable: true,
            render: (log) => {
                // Use the actual status field from audit log (SUCCESS/PARTIAL/SKIPPED/FAILED)
                const status = (log.status || '').toUpperCase();
                const statusStyles = {
                    SUCCESS: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
                    PARTIAL: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
                    SKIPPED: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
                    FAILED: 'bg-rose-500/10 text-rose-400 border border-rose-500/20',
                    ERROR: 'bg-rose-500/10 text-rose-400 border border-rose-500/20',
                };
                const statusLabels = {
                    SUCCESS: t('admin.logs.status_success'),
                    PARTIAL: 'Partial',
                    SKIPPED: 'Skipped',
                    FAILED: t('admin.logs.status_failed'),
                    ERROR: t('admin.logs.status_failed'),
                };
                const statusIcons = {
                    SUCCESS: <CheckCircle2 size={10} />,
                    PARTIAL: <AlertCircle size={10} />,
                    SKIPPED: <Clock size={10} />,
                    FAILED: <XCircle size={10} />,
                    ERROR: <XCircle size={10} />,
                };
                const style = statusStyles[status] || statusStyles.SUCCESS;
                const label = statusLabels[status] || status;
                const icon = statusIcons[status] || <CheckCircle2 size={10} />;
                return (
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${style}`}>
                        {icon} {label}
                    </span>
                );
            },
        },
        {
            key: 'result_detail',
            label: 'Result',
            render: (log) => {
                const detail = log.result_detail;
                if (!detail) return <span className="text-slate-600">—</span>;
                return (
                    <div className="flex items-center gap-2 text-[9px] font-bold">
                        {detail.success > 0 && <span className="text-emerald-400">{detail.success} ✓</span>}
                        {detail.skipped > 0 && <span className="text-amber-400">{detail.skipped} skip</span>}
                        {detail.failed > 0 && <span className="text-rose-400">{detail.failed} ✕</span>}
                    </div>
                );
            },
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
                searchKeys={['actor_email', 'action']}
                searchPlaceholder={`${t('admin.logs.table_actor')}, ${t('admin.logs.table_action')}...`}
                stickyHeader
            />
        </div>
    );
};

export default AdminPage;
