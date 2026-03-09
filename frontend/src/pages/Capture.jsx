import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Search,
    Filter,
    RefreshCw,
    ChevronRight,
    Clock,
    Globe,
    Activity,
    Database,
    Trash2,
    CheckCircle2,
    XCircle,
    AlertCircle,
    Info,
    ArrowUpRight
} from 'lucide-react';
import apiClient from '../api/apiClient';

function Capture() {
    const navigate = useNavigate();
    const [logs, setLogs] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [isLive, setIsLive] = useState(true);
    const [filters, setFilters] = useState({
        keyword: '',
        method: '',
        status: '',
        domain: ''
    });

    const ws = useRef(null);

    useEffect(() => {
        fetchLogs();
        connectWebSocket();
        return () => {
            if (ws.current) ws.current.close();
        };
    }, []);

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const params = {
                limit: 50,
                keyword: filters.keyword || undefined,
                method: filters.method || undefined,
                status: filters.status || undefined,
                domain: filters.domain || undefined
            };
            const res = await apiClient.get('/logs', { params });
            setLogs(res.data.logs);
            setTotal(res.data.total);
        } catch (error) {
            console.error("Failed to fetch logs:", error);
        } finally {
            setLoading(false);
        }
    };

    const connectWebSocket = () => {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const socketUrl = `${protocol}//localhost:8000/ws`;

        ws.current = new WebSocket(socketUrl);

        ws.current.onmessage = (event) => {
            const message = JSON.parse(event.data);
            if (message.type === 'NEW_REQUEST' && isLive) {
                setLogs(prev => [message.data, ...prev].slice(0, 100)); // Keep last 100 in live view
                setTotal(t => t + 1);
            }
        };

        ws.current.onclose = () => {
            console.log("WebSocket closed. Reconnecting in 5s...");
            setTimeout(connectWebSocket, 5000);
        };
    };

    const handleClearLogs = async () => {
        if (!confirm("Are you sure you want to wipe ALL captured logs? This cannot be undone.")) return;
        try {
            await apiClient.delete('/logs');
            setLogs([]);
            setTotal(0);
        } catch (err) {
            alert("Failed to clear logs");
        }
    };

    const getStatusStyle = (code) => {
        if (code < 300) return "text-emerald-400 bg-emerald-400/10 border-emerald-400/20";
        if (code < 400) return "text-blue-400 bg-blue-400/10 border-blue-400/20";
        if (code < 500) return "text-orange-400 bg-orange-400/10 border-orange-400/20";
        return "text-rose-400 bg-rose-400/10 border-rose-400/20";
    };

    const StatusIcon = ({ code }) => {
        if (code < 300) return <CheckCircle2 size={14} />;
        if (code < 400) return <Info size={14} />;
        if (code >= 500) return <XCircle size={14} />;
        return <AlertCircle size={14} />;
    };

    const formatTime = (ts) => {
        const date = new Date(ts);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };

    return (
        <div className="animate-fade-in space-y-6 pb-20">
            {/* Header section */}
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-800/40 p-6 rounded-2xl border border-white/5 backdrop-blur-md">
                <div>
                    <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-3">
                        <Activity className="text-blue-500 animate-pulse" />
                        Traffic Explorer
                    </h1>
                    <p className="text-slate-400 text-sm mt-1">
                        Real-time inspection of captured API communication
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex bg-slate-900/50 p-1 rounded-xl border border-white/5">
                        <button
                            onClick={() => setIsLive(true)}
                            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${isLive ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                        >
                            Live
                        </button>
                        <button
                            onClick={() => setIsLive(false)}
                            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${!isLive ? 'bg-slate-700 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                        >
                            Snapshot
                        </button>
                    </div>
                    <button
                        onClick={fetchLogs}
                        className="p-2.5 bg-slate-800 hover:bg-slate-700 border border-white/10 rounded-xl text-slate-300 transition-all active:scale-95"
                        title="Refresh Data"
                    >
                        <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                    </button>
                    <button
                        onClick={handleClearLogs}
                        className="p-2.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 rounded-xl text-rose-400 transition-all active:scale-95"
                        title="Clear History"
                    >
                        <Trash2 size={18} />
                    </button>
                </div>
            </header>

            {/* Filter Bar */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="relative group">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-blue-500 transition-colors" size={16} />
                    <input
                        type="text"
                        placeholder="Search URL or body..."
                        className="w-full h-12 bg-slate-800/50 border border-white/5 rounded-xl pl-11 pr-4 text-sm text-white focus:outline-none focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/5 transition-all"
                        value={filters.keyword}
                        onChange={(e) => setFilters(f => ({ ...f, keyword: e.target.value }))}
                        onKeyDown={(e) => e.key === 'Enter' && fetchLogs()}
                    />
                </div>
                <div className="relative">
                    <Filter className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                    <select
                        className="w-full h-12 bg-slate-800/50 border border-white/5 rounded-xl pl-11 pr-4 text-sm text-white appearance-none focus:outline-none focus:border-blue-500/50"
                        value={filters.method}
                        onChange={(e) => setFilters(f => ({ ...f, method: e.target.value }))}
                    >
                        <option value="">All Methods</option>
                        <option value="GET">GET</option>
                        <option value="POST">POST</option>
                        <option value="PUT">PUT</option>
                        <option value="DELETE">DELETE</option>
                    </select>
                </div>
                <div className="relative">
                    <Database className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                    <select
                        className="w-full h-12 bg-slate-800/50 border border-white/5 rounded-xl pl-11 pr-4 text-sm text-white appearance-none focus:outline-none focus:border-blue-500/50"
                        value={filters.status}
                        onChange={(e) => setFilters(f => ({ ...f, status: e.target.value }))}
                    >
                        <option value="">All Status</option>
                        <option value="2">2xx Success</option>
                        <option value="4">4xx Error</option>
                        <option value="5">5xx Server</option>
                    </select>
                </div>
                <button
                    onClick={fetchLogs}
                    className="h-12 bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm rounded-xl transition-all shadow-lg active:scale-95"
                >
                    Apply Filters
                </button>
            </div>

            {/* Logs Table */}
            <div className="bg-slate-800/20 border border-white/5 rounded-2xl overflow-hidden shadow-2xl">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-900/50 text-slate-500 text-[10px] uppercase font-black tracking-[0.2em] border-b border-white/5">
                                <th className="px-6 py-4">Status</th>
                                <th className="px-6 py-4">Method</th>
                                <th className="px-6 py-4">Domain</th>
                                <th className="px-6 py-4">Endpoint</th>
                                <th className="px-6 py-4">Duration</th>
                                <th className="px-6 py-4 text-right">Timestamp</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.03]">
                            {logs.length === 0 ? (
                                <tr>
                                    <td colSpan="6" className="px-6 py-20 text-center">
                                        <div className="flex flex-col items-center gap-3">
                                            <div className="w-16 h-16 bg-slate-800 rounded-2xl flex items-center justify-center text-slate-600">
                                                <RefreshCw size={32} />
                                            </div>
                                            <p className="text-slate-500 font-medium">No captured logs found.</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                logs.map((log) => (
                                    <tr
                                        key={log.id || log._id}
                                        onClick={() => navigate(`/detail/${log.id || log._id}`)}
                                        className="group hover:bg-white/[0.02] cursor-pointer transition-colors"
                                    >
                                        <td className="px-6 py-4">
                                            <div className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-lg border text-xs font-bold ${getStatusStyle(log.status_code)}`}>
                                                <StatusIcon code={log.status_code} />
                                                {log.status_code}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`text-[11px] font-black tracking-tighter uppercase ${log.method === 'GET' ? 'text-blue-400' :
                                                    log.method === 'POST' ? 'text-emerald-400' :
                                                        log.method === 'PUT' ? 'text-orange-400' : 'text-rose-400'
                                                }`}>
                                                {log.method}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2 text-slate-300">
                                                <Globe size={14} className="text-slate-600" />
                                                <span className="text-xs font-medium truncate max-w-[150px]">{log.domain}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="group-hover:translate-x-1 transition-transform truncate max-w-[300px]">
                                                <span className="text-xs font-mono text-indigo-300">{log.path}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2 text-slate-500 text-[10px] font-bold">
                                                <Clock size={12} />
                                                {log.duration_ms}ms
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex flex-col items-end">
                                                <span className="text-xs text-slate-300 font-mono">{formatTime(log.timestamp)}</span>
                                                <ArrowUpRight size={14} className="text-slate-700 group-hover:text-blue-500 transition-colors mt-1" />
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
                {total > 0 && (
                    <div className="px-6 py-4 bg-slate-900/30 border-t border-white/5 flex justify-between items-center text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                        <span>Showing {logs.length} of {total} results</span>
                        {isLive && <span className="flex items-center gap-2 text-emerald-500"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> Listening for traffic</span>}
                    </div>
                )}
            </div>
        </div>
    );
}

export default Capture;
