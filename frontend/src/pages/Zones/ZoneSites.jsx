import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Layers, Server, MapPin, ChevronRight, ChevronLeft, RefreshCw, Wifi, Search, Filter, ArrowUp, ArrowDown, Activity, WifiOff, CloudOff, AlertTriangle, CheckCircle2, Edit3, Check, X, LayoutGrid, List } from 'lucide-react';
import apiClient from '../../api/apiClient';
import { useSite } from '../../context/SiteContext';
import { useZone } from '../../context/ZoneContext';
import { useLanguage } from '../../context/LanguageContext';

const ZoneSites = () => {
  const { t } = useLanguage();
  const { zoneId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { sites, fetchSites, loadingSites, prefetchSite } = useSite();
  const { getZone, fetchZones } = useZone();
  const prefetchTimerRef = useRef(null);

  // Read template filter from URL query param (set by ZoneTemplates page)
  const urlTemplate = searchParams.get('template') || '';
  const initialFilter = urlTemplate === 'general' ? 'other' : (urlTemplate || 'all');

  const [zone, setZone] = useState(() => getZone(zoneId) || null);
  const [loadingZone, setLoadingZone] = useState(!zone);
  const [siteSearch, setSiteSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'asc' });
  const [viewMode, setViewMode] = useState('grid');
  const [siteMetrics, setSiteMetrics] = useState({});
  const fetchedSiteIds = useRef(new Set());

  // Editing state
  const [isEditingName, setIsEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState(zone?.name || '');
  const [savingName, setSavingName] = useState(false);

  // Template state
  const [templates, setTemplates] = useState([]);
  const [templateFilter, setTemplateFilter] = useState(initialFilter);

  const fetchZone = useCallback(async () => {
    const cached = getZone(zoneId);
    if (cached) {
      setZone(cached);
      setEditNameValue(cached.name || '');
      setLoadingZone(false);
      return;
    }
    setLoadingZone(true);
    try {
      const res = await apiClient.get(`/zones/${zoneId}`);
      setZone(res.data);
      setEditNameValue(res.data.name || '');
    } catch (err) {
      console.error('Failed to fetch zone:', err);
    } finally {
      setLoadingZone(false);
    }
  }, [zoneId, getZone]);

  useEffect(() => {
    const cached = getZone(zoneId);
    if (cached && JSON.stringify(cached) !== JSON.stringify(zone)) {
      setZone(cached);
    }
  }, [getZone, zoneId]);

  useEffect(() => {
    fetchZone();
    if (sites.length === 0) fetchSites();
    apiClient.get('/templates').then(res => setTemplates(res.data || [])).catch(() => {});
  }, [fetchZone]);

  const handleRefresh = () => {
    fetchedSiteIds.current.clear();
    fetchZones();
    fetchZone();
    fetchSites();
  };

  const handleSaveName = async () => {
    if (!editNameValue.trim() || editNameValue === zone?.name) {
      setIsEditingName(false);
      return;
    }
    setSavingName(true);
    try {
      await apiClient.put(`/zones/${zoneId}`, { name: editNameValue.trim() });
      setZone(prev => ({ ...prev, name: editNameValue.trim() }));
      setIsEditingName(false);
    } catch (err) {
      console.error('Failed to rename zone:', err);
      setEditNameValue(zone?.name || '');
    } finally {
      setSavingName(false);
    }
  };

  const zoneSiteIds = new Set((zone?.site_ids || []).map(String));
  const zoneSites = sites.filter(s => {
    const id = String(s.siteId || s.id || s._id);
    if (!zoneSiteIds.has(id)) return false;
    if (statusFilter !== 'all' && s.status !== statusFilter) return false;
    if (templateFilter !== 'all') {
        const siteTplId = s.template?.id;
        if (templateFilter === 'other') {
            if (siteTplId) return false;
        } else {
            if (siteTplId !== templateFilter) return false;
        }
    }
    if (!siteSearch) return true;
    const name = String(s.siteName || s.name || id);
    return name.toLowerCase().includes(siteSearch.toLowerCase());
  }).sort((a, b) => {
    if (sortConfig.key === 'name') {
      const nameA = String(a.siteName || a.name || a.siteId || a.id || '').toLowerCase();
      const nameB = String(b.siteName || b.name || b.siteId || b.id || '').toLowerCase();
      return sortConfig.direction === 'asc' ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
    } else if (sortConfig.key === 'status') {
      const statusA = String(a.status || '');
      const statusB = String(b.status || '');
      return sortConfig.direction === 'asc' ? statusA.localeCompare(statusB) : statusB.localeCompare(statusA);
    }
    return 0;
  });

  useEffect(() => {
    if (!zoneSites || zoneSites.length === 0) return;
    zoneSites.forEach(site => {
      const id = site.siteId || site.id || site._id;
      if (!fetchedSiteIds.current.has(id)) {
        fetchedSiteIds.current.add(id);
        setSiteMetrics(prev => ({ ...prev, [id]: { loading: true, health: site.healthScore ?? null, activeAlerts: 0, activeAlertsDetail: {}, hasHistoricalAlerts: false } }));
        Promise.all([
          apiClient.get(`/overview/sites/${id}/health`).catch(() => ({ data: null })),
          apiClient.get(`/overview/sites/${id}/alerts`).catch(() => ({ data: [] }))
        ]).then(([hRes, aRes]) => {
          const alertsList = Array.isArray(aRes.data) ? aRes.data : [];
          // Separate active (clearedTime == null) vs cleared alerts
          const activeAlerts = alertsList.filter(a => !a.clearedTime);
          const clearedAlerts = alertsList.filter(a => a.clearedTime);
          const activeDetail = {};
          activeAlerts.forEach(a => {
            const sev = (a.severity || 'minor').toLowerCase();
            activeDetail[sev] = (activeDetail[sev] || 0) + 1;
          });
          setSiteMetrics(prev => {
            const fetchedScore = hRes.data?.currentScore;
            const finalScore = fetchedScore !== undefined && fetchedScore !== null ? Math.round(fetchedScore) : (site.healthScore !== null ? Math.round(site.healthScore) : null);
            return {
              ...prev,
              [id]: {
                loading: false,
                health: finalScore,
                activeAlerts: activeAlerts.length,
                activeAlertsDetail: activeDetail,
                hasHistoricalAlerts: clearedAlerts.length > 0
              }
            };
          });
        });
      }
    });
  }, [zoneSites]);

  const loading = loadingZone || loadingSites;

  if (loading && !zone) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500" />
      </div>
    );
  }

  if (!loadingZone && !zone) {
    return (
      <div className="flex flex-col items-center justify-center py-20 th-text-muted p-6">
        <Server className="w-12 h-12 mb-3 text-rose-500 opacity-50" />
        <h2 className="text-lg font-bold th-text-primary mb-1">{t('zones.sites.error_load_zone')}</h2>
        <p className="text-sm text-center max-w-md">{t('zones.sites.error_message')}</p>
        <button onClick={() => navigate('/zones')} className="mt-6 px-4 py-2 th-bg-surface-alt hover:th-bg-elevated th-text-primary rounded-lg transition-colors flex items-center gap-2 text-sm" style={{ backgroundColor: 'var(--color-bg-surface-alt)' }}>
          <ChevronLeft className="w-4 h-4" /> {t('zones.sites.error_back_button')}
        </button>
      </div>
    );
  }

  // Derive active template name for breadcrumb
  const activeTemplateName = templateFilter === 'all'
    ? null
    : templateFilter === 'other'
      ? 'General'
      : templates.find(tp => tp.id === templateFilter)?.name || null;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(`/zones/${zoneId}/templates`)} className="p-1.5 rounded-lg th-text-muted hover:th-text-primary hover:th-bg-surface-alt transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: zone?.color || '#3B82F6' }} />
          <div>
            {isEditingName ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={editNameValue}
                  onChange={(e) => setEditNameValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSaveName(); else if (e.key === 'Escape') setIsEditingName(false); }}
                  autoFocus
                  disabled={savingName}
                  className="th-bg-surface border border-blue-500 rounded px-2 py-0.5 text-sm font-semibold th-text-primary focus:outline-none w-48"
                  style={{ backgroundColor: 'var(--color-bg-surface)', color: 'var(--color-text-primary)' }}
                />
                <button onClick={handleSaveName} disabled={savingName} className="p-1 text-emerald-500 hover:th-bg-surface-alt rounded transition-colors"><Check size={16} /></button>
                <button onClick={() => setIsEditingName(false)} disabled={savingName} className="p-1 text-rose-500 hover:th-bg-surface-alt rounded transition-colors"><X size={16} /></button>
              </div>
            ) : (
              <div className="flex items-center gap-2 group cursor-pointer" onClick={() => { setEditNameValue(zone?.name || ''); setIsEditingName(true); }}>
                <h1 className="text-lg font-semibold th-text-primary">{zone?.name || 'Zone'}</h1>
                <Edit3 size={14} className="th-text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            )}
            {zone?.description && <p className="text-xs th-text-muted mt-0.5">{zone.description}</p>}
          </div>
          {activeTemplateName && (
            <span
              className="text-xs font-semibold px-2.5 py-0.5 rounded-full ml-1 border"
              style={{
                borderColor: templateFilter === 'other' ? 'var(--color-border)' : `${templates.find(tp => tp.id === templateFilter)?.color || '#3B82F6'}40`,
                backgroundColor: templateFilter === 'other' ? 'var(--color-bg-surface-alt)' : `${templates.find(tp => tp.id === templateFilter)?.color || '#3B82F6'}15`,
                color: templateFilter === 'other' ? 'var(--color-text-muted)' : (templates.find(tp => tp.id === templateFilter)?.color || '#3B82F6'),
              }}
            >
              {activeTemplateName}
            </span>
          )}
          <span className="text-xs th-text-muted th-bg-surface-alt px-2 py-0.5 rounded-full ml-1" style={{ backgroundColor: 'var(--color-bg-surface-alt)' }}>{zoneSites.length} sites</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => navigate(`/zones/${zoneId}/logs`)} className="px-3 py-1.5 text-xs th-text-muted hover:th-text-primary border th-border hover:border-blue-500/50 rounded-lg transition-colors" style={{ borderColor: 'var(--color-border)' }}>{t('zones.sites.button_view_logs')}</button>
          <button onClick={handleRefresh} className="flex items-center gap-1.5 px-3 py-1.5 text-xs th-text-muted hover:th-text-primary border th-border hover:border-blue-500/50 rounded-lg transition-colors" style={{ borderColor: 'var(--color-border)' }}><RefreshCw className="w-3.5 h-3.5" /> {t('zones.sites.button_refresh')}</button>
        </div>
      </div>

      {/* Filter / Search / Sort */}
      <div className="flex flex-col md:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="w-4 h-4 th-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder={t('zones.sites.search_placeholder')}
            value={siteSearch}
            onChange={(e) => setSiteSearch(e.target.value)}
            className="w-full th-bg-surface border th-border rounded-lg text-sm th-text-primary pl-9 pr-4 py-2 focus:outline-none focus:border-blue-500 transition-colors"
            style={{ backgroundColor: 'var(--color-bg-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
          />
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 th-bg-surface border th-border rounded-lg px-3 py-2" style={{ backgroundColor: 'var(--color-bg-surface)', borderColor: 'var(--color-border)' }}>
            <Filter className="w-4 h-4 th-text-muted" />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="bg-transparent text-sm th-text-primary focus:outline-none appearance-none pr-4 cursor-pointer" style={{ color: 'var(--color-text-primary)' }}>
              <option value="all" style={{ backgroundColor: 'var(--color-bg-elevated)' }}>{t('zones.sites.filter_status_all')}</option>
              <option value="up" style={{ backgroundColor: 'var(--color-bg-elevated)' }}>{t('zones.sites.filter_status_online')}</option>
              <option value="down" style={{ backgroundColor: 'var(--color-bg-elevated)' }}>{t('zones.sites.filter_status_offline')}</option>
            </select>
          </div>
          <div className="flex items-center gap-2 th-bg-surface border th-border rounded-lg px-3 py-2" style={{ backgroundColor: 'var(--color-bg-surface)', borderColor: 'var(--color-border)' }}>
            <LayoutGrid className="w-4 h-4 text-emerald-500" />
            <select value={templateFilter} onChange={(e) => setTemplateFilter(e.target.value)} className="bg-transparent text-sm th-text-primary focus:outline-none appearance-none pr-4 cursor-pointer" style={{ color: 'var(--color-text-primary)' }}>
              <option value="all" style={{ backgroundColor: 'var(--color-bg-elevated)' }}>All Templates</option>
              {templates.map(t => (
                  <option key={t.id} value={t.id} style={{ backgroundColor: 'var(--color-bg-elevated)' }}>{t.name}</option>
              ))}
              <option value="other" style={{ backgroundColor: 'var(--color-bg-elevated)' }}>No Template (Other)</option>
            </select>
          </div>

          <div className="flex items-center gap-2 th-bg-surface border th-border rounded-lg px-2 py-1" style={{ backgroundColor: 'var(--color-bg-surface)', borderColor: 'var(--color-border)' }}>
            <select value={sortConfig.key} onChange={(e) => setSortConfig({ ...sortConfig, key: e.target.value })} className="bg-transparent text-sm th-text-primary focus:outline-none appearance-none pl-2 pr-4 py-1 cursor-pointer" style={{ color: 'var(--color-text-primary)' }}>
              <option value="name" style={{ backgroundColor: 'var(--color-bg-elevated)' }}>{t('zones.sites.sort_by_name')}</option>
              <option value="status" style={{ backgroundColor: 'var(--color-bg-elevated)' }}>{t('zones.sites.sort_by_status')}</option>
            </select>
            <button onClick={() => setSortConfig({ ...sortConfig, direction: sortConfig.direction === 'asc' ? 'desc' : 'asc' })} className="p-1 th-text-muted hover:th-text-primary hover:th-bg-surface-alt rounded transition-colors" title={t('zones.sites.sort_direction_tooltip')}>
              {sortConfig.direction === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
            </button>
          </div>
        </div>
        <div className="flex th-bg-surface border th-border rounded-lg p-1" style={{ backgroundColor: 'var(--color-bg-surface)', borderColor: 'var(--color-border)' }}>
          <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded-md transition-all ${viewMode === 'grid' ? 'bg-blue-600 th-text-primary shadow-lg' : 'th-text-muted hover:th-text-secondary'}`} title="Grid View"><LayoutGrid size={18} /></button>
          <button onClick={() => setViewMode('list')} className={`p-1.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-blue-600 th-text-primary shadow-lg' : 'th-text-muted hover:th-text-secondary'}`} title="List View"><List size={18} /></button>
        </div>
      </div>

      {/* Sites list */}
      {zoneSites.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 th-text-muted">
          <Server className="w-12 h-12 mb-3 opacity-20" />
          <p className="text-sm">{t('zones.sites.empty_state_message')}</p>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {zoneSites.map(site => {
            const id = site.siteId || site.id || site._id;
            const metrics = siteMetrics[id] || { loading: true, health: site.healthScore ?? null, activeAlerts: 0, activeAlertsDetail: {}, hasHistoricalAlerts: false };
            const healthScore = metrics.health;
            const activeAlerts = metrics.activeAlerts || 0;
            const healthLabel = healthScore === null ? 'None' : (healthScore >= 67 ? t('zones.sites.card_health_good') : healthScore >= 34 ? t('zones.sites.card_health_fair') : t('zones.sites.card_health_poor'));

            return (
              <div
                key={id}
                onClick={() => { if (prefetchTimerRef.current) clearTimeout(prefetchTimerRef.current); navigate(`/site/${id}`); }}
                onMouseEnter={() => { prefetchTimerRef.current = setTimeout(() => prefetchSite(id), 150); }}
                onMouseLeave={() => { if (prefetchTimerRef.current) clearTimeout(prefetchTimerRef.current); }}
                className="th-bg-surface-alt rounded-xl p-4 cursor-pointer hover:th-bg-elevated hover:shadow-lg transition-all border-l-4 border-transparent flex flex-col justify-between min-h-[160px] group"
                style={{ backgroundColor: 'var(--color-bg-surface-alt)', borderLeftColor: healthScore === null ? 'var(--color-border)' : (healthScore >= 67 ? '#10b981' : healthScore >= 34 ? '#f59e0b' : '#f43f5e') }}
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="flex flex-col truncate pr-2">
                    <h3 className="text-lg font-bold th-text-primary truncate">{site.siteName || site.name || id}</h3>
                    {site.template ? (
                      <span 
                        className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border w-fit mt-0.5"
                        style={{ borderColor: `${site.template.color}40`, backgroundColor: `${site.template.color}10`, color: site.template.color }}
                      >
                        {site.template.name}
                      </span>
                    ) : (
                      <span className="text-[8px] font-black uppercase tracking-widest th-text-muted mt-1 opacity-50">GENERAL</span>
                    )}
                  </div>
                </div>

                {/* Health + Badge */}
                <div className="mb-3 flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs th-text-muted">{t('zones.sites.card_health_label')}</p>
                    {!metrics.loading && healthScore !== null && (
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                        healthScore >= 67
                          ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                          : healthScore >= 34
                          ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                          : 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                      }`}>
                        {healthLabel}
                      </span>
                    )}
                  </div>
                  <div className="flex items-baseline gap-2">
                    {metrics.loading && healthScore === null ? (
                      <div className="w-4 h-4 rounded-full border-2 border-slate-600 border-t-slate-400 animate-spin" />
                    ) : (
                      <>
                        <span className={`text-3xl font-black leading-none ${healthScore === null ? 'th-text-muted' : healthScore >= 67 ? 'text-emerald-400' : healthScore >= 34 ? 'text-amber-400' : 'text-rose-400'}`}>
                          {healthScore !== null ? `${healthScore}%` : '—'}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Alerts + Footer */}
                <div className="pt-3 border-t flex items-center justify-between" style={{ borderTopColor: 'var(--color-border)' }}>
                  <div className="flex items-center gap-2">
                    {metrics.loading ? (
                      <div className="w-3 h-3 rounded-full border-2 border-slate-600 border-t-slate-400 animate-spin" />
                    ) : activeAlerts > 0 ? (
                      <>
                        <AlertTriangle size={14} className="text-rose-400" />
                        <span className="text-sm font-bold text-rose-400">
                          {activeAlerts} {t('zones.sites.card_alerts_label')}
                        </span>
                        {metrics.activeAlertsDetail && (
                          <div className="flex gap-1 text-[8px] font-bold">
                            {(metrics.activeAlertsDetail.major || metrics.activeAlertsDetail.Major) > 0 && <span className="text-rose-400 bg-rose-500/10 px-1.5 py-0.5 rounded border border-rose-500/20">M:{(metrics.activeAlertsDetail.major || metrics.activeAlertsDetail.Major)}</span>}
                            {(metrics.activeAlertsDetail.minor || metrics.activeAlertsDetail.Minor) > 0 && <span className="text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">m:{(metrics.activeAlertsDetail.minor || metrics.activeAlertsDetail.Minor)}</span>}
                          </div>
                        )}
                      </>
                    ) : null}
                  </div>
                  <ChevronRight size={14} className="th-text-muted group-hover:th-text-secondary transition-colors" />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {zoneSites.map(site => {
            const id = site.siteId || site.id || site._id;
            const metrics = siteMetrics[id] || { loading: true, health: site.healthScore ?? null, activeAlerts: 0, activeAlertsDetail: {}, hasHistoricalAlerts: false };
            const healthScore = metrics.health;
            const activeAlerts = metrics.activeAlerts || 0;
            const healthLabel = healthScore === null ? 'None' : (healthScore >= 67 ? t('zones.sites.card_health_good') : healthScore >= 34 ? t('zones.sites.card_health_fair') : t('zones.sites.card_health_poor'));

            return (
              <div
                key={id}
                onClick={() => { if (prefetchTimerRef.current) clearTimeout(prefetchTimerRef.current); navigate(`/site/${id}`); }}
                onMouseEnter={() => { prefetchTimerRef.current = setTimeout(() => prefetchSite(id), 150); }}
                onMouseLeave={() => { if (prefetchTimerRef.current) clearTimeout(prefetchTimerRef.current); }}
                className="th-bg-surface-alt rounded-xl px-5 py-4 cursor-pointer hover:th-bg-elevated hover:shadow-lg transition-all border-l-4 border-transparent group flex items-center gap-6"
                style={{ backgroundColor: 'var(--color-bg-surface-alt)', borderLeftColor: healthScore === null ? 'var(--color-border)' : (healthScore >= 67 ? '#10b981' : healthScore >= 34 ? '#f59e0b' : '#f43f5e') }}
              >
                {/* Site Name + Template */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold th-text-primary truncate">{site.siteName || site.name || id}</h3>
                  </div>
                  {site.template ? (
                    <span
                      className="px-1.5 py-0.5 rounded text-[7px] font-black uppercase tracking-widest border w-fit mt-1 inline-block"
                      style={{ borderColor: `${site.template.color}40`, backgroundColor: `${site.template.color}10`, color: site.template.color }}
                    >
                      {site.template.name}
                    </span>
                  ) : (
                    <span className="text-[7px] font-black uppercase tracking-widest th-text-muted mt-1 opacity-50 inline-block">GENERAL</span>
                  )}
                </div>

                {/* Health Score */}
                <div className="flex items-center gap-3 min-w-[140px] justify-center">
                  {metrics.loading && healthScore === null ? (
                    <div className="w-4 h-4 rounded-full border-2 border-slate-600 border-t-slate-400 animate-spin" />
                  ) : (
                    <>
                      <span className={`text-xl font-black leading-none ${healthScore === null ? 'th-text-muted' : healthScore >= 67 ? 'text-emerald-400' : healthScore >= 34 ? 'text-amber-400' : 'text-rose-400'}`}>
                        {healthScore !== null ? `${healthScore}%` : '—'}
                      </span>
                      {!metrics.loading && healthScore !== null && (
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border ${
                          healthScore >= 67
                            ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                            : healthScore >= 34
                            ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                            : 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                        }`}>
                          {healthLabel}
                        </span>
                      )}
                    </>
                  )}
                </div>

                {/* Alerts */}
                <div className="flex items-center gap-2 min-w-[120px]">
                  {metrics.loading ? (
                    <div className="w-3 h-3 rounded-full border-2 border-slate-600 border-t-slate-400 animate-spin" />
                  ) : activeAlerts > 0 ? (
                    <>
                      <AlertTriangle size={13} className="text-rose-400" />
                      <span className="text-sm font-bold text-rose-400">
                        {activeAlerts} {t('zones.sites.card_alerts_label')}
                      </span>
                      {metrics.activeAlertsDetail && (
                        <div className="flex gap-1 text-[8px] font-bold">
                          {(metrics.activeAlertsDetail.major || metrics.activeAlertsDetail.Major) > 0 && <span className="text-rose-400 bg-rose-500/10 px-1.5 py-0.5 rounded border border-rose-500/20">M:{(metrics.activeAlertsDetail.major || metrics.activeAlertsDetail.Major)}</span>}
                          {(metrics.activeAlertsDetail.minor || metrics.activeAlertsDetail.Minor) > 0 && <span className="text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">m:{(metrics.activeAlertsDetail.minor || metrics.activeAlertsDetail.Minor)}</span>}
                        </div>
                      )}
                    </>
                  ) : null}
                </div>

                {/* Arrow */}
                <ChevronRight size={16} className="th-text-muted group-hover:th-text-secondary transition-colors shrink-0" />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ZoneSites;
