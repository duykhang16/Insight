import React, { useState, useEffect } from 'react';
import apiClient from '../api/apiClient';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock, Globe, Shield, Copy } from 'lucide-react';

const Detail = () => {
    const { logId } = useParams();
    const navigate = useNavigate();
    const [log, setLog] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [activeTab, setActiveTab] = useState('response'); // 'response' | 'filtered'

    useEffect(() => {
        loadLog();
    }, [logId]);

    const loadLog = async () => {
        try {
            const res = await apiClient.get(`/api/logs/${logId}`);
            setLog(res.data);
        } catch (err) {
            setError(err.response?.data?.detail || "Failed to load log.");
        } finally {
            setLoading(false);
        }
    };

    const copyToClipboard = (text) => {
        if (typeof text === 'object') text = JSON.stringify(text, null, 2);
        navigator.clipboard.writeText(text);
        alert("Copied!");
    };

    const StatusBadge = ({ code }) => {
        let color = 'bg-gray-600';
        if (code < 300) color = 'bg-emerald-600';
        else if (code < 400) color = 'bg-blue-600';
        else if (code < 500) color = 'bg-orange-600';
        else color = 'bg-red-600';
        return <span className={`px-2 py-1 rounded text-xs font-bold text-white ${color}`}>{code}</span>;
    };

    const MethodBadge = ({ method }) => {
        const colors = { GET: 'text-blue-400', POST: 'text-emerald-400', PUT: 'text-orange-400', DELETE: 'text-red-400' };
        return <span className={`font-black tracking-tighter ${colors[method] || 'text-gray-400'}`}>{method}</span>;
    };

    if (loading) return <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">Loading...</div>;
    if (error) return <div className="min-h-screen bg-gray-900 text-red-500 flex items-center justify-center font-bold">{error}</div>;

    return (
        <div className="min-h-screen bg-gray-900 text-gray-200 p-8 font-sans">
            <header className="flex items-center justify-between mb-8 max-w-6xl mx-auto">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate(-1)} className="p-2 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors">
                        <ArrowLeft size={18} />
                    </button>
                    <div>
                        <h1 className="text-xl font-bold flex items-center gap-2">
                            Request Details <span className="text-[10px] font-mono bg-gray-800 px-2 py-0.5 rounded text-gray-500">{log._id || log.id}</span>
                        </h1>
                    </div>
                </div>
            </header>

            <main className="max-w-6xl mx-auto space-y-6">
                {/* 1. Overview Card */}
                <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 shadow-xl">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                        <div className="flex items-center gap-4 break-all">
                            <StatusBadge code={log.status_code} />
                            <MethodBadge method={log.method} />
                            <span className="font-mono text-indigo-300">{log.url}</span>
                        </div>
                        <div className="text-right text-xs text-gray-500 font-mono space-y-1">
                            <div className="flex items-center justify-end gap-2"><Clock size={12} /> {new Date(log.timestamp).toLocaleString()}</div>
                            <div className="flex items-center justify-end gap-2"><Globe size={12} /> {log.domain} ({log.duration_ms}ms)</div>
                        </div>
                    </div>
                    {/* Context info if relevant */}
                    {log.execution_context && (
                        <div className="text-xs bg-black/20 p-2 rounded border border-gray-700/50 inline-block text-gray-400">
                            Context: <span className="text-indigo-400 font-bold">{log.execution_context}</span>
                        </div>
                    )}
                </div>

                {/* 2. Req/Res Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Request Column */}
                    <div className="space-y-6">
                        <section className="bg-gray-800/50 border border-gray-700 rounded-xl overflow-hidden">
                            <div className="px-4 py-3 bg-gray-900/50 border-b border-gray-700 flex justify-between items-center">
                                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Request Headers</h3>
                                <button onClick={() => copyToClipboard(log.request_headers)} className="text-gray-500 hover:text-white"><Copy size={12} /></button>
                            </div>
                            <div className="p-4 text-xs font-mono text-gray-400 space-y-1 overflow-x-auto">
                                {Object.entries(log.request_headers || {}).map(([k, v]) => (
                                    <div key={k}><span className="text-indigo-400/70">{k}:</span> <span className="text-gray-300">{v}</span></div>
                                ))}
                            </div>
                        </section>

                        <section className="bg-gray-800/50 border border-gray-700 rounded-xl overflow-hidden h-full">
                            <div className="px-4 py-3 bg-gray-900/50 border-b border-gray-700 flex justify-between items-center">
                                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Request Body</h3>
                                <button onClick={() => copyToClipboard(log.request_body)} className="text-gray-500 hover:text-white"><Copy size={12} /></button>
                            </div>
                            <pre className="p-4 text-xs font-mono text-indigo-300 whitespace-pre-wrap break-all max-h-[400px] overflow-y-auto">
                                {typeof log.request_body === 'object' ? JSON.stringify(log.request_body, null, 2) : (log.request_body || 'No Body')}
                            </pre>
                        </section>
                    </div>

                    {/* Response Column */}
                    <div className="space-y-6">
                        <section className="bg-gray-800/50 border border-gray-700 rounded-xl overflow-hidden">
                            <div className="px-4 py-3 bg-gray-900/50 border-b border-gray-700 flex justify-between items-center">
                                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Response Headers</h3>
                                <button onClick={() => copyToClipboard(log.response_headers)} className="text-gray-500 hover:text-white"><Copy size={12} /></button>
                            </div>
                            <div className="p-4 text-xs font-mono text-gray-400 space-y-1 overflow-x-auto">
                                {Object.entries(log.response_headers || {}).map(([k, v]) => (
                                    <div key={k}><span className="text-indigo-400/70">{k}:</span> <span className="text-gray-300">{v}</span></div>
                                ))}
                            </div>
                        </section>

                        <section className="bg-gray-800/50 border border-gray-700 rounded-xl overflow-hidden h-full flex flex-col">
                            <div className="px-4 py-0 bg-gray-900/50 border-b border-gray-700 flex justify-between items-center h-10">
                                <div className="flex h-full">
                                    <button
                                        onClick={() => setActiveTab('response')}
                                        className={`px-3 text-xs font-bold uppercase tracking-widest h-full border-b-2 transition-colors ${activeTab === 'response' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-gray-500 hover:text-white'}`}
                                    >Response</button>
                                    <button
                                        onClick={() => setActiveTab('filtered')}
                                        className={`px-3 text-xs font-bold uppercase tracking-widest h-full border-b-2 transition-colors ${activeTab === 'filtered' ? 'border-indigo-500 text-indigo-400' : 'border-transparent text-gray-500 hover:text-white'}`}
                                    >Parsed</button>
                                </div>
                                <button onClick={() => copyToClipboard(log.response_body)} className="text-gray-500 hover:text-white"><Copy size={12} /></button>
                            </div>

                            <div className="flex-1 max-h-[600px] overflow-y-auto p-4">
                                {activeTab === 'response' ? (
                                    <pre className="text-xs font-mono text-emerald-400 whitespace-pre-wrap break-all">
                                        {typeof log.response_body === 'object' ? JSON.stringify(log.response_body, null, 2) : (log.response_body || 'No Response')}
                                    </pre>
                                ) : (
                                    <div className="text-xs text-gray-500 italic text-center py-8">
                                        Parsed view logic not fully ported yet. Use raw JSON response.
                                        {/* TODO: Implement the complex parsing logic from detail.html if strictly needed */}
                                    </div>
                                )}
                            </div>
                        </section>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default Detail;
