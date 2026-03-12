import React, { useState, useRef, useEffect } from 'react';
import apiClient from '../../api/apiClient';
import { useLanguage } from '../../context/LanguageContext';
import { toast } from 'sonner';
import {
    Layers, Play, Square, AlertTriangle, CheckCircle,
    XCircle, ChevronRight, Globe, Clock, Hash, Tag, Map, RefreshCw, CheckSquare, Square as SquareIcon, Rocket, Layout
} from 'lucide-react';

const TIMEZONES = [
    { value: 'Asia/Ho_Chi_Minh', label: 'Asia/Ho_Chi_Minh (UTC+7)' },
    { value: 'Asia/Tokyo', label: 'Asia/Tokyo (UTC+9)' },
    { value: 'Asia/Singapore', label: 'Asia/Singapore (UTC+8)' },
    { value: 'Asia/Bangkok', label: 'Asia/Bangkok (UTC+7)' },
    { value: 'America/New_York', label: 'America/New_York (UTC-5)' },
    { value: 'Europe/London', label: 'Europe/London (UTC+0)' },
];

const REG_DOMAINS = [
    { value: 'VN', label: 'VN — Vietnam' },
    { value: 'JP', label: 'JP — Japan' },
    { value: 'US', label: 'US — United States' },
    { value: 'SG', label: 'SG — Singapore' },
    { value: 'TH', label: 'TH — Thailand' },
];

const getRoleBadgeInfo = (roleStr) => {
    const role = (roleStr || 'UNKNOWN').toLowerCase();
    switch (role) {
        case 'administrator':
        case 'admin':
            return { text: 'ADMIN', classes: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-700/50' };
        default:
            return { text: role.toUpperCase(), classes: 'bg-slate-100 dark:bg-slate-800/40 text-slate-500 border-slate-200 dark:border-slate-700/50' };
    }
};

const BatchProvision = () => {
    const { t } = useLanguage();
    // Config State
    const [sites, setSites] = useState([]);
    const [selectedSourceId, setSelectedSourceId] = useState('');
    const [prefix, setPrefix] = useState('');
    const [cloneCount, setCloneCount] = useState(5);
    const [regDomain, setRegDomain] = useState('VN');
    const [timezone, setTimezone] = useState('Asia/Ho_Chi_Minh');

    // Location Override
    /* eslint-disable no-unused-vars */
    const [overrideLocation, setOverrideLocation] = useState(false);
    const [lat, setLat] = useState('21.02884');
    const [lng, setLng] = useState('105.85462');
    const [address, setAddress] = useState('Vietnam');
    /* eslint-enable no-unused-vars */

    // Target Zones State
    const [zones, setZones] = useState([]);
    const [isLoadingZones, setIsLoadingZones] = useState(false);
    const [selectedZones, setSelectedZones] = useState(new Set());

    // Template State
    const [templates, setTemplates] = useState([]);
    const [selectedTemplateId, setSelectedTemplateId] = useState('');

    const [isRunning, setIsRunning] = useState(false);
    const [logs, setLogs] = useState([]);
    const [progress, setProgress] = useState(0);
    const [confirmShown, setConfirmShown] = useState(false);
    const mountedRef = useRef(true);
    const progressRef = useRef(null);

    const scanZones = async () => {
        setIsLoadingZones(true);
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

    useEffect(() => {
        apiClient.get('/overview/sites').then(res => {
            const list = Array.isArray(res.data) ? res.data : (res.data?.sites || []);
            setSites(list);
        }).catch(() => setSites([]));

        apiClient.get('/templates').then(res => {
            setTemplates(res.data || []);
        }).catch(() => setTemplates([]));

        scanZones();
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
    }, []);

    const selectedSite = sites.find(s => (s.siteId === selectedSourceId || s.id === selectedSourceId));
    const siteRole = (selectedSite?.role || '').toLowerCase();

    // Template sites MUST be admin/administrator sites
    const adminTemplateSites = sites.filter(s => {
        const r = (s.role || '').toLowerCase();
        return r === 'admin' || r === 'administrator';
    });

    const isPrefixValid = prefix.trim() !== '';
    const isCloneCountValid = cloneCount >= 1 && cloneCount <= 50;
    const isLocationValid = !overrideLocation || (overrideLocation && lat.trim() !== '' && lng.trim() !== '' && address.trim() !== '');

    // Zone selection is now OPTIONAL
    const canStart = selectedSourceId !== '' && isPrefixValid && isCloneCountValid && isLocationValid && !isRunning;

    const toggleZone = (zoneId) => {
        const newSet = new Set(selectedZones);
        if (newSet.has(zoneId)) newSet.delete(zoneId);
        else newSet.add(zoneId);
        setSelectedZones(newSet);
    };

    const handleSelectAllZones = () => {
        if (selectedZones.size === zones.length && zones.length > 0) {
            setSelectedZones(new Set());
        } else {
            setSelectedZones(new Set(zones.map(z => z.id)));
        }
    };

    const handleStart = async () => {
        setIsRunning(true);
        setLogs([]);
        setProgress(0);
        setConfirmShown(false);

        // Simulated progress animation
        progressRef.current = setInterval(() => {
            setProgress(p => p < 80 ? p + 3 : p);
        }, 150);

        const finalZones = Array.from(selectedZones);
        const initialLogs = [
            { id: 'init', status: 'running', msg: `Initiating batch provision of ${cloneCount} sites...` }
        ];
        setLogs(initialLogs);

        try {
            const payload = {
                source_site_id: selectedSourceId,
                clone_count: cloneCount,
                prefix: prefix,
                regulatory_domain: regDomain,
                timezone_iana: timezone,
                configured_location: {
                    latitude: overrideLocation ? lat : (selectedSite?.configuredLocation?.latitude || "21.02884"),
                    longitude: overrideLocation ? lng : (selectedSite?.configuredLocation?.longitude || "105.85462"),
                    address: overrideLocation ? address : (selectedSite?.configuredLocation?.address || "Vietnam")
                },
                target_zone_ids: finalZones,
                template_id: selectedTemplateId || null,
            };

            const res = await apiClient.post('/cloner/batch-site-provision', payload);
            if (!mountedRef.current) return;

            clearInterval(progressRef.current);
            setProgress(100);

            if (res.data?.status === 'success') {
                const results = res.data.results || [];
                const successCount = results.filter(r => r.status === 'SUCCESS').length;
                const formattedLogs = results.map((r, idx) => ({
                    id: `res-${idx}`,
                    status: r.status === 'SUCCESS' ? 'ok' : 'error',
                    msg: `Site ${r.target}: ${r.status === 'SUCCESS' ? 'Created Successfully' : (r.detail?.message || r.detail || 'Failed')}`
                }));
                setLogs(prev => [
                    ...prev,
                    { id: 'done', status: 'ok', msg: `Batch provision completed. Processed ${results.length} sites.` },
                    ...formattedLogs
                ]);
                toast.success(`${successCount} sites provisioned successfully!`, {
                    description: `Batch provision hoàn tất. Đã tạo ${successCount}/${results.length} sites.`,
                    duration: 6000,
                });
            } else {
                setLogs([{ id: 'err', status: 'error', msg: `API returned unexpected status: ${res.data?.status}` }]);
                toast.error('Batch provision gặp lỗi bất ngờ.');
            }
        } catch (err) {
            if (!mountedRef.current) return;
            clearInterval(progressRef.current);
            setProgress(0);
            const errMsg = err.response?.data?.detail || err.message;
            setLogs([{ id: 'err-catch', status: 'error', msg: `Critical Error: ${errMsg}` }]);
            toast.error(`Batch provision thất bại: ${errMsg}`);
        } finally {
            if (mountedRef.current) {
                setIsRunning(false);
                scanZones();
            }
        }
    };

    return (
        <div className="relative w-full min-h-[700px] bg-slate-50 dark:bg-[#020617] text-slate-800 dark:text-slate-200 rounded-xl border border-slate-200 dark:border-gray-800 shadow-xl overflow-hidden">
            <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden rounded-xl">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-violet-600/5 dark:bg-violet-600/10 blur-[120px] rounded-full" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-600/5 dark:bg-indigo-600/10 blur-[120px] rounded-full" />
            </div>

            <div className="relative z-10 p-8">
                <div className="flex items-center gap-4 mb-8">
                    <div className="w-12 h-12 bg-violet-50 dark:bg-violet-500/10 rounded-xl flex items-center justify-center text-violet-500 dark:text-violet-400 border border-violet-100 dark:border-violet-500/20">
                        <Layers size={24} />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">{t('batch_provision.title')}</h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400">{t('batch_provision.subtitle')}</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                    {/* Panel 1: Config Form */}
                    <div className="backdrop-blur-2xl bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 rounded-3xl p-6 flex flex-col gap-5 shadow-xl dark:shadow-none min-h-[500px]">
                        <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400 flex items-center gap-2">
                            <Tag size={14} className="text-violet-500" /> {t('batch_provision.configuration')}
                        </h3>

                        <div className="flex flex-col gap-1.5">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{t('batch_provision.template_site')}</label>
                            <select
                                value={selectedSourceId}
                                onChange={e => setSelectedSourceId(e.target.value)}
                                disabled={isRunning}
                                className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-3 text-sm font-semibold text-slate-800 dark:text-white appearance-none focus:outline-none focus:border-violet-500/50 disabled:opacity-50"
                            >
                                <option value="">{t('batch_provision.select_template')}</option>
                                {adminTemplateSites.map(s => (
                                    <option key={s.siteId || s.id} value={s.siteId || s.id} className="bg-white dark:bg-slate-900">
                                        {s.siteName}
                                    </option>
                                ))}
                            </select>
                            {selectedSite && (
                                <div className="flex items-center gap-2 mt-1">
                                    <span className={`px-2 py-0.5 rounded border text-[9px] font-black uppercase tracking-widest ${getRoleBadgeInfo(selectedSite.role).classes}`}>
                                        {getRoleBadgeInfo(selectedSite.role).text}
                                    </span>
                                </div>
                            )}
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{t('batch_provision.site_name_prefix')}</label>
                            <input
                                type="text"
                                value={prefix}
                                onChange={e => setPrefix(e.target.value)}
                                disabled={isRunning}
                                placeholder={t('batch_provision.prefix_placeholder')}
                                className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-3 text-sm font-semibold text-slate-800 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none focus:border-violet-500/50 disabled:opacity-50"
                            />
                        </div>

                        <div className="flex flex-col gap-2">
                            <div className="flex justify-between items-center">
                                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5"><Hash size={11} /> {t('batch_provision.clone_target')}</label>
                                <span className="text-sm font-black text-violet-600 dark:text-violet-400">{cloneCount}</span>
                            </div>
                            <input
                                type="range"
                                min={1} max={50}
                                value={cloneCount}
                                onChange={e => setCloneCount(Number(e.target.value))}
                                disabled={isRunning}
                                className="w-full accent-violet-500 disabled:opacity-50"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="flex flex-col gap-1.5">
                                <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest"><Globe size={11} className="inline mr-1" /> {t('batch_provision.domain')}</label>
                                <select value={regDomain} onChange={e => setRegDomain(e.target.value)} disabled={isRunning} className="w-full bg-slate-50 border rounded-lg px-2 py-2 text-xs appearance-none">
                                    {REG_DOMAINS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                                </select>
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest"><Clock size={11} className="inline mr-1" /> {t('batch_provision.timezone')}</label>
                                <select value={timezone} onChange={e => setTimezone(e.target.value)} disabled={isRunning} className="w-full bg-slate-50 border rounded-lg px-2 py-2 text-xs appearance-none">
                                    {TIMEZONES.map(z => <option key={z.value} value={z.value}>{z.label}</option>)}
                                </select>
                            </div>
                        </div>

                        {/* Template Selector */}
                        <div className="flex flex-col gap-1.5">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                                <Layout size={11} className="text-emerald-500" /> Template Badge
                            </label>
                            <select
                                value={selectedTemplateId}
                                onChange={e => setSelectedTemplateId(e.target.value)}
                                disabled={isRunning}
                                className="w-full bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-white/5 rounded-xl px-4 py-3 text-sm font-semibold text-slate-800 dark:text-white appearance-none focus:outline-none focus:border-emerald-500/50 disabled:opacity-50"
                            >
                                <option value="">Không gán template</option>
                                {templates.map(tpl => (
                                    <option key={tpl.id} value={tpl.id} className="bg-white dark:bg-slate-900">
                                        {tpl.name}
                                    </option>
                                ))}
                            </select>
                            {selectedTemplateId && (() => {
                                const tpl = templates.find(t => t.id === selectedTemplateId);
                                return tpl ? (
                                    <div className="flex items-center gap-2 mt-1">
                                        <span
                                            className="px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border"
                                            style={{ borderColor: `${tpl.color}50`, backgroundColor: `${tpl.color}15`, color: tpl.color }}
                                        >
                                            {tpl.name}
                                        </span>
                                        <span className="text-[9px] text-slate-400 font-bold">← Badge sẽ được gắn</span>
                                    </div>
                                ) : null;
                            })()}
                        </div>
                    </div>

                    {/* Panel 2: Target Selection */}
                    <div className="backdrop-blur-2xl bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 rounded-3xl p-6 flex flex-col gap-4 shadow-xl dark:shadow-none min-h-[500px]">
                        <div className="flex items-center justify-between">
                            <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400 flex items-center gap-2">
                                <Map size={14} className="text-violet-500" /> {t('batch_provision.target_zones')}
                            </h3>
                            <button
                                onClick={scanZones}
                                disabled={isLoadingZones || isRunning}
                                className="text-slate-500 hover:text-violet-500 transition-colors"
                            >
                                <RefreshCw size={12} className={isLoadingZones ? 'animate-spin' : ''} />
                            </button>
                        </div>

                        <div className="flex-1 flex flex-col min-h-0">
                            {isLoadingZones ? (
                                <div className="flex-1 flex flex-col items-center justify-center gap-3 text-slate-400">
                                    <RefreshCw size={24} className="animate-spin" />
                                </div>
                            ) : zones.length === 0 ? (
                                <div className="flex-1 flex items-center justify-center text-slate-400 text-xs">{t('batch_provision.no_zones_found')}</div>
                            ) : (
                                <>
                                    <div className="flex items-center justify-between border-b dark:border-white/5 pb-2 mb-2">
                                        <button onClick={handleSelectAllZones} disabled={isRunning} className="flex items-center gap-1.5 text-[10px] text-slate-600 dark:text-slate-400 hover:text-violet-500 font-bold uppercase tracking-wider">
                                            {selectedZones.size === zones.length && zones.length > 0 ? <CheckSquare size={14} className="text-violet-500" /> : <SquareIcon size={14} />} {t('batch_provision.select_all')}
                                        </button>
                                        <span className="text-[10px] font-mono text-slate-400 font-bold"><span className="text-violet-500">{selectedZones.size}</span> / {zones.length}</span>
                                    </div>
                                    <div className="flex-1 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                                        {zones.map(z => (
                                            <div
                                                key={z.id}
                                                onClick={() => !isRunning && toggleZone(z.id)}
                                                className={`p-2 rounded-xl flex items-center gap-3 border cursor-pointer transition-all ${selectedZones.has(z.id) ? 'bg-violet-50 dark:bg-violet-500/10 border-violet-200 dark:border-violet-500/30' : 'bg-white dark:bg-black/20 border-slate-100 dark:border-white/5 hover:border-slate-300'}`}
                                            >
                                                {selectedZones.has(z.id) ? <CheckSquare size={16} className="text-violet-600 dark:text-violet-400" /> : <SquareIcon size={16} className="th-text-secondary dark:text-slate-600" />}
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">{z.name}</p>
                                                    <p className="text-[9px] text-slate-500">{z.site_count || 0} Sites</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Panel 3: Execution Log */}
                    <div className="backdrop-blur-2xl bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 rounded-3xl p-6 flex flex-col gap-4 shadow-xl dark:shadow-none min-h-[500px]">
                        <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400 flex items-center gap-2">
                            <Play size={14} className="text-violet-500" /> {t('batch_provision.execution_log')}
                        </h3>

                        {/* Progress Bar */}
                        {(isRunning || progress > 0) && (
                            <div className="space-y-2 py-1">
                                <div className="flex justify-between items-center">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                        {isRunning ? 'Provisioning...' : 'Completed'}
                                    </span>
                                    <span className="text-sm font-mono font-black text-violet-500">{progress}%</span>
                                </div>
                                <div className="w-full h-3 bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-gradient-to-r from-violet-500 to-indigo-400 transition-all duration-300 shadow-[0_0_10px_rgba(139,92,246,0.5)]"
                                        style={{ width: `${progress}%` }}
                                    />
                                </div>
                            </div>
                        )}

                        {/* Inline Confirm Panel */}
                        {!isRunning && logs.length === 0 && prefix && selectedSourceId && !confirmShown && (
                            <div className="p-4 rounded-2xl border-l-4 border-violet-500 bg-violet-50/50 dark:bg-violet-500/5 border border-violet-200 dark:border-violet-500/20 flex flex-col gap-4 animate-fade-in">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-violet-500/10 rounded-xl flex items-center justify-center text-violet-500">
                                        <Rocket size={20} />
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black uppercase tracking-widest text-violet-500">XÁC NHẬN THỰC THI</p>
                                        <p className="text-sm font-bold text-slate-800 dark:text-white">Ready to Provision</p>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 gap-2 text-xs">
                                    <div className="flex justify-between">
                                        <span className="text-slate-400 font-bold uppercase tracking-wider">Source Site</span>
                                        <span className="font-bold text-slate-700 dark:text-white">{selectedSite?.siteName || '—'}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-slate-400 font-bold uppercase tracking-wider">Prefix</span>
                                        <span className="font-bold text-violet-600 dark:text-violet-400">{prefix}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-slate-400 font-bold uppercase tracking-wider">Sites to create</span>
                                        <span className="font-bold text-slate-700 dark:text-white">{cloneCount}</span>
                                    </div>
                                    {selectedTemplateId && (() => {
                                        const tpl = templates.find(t => t.id === selectedTemplateId);
                                        return tpl ? (
                                            <div className="flex justify-between items-center">
                                                <span className="text-slate-400 font-bold uppercase tracking-wider">Template Badge</span>
                                                <span
                                                    className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border"
                                                    style={{ borderColor: `${tpl.color}50`, backgroundColor: `${tpl.color}15`, color: tpl.color }}
                                                >
                                                    {tpl.name}
                                                </span>
                                            </div>
                                        ) : null;
                                    })()}
                                </div>
                                <button
                                    onClick={() => setConfirmShown(true)}
                                    className="w-full h-10 bg-gradient-to-r from-violet-600 to-indigo-600 th-text-primary font-black uppercase tracking-widest text-[10px] rounded-xl flex items-center justify-center gap-2 hover:scale-[1.02] transition-all shadow-lg shadow-violet-500/20"
                                >
                                    <Rocket size={14} /> Xác nhận & Khởi chạy
                                </button>
                            </div>
                        )}

                        {/* Preview Summary (khi đã confirm) */}
                        {prefix && selectedSourceId && !isRunning && logs.length === 0 && confirmShown && (
                            <div className="p-3 bg-violet-50 dark:bg-violet-500/10 border border-violet-200 dark:border-violet-500/30 rounded-xl mb-2 animate-fade-in">
                                <h4 className="text-xs font-bold text-violet-800 dark:text-violet-300">{t('batch_provision.preview_summary')}</h4>
                                <p className="text-[10px] text-violet-600 dark:text-violet-400 mt-1 leading-relaxed">
                                    {t('batch_provision.provision_sites')} <strong>{cloneCount}</strong> {t('batch_provision.provision_based_on')} {selectedSite?.siteName}.
                                    {selectedZones.size > 0 ? (
                                        <> {t('batch_provision.zones_assigned')} <strong>{selectedZones.size} {t('batch_provision.zones_count')}</strong></>
                                    ) : (
                                        <> {t('batch_provision.zones_standalone')}</>
                                    )}
                                </p>
                            </div>
                        )}

                        <div className="flex-1 bg-slate-50 dark:bg-black/20 border rounded-2xl p-3 overflow-y-auto font-mono text-[10px] custom-scrollbar">
                            {logs.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-slate-400 dark:text-slate-600 gap-2">
                                    <Play size={20} className="opacity-50" />
                                    <p className="font-sans text-xs">{t('batch_provision.awaiting_execution')}</p>
                                </div>
                            ) : (
                                <div className="space-y-1.5">
                                    {logs.map(log => (
                                        <div key={log.id} className="flex items-start gap-2 border-b border-slate-100 pb-1.5">
                                            {log.status === 'running' && <RefreshCw size={10} className="animate-spin text-violet-500 mt-0.5 shrink-0" />}
                                            {log.status === 'error' && <XCircle size={10} className="text-rose-500 mt-0.5 shrink-0" />}
                                            {log.status === 'ok' && <CheckCircle size={10} className="text-emerald-500 mt-0.5 shrink-0" />}
                                            <span className={`${log.status === 'error' ? 'text-rose-600' : log.status === 'running' ? 'text-violet-600 font-bold' : 'text-slate-600'} break-all`}>
                                                {log.msg}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <button
                            onClick={handleStart}
                            disabled={!canStart || (prefix && selectedSourceId && !confirmShown && logs.length === 0)}
                            className="w-full h-12 bg-gradient-to-r from-violet-600 to-indigo-600 th-text-primary font-black uppercase tracking-[0.2em] text-[10px] rounded-2xl shadow-xl hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {isRunning ? (
                                <><RefreshCw size={14} className="animate-spin" /> {t('batch_provision.provisioning_backend')}</>
                            ) : (
                                <><Play size={14} /> {t('batch_provision.start_batch_clone')}</>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default BatchProvision;
