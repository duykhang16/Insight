import React, { useState, useRef, useEffect } from 'react';
import apiClient from '../../api/apiClient';
import {
    Trash2, Play, Square, AlertTriangle, CheckCircle,
    XCircle, ShieldAlert, List, RefreshCw, KeyRound, AlertOctagon, CheckSquare, Square as SquareIcon, Map, Search
} from 'lucide-react';

const CHALLENGE_WORD = 'DELETE';
const REQUIRED_PASSKEY = 'AITC-ADMIN';

const BatchDelete = () => {
    const [zones, setZones] = useState([]);
    const [selectedZones, setSelectedZones] = useState(new Set());
    const [isLoadingZones, setIsLoadingZones] = useState(false);

    const [sites, setSites] = useState([]);
    const [selectedSites, setSelectedSites] = useState([]);
    const [isLoadingSites, setIsLoadingSites] = useState(false);

    const [activeTab, setActiveTab] = useState('zones'); // 'zones' or 'sites'
    const [searchTargetTerm, setSearchTargetTerm] = useState('');
    const [selectedZoneFilter, setSelectedZoneFilter] = useState('all');

    // Passkey state
    const [isUnlocked, setIsUnlocked] = useState(false);
    const [passkeyInput, setPasskeyInput] = useState('');
    const [passkeyError, setPasskeyError] = useState(false);

    // Modal state
    const [showModal, setShowModal] = useState(false);
    const [challengeInput, setChallengeInput] = useState('');

    const [isRunning, setIsRunning] = useState(false);
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
            // Normalize IDs to ensure every site has an 'id' property
            const list = rawList.map(s => ({
                ...s,
                id: s.id || s.siteId || s.site_id
            }));

            const adminSites = list.filter(s => {
                const r = (s.role || '').toLowerCase();
                const rawR = (s.aruba_role_raw || '').toLowerCase();
                const isAdmin = r.startsWith('admin') || rawR.startsWith('admin');
                return isAdmin && s.id; // Must have a valid ID now
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

    const handleOpenModal = () => {
        setChallengeInput('');
        setShowModal(true);
    };

    const handleCloseModal = () => {
        setShowModal(false);
        setChallengeInput('');
    };

    const canConfirmDestruction = challengeInput === CHALLENGE_WORD && !isRunning;

    const targetZones = zones.filter(z => selectedZones.has(z.id));
    const totalSitesSelected = targetZones.reduce((sum, z) => sum + (z.site_count || 0), 0);
    const totalExecutionSites = totalSitesSelected + selectedSites.length;

    const handleStart = async () => {
        setShowModal(false); // Close modal on start
        setIsRunning(true);

        // --- Security Validation Phase ---
        const adminSiteIds = new Set(sites.map(s => s.id));
        const finalTargets = new Set(selectedSites);
        let skipCount = 0;

        // Resolve selected Zones to Admin Sites
        targetZones.forEach(z => {
            (z.site_ids || []).forEach(sid => {
                if (adminSiteIds.has(sid)) {
                    finalTargets.add(sid);
                } else {
                    skipCount++;
                }
            });
        });

        const initialLogs = [];
        if (skipCount > 0) {
            initialLogs.push({ id: 'security-skip', status: 'error', msg: `Security Notice: Automatically skipped ${skipCount} sites with insufficient permissions (Viewer).` });
        }

        const finalTargetArray = Array.from(finalTargets).filter(id => typeof id === 'string' && id.length > 0);

        if (finalTargetArray.length === 0) {
            setLogs([...initialLogs, { id: 'done', status: 'error', msg: 'Zero authorized targets found from selected Zones/Sites. Aborting.' }]);
            setIsRunning(false);
            return;
        }

        setLogs([...initialLogs, { id: 'init', status: 'running', msg: `Initiating batch deletion for ${finalTargetArray.length} sites...` }]);

        try {
            // Send exactly what the Pydantic model 'BatchDeleteRequest' expects
            const payload = {
                target_zone_ids: [], // We already resolved them into target_site_ids for granular logging
                target_site_ids: finalTargetArray
            };
            const res = await apiClient.post('/cloner/batch-site-delete', payload);

            if (!mountedRef.current) return;

            if (res.data?.status === 'success') {
                const results = res.data.results || [];
                const formattedLogs = results.map((r, idx) => ({
                    id: `res-${idx}`,
                    status: r.status === 'SUCCESS' ? 'ok' : 'error',
                    msg: `Site ${r.target}: ${r.status === 'SUCCESS' ? 'Deleted Successfully' : (r.detail?.message || r.detail || 'Failed')}`
                }));
                setLogs(prev => [
                    ...prev,
                    { id: 'done', status: 'ok', msg: `Batch deletion completed. Processed ${results.length} sites.` },
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
                scanZones(); // refresh list
                scanSites(); // refresh list
            }
        }
    };

    const handleUnlock = (e) => {
        e.preventDefault();
        if (passkeyInput === REQUIRED_PASSKEY) {
            setIsUnlocked(true);
            setPasskeyError(false);
        } else {
            setPasskeyError(true);
            setPasskeyInput('');
        }
    };

    if (!isUnlocked) {
        return (
            <div className="w-full min-h-[700px] flex items-center justify-center bg-slate-50 dark:bg-[#020617] rounded-xl border border-slate-200 dark:border-gray-800 shadow-xl p-8 relative overflow-hidden">
                <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden rounded-xl">
                    <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-rose-600/5 dark:bg-rose-600/10 blur-[120px] rounded-full" />
                    <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-red-600/5 dark:bg-red-600/10 blur-[120px] rounded-full" />
                </div>

                <form onSubmit={handleUnlock} className="relative z-10 max-w-sm w-full bg-white dark:bg-slate-900 p-8 rounded-3xl shadow-2xl border border-rose-100 dark:border-rose-900/30 flex flex-col items-center gap-6">
                    <div className="w-16 h-16 bg-rose-100 dark:bg-rose-500/20 rounded-full flex items-center justify-center text-rose-600 dark:text-rose-400">
                        <KeyRound size={32} />
                    </div>
                    <div className="text-center">
                        <h2 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-wider">Restricted Area</h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">Enter the admin passkey to access the Batch Deletion tool.</p>
                    </div>
                    <div className="w-full relative">
                        <input
                            type="password"
                            value={passkeyInput}
                            onChange={e => {
                                setPasskeyInput(e.target.value);
                                setPasskeyError(false);
                            }}
                            placeholder="Enter Passkey"
                            autoFocus
                            className={`w-full text-center bg-slate-50 dark:bg-black/50 border-2 rounded-xl px-4 py-3 text-lg font-bold text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none transition-colors ${passkeyError ? 'border-rose-500 dark:border-rose-500/80 animate-shake' : 'border-slate-200 dark:border-slate-800 focus:border-rose-500 dark:focus:border-rose-500'}`}
                        />
                        {passkeyError && (
                            <p className="text-[10px] text-rose-500 font-bold text-center mt-2 absolute w-full -bottom-5">Incorrect Passkey</p>
                        )}
                    </div>
                    <button
                        type="submit"
                        disabled={!passkeyInput}
                        className="w-full h-12 mt-2 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 disabled:from-slate-300 disabled:to-slate-300 dark:disabled:from-slate-800 dark:disabled:to-slate-800 text-white font-black uppercase tracking-widest text-xs rounded-xl shadow-[0_10px_30px_rgba(225,29,72,0.2)] active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none flex items-center justify-center gap-2"
                    >
                        Unlock Tool
                    </button>
                </form>
            </div>
        );
    }

    return (
        <div className="relative w-full min-h-[700px] bg-slate-50 dark:bg-[#020617] text-slate-800 dark:text-slate-200 rounded-xl border border-slate-200 dark:border-gray-800 shadow-xl overflow-hidden">
            <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden rounded-xl">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-rose-600/5 dark:bg-rose-600/10 blur-[120px] rounded-full" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-red-600/5 dark:bg-red-600/10 blur-[120px] rounded-full" />
            </div>

            <div className="relative z-10 p-8">
                <div className="flex items-center gap-4 mb-8">
                    <div className="w-12 h-12 bg-rose-50 dark:bg-rose-500/10 rounded-xl flex items-center justify-center text-rose-500 dark:text-rose-400 border border-rose-100 dark:border-rose-500/20">
                        <Trash2 size={24} />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                            Batch Site Deletion
                            <span className="bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-400 text-[9px] font-black uppercase px-2 py-0.5 rounded border border-rose-200 dark:border-rose-500/30">High Risk</span>
                        </h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400">Permanently destroy multiple sites across selected Zones. This action cannot be undone.</p>
                    </div>
                </div>

                {/* Preview Summary */}
                {(selectedZones.size > 0 || selectedSites.length > 0) && !isRunning && (
                    <div className="p-4 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 rounded-2xl mb-4 animate-fade-in">
                        <h4 className="text-sm font-bold text-rose-800 dark:text-rose-300 mb-1">Execution Preview</h4>
                        <p className="text-xs text-rose-600 dark:text-rose-400 leading-relaxed">
                            Tổng hợp: <strong className="text-rose-700 dark:text-rose-300">{selectedZones.size}</strong> Zone và <strong className="text-rose-700 dark:text-rose-300">{selectedSites.length}</strong> Site lẻ.
                            Hệ thống sẽ xóa tổng cộng <strong className="text-rose-700 dark:text-rose-300">{totalExecutionSites}</strong> Site.
                        </p>
                        {(() => {
                            const adminSiteIds = new Set(sites.map(s => s.id));
                            let skippedViewerCount = 0;
                            targetZones.forEach(z => {
                                (z.site_ids || []).forEach(sid => {
                                    if (!adminSiteIds.has(sid)) skippedViewerCount++;
                                });
                            });
                            if (skippedViewerCount > 0) {
                                return (
                                    <div className="mt-2 flex items-start gap-2 p-2 bg-white dark:bg-black/20 rounded-lg border border-rose-200 dark:border-rose-500/20">
                                        <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />
                                        <p className="text-[10px] text-amber-600 dark:text-amber-400 font-bold">
                                            Warning: Phát hiện {skippedViewerCount} Site trong Zone là "Viewer". Các site này sẽ tự động bị bỏ qua để bảo mật.
                                        </p>
                                    </div>
                                );
                            }
                            return null;
                        })()}
                    </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                    {/* Panel 1: Zone & Site Selection */}
                    <div className="backdrop-blur-2xl bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 rounded-3xl p-6 flex flex-col gap-5 shadow-xl dark:shadow-none min-h-[500px]">
                        <div className="flex items-center justify-between">
                            <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400 flex items-center gap-2">
                                <Map size={14} className="text-rose-500" /> Source Targets
                            </h3>
                            <button
                                onClick={() => { scanZones(); scanSites(); }}
                                disabled={isLoadingZones || isLoadingSites || isRunning}
                                className="flex items-center gap-1.5 text-[10px] font-bold uppercase hover:text-rose-500 text-slate-500 dark:text-slate-400 transition-colors disabled:opacity-50"
                            >
                                <RefreshCw size={12} className={isLoadingZones || isLoadingSites ? 'animate-spin' : ''} />
                                Refresh
                            </button>
                        </div>

                        <div className="flex gap-2 p-1 bg-slate-100 dark:bg-black/40 rounded-xl relative">
                            <button
                                onClick={() => setActiveTab('zones')}
                                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${activeTab === 'zones' ? 'bg-white dark:bg-slate-800 text-rose-600 dark:text-rose-400 shadow-sm border border-slate-200 dark:border-white/10' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                            >
                                Quản lý theo Zone
                            </button>
                            <button
                                onClick={() => setActiveTab('sites')}
                                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${activeTab === 'sites' ? 'bg-white dark:bg-slate-800 text-rose-600 dark:text-rose-400 shadow-sm border border-slate-200 dark:border-white/10' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                            >
                                Chọn Site lẻ
                            </button>
                        </div>

                        {activeTab === 'zones' ? (
                            isLoadingZones ? (
                                <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-400 dark:text-slate-600">
                                    <RefreshCw size={36} strokeWidth={1} className="animate-spin" />
                                    <p className="text-xs text-center">Loading zones...</p>
                                </div>
                            ) : zones.length === 0 ? (
                                <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-400 dark:text-slate-600 px-4">
                                    <ShieldAlert size={36} strokeWidth={1} className="text-amber-500/50" />
                                    <p className="text-xs text-center">You don't have access to any Zones.</p>
                                </div>
                            ) : (
                                <>
                                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/5 pb-3">
                                        <button
                                            onClick={handleSelectAll}
                                            disabled={isRunning}
                                            className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 transition-colors disabled:opacity-50"
                                        >
                                            {selectedZones.size === zones.length ? (
                                                <><CheckSquare size={16} className="text-rose-500" /> Deselect All</>
                                            ) : (
                                                <><SquareIcon size={16} className="text-slate-400" /> Select All</>
                                            )}
                                        </button>
                                        <span className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded font-mono text-[10px] font-bold">
                                            <span className="text-rose-500">{selectedZones.size}</span> / {zones.length}
                                        </span>
                                    </div>
                                    <div className="flex-1 overflow-y-auto max-h-[360px] pr-2 space-y-2 custom-scrollbar">
                                        {zones.map(zone => (
                                            <div
                                                key={zone.id}
                                                onClick={() => !isRunning && toggleZone(zone.id)}
                                                className={`p-3 rounded-xl border flex items-center gap-3 cursor-pointer transition-all ${selectedZones.has(zone.id)
                                                    ? 'bg-rose-50/50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/30'
                                                    : 'bg-white dark:bg-black/20 border-slate-100 dark:border-white/5 hover:border-slate-300 dark:hover:border-white/20'
                                                    } ${isRunning ? 'opacity-50 pointer-events-none' : ''}`}
                                            >
                                                <div className="shrink-0 flex items-center justify-center">
                                                    {selectedZones.has(zone.id) ? (
                                                        <CheckSquare size={18} className="text-rose-600 dark:text-rose-400" />
                                                    ) : (
                                                        <SquareIcon size={18} className="text-slate-300 dark:text-slate-600" />
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">{zone.name}</p>
                                                    <p className="text-[10px] font-mono text-slate-500 truncate">{zone.site_count || 0} Sites</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )
                        ) : (
                            isLoadingSites ? (
                                <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-400 dark:text-slate-600">
                                    <RefreshCw size={36} strokeWidth={1} className="animate-spin" />
                                    <p className="text-xs text-center">Loading sites...</p>
                                </div>
                            ) : sites.length === 0 ? (
                                <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-400 dark:text-slate-600 px-4">
                                    <ShieldAlert size={36} strokeWidth={1} className="text-amber-500/50" />
                                    <p className="text-xs text-center">No available sites found.</p>
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
                                                className="w-full text-sm bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl py-3 pl-10 pr-4 text-slate-800 dark:text-white focus:outline-none focus:border-rose-500/50 focus:ring-1 focus:ring-rose-500/50 transition-all font-mono"
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
                                    <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/5 pb-3">
                                        <button
                                            onClick={handleSelectAllSites}
                                            disabled={isRunning}
                                            className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 transition-colors disabled:opacity-50"
                                        >
                                            {selectedSites.length === sites.length && sites.length > 0 ? (
                                                <><CheckSquare size={16} className="text-rose-500" /> Deselect All</>
                                            ) : (
                                                <><SquareIcon size={16} className="text-slate-400" /> Select All</>
                                            )}
                                        </button>
                                        <span className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded font-mono text-[10px] font-bold">
                                            <span className="text-rose-500">{selectedSites.length}</span> / {sites.length}
                                        </span>
                                    </div>
                                    <div className="flex-1 overflow-y-auto max-h-[360px] pr-2 space-y-2 custom-scrollbar">
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
                                                className={`p-3 rounded-xl border flex items-center gap-3 cursor-pointer transition-all ${selectedSites.includes(site.id)
                                                    ? 'bg-rose-50/50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/30'
                                                    : 'bg-white dark:bg-black/20 border-slate-100 dark:border-white/5 hover:border-slate-300 dark:hover:border-white/20'
                                                    } ${isRunning ? 'opacity-50 pointer-events-none' : ''}`}
                                            >
                                                <div className="shrink-0 flex items-center justify-center">
                                                    {selectedSites.includes(site.id) ? (
                                                        <CheckSquare size={18} className="text-rose-600 dark:text-rose-400" />
                                                    ) : (
                                                        <SquareIcon size={18} className="text-slate-300 dark:text-slate-600" />
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">{site.siteName}</p>
                                                    <p className="text-[10px] font-mono text-slate-500 truncate">{site.id}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )
                        )}
                        <div className="mt-4 pt-2 border-t border-slate-100 dark:border-white/5">
                            <button
                                onClick={handleOpenModal}
                                disabled={(selectedZones.size === 0 && selectedSites.size === 0) || isRunning}
                                className="w-full h-12 bg-gradient-to-r from-rose-600 to-red-600 text-white font-black uppercase tracking-[0.2em] text-xs rounded-2xl shadow-[0_10px_30px_rgba(225,29,72,0.2)] hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-25 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                <Trash2 size={16} /> Delete {totalExecutionSites} Sites
                            </button>
                        </div>
                    </div>

                    {/* Panel 2: Execution Log */}
                    <div className="backdrop-blur-2xl bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 rounded-3xl p-6 flex flex-col gap-4 shadow-xl dark:shadow-none min-h-[500px]">
                        <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400 flex items-center gap-2">
                            <Play size={14} className="text-rose-500" /> Execution Log
                        </h3>

                        <div className="flex-1 overflow-y-auto max-h-[380px] space-y-1.5 font-mono pr-1 custom-scrollbar">
                            {logs.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-400 dark:text-slate-600 py-12">
                                    <AlertOctagon size={28} strokeWidth={1} className="opacity-50" />
                                    <p className="text-xs text-center font-sans">Ready for destructive sequence.</p>
                                </div>
                            ) : (
                                logs.map((log) => (
                                    <div
                                        key={log.id}
                                        className={`flex items-start gap-2.5 p-2.5 rounded-lg text-[11px] border transition-colors ${log.status === 'ok'
                                            ? 'bg-emerald-50 dark:bg-emerald-500/5 border-emerald-200 dark:border-emerald-500/10'
                                            : log.status === 'error'
                                                ? 'bg-rose-50 dark:bg-rose-500/5 border-rose-200 dark:border-rose-500/10'
                                                : log.status === 'running'
                                                    ? 'bg-rose-50 dark:bg-rose-500/5 border-rose-200 dark:border-rose-500/10 animate-pulse'
                                                    : 'bg-slate-50 dark:bg-white/[0.02] border-slate-200 dark:border-white/5'
                                            }`}
                                    >
                                        <span className="shrink-0 mt-0.5">
                                            {log.status === 'ok' && <CheckCircle size={12} className="text-emerald-500" />}
                                            {log.status === 'error' && <XCircle size={12} className="text-rose-500" />}
                                            {log.status === 'running' && (
                                                <div className="w-3 h-3 rounded-full border-2 border-rose-500 border-t-transparent animate-spin" />
                                            )}
                                        </span>
                                        <div className="flex-1 min-w-0">
                                            <p className={`font-bold ${log.status === 'error' ? 'text-rose-700 dark:text-rose-400' : 'text-slate-600 dark:text-slate-400'} text-[10px] break-all`}>
                                                {log.msg}
                                            </p>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                </div>
            </div>

            {/* 2-Step Confirmation Modal */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 dark:bg-black/80 backdrop-blur-md">
                    <div className="bg-white dark:bg-slate-900 max-w-md w-full rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col animate-fade-in relative">
                        {/* Danger header stripe */}
                        <div className="h-2 w-full bg-gradient-to-r from-rose-500 via-red-500 to-rose-500" />

                        <div className="p-6 pb-2">
                            <div className="w-12 h-12 bg-rose-100 dark:bg-rose-500/20 rounded-full flex items-center justify-center text-rose-600 dark:text-rose-400 mb-4 mx-auto shadow-[0_0_20px_rgba(225,29,72,0.3)]">
                                <AlertTriangle size={24} />
                            </div>
                            <h2 className="text-xl font-black text-center text-slate-900 dark:text-white mb-2">Confirm Destruction</h2>
                            <p className="text-sm text-center text-slate-600 dark:text-slate-400 mb-6">
                                You are about to permanently delete <strong className="text-rose-600 dark:text-rose-400">{totalExecutionSites}</strong> selected site(s). This action cannot be undone.
                            </p>

                            <div className="flex flex-col gap-2 mb-4">
                                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 text-center">
                                    Type <span className="font-mono bg-rose-100 dark:bg-rose-900/50 text-rose-700 dark:text-rose-300 px-1 py-0.5 rounded select-all">{CHALLENGE_WORD}</span> to proceed
                                </label>
                                <input
                                    type="text"
                                    value={challengeInput}
                                    onChange={e => setChallengeInput(e.target.value)}
                                    placeholder={CHALLENGE_WORD}
                                    className="w-full text-center bg-white dark:bg-black/50 border-2 border-slate-300 dark:border-slate-700 focus:border-rose-500 dark:focus:border-rose-500 rounded-xl px-4 py-3 text-lg font-black tracking-widest text-slate-900 dark:text-rose-500 placeholder:text-slate-300 dark:placeholder:text-slate-700 focus:outline-none transition-colors"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 p-6 bg-slate-50 dark:bg-slate-800/30 border-t border-slate-100 dark:border-white/5">
                            <button
                                onClick={handleCloseModal}
                                className="h-12 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-600 font-bold rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 active:scale-95 transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleStart}
                                disabled={!canConfirmDestruction}
                                className="h-12 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white font-black uppercase tracking-widest text-xs rounded-xl shadow-lg active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                <KeyRound size={16} className={canConfirmDestruction ? 'animate-pulse' : ''} /> Destroy
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BatchDelete;
