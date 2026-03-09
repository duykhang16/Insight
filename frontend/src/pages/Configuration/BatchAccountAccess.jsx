import React, { useState, useRef, useEffect } from 'react';
import apiClient from '../../api/apiClient';
import {
    Users, AlertTriangle, Mail, Tag, Shield, Map, RefreshCw, Play, Square, CheckSquare, Square as SquareIcon, CheckCircle, XCircle, Search
} from 'lucide-react';

const AVAILABLE_ROLES = [
    { label: 'Administrator', value: 'administrator' },
    { label: 'Viewer', value: 'viewer' },
];

const BatchAccountAccess = () => {
    const [zones, setZones] = useState([]);
    const [selectedZones, setSelectedZones] = useState(new Set());
    const [isLoadingZones, setIsLoadingZones] = useState(false);

    const [sites, setSites] = useState([]);
    const [selectedSites, setSelectedSites] = useState([]);
    const [isLoadingSites, setIsLoadingSites] = useState(false);
    const [activeTab, setActiveTab] = useState('zones'); // 'zones' or 'sites'
    const [searchTargetTerm, setSearchTargetTerm] = useState('');
    const [selectedZoneFilter, setSelectedZoneFilter] = useState('all');

    const [email, setEmail] = useState('');
    const [selectedRole, setSelectedRole] = useState(AVAILABLE_ROLES[0].value);
    const [mode, setMode] = useState('add'); // 'add' or 'remove'

    const [isRunning, setIsRunning] = useState(false);
    const [isPrechecking, setIsPrechecking] = useState(false);
    const [showPrecheckModal, setShowPrecheckModal] = useState(false);
    const [existingSites, setExistingSites] = useState([]);
    const [logs, setLogs] = useState([]);
    const mountedRef = useRef(true);

    const scanZones = async () => {
        setIsLoadingZones(true);
        setSelectedZones(new Set()); // Reset selection on scan
        try {
            const res = await apiClient.get('/zones/my');
            const list = Array.isArray(res.data) ? res.data : [];
            if (mountedRef.current) setZones(list.sort((a, b) => a.name.localeCompare(b.name)));
        } catch (err) {
            console.error(err);
            if (mountedRef.current) setZones([]);
        } finally {
            if (mountedRef.current) setIsLoadingZones(false);
        }
    };

    const scanSites = async () => {
        setIsLoadingSites(true);
        setSelectedSites([]);
        try {
            const res = await apiClient.get('/overview/sites');
            const rawList = Array.isArray(res.data?.sites) ? res.data.sites : [];
            const list = rawList.map(s => ({
                ...s,
                id: s.id || s.siteId || s.site_id
            }));

            // Filter only Administrator sites
            const adminSites = list.filter(s => {
                const r = (s.role || '').toLowerCase();
                const rawR = (s.aruba_role_raw || '').toLowerCase();
                const isAdmin = r.startsWith('admin') || rawR.startsWith('admin');
                return isAdmin && s.id;
            });
            if (mountedRef.current) setSites(adminSites.sort((a, b) => (a.siteName || '').localeCompare(b.siteName || '')));
        } catch (err) {
            console.error(err);
            if (mountedRef.current) setSites([]);
        } finally {
            if (mountedRef.current) setIsLoadingSites(false);
        }
    };

    useEffect(() => {
        scanZones();
        scanSites();
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
    }, []);

    const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    const canStart = isEmailValid && (selectedZones.size > 0 || selectedSites.size > 0) && !isRunning && !isPrechecking;

    const handleSelectAll = () => {
        if (selectedZones.size === zones.length && zones.length > 0) {
            setSelectedZones(new Set());
        } else {
            setSelectedZones(new Set(zones.map(z => z.id)));
        }
    };

    const toggleZone = (zoneId) => {
        const newSet = new Set(selectedZones);
        if (newSet.has(zoneId)) {
            newSet.delete(zoneId);
        } else {
            newSet.add(zoneId);
        }
        setSelectedZones(newSet);
    };

    const handleSelectAllSites = () => {
        if (selectedSites.length === sites.length && sites.length > 0) {
            setSelectedSites([]);
        } else {
            setSelectedSites(sites.map(s => s.id));
        }
    };

    const toggleSite = (siteId) => {
        setSelectedSites(prev =>
            prev.includes(siteId)
                ? prev.filter(id => id !== siteId)
                : [...prev, siteId]
        );
    };

    const targetZones = zones.filter(z => selectedZones.has(z.id));
    const totalSitesSelected = targetZones.reduce((sum, z) => sum + (z.site_count || 0), 0);
    const totalExecutionSites = totalSitesSelected + selectedSites.length;

    const runPrecheck = async () => {
        setIsPrechecking(true);
        setLogs([{ id: 'precheck', status: 'running', msg: `Running Smart Pre-check for ${email}...` }]);
        try {
            const payload = {
                email: email,
                target_zone_ids: Array.from(selectedZones),
                target_site_ids: Array.from(selectedSites)
            };
            const res = await apiClient.post('/cloner/batch-account-access/precheck', payload);
            const found = res.data?.existing_sites || [];
            if (found.length > 0 && mode === 'add') {
                setExistingSites(found);
                setShowPrecheckModal(true);
                setLogs([{ id: 'precheck-done', status: 'ok', msg: `Pre-check found ${found.length} site(s) already containing the account.` }]);
            } else {
                handleStart([]); // No conflicts or we are removing
            }
        } catch (err) {
            setLogs([{ id: 'err-precheck', status: 'error', msg: `Pre-check failed: ${err.message}` }]);
            handleStart([]); // proceed anyway if precheck fails
        } finally {
            if (mountedRef.current) setIsPrechecking(false);
        }
    };

    const handleStart = async (excludeIds = []) => {
        setShowPrecheckModal(false);
        setIsRunning(true);
        setLogs([]);

        // --- Security Validation Phase ---
        const adminSiteIds = new Set(sites.map(s => s.id));
        const initialTargets = new Set(selectedSites);
        let skipCount = 0;

        // Resolve Zones
        targetZones.forEach(z => {
            (z.site_ids || []).forEach(sid => {
                if (adminSiteIds.has(sid)) {
                    initialTargets.add(sid);
                } else {
                    skipCount++;
                }
            });
        });

        // Filter exclusions from pre-check
        const finalTargets = Array.from(initialTargets).filter(sid => !excludeIds.includes(sid));

        const initialLogs = [
            { id: 'security-check', status: 'ok', msg: `Security Check: Validated ${initialTargets.size} Administrator sites.` }
        ];
        if (skipCount > 0) {
            initialLogs.push({ id: 'security-skip', status: 'error', msg: `Security Notice: Automatically skipped ${skipCount} sites with insufficient permissions (Viewer).` });
        }

        if (finalTargets.length === 0) {
            setLogs([...initialLogs, { id: 'done', status: 'error', msg: 'Zero authorized targets found after filtering and pre-check. Aborting.' }]);
            setIsRunning(false);
            return;
        }

        setLogs(prev => [...prev, { id: 'init', status: 'running', msg: `Initiating batch sequence for ${finalTargets.length} sites...` }]);

        try {
            const payload = {
                action_type: mode,
                email: email,
                roleOnSite: selectedRole,
                target_zone_ids: [],
                target_site_ids: finalTargets,
                exclude_site_ids: []
            };
            const res = await apiClient.post('/cloner/batch-account-access', payload);

            if (!mountedRef.current) return;

            if (res.data?.status === 'success') {
                const results = res.data.results || [];
                const formattedLogs = results.map((r, idx) => ({
                    id: `res-${idx}`,
                    status: r.status === 'SUCCESS' ? 'ok' : 'error',
                    msg: `Site ${r.target}: ${r.status === 'SUCCESS' ? 'Operation Successful' : (r.detail?.message || r.detail || 'Failed')}`
                }));
                setLogs(prev => [
                    ...prev,
                    { id: 'done', status: 'ok', msg: `Batch sequence completed. Processed ${results.length} sites.` },
                    ...formattedLogs
                ]);
            } else {
                setLogs([{ id: 'err', status: 'error', msg: `API returned unexpected status: ${res.data?.status}` }]);
            }
        } catch (err) {
            if (!mountedRef.current) return;
            setLogs([{ id: 'err-catch', status: 'error', msg: `Critical Error: ${err.response?.data?.detail || err.message}` }]);
        } finally {
            if (mountedRef.current) {
                setIsRunning(false);
            }
        }
    };

    return (
        <div className="relative w-full min-h-[700px] bg-slate-50 dark:bg-[#020617] text-slate-800 dark:text-slate-200 rounded-xl border border-slate-200 dark:border-gray-800 shadow-xl overflow-hidden">
            <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden rounded-xl">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/5 dark:bg-blue-600/10 blur-[120px] rounded-full" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-600/5 dark:bg-indigo-600/10 blur-[120px] rounded-full" />
            </div>

            <div className="relative z-10 p-8">
                <div className="flex items-center gap-4 mb-8">
                    <div className="w-12 h-12 bg-blue-50 dark:bg-blue-500/10 rounded-xl flex items-center justify-center text-blue-500 dark:text-blue-400 border border-blue-100 dark:border-blue-500/20">
                        <Users size={24} />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">Batch Account Management</h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400">Add or revoke user access across multiple zones simultaneously.</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                    {/* Panel 1: Configuration & Target */}
                    <div className="flex flex-col gap-6">

                        {/* Config Panel */}
                        <div className="backdrop-blur-2xl bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 rounded-3xl p-6 shadow-xl dark:shadow-none">
                            <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400 mb-6 flex items-center gap-2">
                                <Shield size={14} className="text-blue-500" /> Identity Configuration
                            </h3>

                            <div className="flex gap-2 mb-6 p-1 bg-slate-100 dark:bg-black/40 rounded-xl">
                                <button
                                    onClick={() => setMode('add')}
                                    className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${mode === 'add' ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm border border-slate-200 dark:border-white/10' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                                >
                                    Grant Access
                                </button>
                                <button
                                    onClick={() => setMode('remove')}
                                    className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${mode === 'remove' ? 'bg-white dark:bg-slate-800 text-rose-600 dark:text-rose-400 shadow-sm border border-slate-200 dark:border-white/10' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                                >
                                    Revoke Access
                                </button>
                            </div>

                            <div className="space-y-5">
                                <div>
                                    <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">
                                        <Mail size={12} className="text-slate-400" /> Target Email
                                    </label>
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={e => setEmail(e.target.value)}
                                        placeholder="user@example.com"
                                        className="w-full text-sm bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-xl py-3 px-4 text-slate-800 dark:text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-mono"
                                    />
                                </div>

                                <div className={`transition-all duration-300 ${mode === 'remove' ? 'opacity-30 pointer-events-none' : 'opacity-100'}`}>
                                    <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">
                                        <Tag size={12} className="text-slate-400" /> Access Role
                                    </label>
                                    <select
                                        value={selectedRole}
                                        onChange={e => setSelectedRole(e.target.value)}
                                        className="w-full text-sm bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-xl py-3 px-4 text-slate-800 dark:text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-bold appearance-none"
                                    >
                                        {AVAILABLE_ROLES.map(role => (
                                            <option key={role.value} value={role.value}>{role.label}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* Target Panel */}
                        <div className="backdrop-blur-2xl bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 rounded-3xl p-6 shadow-xl dark:shadow-none flex-1 flex flex-col min-h-[300px]">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400 flex items-center gap-2">
                                    <Map size={14} className="text-blue-500" /> Target Selection
                                </h3>
                                <button
                                    onClick={() => { scanZones(); scanSites(); }}
                                    disabled={isLoadingZones || isLoadingSites || isRunning}
                                    className="flex items-center gap-1.5 text-[10px] font-bold uppercase hover:text-blue-500 text-slate-500 dark:text-slate-400 transition-colors disabled:opacity-50"
                                >
                                    <RefreshCw size={12} className={isLoadingZones || isLoadingSites ? 'animate-spin' : ''} />
                                    Refresh
                                </button>
                            </div>

                            <div className="flex gap-2 p-1 bg-slate-100 dark:bg-black/40 rounded-xl relative mb-3">
                                <button
                                    onClick={() => setActiveTab('zones')}
                                    className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${activeTab === 'zones' ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm border border-slate-200 dark:border-white/10' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                                >
                                    Quản lý theo Zone
                                </button>
                                <button
                                    onClick={() => setActiveTab('sites')}
                                    className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${activeTab === 'sites' ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm border border-slate-200 dark:border-white/10' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                                >
                                    Chọn Site lẻ
                                </button>
                            </div>

                            {activeTab === 'zones' ? (
                                isLoadingZones ? (
                                    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-400 dark:text-slate-600">
                                        <RefreshCw size={24} className="animate-spin" />
                                        <p className="text-xs">Loading zones...</p>
                                    </div>
                                ) : zones.length === 0 ? (
                                    <div className="flex-1 flex flex-col items-center justify-center gap-2 text-amber-500/50">
                                        <AlertTriangle size={24} />
                                        <p className="text-xs text-center text-slate-400">No zones available.</p>
                                    </div>
                                ) : (
                                    <>
                                        <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/5 pb-2 mb-2">
                                            <button
                                                onClick={handleSelectAll}
                                                disabled={isRunning}
                                                className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors disabled:opacity-50"
                                            >
                                                {selectedZones.size === zones.length ? (
                                                    <><CheckSquare size={16} className="text-blue-500" /> Deselect All</>
                                                ) : (
                                                    <><SquareIcon size={16} className="text-slate-400" /> Select All</>
                                                )}
                                            </button>
                                            <span className="font-mono text-[10px] font-bold text-slate-400">
                                                <span className="text-blue-500">{selectedZones.size}</span> / {zones.length}
                                            </span>
                                        </div>
                                        <div className="flex-1 overflow-y-auto space-y-1.5 py-1 pr-1 custom-scrollbar">
                                            {zones.map(zone => (
                                                <div
                                                    key={zone.id}
                                                    onClick={() => !isRunning && toggleZone(zone.id)}
                                                    className={`p-2.5 rounded-xl border flex items-center gap-3 cursor-pointer transition-all ${selectedZones.has(zone.id)
                                                        ? 'bg-blue-50/50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/30'
                                                        : 'bg-white dark:bg-black/20 border-slate-100 dark:border-white/5 hover:border-slate-300 dark:hover:border-white/20'
                                                        } ${isRunning ? 'opacity-50 pointer-events-none' : ''}`}
                                                >
                                                    <div className="shrink-0 flex items-center justify-center">
                                                        {selectedZones.has(zone.id) ? (
                                                            <CheckSquare size={18} className="text-blue-600 dark:text-blue-400" />
                                                        ) : (
                                                            <SquareIcon size={18} className="text-slate-300 dark:text-slate-600" />
                                                        )}
                                                    </div>
                                                    <div className="flex-1 min-w-0 flex items-center justify-between">
                                                        <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">{zone.name}</p>
                                                        <span className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-[10px] font-mono text-slate-500">
                                                            {zone.site_count || 0} Sites
                                                        </span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                )
                            ) : (
                                isLoadingSites ? (
                                    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-400 dark:text-slate-600">
                                        <RefreshCw size={24} className="animate-spin" />
                                        <p className="text-xs">Loading sites...</p>
                                    </div>
                                ) : sites.length === 0 ? (
                                    <div className="flex-1 flex flex-col items-center justify-center gap-2 text-amber-500/50">
                                        <AlertTriangle size={24} />
                                        <p className="text-xs text-center text-slate-400">No sites available.</p>
                                    </div>
                                ) : (
                                    <>
                                        <div className="flex gap-3 mb-4 shrink-0 mt-2">
                                            <div className="relative flex-1">
                                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                                    <Search size={16} className="text-slate-400 dark:text-slate-500" />
                                                </div>
                                                <input
                                                    type="text"
                                                    placeholder="Search sites..."
                                                    value={searchTargetTerm}
                                                    onChange={(e) => setSearchTargetTerm(e.target.value)}
                                                    className="w-full text-sm bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl py-3 pl-10 pr-4 text-slate-800 dark:text-white focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all font-mono"
                                                />
                                            </div>
                                            <select
                                                value={selectedZoneFilter}
                                                onChange={(e) => setSelectedZoneFilter(e.target.value)}
                                                className="h-[46px] bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl px-4 text-slate-800 dark:text-white text-sm font-bold focus:outline-none min-w-[150px] md:max-w-[200px]"
                                            >
                                                <option value="all">Tất cả Group (Zone)</option>
                                                {zones.map(z => (
                                                    <option key={z.id || z._id} value={z.id || z._id}>{z.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/5 pb-2 mb-2">
                                            <button
                                                onClick={handleSelectAllSites}
                                                disabled={isRunning}
                                                className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors disabled:opacity-50"
                                            >
                                                {selectedSites.length === sites.length && sites.length > 0 ? (
                                                    <><CheckSquare size={16} className="text-blue-500" /> Deselect All</>
                                                ) : (
                                                    <><SquareIcon size={16} className="text-slate-400" /> Select All</>
                                                )}
                                            </button>
                                            <span className="font-mono text-[10px] font-bold text-slate-400">
                                                <span className="text-blue-500">{selectedSites.length}</span> / {sites.length}
                                            </span>
                                        </div>
                                        <div className="flex-1 overflow-y-auto space-y-1.5 py-1 pr-1 custom-scrollbar">
                                            {sites.filter(site => {
                                                const matchesSearch = (site.siteName || '').toLowerCase().includes(searchTargetTerm.toLowerCase());
                                                let matchesZone = true;
                                                if (selectedZoneFilter !== 'all') {
                                                    const zoneObj = zones.find(z => String(z.id || z._id) === selectedZoneFilter);
                                                    matchesZone = zoneObj ? (zoneObj.site_ids || []).includes(site.id) : false;
                                                }
                                                return matchesSearch && matchesZone;
                                            }).map(site => (
                                                <div
                                                    key={site.id}
                                                    onClick={() => !isRunning && toggleSite(site.id)}
                                                    className={`p-2.5 rounded-xl border flex items-center gap-3 cursor-pointer transition-all ${selectedSites.includes(site.id)
                                                        ? 'bg-blue-50/50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/30'
                                                        : 'bg-white dark:bg-black/20 border-slate-100 dark:border-white/5 hover:border-slate-300 dark:hover:border-white/20'
                                                        } ${isRunning ? 'opacity-50 pointer-events-none' : ''}`}
                                                >
                                                    <div className="shrink-0 flex items-center justify-center">
                                                        {selectedSites.includes(site.id) ? (
                                                            <CheckSquare size={18} className="text-blue-600 dark:text-blue-400" />
                                                        ) : (
                                                            <SquareIcon size={18} className="text-slate-300 dark:text-slate-600" />
                                                        )}
                                                    </div>
                                                    <div className="flex-1 min-w-0 flex items-center justify-between">
                                                        <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">{site.siteName}</p>
                                                        <p className="text-[10px] font-mono text-slate-500 truncate">{site.id}</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                )
                            )}
                        </div>
                    </div>

                    {/* Panel 2: Execution */}
                    <div className="backdrop-blur-2xl bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 rounded-3xl p-6 flex flex-col gap-4 shadow-xl dark:shadow-none min-h-[500px]">
                        <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400 flex items-center gap-2">
                            <Play size={14} className="text-blue-500" /> Execution Platform
                        </h3>

                        {/* Preview UI */}
                        {(selectedZones.size > 0 || selectedSites.size > 0) && !isRunning && !isPrechecking && (
                            <div className={`p-4 rounded-xl border flex items-start gap-4 animate-fade-in ${mode === 'add'
                                ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30'
                                : 'bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/30'
                                }`}>
                                <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${mode === 'add' ? 'bg-white dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'bg-white dark:bg-rose-500/20 text-rose-600 dark:text-rose-400'
                                    }`}>
                                    <AlertTriangle size={20} />
                                </div>
                                <div className="flex-1">
                                    <h4 className={`text-sm font-bold ${mode === 'add' ? 'text-emerald-800 dark:text-emerald-300' : 'text-rose-800 dark:text-rose-300'}`}>
                                        Execution Preview
                                    </h4>
                                    <p className={`text-xs mt-0.5 ${mode === 'add' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                        Tổng hợp: <strong className="font-bold">{selectedZones.size}</strong> Zone và <strong className="font-bold">{selectedSites.length}</strong> Site lẻ.
                                        Hệ thống sẽ xử lý tổng cộng <strong className="font-bold">{totalExecutionSites}</strong> Site.
                                    </p>
                                    {(() => {
                                        const adminSiteIds = new Set(sites.map(s => s.siteId));
                                        let skippedViewerCount = 0;
                                        targetZones.forEach(z => {
                                            (z.site_ids || []).forEach(sid => {
                                                if (!adminSiteIds.has(sid)) skippedViewerCount++;
                                            });
                                        });
                                        if (skippedViewerCount > 0) {
                                            return (
                                                <div className="mt-2 flex items-start gap-1.5 p-2 bg-white/50 dark:bg-black/20 rounded-lg border border-amber-200 dark:border-amber-500/20">
                                                    <AlertTriangle size={12} className="text-amber-500 shrink-0 mt-0.5" />
                                                    <p className="text-[10px] text-amber-700 dark:text-amber-400 font-bold">
                                                        Phát hiện {skippedViewerCount} Site trong Zone là "Viewer". Sẽ tự động bỏ qua.
                                                    </p>
                                                </div>
                                            );
                                        }
                                        return null;
                                    })()}
                                </div>
                            </div>
                        )}

                        <div className="flex-1 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/5 rounded-2xl p-4 overflow-y-auto font-mono text-[11px] custom-scrollbar shadow-inner">
                            {logs.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-slate-400 dark:text-slate-600 gap-2">
                                    <SquareIcon size={24} className="opacity-50" />
                                    <p className="font-sans text-xs">Awaiting Execution Command</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {logs.map(log => (
                                        <div key={log.id} className="flex items-start gap-2">
                                            {log.status === 'running' && <RefreshCw size={12} className="animate-spin text-blue-500 mt-0.5 shrink-0" />}
                                            {log.status === 'error' && <XCircle size={12} className="text-rose-500 mt-0.5 shrink-0" />}
                                            {log.status === 'ok' && <CheckCircle size={12} className="text-emerald-500 mt-0.5 shrink-0" />}
                                            <span className={`${log.status === 'error' ? 'text-rose-600 dark:text-rose-400' : log.status === 'running' ? 'text-blue-600 dark:text-blue-400 font-bold' : 'text-slate-600 dark:text-slate-400'} break-all`}>
                                                {log.msg}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="mt-2 text-center">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{mode === 'add' ? 'Grant Access' : 'Revoke Access'} Mode Active</span>
                        </div>

                        <button
                            onClick={runPrecheck}
                            disabled={!canStart}
                            className={`w-full h-14 font-black uppercase tracking-[0.2em] text-xs rounded-2xl shadow-xl hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center justify-center gap-2 ${mode === 'add'
                                ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-emerald-500/20'
                                : 'bg-gradient-to-r from-rose-500 to-amber-500 text-white shadow-rose-500/20'
                                }`}
                        >
                            {isRunning || isPrechecking ? (
                                <><RefreshCw size={16} className="animate-spin" /> {isPrechecking ? 'Running Pre-Check...' : 'Processing...'}</>
                            ) : (
                                <><Play size={16} /> Execute Batch {mode === 'add' ? 'Add' : 'Remove'}</>
                            )}
                        </button>
                    </div>
                </div>
            </div>

            {/* Smart Precheck Modal */}
            {
                showPrecheckModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/80 backdrop-blur-md">
                        <div className="bg-white dark:bg-slate-900 max-w-md w-full rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col animate-fade-in relative">
                            <div className="h-2 w-full bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500" />
                            <div className="p-6 pb-2">
                                <div className="w-12 h-12 bg-amber-100 dark:bg-amber-500/20 rounded-full flex items-center justify-center text-amber-600 dark:text-amber-400 mb-4 mx-auto shadow-[0_0_20px_rgba(245,158,11,0.3)]">
                                    <AlertTriangle size={24} />
                                </div>
                                <h2 className="text-xl font-black text-center text-slate-900 dark:text-white mb-2">Trùng Lặp Tài Khoản</h2>
                                <p className="text-sm text-center text-slate-600 dark:text-slate-400 mb-4">
                                    Phát hiện <strong>{existingSites.length}</strong> site đã chứa email <strong className="text-blue-500">{email}</strong>.
                                </p>

                                <div className="bg-slate-50 dark:bg-black/30 p-3 rounded-xl border border-slate-100 dark:border-white/5 max-h-32 overflow-y-auto mb-4 custom-scrollbar">
                                    <p className="text-xs font-mono text-slate-500 leading-relaxed">
                                        {existingSites.map(s => s.site_id).join(', ')}
                                    </p>
                                </div>

                                <p className="text-sm font-bold text-center text-slate-700 dark:text-slate-300 mb-6">
                                    Bạn có muốn bỏ qua các site này và tiếp tục với phần còn lại?
                                </p>
                            </div>

                            <div className="grid grid-cols-2 gap-3 p-6 bg-slate-50 dark:bg-slate-800/30 border-t border-slate-100 dark:border-white/5">
                                <button
                                    onClick={() => setShowPrecheckModal(false)}
                                    className="h-12 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-600 font-bold rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 active:scale-95 transition-all"
                                >
                                    Hủy Bỏ
                                </button>
                                <button
                                    onClick={() => handleStart(existingSites.map(s => s.site_id))}
                                    className="h-12 bg-amber-500 hover:bg-amber-600 disabled:bg-slate-300 text-white font-black tracking-widest text-xs rounded-xl shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2"
                                >
                                    <Play size={16} /> Bỏ Qua & Tiếp Tục
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
};

export default BatchAccountAccess;
