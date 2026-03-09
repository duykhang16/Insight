import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Search, X } from 'lucide-react';
import apiClient from '../../api/apiClient';

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
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
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
      setError(e?.response?.data?.detail || 'Không thể tải logs.');
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const filtered = logs.filter(l => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (l.actor_email || '').toLowerCase().includes(q) ||
      (l.endpoint || '').toLowerCase().includes(q) ||
      (l.action || '').toLowerCase().includes(q) ||
      (l.insight_user_id || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-white">System Logs</h1>
          <p className="text-xs text-slate-500 mt-0.5">Toàn bộ audit log hệ thống — chỉ Super Admin.</p>
        </div>
        <button
          onClick={fetchLogs}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-sm text-white rounded transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input
          className="w-full bg-slate-800 border border-slate-700 rounded pl-9 pr-8 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
          placeholder="Tìm theo email, endpoint, action..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-800 text-red-400 text-sm px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Log table */}
      <div className="bg-[#0F172A] border border-slate-800 rounded-lg overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-blue-500" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-slate-500 text-sm">Không có log nào.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-800/60">
                <tr>
                  <th className="px-3 py-3 text-left font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">Thời gian</th>
                  <th className="px-3 py-3 text-left font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">Actor</th>
                  <th className="px-3 py-3 text-left font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">Method</th>
                  <th className="px-3 py-3 text-left font-semibold text-slate-400 uppercase tracking-wider">Endpoint</th>
                  <th className="px-3 py-3 text-left font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">Status</th>
                  <th className="px-3 py-3 text-left font-semibold text-slate-400 uppercase tracking-wider">Action</th>
                  <th className="px-3 py-3 text-left font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">IP</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(log => (
                  <tr key={log.id} className="border-t border-slate-800 hover:bg-slate-800/30 transition-colors">
                    <td className="px-3 py-2 text-slate-400 whitespace-nowrap">{log.timestamp}</td>
                    <td className="px-3 py-2 text-slate-300 whitespace-nowrap max-w-[180px] truncate" title={log.actor_email}>
                      {log.actor_email || log.insight_user_id || '—'}
                    </td>
                    <td className={`px-3 py-2 font-bold whitespace-nowrap ${METHOD_COLOR[log.method] || 'text-slate-400'}`}>
                      {log.method}
                    </td>
                    <td className="px-3 py-2 text-slate-400 font-mono max-w-[260px] truncate" title={log.endpoint}>
                      {log.endpoint}
                    </td>
                    <td className={`px-3 py-2 font-semibold whitespace-nowrap ${STATUS_COLOR(log.statusCode)}`}>
                      {log.statusCode || '—'}
                    </td>
                    <td className="px-3 py-2 text-slate-400 max-w-[160px] truncate" title={log.action}>
                      {log.action || '—'}
                    </td>
                    <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{log.ip_address || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      <div className="flex items-center gap-3 justify-end">
        <button
          disabled={page === 0 || loading}
          onClick={() => setPage(p => p - 1)}
          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 text-sm rounded transition-colors"
        >
          ← Trước
        </button>
        <span className="text-sm text-slate-500">Trang {page + 1}</span>
        <button
          disabled={logs.length < PAGE_SIZE || loading}
          onClick={() => setPage(p => p + 1)}
          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 text-sm rounded transition-colors"
        >
          Tiếp →
        </button>
      </div>
    </div>
  );
}
