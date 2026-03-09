// ─── Custom CSS for Recharts Bar Color ─────────────────────────────────────
import '../../assets/recharts-custom.css';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { AlertCircle, ArrowRight, Users, Wifi, Monitor, X } from 'lucide-react';
import {
    LineChart, BarChart, Line, Bar, Cell, ReferenceLine,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import apiClient from '../../api/apiClient';
import { useSite } from '../../context/SiteContext';
import { useLanguage } from '../../context/LanguageContext';
import { formatVN, formatTimeOnly, formatDateKey } from '../../utils/timeUtils';

// ─── Constants ────────────────────────────────────────────────────────────────

const SEVERITY_COLORS = {
    poor: '#ef4444',
    major: '#ef4444',
    fair: '#f59e0b',
    minor: '#f59e0b',
    good: '#10b981',
    none: '#64748b',
};

// Shared chart margins — both zones must use identical left/right margins
// so their X-axis tick positions align perfectly into one continuous frame.
const CHART_MARGIN_LEFT = 0;
const CHART_MARGIN_RIGHT = 48;

// ─── Pure helpers ─────────────────────────────────────────────────────────────

const worstSeverity = (conditions) => {
    const sevs = conditions.map(c => (c.conditionSeverity || c.severity || 'none').toLowerCase());
    if (sevs.some(s => s === 'major' || s === 'poor')) return 'poor';
    if (sevs.some(s => s === 'minor' || s === 'fair')) return 'fair';
    if (sevs.some(s => s === 'good')) return 'good';
    return 'none';
};

const extractConditions = (entry) => {
    const list = [];
    if (!entry?.health) return list;
    ['clients', 'networks', 'devices'].forEach(key => {
        const section = entry.health[key];
        if (Array.isArray(section?.conditions)) {
            section.conditions.forEach(c => list.push({
                ...c,
                sourceType: key.charAt(0).toUpperCase() + key.slice(1).replace(/s$/, ''),
            }));
        }
    });
    return list;
};

const fmtConditionName = (str) =>
    str.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());

// ─── Shared custom tick renderer — highlights day-boundary labels in cyan ─────

const DayBoundaryTick = ({ x, y, payload }) => {
    const isDayMark = payload.value.includes('/');
    return (
        <text
            x={x} y={y + 4}
            textAnchor="middle"
            fontSize={isDayMark ? 10 : 11}
            fontWeight={isDayMark ? 700 : 400}
            fill={isDayMark ? '#06b6d4' : '#64748b'}
        >
            {payload.value}
        </text>
    );
};

// ─── Shared tooltip for both charts ───────────────────────────────────────────

const ChartTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0]?.payload;
    if (!d) return null;
    const isScore = payload[0]?.dataKey === 'score';

    return (
        <div className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs shadow-xl pointer-events-none min-w-[140px]">
            <p className="text-slate-400 mb-2 font-mono text-[10px]">{formatVN(d.sampleTime)}</p>
            {isScore ? (
                <p className="text-emerald-400 font-bold">Score: {d.score}%</p>
            ) : (
                <>
                    <p className="text-slate-300">
                        {d.count} {d.count === 1 ? 'condition' : 'conditions'}
                    </p>
                    {d.majorCount > 0 && <p className="text-rose-400">↑ Major: {d.majorCount}</p>}
                    {d.minorCount > 0 && <p className="text-amber-400">↑ Minor: {d.minorCount}</p>}
                </>
            )}
        </div>
    );
};

// ─── Coloured bar cells (must be defined outside render to avoid re-mount) ────

const ColoredBars = ({ unifiedData, selectedIndex }) =>
    unifiedData.map((entry, idx) => {
        const isSelected = idx === selectedIndex;
        const color = SEVERITY_COLORS[entry.severity] ?? SEVERITY_COLORS.none;
        return (
            <Cell
                key={`cell-${idx}`}
                fill={color}
                fillOpacity={isSelected ? 1 : 0.45}
                stroke={isSelected ? '#ffffff' : 'none'}
                strokeWidth={isSelected ? 1.5 : 0}
            />
        );
    });

// ─── Main Component ───────────────────────────────────────────────────────────

const Health = () => {
    const { t } = useLanguage();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(null);

    const { selectedSiteId, setSelectedSiteId, sites, fetchSites } = useSite();

    // ── Effects ───────────────────────────────────────────────────────────────

    useEffect(() => { if (sites.length === 0) fetchSites(); }, []);

    useEffect(() => {
        if (selectedSiteId) fetchHealthData(selectedSiteId);
    }, [selectedSiteId]);

    // ── Fetch ─────────────────────────────────────────────────────────────────

    const fetchHealthData = async (siteId) => {
        setLoading(true);
        setError('');
        setSelectedIndex(null);
        try {
            const res = await apiClient.get(`/overview/sites/${siteId}/health`);
            setData(res.data);
        } catch (err) {
            console.error('Health fetch error:', err);
            setError(t('dashboard.error_fetch'));
        } finally {
            setLoading(false);
        }
    };

    const handleRefresh = () => {
        if (selectedSiteId) fetchHealthData(selectedSiteId);
        else fetchSites();
    };

    // ── Data processing ───────────────────────────────────────────────────────

    // Strictly sorted ascending — guarantees chronological timeline
    const historicalEntries = useMemo(() =>
        (data?.historicalHealths || [])
            .slice()
            .sort((a, b) => a.sampleTime - b.sampleTime),
        [data]);

    // Unified data consumed by both synchronized charts.
    // Both LineChart and BarChart share this same array ref so syncId index-matching works.
    // `label`  = X-axis tick (includes "DD/MM" prefix at day boundaries)
    // `score`  = Zone A line Y value (0–100)
    // `count`  = Zone B bar height (alert count)
    const unifiedData = useMemo(() => {
        let prevDateKey = null;
        return historicalEntries.map(h => {
            const conditions = extractConditions(h);
            const majorCount = conditions.filter(c =>
                ['major', 'poor'].includes((c.conditionSeverity || c.severity || '').toLowerCase())
            ).length;
            const minorCount = conditions.filter(c =>
                ['minor', 'fair'].includes((c.conditionSeverity || c.severity || '').toLowerCase())
            ).length;

            const timeStr = formatTimeOnly(h.sampleTime);
            const dateKey = formatDateKey(h.sampleTime);
            const dayChanged = dateKey !== prevDateKey;

            // Mark midnight crossings clearly: "05/03 00:00"
            const label = (timeStr === '00:00' || (dayChanged && prevDateKey !== null))
                ? `${dateKey.slice(0, 5)} ${timeStr}`
                : timeStr;

            prevDateKey = dateKey;

            return {
                label,
                sampleTime: h.sampleTime,
                score: h.health?.healthScore?.score ?? 0,
                scoreSeverity: h.health?.healthScore?.scoreSeverity ?? 'none',
                count: conditions.length,
                majorCount,
                minorCount,
                severity: worstSeverity(conditions),
            };
        });
    }, [historicalEntries]);

    // ── Click handler — full vertical-slice snap ──────────────────────────────
    // Both chart containers fire this; activeTooltipIndex covers the full column width.
    const handleChartClick = useCallback((chartEvent) => {
        if (!chartEvent) return;
        const idx = chartEvent.activeTooltipIndex;
        if (idx == null || idx < 0) return;
        setSelectedIndex(prev => prev === idx ? null : idx);
    }, []);

    // ── Derived state ─────────────────────────────────────────────────────────

    const selectedEntry = useMemo(() =>
        selectedIndex != null ? (historicalEntries[selectedIndex] ?? null) : null,
        [selectedIndex, historicalEntries]);

    const allConditions = useMemo(() => {
        const list = [];
        if (data?.currentHealth) {
            Object.entries(data.currentHealth).forEach(([key, val]) => {
                if (Array.isArray(val?.conditions)) {
                    val.conditions.forEach(c => list.push({
                        ...c,
                        sourceType: key.charAt(0).toUpperCase() + key.slice(1).replace(/s$/, ''),
                    }));
                }
            });
        }
        return list;
    }, [data]);

    const displayConditions = useMemo(() =>
        selectedEntry ? extractConditions(selectedEntry) : allConditions,
        [selectedEntry, allConditions]);

    // ReferenceLine x must exactly match the XAxis dataKey value at that index
    const selectedLabel = selectedIndex != null
        ? (unifiedData[selectedIndex]?.label ?? null)
        : null;

    // ── UI helpers ────────────────────────────────────────────────────────────

    const currentScore = data?.currentHealth?.healthScore?.score ?? 0;
    const scoreColor = currentScore >= 80 ? 'text-emerald-500'
        : currentScore >= 60 ? 'text-yellow-500'
            : 'text-rose-500';

    const maxCount = useMemo(() =>
        Math.max(1, ...unifiedData.map(d => d.count)),
        [unifiedData]);

    const getCounterBox = (title, counters) => {
        const { goodCount = 0, fairCount = 0, poorCount = 0, noneCount = 0 } = counters || {};
        const total = goodCount + fairCount + poorCount + noneCount;
        return (
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-xl border border-slate-100 dark:border-white/5 flex flex-col items-center">
                <div className="mb-2 text-slate-600 dark:text-slate-300 font-bold text-sm">{title}</div>
                <div className="text-2xl font-black text-slate-800 dark:text-white">{total}</div>
                <div className="flex flex-wrap justify-center gap-3 mt-3 text-xs font-bold">
                    {poorCount > 0 && <span className="flex items-center gap-1 text-rose-500"><span className="w-2 h-2 rounded-full bg-rose-500 inline-block" />{poorCount} {t('health.severity_poor')}</span>}
                    {fairCount > 0 && <span className="flex items-center gap-1 text-yellow-500"><span className="w-2 h-2 rounded-full bg-yellow-500 inline-block" />{fairCount} {t('health.severity_fair')}</span>}
                    {goodCount > 0 && <span className="flex items-center gap-1 text-emerald-500"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />{goodCount} {t('health.severity_good')}</span>}
                    {noneCount > 0 && <span className="flex items-center gap-1 text-slate-400"><span className="w-2 h-2 rounded-full bg-slate-400 inline-block" />{noneCount} {t('health.severity_none')}</span>}
                </div>
            </div>
        );
    };

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <div className="p-8 pb-32">

            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                <div>
                    <h1 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight">{t('health.title')}</h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{t('health.subtitle')}</p>
                </div>
                <div className="flex items-center gap-4 w-full md:w-auto">

                    <button
                        onClick={handleRefresh}
                        disabled={loading}
                        className="h-12 px-6 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-emerald-500/20 transition-all active:scale-95 disabled:opacity-50 whitespace-nowrap"
                    >
                        {loading ? t('common.syncing') : t('common.refresh')}
                    </button>
                </div>
            </div>

            {/* Error */}
            {error && (
                <div className="mb-6 p-4 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-xl flex items-center gap-3 text-rose-600 dark:text-rose-400">
                    <AlertCircle size={20} />
                    <span className="text-sm font-bold">{error}</span>
                </div>
            )}

            {/* ── Dual-Zone Synchronized Chart Card ── */}
            {/*
                Zone A (top, 70%): LineChart — Health Score 0–100%
                Zone B (bottom, 30%): BarChart — Alert/Condition Density
                Both share syncId="healthSync" so hover cursor stays in sync.
                Zero gap between zones — rendered inside a single card.
                Both charts share identical left/right margins so X-axis ticks align.
            */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-xl border border-slate-100 dark:border-white/5 mb-8">

                {/* Chart header row */}
                <div className="flex justify-between items-start mb-5">
                    <div>
                        <h2 className="text-lg font-bold text-slate-700 dark:text-slate-300">{t('health.trend')}</h2>
                        {data && (
                            <div className="flex items-baseline gap-3 mt-1">
                                <span className={`text-4xl font-black ${scoreColor}`}>{currentScore}%</span>
                                <span className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-widest font-bold">{t('health.score')}</span>
                            </div>
                        )}
                    </div>

                    {/* Legend */}
                    <div className="flex items-center gap-4 text-xs font-bold text-slate-500 dark:text-slate-400 mt-1">
                        <span className="flex items-center gap-1.5">
                            <span className="w-6 h-0.5 bg-emerald-500 inline-block rounded" />
                            Score
                        </span>
                        <span className="flex items-center gap-1.5">
                            <span className="w-3 h-3 rounded-sm bg-rose-500/60 inline-block" />
                            {t('health.histogram_title')}
                        </span>
                        <span className="text-slate-400 dark:text-slate-500 italic normal-case">
                            Click to inspect
                        </span>
                    </div>
                </div>

                {loading && !data ? (
                    <div className="flex items-center justify-center h-80 text-slate-500 text-sm">{t('common.loading')}</div>
                ) : unifiedData.length > 0 ? (
                    <div className="flex flex-col cursor-crosshair select-none" style={{ gap: 0 }}>

                        {/* ── Zone A: Health Score Line Chart (70%) ── */}
                        <div style={{ height: '224px' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart
                                    data={unifiedData}
                                    syncId="healthSync"
                                    onClick={handleChartClick}
                                    margin={{ top: 8, right: CHART_MARGIN_RIGHT, left: CHART_MARGIN_LEFT, bottom: 0 }}
                                    style={{ outline: 'none' }}
                                    tabIndex={-1}
                                >
                                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />

                                    {/* Hidden X-axis — keeps the axis space so bars align,
                                        but no labels (labels only shown in Zone B) */}
                                    <XAxis
                                        dataKey="label"
                                        hide={true}
                                        axisLine={false}
                                        tickLine={false}
                                    />

                                    <YAxis
                                        stroke="#475569"
                                        fontSize={11}
                                        tickLine={false}
                                        axisLine={false}
                                        tickFormatter={v => `${v}%`}
                                        domain={[0, 100]}
                                        width={36}
                                    />

                                    <Tooltip
                                        content={<ChartTooltip />}
                                        cursor={{ stroke: '#334155', strokeWidth: 1, strokeDasharray: '4 3' }}
                                    />

                                    {/* Cyan vertical marker at selected time slice */}
                                    {selectedLabel && (
                                        <ReferenceLine
                                            x={selectedLabel}
                                            stroke="#06b6d4"
                                            strokeWidth={2}
                                            strokeOpacity={0.9}
                                        />
                                    )}

                                    <Line
                                        type="monotone"
                                        dataKey="score"
                                        stroke="#10b981"
                                        strokeWidth={2.5}
                                        dot={false}
                                        activeDot={{ r: 5, fill: '#10b981', stroke: '#ecfdf5', strokeWidth: 2 }}
                                        isAnimationActive={false}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>

                        {/* ── Divider: subtle separator between zones ── */}
                        <div className="h-px bg-white/5" />

                        {/* ── Zone B: Alert Density Bar Chart (30%) ── */}
                        <div style={{ height: '96px' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart
                                    data={unifiedData}
                                    syncId="healthSync"
                                    onClick={handleChartClick}
                                    margin={{ top: 0, right: CHART_MARGIN_RIGHT, left: CHART_MARGIN_LEFT, bottom: 4 }}
                                    barCategoryGap="20%"
                                    style={{ outline: 'none' }}
                                    tabIndex={-1}
                                >
                                    {/* X-axis with labels — only rendered here in Zone B */}
                                    <XAxis
                                        dataKey="label"
                                        stroke="#475569"
                                        fontSize={11}
                                        tickLine={false}
                                        axisLine={{ stroke: '#334155', strokeWidth: 1 }}
                                        tickMargin={8}
                                        interval="preserveStartEnd"
                                        tick={DayBoundaryTick}
                                    />

                                    <YAxis
                                        stroke="#475569"
                                        fontSize={11}
                                        tickLine={false}
                                        axisLine={false}
                                        allowDecimals={false}
                                        domain={[0, maxCount + 1]}
                                        width={36}
                                        tickFormatter={v => v === 0 ? '' : v}
                                    />

                                    <Tooltip
                                        content={<ChartTooltip />}
                                        cursor={{ fill: 'rgba(51, 65, 85, 0.3)' }}
                                    />

                                    {/* Cyan vertical marker — same selectedLabel as Zone A */}
                                    {selectedLabel && (
                                        <ReferenceLine
                                            x={selectedLabel}
                                            stroke="#06b6d4"
                                            strokeWidth={2}
                                            strokeOpacity={0.9}
                                        />
                                    )}

                                    <Bar
                                        dataKey="count"
                                        radius={[3, 3, 0, 0]}
                                        maxBarSize={18}
                                        isAnimationActive={false}
                                    >
                                        <ColoredBars
                                            unifiedData={unifiedData}
                                            selectedIndex={selectedIndex}
                                        />
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>

                    </div>
                ) : (
                    <div className="flex items-center justify-center h-80 text-slate-500 text-sm">{t('common.no_data')}</div>
                )}
            </div>

            {/* Counter Boxes */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                {getCounterBox(t('sidebar.clients'), data?.currentHealth?.clients?.counters)}
                {getCounterBox(t('sidebar.networks'), data?.currentHealth?.networks?.counters)}
                {getCounterBox(t('sidebar.devices'), data?.currentHealth?.devices?.counters)}
            </div>

            {/* Conditions Table */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-white/5 overflow-hidden">
                <div className="p-6 border-b border-slate-100 dark:border-white/5 flex items-center gap-3">
                    <h2 className="text-lg font-bold text-slate-700 dark:text-slate-300">
                        {displayConditions.length} {t('health.items')}
                    </h2>
                    {selectedEntry && (
                        <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                            {t('health.filter_active')}: {formatVN(selectedEntry.sampleTime)}
                            <button
                                onClick={() => setSelectedIndex(null)}
                                className="hover:text-white transition-colors ml-1"
                                title={t('health.clear_filter')}
                            >
                                <X size={12} />
                            </button>
                        </span>
                    )}
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400">
                            <tr>
                                <th className="px-6 py-4 font-bold">Condition</th>
                                <th className="px-6 py-4 font-bold">Source Type</th>
                                <th className="px-6 py-4 font-bold">Source</th>
                                <th className="px-6 py-4 font-bold">Severity</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-white/5 text-slate-600 dark:text-slate-300 font-medium">
                            {displayConditions.map((item, idx) => {
                                const sev = (item.conditionSeverity || item.severity || '').toLowerCase();
                                const isMajor = sev === 'major' || sev === 'poor';
                                const severityLabel = item.conditionSeverity || item.severity || 'Unknown';
                                return (
                                    <tr key={`cond-${idx}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                        <td className="px-6 py-4 text-slate-800 dark:text-white font-bold tracking-tight">
                                            {fmtConditionName(item.condition || '')}
                                        </td>
                                        <td className="px-6 py-4 text-slate-500 dark:text-slate-400">{item.sourceType}</td>
                                        <td className="px-6 py-4">{item.name || item.id || '—'}</td>
                                        <td className="px-6 py-4">
                                            <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider ${isMajor
                                                    ? 'bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400'
                                                    : 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                                }`}>
                                                <span className={`w-2 h-2 rounded-full ${isMajor ? 'bg-rose-500' : 'bg-emerald-500'}`} />
                                                {severityLabel}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                            {!loading && displayConditions.length === 0 && (
                                <tr>
                                    <td colSpan={4} className="px-6 py-10 text-center text-slate-500 text-sm">
                                        {t('health.no_conditions')}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default Health;
