import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layers, Server, Users, ChevronRight, RefreshCw, LayoutGrid, List, ArrowUpDown } from 'lucide-react';
import apiClient from '../../api/apiClient';
import ZoneRoleBadge from '../../components/Zones/ZoneRoleBadge';

const SORT_OPTIONS = [
  { value: 'name_asc',   label: 'Tên A→Z' },
  { value: 'name_desc',  label: 'Tên Z→A' },
  { value: 'sites_desc', label: 'Nhiều site nhất' },
  { value: 'sites_asc',  label: 'Ít site nhất' },
  { value: 'members_desc', label: 'Nhiều member nhất' },
];

function sortZones(zones, sortKey) {
  const copy = [...zones];
  switch (sortKey) {
    case 'name_asc':     return copy.sort((a, b) => a.name.localeCompare(b.name));
    case 'name_desc':    return copy.sort((a, b) => b.name.localeCompare(a.name));
    case 'sites_desc':   return copy.sort((a, b) => (b.site_ids?.length || 0) - (a.site_ids?.length || 0));
    case 'sites_asc':    return copy.sort((a, b) => (a.site_ids?.length || 0) - (b.site_ids?.length || 0));
    case 'members_desc': return copy.sort((a, b) => (b.members?.length || 0) - (a.members?.length || 0));
    default: return copy;
  }
}

const ZoneDashboard = () => {
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('card'); // 'card' | 'list'
  const [sortKey, setSortKey] = useState('name_asc');
  const navigate = useNavigate();
  const myEmail = sessionStorage.getItem('insight_user_email') || '';

  const fetchZones = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/zones/my');
      const details = await Promise.all(
        (res.data || []).map((z) => apiClient.get(`/zones/${z.id}`).then((r) => r.data))
      );
      setZones(details);
    } catch (err) {
      console.error('Failed to fetch zones:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchZones(); }, [fetchZones]);

  const getMyZoneRole = (zone) => {
    const me = (zone.members || []).find((m) => m.email === myEmail);
    return me?.zone_role || null;
  };

  const sorted = sortZones(zones, sortKey);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Layers className="w-5 h-5 text-blue-400" />
          <h1 className="text-lg font-semibold text-white">My Zones</h1>
          <span className="text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full">
            {zones.length} zones
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Sort */}
          <div className="flex items-center gap-1.5 px-2 py-1.5 bg-slate-800/60 border border-slate-700 rounded-lg">
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-500" />
            <select
              value={sortKey}
              onChange={e => setSortKey(e.target.value)}
              className="text-xs text-slate-300 bg-transparent border-none outline-none cursor-pointer pr-1"
            >
              {SORT_OPTIONS.map(o => (
                <option key={o.value} value={o.value} className="bg-slate-800">{o.label}</option>
              ))}
            </select>
          </div>

          {/* View toggle */}
          <div className="flex items-center bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode('card')}
              className={`p-1.5 transition-colors ${viewMode === 'card' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
              title="Card view"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 transition-colors ${viewMode === 'list' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
              title="List view"
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            onClick={fetchZones}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 rounded-lg transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>
      </div>

      {zones.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500">
          <Layers className="w-12 h-12 mb-3 opacity-20" />
          <p className="text-sm">Bạn chưa được thêm vào Zone nào.</p>
          <p className="text-xs text-slate-600 mt-1">Liên hệ Admin để được phân quyền.</p>
        </div>
      ) : viewMode === 'card' ? (
        // ── Card view ──────────────────────────────────────────────────────────
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {sorted.map((zone) => {
            const myRole = getMyZoneRole(zone);
            return (
              <div
                key={zone.id}
                className="bg-[#0F172A] border border-slate-700 rounded-xl overflow-hidden hover:border-slate-500 transition-colors cursor-pointer group"
                onClick={() => navigate(`/zones/${zone.id}/sites`)}
              >
                {/* Color accent header */}
                <div
                  className="px-4 py-3 border-b border-slate-800"
                  style={{ borderLeftWidth: 3, borderLeftColor: zone.color || '#3B82F6' }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-white text-sm truncate group-hover:text-blue-300 transition-colors">{zone.name}</h3>
                      {zone.description && (
                        <p className="text-xs text-slate-500 mt-0.5 truncate">{zone.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {myRole && <ZoneRoleBadge role={myRole} />}
                      <ChevronRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-slate-400 transition-colors" />
                    </div>
                  </div>
                </div>

                {/* Stats */}
                <div className="px-4 py-3 flex items-center gap-4 text-xs text-slate-400">
                  <span className="flex items-center gap-1.5">
                    <Server className="w-3.5 h-3.5 text-slate-500" />
                    {(zone.site_ids || []).length} sites
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-slate-500" />
                    {(zone.members || []).length} members
                  </span>
                </div>

                {/* Actions */}
                <div className="px-4 pb-3 flex items-center justify-between">
                  <button
                    onClick={e => { e.stopPropagation(); navigate(`/zones/${zone.id}/sites`); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/40 border border-blue-500/30 text-blue-300 text-xs font-medium rounded-lg transition-colors"
                  >
                    <ChevronRight className="w-3.5 h-3.5" /> Vào Zone
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); navigate(`/zones/${zone.id}/logs`); }}
                    className="text-[11px] text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    Logs →
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        // ── List view ──────────────────────────────────────────────────────────
        <div className="bg-[#0F172A] border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-800/60 border-b border-slate-700">
              <tr>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Zone</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Role</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Sites</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Members</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {sorted.map((zone) => {
                const myRole = getMyZoneRole(zone);
                return (
                  <tr
                    key={zone.id}
                    className="hover:bg-slate-800/40 transition-colors cursor-pointer group"
                    onClick={() => navigate(`/zones/${zone.id}/sites`)}
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: zone.color || '#3B82F6' }}
                        />
                        <div>
                          <div className="text-white font-medium text-sm group-hover:text-blue-300 transition-colors">{zone.name}</div>
                          {zone.description && (
                            <div className="text-xs text-slate-500 truncate max-w-xs">{zone.description}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      {myRole ? <ZoneRoleBadge role={myRole} /> : <span className="text-slate-600 text-xs">—</span>}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-slate-300 text-xs font-medium">{(zone.site_ids || []).length}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-slate-300 text-xs font-medium">{(zone.members || []).length}</span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <button
                          onClick={e => { e.stopPropagation(); navigate(`/zones/${zone.id}/logs`); }}
                          className="text-[11px] text-slate-500 hover:text-slate-300 transition-colors"
                        >
                          Logs
                        </button>
                        <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-slate-400 transition-colors" />
                      </div>
                    </td>
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

export default ZoneDashboard;
