import React, { useState, useEffect, useCallback } from 'react';
import {
  Cpu, MemoryStick, HardDrive, Database, Users, Activity,
  Globe, Server, RefreshCw, TrendingUp, CheckCircle,
  XCircle, Clock, Monitor, Zap, BarChart3, Layers
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, Legend
} from 'recharts';
import apiClient from '../../api/apiClient';
import { useLanguage } from '../../context/LanguageContext';

// ── Utility ────────────────────────────────────────────────────────────────

function fmtBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[Math.max(i, 0)];
}

function fmtUptime(sec) {
  if (!sec) return '—';
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#14b8a6'];
const PIE_COLORS  = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

// Custom Recharts tooltip
const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="th-bg-surface border th-border rounded-lg px-3 py-2 shadow-xl text-xs">
      <p className="font-medium th-text-primary mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }} className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          {p.name}: <span className="font-semibold">{(p.value || 0).toLocaleString()}</span>
        </p>
      ))}
    </div>
  );
};

// ── Sub Components ─────────────────────────────────────────────────────────

function KpiCard({ icon: Icon, label, value, sub, color = '#3b82f6', className = '' }) {
  return (
    <div className={`th-bg-surface border th-border rounded-xl p-4 hover:shadow-lg transition-all group ${className}`}>
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl transition-colors" style={{ background: `${color}15` }}>
          <Icon className="w-5 h-5" style={{ color }} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider th-text-muted">{label}</p>
          <p className="text-xl font-bold th-text-primary leading-tight mt-0.5">{value}</p>
          {sub && <p className="text-[11px] th-text-muted mt-0.5 truncate">{sub}</p>}
        </div>
      </div>
    </div>
  );
}

function GaugeRing({ percent, color, size = 80, strokeWidth = 8 }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none"
        stroke="currentColor" strokeWidth={strokeWidth} className="text-slate-700/50" />
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none"
        stroke={color} strokeWidth={strokeWidth} strokeDasharray={circumference}
        strokeDashoffset={offset} strokeLinecap="round"
        className="transition-all duration-1000 ease-out" />
    </svg>
  );
}

function ResourceCard({ label, icon: Icon, percent, used, total }) {
  const color = percent < 50 ? '#10b981' : percent < 80 ? '#f59e0b' : '#ef4444';
  return (
    <div className="th-bg-surface border th-border rounded-xl p-5 flex items-center gap-5 hover:shadow-lg transition-all">
      <div className="relative flex items-center justify-center">
        <GaugeRing percent={percent} color={color} size={76} strokeWidth={7} />
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-bold th-text-primary">{percent}%</span>
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <Icon className="w-4 h-4 th-text-muted" />
          <span className="text-sm font-semibold th-text-primary">{label}</span>
        </div>
        <p className="text-xs th-text-muted">{used} / {total}</p>
      </div>
    </div>
  );
}

function TabButton({ active, children, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all ${
        active
          ? 'bg-blue-600 text-white shadow-md shadow-blue-600/25'
          : 'th-text-muted hover:th-text-primary hover:bg-slate-700/40'
      }`}
    >
      {children}
    </button>
  );
}

// ── Tabs ────────────────────────────────────────────────────────────────────

function OverviewTab({ server, users, traffic, t }) {
  if (!server) return null;

  const successRate = traffic?.success_rate || 0;
  const methodData = traffic?.by_method
    ? Object.entries(traffic.by_method).map(([name, value]) => ({ name, value }))
    : [];

  return (
    <div className="space-y-5">
      {/* Resource Gauges */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ResourceCard
          label="CPU" icon={Cpu}
          percent={server?.cpu?.percent || 0}
          used={`${server?.cpu?.percent || 0}%`}
          total={`${server?.cpu?.cores_logical || '?'} ${t('monitoring.cores')}`}
        />
        <ResourceCard
          label="RAM" icon={MemoryStick}
          percent={server?.memory?.percent || 0}
          used={fmtBytes(server?.memory?.used_bytes)}
          total={fmtBytes(server?.memory?.total_bytes)}
        />
        <ResourceCard
          label={t('monitoring.disk')} icon={HardDrive}
          percent={server?.disk?.percent || 0}
          used={fmtBytes(server?.disk?.used_bytes)}
          total={fmtBytes(server?.disk?.total_bytes)}
        />
      </div>

      {/* System + User KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard icon={Monitor} label={t('monitoring.hostname')}
          value={server?.system?.hostname || '—'}
          sub={`${server?.system?.platform || ''} ${server?.system?.platform_release || ''}`}
          color="#6366f1" />
        <KpiCard icon={Clock} label={t('monitoring.uptime')}
          value={fmtUptime(server?.system?.uptime_seconds)}
          sub={`Python ${server?.system?.python_version || ''}`}
          color="#06b6d4" />
        <KpiCard icon={Users} label={t('monitoring.total_users')}
          value={users?.total_users || 0}
          sub={`${users?.approved || 0} ${t('monitoring.approved')} · ${users?.pending || 0} ${t('monitoring.pending')}`}
          color="#3b82f6" />
        <KpiCard icon={TrendingUp} label={t('monitoring.new_signups_7d')}
          value={users?.recent_signups_7d || 0}
          color="#8b5cf6" />
      </div>

      {/* Traffic overview chart + Pie */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Daily traffic chart */}
        <div className="lg:col-span-2 th-bg-surface border th-border rounded-xl p-5">
          <h3 className="text-xs font-semibold th-text-muted uppercase tracking-wider mb-4 flex items-center gap-2">
            <Activity size={14} />
            {t('monitoring.daily_traffic')}
          </h3>
          {traffic?.daily_traffic?.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={traffic.daily_traffic} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorSuccess" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorError" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }}
                  tickFormatter={v => v?.slice(5)} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <RechartsTooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="success" name={t('monitoring.successful')}
                  stroke="#10b981" fill="url(#colorSuccess)" strokeWidth={2} />
                <Area type="monotone" dataKey="error" name={t('monitoring.errors')}
                  stroke="#ef4444" fill="url(#colorError)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[220px] text-xs th-text-muted">
              {t('monitoring.no_traffic_data')}
            </div>
          )}
        </div>

        {/* Method breakdown pie */}
        <div className="th-bg-surface border th-border rounded-xl p-5">
          <h3 className="text-xs font-semibold th-text-muted uppercase tracking-wider mb-4 flex items-center gap-2">
            <BarChart3 size={14} />
            {t('monitoring.by_method')}
          </h3>
          {methodData.length > 0 ? (
            <div className="flex flex-col items-center">
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={methodData} dataKey="value" nameKey="name"
                    cx="50%" cy="50%" innerRadius={40} outerRadius={65}
                    paddingAngle={3} strokeWidth={0}>
                    {methodData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip content={<ChartTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 justify-center">
                {methodData.map((d, i) => (
                  <div key={d.name} className="flex items-center gap-1.5 text-[10px] th-text-muted">
                    <span className="w-2 h-2 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                    <span className="font-mono font-semibold">{d.name}</span>
                    <span className="th-text-secondary">{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-[160px] text-xs th-text-muted">—</div>
          )}
        </div>
      </div>

      {/* Quick stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard icon={Activity} label={t('monitoring.total_requests')}
          value={(traffic?.total_requests || 0).toLocaleString()} color="#3b82f6" />
        <KpiCard icon={CheckCircle} label={t('monitoring.success_rate')}
          value={`${successRate}%`} color="#10b981" />
        <KpiCard icon={XCircle} label={t('monitoring.errors')}
          value={(traffic?.error_count || 0).toLocaleString()} color="#ef4444" />
        <KpiCard icon={Globe} label={t('monitoring.unique_ips')}
          value={traffic?.unique_ips || 0} color="#06b6d4" />
      </div>
    </div>
  );
}

function DatabaseTab({ database, t }) {
  if (!database) return null;

  const collections = database?.collections || [];
  const topCollections = [...collections].sort((a, b) => b.size_bytes - a.size_bytes).slice(0, 8);
  const chartData = topCollections.map(c => ({
    name: c.name.length > 12 ? c.name.slice(0, 12) + '…' : c.name,
    fullName: c.name,
    size: c.size_bytes,
    docs: c.count,
  }));

  return (
    <div className="space-y-5">
      {/* DB KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard icon={Database} label={t('monitoring.db_size')}
          value={fmtBytes(database?.total_size_bytes)} sub={database?.database_name} color="#8b5cf6" />
        <KpiCard icon={Layers} label={t('monitoring.collections')}
          value={database?.total_collections || 0}
          sub={`${(database?.total_documents || 0).toLocaleString()} docs`} color="#3b82f6" />
        <KpiCard icon={HardDrive} label={t('monitoring.storage_size')}
          value={fmtBytes(database?.storage_size_bytes)}
          sub={`Index: ${fmtBytes(database?.index_size_bytes)}`} color="#06b6d4" />
        <KpiCard icon={Zap} label={t('monitoring.connections')}
          value={database?.connections?.current || 0}
          sub={`${t('monitoring.available')}: ${database?.connections?.available || 0}`} color="#f59e0b" />
      </div>

      {/* Collection size bar chart */}
      {chartData.length > 0 && (
        <div className="th-bg-surface border th-border rounded-xl p-5">
          <h3 className="text-xs font-semibold th-text-muted uppercase tracking-wider mb-4">
            {t('monitoring.collection_details')}
          </h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false}
                tickFormatter={v => fmtBytes(v)} />
              <RechartsTooltip content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload;
                return (
                  <div className="th-bg-surface border th-border rounded-lg px-3 py-2 shadow-xl text-xs">
                    <p className="font-medium th-text-primary mb-1">{d.fullName}</p>
                    <p className="th-text-secondary">Size: <span className="font-semibold th-text-primary">{fmtBytes(d.size)}</span></p>
                    <p className="th-text-secondary">Docs: <span className="font-semibold th-text-primary">{d.docs?.toLocaleString()}</span></p>
                  </div>
                );
              }} />
              <Bar dataKey="size" name="Size" radius={[6, 6, 0, 0]} maxBarSize={40}>
                {chartData.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} fillOpacity={0.85} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Collection table */}
      {collections.length > 0 && (
        <div className="th-bg-surface border th-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b th-border th-bg-elevated">
                  <th className="text-left py-2.5 px-4 th-text-muted font-semibold">{t('monitoring.col_name')}</th>
                  <th className="text-right py-2.5 px-4 th-text-muted font-semibold">{t('monitoring.col_docs')}</th>
                  <th className="text-right py-2.5 px-4 th-text-muted font-semibold">{t('monitoring.col_size')}</th>
                  <th className="text-right py-2.5 px-4 th-text-muted font-semibold">{t('monitoring.col_indexes')}</th>
                </tr>
              </thead>
              <tbody>
                {collections.map(col => (
                  <tr key={col.name} className="border-b th-border hover:th-bg-surface-alt transition-colors">
                    <td className="py-2 px-4 font-mono th-text-primary">{col.name}</td>
                    <td className="py-2 px-4 text-right th-text-secondary">{col.count.toLocaleString()}</td>
                    <td className="py-2 px-4 text-right th-text-secondary">{fmtBytes(col.size_bytes)}</td>
                    <td className="py-2 px-4 text-right th-text-secondary">{col.indexes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function TrafficTab({ traffic, t }) {
  if (!traffic) return null;

  const topActions = traffic?.top_actions || [];
  const topUsers = traffic?.top_users || [];
  const topEndpoints = traffic?.top_endpoints || [];

  return (
    <div className="space-y-5">
      {/* Top Actions bar chart */}
      <div className="th-bg-surface border th-border rounded-xl p-5">
        <h3 className="text-xs font-semibold th-text-muted uppercase tracking-wider mb-4 flex items-center gap-2">
          <Zap size={14} />
          {t('monitoring.top_actions')}
        </h3>
        {topActions.length > 0 ? (
          <ResponsiveContainer width="100%" height={Math.max(topActions.length * 36, 120)}>
            <BarChart data={topActions} layout="vertical" margin={{ top: 0, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="action" width={160}
                tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <RechartsTooltip content={<ChartTooltip />} />
              <Bar dataKey="count" name="Count" radius={[0, 6, 6, 0]} maxBarSize={22}>
                {topActions.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} fillOpacity={0.8} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="text-xs th-text-muted text-center py-8">{t('monitoring.no_traffic_data')}</div>
        )}
      </div>

      {/* Top Users + Top Endpoints side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top Users */}
        <div className="th-bg-surface border th-border rounded-xl p-5">
          <h3 className="text-xs font-semibold th-text-muted uppercase tracking-wider mb-4 flex items-center gap-2">
            <Users size={14} />
            {t('monitoring.top_users')}
          </h3>
          {topUsers.length > 0 ? (
            <div className="space-y-2.5">
              {topUsers.map((u, i) => {
                const maxCount = topUsers[0]?.count || 1;
                const pct = Math.round((u.count / maxCount) * 100);
                return (
                  <div key={u.email}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold"
                          style={{ background: `${CHART_COLORS[i % CHART_COLORS.length]}25`, color: CHART_COLORS[i % CHART_COLORS.length] }}>
                          {i + 1}
                        </span>
                        <span className="text-xs th-text-primary truncate" title={u.email}>{u.email}</span>
                      </div>
                      <span className="text-xs font-mono font-semibold th-text-secondary ml-2">{u.count}</span>
                    </div>
                    <div className="h-1 rounded-full bg-slate-700/40 overflow-hidden ml-7">
                      <div className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${pct}%`, background: CHART_COLORS[i % CHART_COLORS.length] }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-xs th-text-muted text-center py-6">—</div>
          )}
        </div>

        {/* Top Endpoints */}
        <div className="th-bg-surface border th-border rounded-xl p-5">
          <h3 className="text-xs font-semibold th-text-muted uppercase tracking-wider mb-4 flex items-center gap-2">
            <Globe size={14} />
            {t('monitoring.top_endpoints')}
          </h3>
          {topEndpoints.length > 0 ? (
            <div className="space-y-2.5">
              {topEndpoints.map((ep, i) => {
                const maxCount = topEndpoints[0]?.count || 1;
                const pct = Math.round((ep.count / maxCount) * 100);
                return (
                  <div key={ep.endpoint}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-mono th-text-primary truncate" title={ep.endpoint}>
                        {ep.endpoint}
                      </span>
                      <span className="text-xs font-mono font-semibold th-text-secondary ml-2">{ep.count}</span>
                    </div>
                    <div className="h-1 rounded-full bg-slate-700/40 overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${pct}%`, background: CHART_COLORS[i % CHART_COLORS.length] }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-xs th-text-muted text-center py-6">—</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function SystemMonitoring() {
  const { t } = useLanguage();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [period, setPeriod] = useState(7);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  const fetchData = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError('');
    try {
      const res = await apiClient.get(`/monitoring/dashboard?days=${period}`);
      setData(res.data);
      setLastUpdated(new Date());
    } catch (e) {
      setError(e?.response?.data?.detail || t('monitoring.error_loading'));
    } finally {
      setLoading(false);
    }
  }, [period, t]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => fetchData(false), 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchData]);

  const { server, database, users, traffic } = data || {};

  return (
    <div className="p-6 space-y-5 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold th-text-primary flex items-center gap-2">
            <Monitor className="w-5 h-5 text-blue-400" />
            {t('monitoring.title')}
          </h1>
          <div className="flex items-center gap-3 mt-1">
            <p className="text-xs text-slate-500">{t('monitoring.subtitle')}</p>
            {lastUpdated && (
              <span className="text-[10px] th-text-muted flex items-center gap-1">
                <Clock size={10} />
                {lastUpdated.toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select value={period} onChange={e => setPeriod(Number(e.target.value))}
            className="th-bg-elevated border th-border rounded-lg px-2.5 py-1.5 text-xs th-text-primary focus:outline-none focus:border-blue-500">
            <option value={1}>24h</option>
            <option value={7}>7 {t('monitoring.days')}</option>
            <option value={14}>14 {t('monitoring.days')}</option>
            <option value={30}>30 {t('monitoring.days')}</option>
          </select>
          <button onClick={() => setAutoRefresh(v => !v)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border transition-colors ${
              autoRefresh
                ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10'
                : 'border-slate-600 text-slate-400 bg-slate-700/30'
            }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${autoRefresh ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
            {autoRefresh ? 'LIVE' : 'PAUSED'}
          </button>
          <button onClick={() => fetchData(true)} disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs rounded-lg transition-colors">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            {t('monitoring.refresh')}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-900/20 border border-red-800 text-red-400 text-sm px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && !data && (
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-3">
            <RefreshCw className="w-8 h-8 text-blue-400 animate-spin" />
            <span className="text-xs th-text-muted">{t('monitoring.loading_data')}</span>
          </div>
        </div>
      )}

      {data && (
        <>
          {/* Tabs */}
          <div className="flex items-center gap-1 p-1 th-bg-elevated rounded-xl border th-border w-fit">
            <TabButton active={activeTab === 'overview'} onClick={() => setActiveTab('overview')}>
              <span className="flex items-center gap-1.5"><Server size={13} /> {t('monitoring.tab_overview')}</span>
            </TabButton>
            <TabButton active={activeTab === 'database'} onClick={() => setActiveTab('database')}>
              <span className="flex items-center gap-1.5"><Database size={13} /> {t('monitoring.tab_database')}</span>
            </TabButton>
            <TabButton active={activeTab === 'traffic'} onClick={() => setActiveTab('traffic')}>
              <span className="flex items-center gap-1.5"><Activity size={13} /> {t('monitoring.tab_traffic')}</span>
            </TabButton>
          </div>

          {/* Tab content */}
          {activeTab === 'overview' && <OverviewTab server={server} users={users} traffic={traffic} t={t} />}
          {activeTab === 'database' && <DatabaseTab database={database} t={t} />}
          {activeTab === 'traffic' && <TrafficTab traffic={traffic} t={t} />}
        </>
      )}
    </div>
  );
}
