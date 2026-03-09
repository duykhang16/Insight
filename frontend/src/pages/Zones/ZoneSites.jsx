import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Layers, Server, MapPin, ChevronRight, ChevronLeft, RefreshCw, Wifi, Search, Filter, ArrowUp, ArrowDown, Activity, WifiOff, CloudOff, AlertTriangle, CheckCircle2 } from 'lucide-react';
import apiClient from '../../api/apiClient';
import { useSite } from '../../context/SiteContext';

const STATUS_BADGE = {
  up: { label: 'Online', cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  down: { label: 'Offline', cls: 'bg-slate-500/10 text-slate-400 border-slate-500/20' },
};

const ZoneSites = () => {
  const { zoneId } = useParams();
  const navigate = useNavigate();
  const { sites, fetchSites, loadingSites } = useSite();

  const [zone, setZone] = useState(null);
  const [loadingZone, setLoadingZone] = useState(true);
  const [siteSearch, setSiteSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'asc' });
  const [siteMetrics, setSiteMetrics] = useState({});
  const fetchedSiteIds = useRef(new Set());

  const fetchZone = useCallback(async () => {
    setLoadingZone(true);
    try {
      const res = await apiClient.get(`/zones/${zoneId}`);
      setZone(res.data);
    } catch (err) {
      console.error('Failed to fetch zone:', err);
    } finally {
      setLoadingZone(false);
    }
  }, [zoneId]);

  useEffect(() => {
    fetchZone();
    if (sites.length === 0) fetchSites();
  }, [fetchZone]);

  const handleRefresh = () => {
    fetchedSiteIds.current.clear(); // Clear so it re-fetches site metrics
    fetchZone();
    fetchSites();
  };

  // Filter and sort sites belonging to this zone
  const zoneSiteIds = new Set((zone?.site_ids || []).map(String));
  const zoneSites = sites.filter(s => {
    const id = String(s.siteId || s.id || s._id);
    if (!zoneSiteIds.has(id)) return false;

    // Status filter
    if (statusFilter !== 'all' && s.status !== statusFilter) return false;

    // Text search
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

  // Fetch individual site metrics (health, alerts) dynamically
  useEffect(() => {
    if (!zoneSites || zoneSites.length === 0) return;

    zoneSites.forEach(site => {
      const id = site.siteId || site.id || site._id;
      if (!fetchedSiteIds.current.has(id)) {
        fetchedSiteIds.current.add(id);

        setSiteMetrics(prev => ({ ...prev, [id]: { loading: true, health: null, alerts: 0 } }));

        Promise.all([
          apiClient.get(`/overview/sites/${id}/health`).catch(() => ({ data: null })),
          apiClient.get(`/overview/sites/${id}/alerts`).catch(() => ({ data: [] }))
        ]).then(([hRes, aRes]) => {
          setSiteMetrics(prev => ({
            ...prev,
            [id]: {
              loading: false,
              health: hRes.data?.score ?? (site.status === 'up' ? 100 : 0),
              alerts: Array.isArray(aRes.data) ? aRes.data.length : 0
            }
          }));
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
        <h2 className="text-lg font-bold text-white mb-1">Không thể tải dữ liệu Zone</h2>
        <p className="text-sm text-center max-w-md">
          Có vẻ như Backend đang gặp sự cố (lỗi 500, mất kết nối DB) hoặc Zone này không tồn tại. Bạn hãy thử tải lại trang hoặc khởi động lại Backend.
        </p>
        <button
          onClick={() => navigate('/zones')}
          className="mt-6 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors flex items-center gap-2 text-sm"
        >
          <ChevronLeft className="w-4 h-4" /> Quay lại danh sách Zone
        </button>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/zones')}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div
            className="w-3 h-3 rounded-full flex-shrink-0"
            style={{ backgroundColor: zone?.color || '#3B82F6' }}
          />
          <div>
            <h1 className="text-lg font-semibold text-white">{zone?.name || 'Zone'}</h1>
            {zone?.description && (
              <p className="text-xs text-slate-500 mt-0.5">{zone.description}</p>
            )}
          </div>
          <span className="text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full ml-1">
            {zoneSites.length} sites
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(`/zones/${zoneId}/logs`)}
            className="px-3 py-1.5 text-xs text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 rounded-lg transition-colors"
          >
            Xem logs
          </button>
          <button
            onClick={handleRefresh}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 rounded-lg transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>
      </div>

      {/* Filter / Search / Sort */}
      <div className="flex flex-col md:flex-row gap-3 mb-4">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Tìm kiếm site..."
            value={siteSearch}
            onChange={(e) => setSiteSearch(e.target.value)}
            className="w-full bg-[#0F172A] border border-slate-700 rounded-lg text-sm text-slate-200 pl-9 pr-4 py-2 focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>

        {/* Status Filter */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 bg-[#0F172A] border border-slate-700 rounded-lg px-3 py-2">
            <Filter className="w-4 h-4 text-slate-500" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-transparent text-sm text-slate-200 focus:outline-none appearance-none pr-4 cursor-pointer"
            >
              <option value="all" className="bg-slate-800">Tất cả trạng thái</option>
              <option value="up" className="bg-slate-800">Online</option>
              <option value="down" className="bg-slate-800">Offline</option>
            </select>
          </div>

          {/* Sort Selection */}
          <div className="flex items-center gap-2 bg-[#0F172A] border border-slate-700 rounded-lg px-2 py-1">
            <select
              value={sortConfig.key}
              onChange={(e) => setSortConfig({ ...sortConfig, key: e.target.value })}
              className="bg-transparent text-sm text-slate-200 focus:outline-none appearance-none pl-2 pr-4 py-1 cursor-pointer"
            >
              <option value="name" className="bg-slate-800">Tên site</option>
              <option value="status" className="bg-slate-800">Trạng thái</option>
            </select>
            <button
              onClick={() => setSortConfig({
                ...sortConfig,
                direction: sortConfig.direction === 'asc' ? 'desc' : 'asc'
              })}
              className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors"
              title="Đảo chiều sắp xếp"
            >
              {sortConfig.direction === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* Sites list */}
      {zoneSites.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500">
          <Server className="w-12 h-12 mb-3 opacity-20" />
          <p className="text-sm">Zone này chưa có site nào.</p>
          <p className="text-xs text-slate-600 mt-1">Admin có thể thêm sites vào zone trong Zone Management.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {zoneSites.map(site => {
            const id = site.siteId || site.id || site._id;
            const name = site.siteName || site.name || id;
            const role = site.internal_app_role || site.aruba_role_raw || '';
            const isUp = site.status === 'up';

            const metrics = siteMetrics[id] || { loading: true, health: isUp ? 100 : 0, alerts: 0 };
            const healthScore = metrics.health !== null ? metrics.health : (isUp ? 100 : 0);
            const alertsCount = metrics.alerts || 0;
            const healthLabel = healthScore >= 80 ? 'Good' : healthScore >= 50 ? 'Fair' : 'Poor';

            const indicatorColor = isUp ? 'border-emerald-500' : 'border-rose-500';
            const healthColor = healthScore >= 80 ? 'text-emerald-500' : healthScore >= 50 ? 'text-yellow-500' : 'text-rose-500';

            return (
              <div
                key={id}
                onClick={() => navigate(`/site/${id}`)}
                className={`bg-[#2D333B] rounded-xl p-4 cursor-pointer hover:bg-slate-700 hover:shadow-lg transition-all border-l-4 ${indicatorColor} flex flex-col justify-between min-h-[160px] group`}
              >
                {/* Header */}
                <div className="flex justify-between items-start mb-4">
                  <h3 className="text-lg font-bold text-white truncate pr-2">{name}</h3>
                  <div className="p-1.5 bg-slate-800/50 rounded-md">
                    {isUp ? <Wifi size={14} className="text-emerald-400" /> : <WifiOff size={14} className="text-rose-400" />}
                  </div>
                </div>

                {/* Body - 2 Columns */}
                <div className="grid grid-cols-2 gap-4 mb-4 flex-1">
                  <div>
                    <p className="text-xs text-slate-400 mb-1">Health</p>
                    <div className="flex items-end gap-1.5 h-[24px]">
                      {metrics.loading ? (
                        <div className="w-4 h-4 rounded-full border-2 border-slate-600 border-t-slate-400 animate-spin mt-1" />
                      ) : (
                        <>
                          {healthScore >= 80 ? <CheckCircle2 size={18} className={healthColor} /> : <AlertTriangle size={18} className={healthColor} />}
                          <span className="text-2xl font-bold text-white leading-none">{healthScore}%</span>
                        </>
                      )}
                    </div>
                    {!metrics.loading && <p className={`text-xs mt-1 ${healthColor}`}>{healthLabel}</p>}
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 mb-1">Alerts</p>
                    <div className="flex items-end gap-1.5 h-[24px]">
                      {metrics.loading ? (
                        <div className="w-4 h-4 rounded-full border-2 border-slate-600 border-t-slate-400 animate-spin mt-1" />
                      ) : (
                        <span className={`text-2xl font-bold leading-none ${alertsCount > 0 ? 'text-rose-500' : 'text-white'}`}>
                          {alertsCount}
                        </span>
                      )}
                    </div>
                    {!metrics.loading && <p className="text-xs mt-1 text-slate-400">{alertsCount > 0 ? 'Active alerts' : 'No alerts'}</p>}
                  </div>
                </div>

                {/* Footer */}
                <div className="pt-3 border-t border-slate-700/50 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-slate-400">
                    <Activity size={14} />
                    <span className="text-[10px] uppercase tracking-wider">{role || 'Site'}</span>
                    <span className="text-[10px]">· Last 24 hours</span>
                  </div>
                  {!isUp && (
                    <div className="flex items-center gap-1 text-rose-500">
                      <CloudOff size={14} />
                      <span className="text-xs font-bold uppercase tracking-wide">Offline</span>
                    </div>
                  )}
                  {isUp && (
                    <ChevronRight size={14} className="text-slate-500 group-hover:text-slate-300 transition-colors" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ZoneSites;
