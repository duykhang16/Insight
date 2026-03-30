import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import apiClient from '../../api/apiClient';
import { formatAction } from '../../utils/logFormatter';
import { useLanguage } from '../../context/LanguageContext';
import { DataTable } from '@/components/ui/data-table';

const METHOD_COLOR = {
  GET: 'text-emerald-400',
  POST: 'text-blue-400',
  PUT: 'text-yellow-400',
  PATCH: 'text-yellow-400',
  DELETE: 'text-red-400',
};

const STATUS_COLOR = (code) => {
  if (code >= 500) return 'text-red-400';
  if (code >= 400) return 'text-yellow-400';
  if (code >= 200) return 'text-emerald-400';
  return 'text-slate-400';
};

export default function SuperLogs() {
  const { t } = useLanguage();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 100;

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiClient.get('/super/logs', {
        params: { limit: PAGE_SIZE, skip: page * PAGE_SIZE },
      });
      setLogs(res.data);
    } catch (e) {
      setError(e?.response?.data?.detail || t('super.logs.error_load_logs'));
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const columns = [
    {
      key: 'timestamp',
      label: t('super.logs.table_header_timestamp'),
      sortable: true,
      className: 'text-slate-400 whitespace-nowrap text-xs',
    },
    {
      key: 'actor_email',
      label: t('super.logs.table_header_actor'),
      sortable: true,
      className: 'th-text-secondary whitespace-nowrap max-w-[180px] truncate text-xs',
      render: (log) => (
        <span title={log.actor_email}>{log.actor_email || log.insight_user_id || '—'}</span>
      ),
    },
    {
      key: 'method',
      label: t('super.logs.table_header_method'),
      sortable: true,
      render: (log) => (
        <span className={`font-bold whitespace-nowrap text-xs ${METHOD_COLOR[log.method] || 'text-slate-400'}`}>
          {log.method}
        </span>
      ),
    },
    {
      key: 'endpoint',
      label: t('super.logs.table_header_endpoint'),
      className: 'text-slate-400 font-mono max-w-[260px] truncate text-xs',
      render: (log) => <span title={log.endpoint}>{log.endpoint}</span>,
    },
    {
      key: 'statusCode',
      label: t('super.logs.table_header_status'),
      sortable: true,
      render: (log) => (
        <span className={`font-semibold whitespace-nowrap text-xs ${STATUS_COLOR(log.statusCode)}`}>
          {log.statusCode || '—'}
        </span>
      ),
    },
    {
<<<<<<< HEAD
      key: 'result',
      label: 'Result',
      render: (log) => {
        const status = (log.status || '').toUpperCase();
        const detail = log.result_detail;
        const statusColor = {
          SUCCESS: 'text-emerald-400', PARTIAL: 'text-blue-400',
          SKIPPED: 'text-amber-400', FAILED: 'text-rose-400', ERROR: 'text-rose-400',
        };
        return (
          <div className="flex items-center gap-2">
            {status && <span className={`text-[9px] font-bold uppercase ${statusColor[status] || 'text-slate-400'}`}>{status}</span>}
            {detail && (
              <span className="text-[9px] text-slate-400">
                {detail.success > 0 ? `${detail.success}✓ ` : ''}{detail.skipped > 0 ? `${detail.skipped}⊘ ` : ''}{detail.failed > 0 ? `${detail.failed}✕` : ''}
              </span>
            )}
          </div>
        );
      },
    },
    {
=======
>>>>>>> parent of 30b1732 (Delete frontend directory)
      key: 'action',
      label: t('super.logs.table_header_action'),
      className: 'text-slate-400 max-w-[160px] truncate text-xs',
      render: (log) => (
        <span title={formatAction(log.method, log.endpoint, log.action, log.payload)}>
          {formatAction(log.method, log.endpoint, log.action, log.payload)}
        </span>
      ),
    },
    {
      key: 'ip_address',
      label: t('super.logs.table_header_ip'),
      className: 'text-slate-500 whitespace-nowrap text-xs',
      render: (log) => log.ip_address || '—',
    },
  ];

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold th-text-primary">{t('super.logs.title')}</h1>
          <p className="text-xs text-slate-500 mt-0.5">{t('super.logs.subtitle')}</p>
        </div>
        <button
          onClick={fetchLogs}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-sm th-text-primary rounded transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          {t('super.logs.button_refresh')}
        </button>
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-800 text-red-400 text-sm px-4 py-3 rounded">
          {error}
        </div>
      )}

      <DataTable
        columns={columns}
        data={logs}
        keyExtractor={log => log.id}
        emptyMessage={t('super.logs.empty_state')}
        loading={loading}
        searchable
        searchKeys={['actor_email', 'endpoint', 'action', 'insight_user_id']}
        searchPlaceholder={t('super.logs.search_placeholder')}
        stickyHeader
        pagination={{
          page,
          pageSize: PAGE_SIZE,
          onPageChange: setPage,
        }}
      />
    </div>
  );
}
