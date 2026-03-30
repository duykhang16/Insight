import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, RefreshCw, FileText, CheckCircle2, XCircle, AlertCircle, Clock } from 'lucide-react';
import apiClient from '../../api/apiClient';
import { formatAction } from '../../utils/logFormatter';
import { useLanguage } from '../../context/LanguageContext';

const ZoneLogs = () => {
  const { t } = useLanguage();
  const { zoneId } = useParams();
  const navigate = useNavigate();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [zoneName, setZoneName] = useState('');

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const [zoneRes, logsRes] = await Promise.all([
        apiClient.get(`/zones/${zoneId}`),
        apiClient.get(`/zones/${zoneId}/logs?limit=100`),
      ]);
      setZoneName(zoneRes.data?.name || zoneId);
      setLogs(logsRes.data || []);
    } catch (err) {
      console.error('Failed to fetch zone logs:', err);
    } finally {
      setLoading(false);
    }
  }, [zoneId]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const getStatusColor = (code) => {
    if (code >= 500) return 'text-rose-400';
    if (code >= 400) return 'text-amber-400';
    return 'text-emerald-400';
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate('/zones')}
          className="p-1.5 text-slate-400 hover:th-text-primary hover:th-bg-elevated rounded-lg transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <FileText className="w-5 h-5 text-blue-400" />
        <h1 className="text-lg font-semibold th-text-primary">{t('zones.logs.title')}</h1>
        {zoneName && (
          <>
            <span className="text-xs text-slate-500 th-bg-elevated px-2 py-0.5 rounded-full">{zoneName}</span>
          </>
        )}
        <div className="ml-auto">
          <button
            onClick={fetchLogs}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-400 hover:th-text-primary border th-border hover:border-slate-500 rounded-lg transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" /> {t('zones.logs.button_refresh')}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      ) : logs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500">
          <FileText className="w-10 h-10 mb-3 opacity-20" />
          <p className="text-sm">{t('zones.logs.empty_state_message')}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border th-border">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b th-border th-bg-surface-alt">
                <th className="px-4 py-3 text-slate-400 font-medium">Thời gian</th>
                <th className="px-4 py-3 text-slate-400 font-medium">Actor</th>
                <th className="px-4 py-3 text-slate-400 font-medium">Action</th>
                <th className="px-4 py-3 text-slate-400 font-medium">Method</th>
                <th className="px-4 py-3 text-slate-400 font-medium">Endpoint</th>
                <th className="px-4 py-3 text-slate-400 font-medium text-center">Status</th>
                <th className="px-4 py-3 text-slate-400 font-medium">Result</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log, i) => (
                <tr
                  key={log.id || i}
                  className="border-b th-border hover:bg-slate-800/30 transition-colors"
                >
                  <td className="px-4 py-3 text-slate-400 whitespace-nowrap">{log.timestamp}</td>
                  <td className="px-4 py-3 th-text-secondary max-w-[180px] truncate">{log.actor_email || '—'}</td>
                  <td className="px-4 py-3 th-text-primary font-medium whitespace-nowrap" title={formatAction(log.method, log.endpoint, log.action, log.payload)}>{formatAction(log.method, log.endpoint, log.action, log.payload)}</td>
                  <td className="px-4 py-3">
                    <span className="font-mono th-bg-elevated px-1.5 py-0.5 rounded th-text-secondary">{log.method}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-400 font-mono max-w-[200px] truncate">{log.endpoint}</td>
                  <td className="px-4 py-3 text-center">
                    {(() => {
                      const status = (log.status || '').toUpperCase();
                      const cfg = {
                        SUCCESS: { cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', icon: <CheckCircle2 size={10} />, label: 'Success' },
                        PARTIAL: { cls: 'bg-blue-500/10 text-blue-400 border-blue-500/20', icon: <AlertCircle size={10} />, label: 'Partial' },
                        SKIPPED: { cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20', icon: <Clock size={10} />, label: 'Skipped' },
                        FAILED: { cls: 'bg-rose-500/10 text-rose-400 border-rose-500/20', icon: <XCircle size={10} />, label: 'Failed' },
                        ERROR: { cls: 'bg-rose-500/10 text-rose-400 border-rose-500/20', icon: <XCircle size={10} />, label: 'Error' },
                      };
                      const c = cfg[status] || cfg.SUCCESS;
                      return (
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${c.cls}`}>
                          {c.icon} {c.label}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-3">
                    {log.result_detail ? (
                      <div className="flex items-center gap-2 text-[9px] font-bold">
                        {log.result_detail.success > 0 && <span className="text-emerald-400">{log.result_detail.success} ✓</span>}
                        {log.result_detail.skipped > 0 && <span className="text-amber-400">{log.result_detail.skipped} skip</span>}
                        {log.result_detail.failed > 0 && <span className="text-rose-400">{log.result_detail.failed} ✕</span>}
                      </div>
                    ) : <span className="text-slate-600">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ZoneLogs;
