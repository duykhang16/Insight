import React, { useState, useEffect, useCallback } from 'react';
import { Shield, AlertCircle, Clock } from 'lucide-react';
import apiClient from '../../api/apiClient';

const METHOD_STYLE = {
    GET:    'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    POST:   'bg-amber-500/10 text-amber-400 border-amber-500/20',
    PUT:    'bg-blue-500/10 text-blue-400 border-blue-500/20',
    PATCH:  'bg-blue-500/10 text-blue-400 border-blue-500/20',
    DELETE: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
};

const AdminPage = () => {
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
                ? 'Access Denied: Admin role required.'
                : 'Failed to fetch audit logs.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchLogs(); }, [fetchLogs]);

    return (
        <div className="p-8 pb-32 min-h-screen bg-slate-950">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                    <Shield className="w-5 h-5 text-blue-400" />
                    <div>
                        <h1 className="text-2xl font-black text-white tracking-tight italic uppercase">Audit Logs</h1>
                        <p className="text-sm text-slate-400 mt-0.5">Activity log của tenant và các sub-account</p>
                    </div>
                </div>
                <button
                    onClick={fetchLogs}
                    disabled={loading}
                    className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
                >
                    {loading ? 'Loading...' : 'Refresh'}
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
                <div className="bg-slate-900 rounded-2xl border border-white/5 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[900px] text-left text-xs whitespace-nowrap">
                            <thead className="bg-slate-800/60 border-b border-white/5 sticky top-0 z-10">
                                <tr>
                                    {['Timestamp (GMT+7)', 'Actor Email', 'Action', 'Method', 'Endpoint', 'Status'].map(h => (
                                        <th key={h} className="px-5 py-4 font-black uppercase tracking-widest text-[9px] text-slate-400">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/[0.04] text-slate-300">
                                {logs.length > 0 ? logs.map(log => (
                                    <tr key={log.id} className="hover:bg-white/[0.02] transition-colors">
                                        <td className="px-5 py-3.5 font-mono text-slate-400 text-[10px]">
                                            <div className="flex items-center gap-1.5">
                                                <Clock size={10} className="text-slate-600 shrink-0" />
                                                {log.timestamp}
                                            </div>
                                        </td>
                                        <td className="px-5 py-3.5 font-bold text-white text-[11px]">{log.actor_email || '—'}</td>
                                        <td className="px-5 py-3.5">
                                            <span className="px-2 py-0.5 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded text-[9px] font-black uppercase tracking-widest">
                                                {log.action || 'API_CALL'}
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
                                            <p className="text-sm font-black text-slate-600 uppercase tracking-widest">No audit logs found</p>
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
