import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Layers, Server, MapPin, ChevronRight, ChevronLeft, RefreshCw, Wifi, Search, Filter, ArrowUp, ArrowDown, Activity, WifiOff, CloudOff, AlertTriangle, CheckCircle2, Edit3, Check, X, LayoutGrid, List } from 'lucide-react';
import apiClient from '../../api/apiClient';
import { useSite } from '../../context/SiteContext';
import { useZone } from '../../context/ZoneContext';
import { useLanguage } from '../../context/LanguageContext';

const ZoneSites = () => {
  const { t } = useLanguage();
  const { zoneId } = useParams();
  const navigate = useNavigate();
  const { sites, fetchSites, loadingSites, prefetchSite } = useSite();
  const { getZone, fetchZones } = useZone();
  const prefetchTimerRef = useRef(null);

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
  const [templateFilter, setTemplateFilter] = useState('all');

  const fetchZone = useCallback(async () => {
    // Try from ZoneContext cache first
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

  // Keep zone in sync with ZoneContext updates (from polling)
  useEffect(() => {
    const cached = getZone(zoneId);
    if (cached && JSON.stringify(cached) !== JSON.stringify(zone)) {
      setZone(cached);
    }
  }, [getZone, zoneId]);

  useEffect(() => {
    fetchZone();
    if (sites.length === 0) fetchSites();
    
    // Load templates for filtering
    apiClient.get('/templates').then(res => setTemplates(res.data || [])).catch(() => {});
  }, [fetchZone]);

  const handleRefresh = () => {
    fetchedSiteIds.current.clear();
    fetchZones(); // refresh centralized zone data
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

  // Filter and sort sites belonging to this zone
  const zoneSiteIds = new Set((zone?.site_ids || []).map(String));
  const zoneSites = sites.filter(s => {
    const id = String(s.siteId || s.id || s._id);
    if (!zoneSiteIds.has(id)) return false;
    
    // Status Filter
    if (statusFilter !== 'all' && s.status !== statusFilter) return false;
    
    // Template Filter
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


  // Fetch individual site metrics dynamically
  useEffect(() => {
    if (!zoneSites || zoneSites.length === 0) return;

    zoneSites.forEach(site => {
      const id = site.siteId || site.id || site._id;
      if (!fetchedSiteIds.current.has(id)) {
        fetchedSiteIds.current.add(id);

        setSiteMetrics(prev => ({ 
          ...prev, 
          [id]: { 
            loading: true, 
            health: site.healthScore ?? null, 
            alerts: site.alertsCount || 0,
            alertsDetail: site.alertsDetail || {}
          } 
        }));

        Promise.all([
          apiClient.get(`/overview/sites/${id}/health`).catch(() => ({ data: null })),
          apiClient.get(`/overview/sites/${id}/alerts`).catch(() => ({ data: [] }))
        ]).then(([hRes, aRes]) => {
          const alertsList = Array.isArray(aRes.data) ? aRes.data : [];
          const detail = {};
          if (alertsList.length > 0) {
            alertsList.forEach(a => {
              const sev = (a.severity || a.conditionSeverity || 'minor').toLowerCase();
              detail[sev] = (detail[sev] || 0) + 1;
            });
          }

          setSiteMetrics(prev => {
            const fetchedScore = hRes.data?.currentHealth?.healthScore?.score ?? hRes.data?.healthScore?.score ?? hRes.data?.score;
            const finalScore = fetchedScore !== undefined && fetchedScore !== null ? Math.round(fetchedScore) : (site.healthScore !== null ? Math.round(site.healthScore) : null);
            
            return {
              ...prev,
              [id]: {
                loading: false,
                health: finalScore,
                alerts: (alertsList.length > 0 ? alertsList.length : (site.alertsCount || 0)),
                alertsDetail: alertsList.length > 0 ? detail : (site.alertsDetail || {})
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
      <div className="flex flex-col items-center justify-center py-20 text-slate-500 p-6">
        <Server className="w-12 h-12 mb-3 text-rose-500 opacity-50" />
        <h2 className="text-lg font-bold text-white mb-1">{t('zones.sites.error_load_zone')}</h2>
        <p className="text-sm text-center max-w-md">{t('zones.sites.error_message')}</p>
        <button onClick={() => navigate('/zones')} className="mt-6 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors flex items-center gap-2 text-sm">
          <ChevronLeft className="w-4 h-4" /> {t('zones.sites.error_back_button')}
        </button>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/zones')} className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
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
                  className="bg-[#0F172A] border border-blue-500 rounded px-2 py-0.5 text-sm font-semibold text-white focus:outline-none w-48"
                />
                <button onClick={handleSaveName} disabled={savingName} className="p-1 text-emerald-500 hover:bg-slate-800 rounded transition-colors"><Check size={16} /></button>
                <button onClick={() => setIsEditingName(false)} disabled={savingName} className="p-1 text-rose-500 hover:bg-slate-800 rounded transition-colors"><X size={16} /></button>
              </div>
            ) : (
              <div className="flex items-center gap-2 group cursor-pointer" onClick={() => { setEditNameValue(zone?.name || ''); setIsEditingName(true); }}>
                <h1 className="text-lg font-semibold text-white">{zone?.name || 'Zone'}</h1>
                <Edit3 size={14} className="text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            )}
            {zone?.description && <p className="text-xs text-slate-500 mt-0.5">{zone.description}</p>}
          </div>
          <span className="text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full ml-1">{zoneSites.length} sites</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => navigate(`/zones/${zoneId}/logs`)} className="px-3 py-1.5 text-xs text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 rounded-lg transition-colors">{t('zones.sites.button_view_logs')}</button>
          <button onClick={handleRefresh} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 rounded-lg transition-colors"><RefreshCw className="w-3.5 h-3.5" /> {t('zones.sites.button_refresh')}</button>
        </div>
      </div>

      {/* Filter / Search / Sort */}
      <div className="flex flex-col md:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder={t('zones.sites.search_placeholder')}
            value={siteSearch}
            onChange={(e) => setSiteSearch(e.target.value)}
            className="w-full bg-[#0F172A] border border-slate-700 rounded-lg text-sm text-slate-200 pl-9 pr-4 py-2 focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 bg-[#0F172A] border border-slate-700 rounded-lg px-3 py-2">
            <Filter className="w-4 h-4 text-slate-500" />
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="bg-transparent text-sm text-slate-200 focus:outline-none appearance-none pr-4 cursor-pointer">
              <option value="all" className="bg-slate-800">{t('zones.sites.filter_status_all')}</option>
              <option value="up" className="bg-slate-800">{t('zones.sites.filter_status_online')}</option>
              <option value="down" className="bg-slate-800">{t('zones.sites.filter_status_offline')}</option>
            </select>
          </div>
          <div className="flex items-center gap-2 bg-[#0F172A] border border-slate-700 rounded-lg px-3 py-2">
            <LayoutGrid className="w-4 h-4 text-emerald-500" />
            <select value={templateFilter} onChange={(e) => setTemplateFilter(e.target.value)} className="bg-transparent text-sm text-slate-200 focus:outline-none appearance-none pr-4 cursor-pointer">
              <option value="all" className="bg-slate-800">All Templates</option>
              {templates.map(t => (
                  <option key={t.id} value={t.id} className="bg-slate-800">{t.name}</option>
              ))}
              <option value="other" className="bg-slate-800">No Template (Other)</option>
            </select>
          </div>

          <div className="flex items-center gap-2 bg-[#0F172A] border border-slate-700 rounded-lg px-2 py-1">
            <select value={sortConfig.key} onChange={(e) => setSortConfig({ ...sortConfig, key: e.target.value })} className="bg-transparent text-sm text-slate-200 focus:outline-none appearance-none pl-2 pr-4 py-1 cursor-pointer">
              <option value="name" className="bg-slate-800">{t('zones.sites.sort_by_name')}</option>
              <option value="status" className="bg-slate-800">{t('zones.sites.sort_by_status')}</option>
            </select>
            <button onClick={() => setSortConfig({ ...sortConfig, direction: sortConfig.direction === 'asc' ? 'desc' : 'asc' })} className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors" title={t('zones.sites.sort_direction_tooltip')}>
              {sortConfig.direction === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
            </button>
          </div>
        </div>
        <div className="flex bg-[#0F172A] border border-slate-700 rounded-lg p-1">
          <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded-md transition-all ${viewMode === 'grid' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`} title="Grid View"><LayoutGrid size={18} /></button>
          <button onClick={() => setViewMode('list')} className={`p-1.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`} title="List View"><List size={18} /></button>
        </div>
      </div>

      {/* Sites list */}
      {zoneSites.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500">
          <Server className="w-12 h-12 mb-3 opacity-20" />
          <p className="text-sm">{t('zones.sites.empty_state_message')}</p>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {zoneSites.map(site => {
            const id = site.siteId || site.id || site._id;
            const metrics = siteMetrics[id] || { loading: true, health: site.healthScore ?? null, alerts: site.alertsCount || 0, alertsDetail: site.alertsDetail || {} };
            const healthScore = metrics.health;
            const alertsCount = metrics.alerts;
            const healthColor = healthScore === null ? 'text-slate-500' : (healthScore >= 67 ? 'text-emerald-500' : healthScore >= 34 ? 'text-amber-500' : 'text-rose-500');
            const healthLabel = healthScore === null ? 'None' : (healthScore >= 67 ? t('zones.sites.card_health_good') : healthScore >= 34 ? t('zones.sites.card_health_fair') : t('zones.sites.card_health_poor'));
            const isUp = site.status === 'up';

            return (
              <div
                key={id}
                onClick={() => { if (prefetchTimerRef.current) clearTimeout(prefetchTimerRef.current); navigate(`/site/${id}`); }}
                onMouseEnter={() => { prefetchTimerRef.current = setTimeout(() => prefetchSite(id), 150); }}
                onMouseLeave={() => { if (prefetchTimerRef.current) clearTimeout(prefetchTimerRef.current); }}
                className={`bg-[#2D333B] rounded-xl p-4 cursor-pointer hover:bg-slate-700 hover:shadow-lg transition-all border-l-4 ${isUp ? 'border-emerald-500' : 'border-rose-500'} flex flex-col justify-between min-h-[160px] group`}
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="flex flex-col truncate pr-2">
                    <h3 className="text-lg font-bold text-white truncate">{site.siteName || site.name || id}</h3>
                    {site.template ? (
                      <span 
                        className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border w-fit mt-0.5"
                        style={{ borderColor: `${site.template.color}40`, backgroundColor: `${site.template.color}10`, color: site.template.color }}
                      >
                        {site.template.name}
                      </span>
                    ) : (
                      <span className="text-[8px] font-black uppercase tracking-widest text-slate-500 mt-1 opacity-50">GENERAL</span>
                    )}
                  </div>
                  <div className="p-1.5 bg-slate-800/50 rounded-md shrink-0">
                    {isUp ? <Wifi size={14} className="text-emerald-400" /> : <WifiOff size={14} className="text-rose-400" />}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-4 flex-1">
                  <div>
                    <p className="text-xs text-slate-400 mb-1">{t('zones.sites.card_health_label')}</p>
                    <div className="flex items-end gap-1.5 h-[24px]">
                      {metrics.loading && healthScore === null ? (
                        <div className="w-4 h-4 rounded-full border-2 border-slate-600 border-t-slate-400 animate-spin mt-1" />
                      ) : (
                        <>
                          {healthScore === null ? <Activity size={18} className={healthColor} /> : healthScore >= 67 ? <CheckCircle2 size={18} className={healthColor} /> : <AlertTriangle size={18} className={healthColor} />}
                          <span className={`text-2xl font-bold leading-none ${healthScore === null ? 'text-slate-500' : 'text-white'}`}>{healthScore !== null ? `${healthScore}%` : 'None'}</span>
                        </>
                      )}
                    </div>
                    {!metrics.loading && <p className={`text-[10px] mt-1 ${healthColor}`}>{healthLabel}</p>}
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 mb-1">{t('zones.sites.card_alerts_label')}</p>
                    <div className="flex items-end gap-1.5 h-[24px]">
                      {metrics.loading ? <div className="w-4 h-4 rounded-full border-2 border-slate-600 border-t-slate-400 animate-spin mt-1" /> : (
                        <div className="flex items-baseline gap-2">
                          <span className={`text-2xl font-bold leading-none ${alertsCount > 0 ? 'text-rose-500' : 'text-white'}`}>{alertsCount}</span>
                          {alertsCount > 0 && metrics.alertsDetail && (
                            <div className="flex gap-1 text-[8px] font-bold">
                              {(metrics.alertsDetail.major || metrics.alertsDetail.Major) > 0 && <span className="text-rose-500 bg-rose-500/10 px-1 rounded">M:{(metrics.alertsDetail.major || metrics.alertsDetail.Major)}</span>}
                              {(metrics.alertsDetail.minor || metrics.alertsDetail.Minor) > 0 && <span className="text-amber-500 bg-amber-500/10 px-1 rounded">m:{(metrics.alertsDetail.minor || metrics.alertsDetail.Minor)}</span>}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="pt-3 border-t border-slate-700/50 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-slate-400">
                    <Activity size={14} />
                    <span className="text-[10px] uppercase tracking-wider">{site.internal_app_role || site.role || 'Site'}</span>
                  </div>
                  {isUp ? <ChevronRight size={14} className="text-slate-500 group-hover:text-slate-300 transition-colors" /> : <CloudOff size={14} className="text-rose-500" />}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-[#1C2128] rounded-xl border border-slate-800 overflow-hidden">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-[#2D333B] text-slate-400 border-b border-slate-700">
              <tr>
                <th className="px-6 py-4 font-bold">Site Name</th>
                <th className="px-6 py-4 font-bold text-center">Status</th>
                <th className="px-6 py-4 font-bold text-center">Health %</th>
                <th className="px-6 py-4 font-bold">Active Alerts</th>
                <th className="px-6 py-4 font-bold">Role</th>
                <th className="px-6 py-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {zoneSites.map(site => {
                const id = site.siteId || site.id || site._id;
                const metrics = siteMetrics[id] || { loading: true, health: site.healthScore ?? null, alerts: site.alertsCount || 0, alertsDetail: site.alertsDetail || {} };
                const healthScore = metrics.health;
                const alertsCount = metrics.alerts;
                const healthColor = healthScore === null ? 'text-slate-500' : (healthScore >= 67 ? 'text-emerald-500' : healthScore >= 34 ? 'text-yellow-500' : 'text-rose-500');
                const isUp = site.status === 'up';
                return (
                  <tr key={id} onClick={() => navigate(`/site/${id}`)} onMouseEnter={() => prefetchSite(id)} className="hover:bg-slate-800/50 cursor-pointer transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${isUp ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]' : 'bg-rose-500'}`} />
                        <div className="flex flex-col">
                            <span className="font-bold text-white text-base leading-tight">{site.siteName || site.name || id}</span>
                            {site.template ? (
                                <span 
                                    className="px-1 py-0.5 rounded text-[7px] font-black uppercase tracking-widest border w-fit mt-1"
                                    style={{ borderColor: `${site.template.color}40`, backgroundColor: `${site.template.color}10`, color: site.template.color }}
                                >
                                    {site.template.name}
                                </span>
                            ) : (
                                <span className="text-[7px] font-black uppercase tracking-widest text-slate-500 mt-1 opacity-50">GENERAL</span>
                            )}
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-4 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${isUp ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border-rose-500/20'}`}>{isUp ? 'Online' : 'Offline'}</span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex flex-col items-center">
                        <span className={`text-base font-black ${healthColor}`}>{healthScore !== null ? `${Math.round(healthScore)}%` : 'None'}</span>
                        {healthScore !== null && (
                          <div className="w-12 h-1 bg-slate-800 rounded-full mt-1 overflow-hidden">
                            <div className={`h-full ${healthScore >= 67 ? 'bg-emerald-500' : healthScore >= 34 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ width: `${healthScore}%` }} />
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <span className={`font-black text-base ${alertsCount > 0 ? 'text-rose-500' : 'text-white'}`}>{alertsCount}</span>
                        {alertsCount > 0 && metrics.alertsDetail && (
                          <div className="flex gap-1.5 text-[9px] font-bold">
                            {(metrics.alertsDetail.major || metrics.alertsDetail.Major) > 0 && <span className="text-rose-400 bg-rose-500/10 px-1.5 py-0.5 rounded-md border border-rose-500/20">MAJOR: {(metrics.alertsDetail.major || metrics.alertsDetail.Major)}</span>}
                            {(metrics.alertsDetail.minor || metrics.alertsDetail.Minor) > 0 && <span className="text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded-md border border-amber-500/20">MINOR: {(metrics.alertsDetail.minor || metrics.alertsDetail.Minor)}</span>}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-400 font-mono text-xs uppercase">{site.internal_app_role || site.role || 'Site'}</td>
                    <td className="px-6 py-4 text-right"><ChevronRight size={18} className="text-slate-600 group-hover:text-white transition-colors ml-auto" /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default ZoneSites;
