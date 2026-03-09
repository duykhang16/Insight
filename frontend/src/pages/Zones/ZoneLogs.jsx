import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, RefreshCw, FileText } from 'lucide-react';
import apiClient from '../../api/apiClient';

const ZoneLogs = () => {
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
          className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <FileText className="w-5 h-5 text-blue-400" />
        <h1 className="text-lg font-semibold text-white">Zone Logs</h1>
        {zoneName && (
          <span className="text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full">{zoneName}</span>
        )}
        <div className="ml-auto">
          <button
            onClick={fetchLogs}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 rounded-lg transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
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
          <p className="text-sm">Chưa có log nào trong zone này.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-700">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-slate-700 bg-slate-800/50">
                <th className="px-4 py-3 text-slate-400 font-medium">Thời gian</th>
                <th className="px-4 py-3 text-slate-400 font-medium">Actor</th>
                <th className="px-4 py-3 text-slate-400 font-medium">Action</th>
                <th className="px-4 py-3 text-slate-400 font-medium">Method</th>
                <th className="px-4 py-3 text-slate-400 font-medium">Endpoint</th>
                <th className="px-4 py-3 text-slate-400 font-medium text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log, i) => (
                <tr
                  key={log.id || i}
                  className="border-b border-slate-800 hover:bg-slate-800/30 transition-colors"
                >
                  <td className="px-4 py-3 text-slate-400 whitespace-nowrap">{log.timestamp}</td>
                  <td className="px-4 py-3 text-slate-300 max-w-[180px] truncate">{log.actor_email || '—'}</td>
                  <td className="px-4 py-3 text-slate-200 font-medium whitespace-nowrap">{log.action || '—'}</td>
                  <td className="px-4 py-3">
                    <span className="font-mono bg-slate-800 px-1.5 py-0.5 rounded text-slate-300">{log.method}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-400 font-mono max-w-[200px] truncate">{log.endpoint}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`font-mono font-semibold ${getStatusColor(log.statusCode)}`}>
                      {log.statusCode}
                    </span>
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
