import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layers, Server, Users, ChevronRight, RefreshCw, LayoutGrid, List, ArrowUpDown } from 'lucide-react';
import ZoneRoleBadge from '../../components/Zones/ZoneRoleBadge';
import { useLanguage } from '../../context/LanguageContext';
import { useZone } from '../../context/ZoneContext';

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
  const { t } = useLanguage();
  const { zones, loadingZones, fetchZones } = useZone();
  const [viewMode, setViewMode] = useState('card'); // 'card' | 'list'
  const [sortKey, setSortKey] = useState('name_asc');
  const navigate = useNavigate();
  const myEmail = sessionStorage.getItem('insight_user_email') || '';

  const SORT_OPTIONS = [
    { value: 'name_asc',     label: t('zones.dashboard.sort_name_asc') },
    { value: 'name_desc',    label: t('zones.dashboard.sort_name_desc') },
    { value: 'sites_desc',   label: t('zones.dashboard.sort_sites_desc') },
    { value: 'sites_asc',    label: t('zones.dashboard.sort_sites_asc') },
    { value: 'members_desc', label: t('zones.dashboard.sort_members_desc') },
  ];

  // Fetch on mount ONLY if no prefetched data
  useEffect(() => {
    if (zones.length === 0) fetchZones();
  }, []);

  const getMyZoneRole = (zone) => {
    const me = (zone.members || []).find((m) => m.email === myEmail);
    return me?.zone_role || null;
  };

  const sorted = sortZones(zones, sortKey);

  if (loadingZones && zones.length === 0) {
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
          <h1 className="text-lg font-semibold th-text-primary">{t('zones.dashboard.title')}</h1>
          <span className="text-xs th-text-muted th-bg-surface-alt px-2 py-0.5 rounded-full" style={{ backgroundColor: 'var(--color-bg-surface-alt)' }}>
            {zones.length} {t('zones.dashboard.zone_count_label')}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Sort */}
          <div className="flex items-center gap-1.5 px-2 py-1.5 th-bg-surface-alt border th-border rounded-lg" style={{ backgroundColor: 'var(--color-bg-surface-alt)', borderColor: 'var(--color-border)' }}>
            <ArrowUpDown className="w-3.5 h-3.5 th-text-muted" />
            <select
              value={sortKey}
              onChange={e => setSortKey(e.target.value)}
              className="text-xs th-text-secondary bg-transparent border-none outline-none cursor-pointer pr-1"
            >
              {SORT_OPTIONS.map(o => (
                <option key={o.value} value={o.value} className="th-bg-elevated" style={{ backgroundColor: 'var(--color-bg-elevated)' }}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* View toggle */}
          <div className="flex items-center th-bg-surface-alt border th-border rounded-lg overflow-hidden" style={{ backgroundColor: 'var(--color-bg-surface-alt)', borderColor: 'var(--color-border)' }}>
            <button
              onClick={() => setViewMode('card')}
              className={`p-1.5 transition-colors ${viewMode === 'card' ? 'bg-blue-600 th-text-primary' : 'th-text-muted hover:th-text-primary'}`}
              title={t('zones.dashboard.button_card_view')}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 transition-colors ${viewMode === 'list' ? 'bg-blue-600 th-text-primary' : 'th-text-muted hover:th-text-primary'}`}
              title={t('zones.dashboard.button_list_view')}
            >
              <List className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            onClick={fetchZones}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs th-text-muted hover:th-text-primary border th-border hover:border-blue-500/50 rounded-lg transition-colors"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <RefreshCw className="w-3.5 h-3.5" /> {t('zones.dashboard.button_refresh')}
          </button>
        </div>
      </div>

      {zones.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 th-text-muted">
          <Layers className="w-12 h-12 mb-3 opacity-20" />
          <p className="text-sm">{t('zones.dashboard.empty_state_message')}</p>
          <p className="text-xs th-text-muted mt-1">{t('zones.dashboard.empty_state_hint')}</p>
        </div>
      ) : viewMode === 'card' ? (
        // ── Card view ──────────────────────────────────────────────────────────
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {sorted.map((zone) => {
            const myRole = getMyZoneRole(zone);
            return (
              <div
                key={zone.id}
                className="th-bg-surface border th-border rounded-xl overflow-hidden hover:border-blue-500/40 transition-colors cursor-pointer group"
                style={{ backgroundColor: 'var(--color-bg-surface)', borderColor: 'var(--color-border)' }}
                onClick={() => navigate(`/zones/${zone.id}/sites`)}
              >
                {/* Color accent header */}
                <div
                  className="px-4 py-3 border-b th-border"
                  style={{ borderLeftWidth: 3, borderLeftColor: zone.color || '#3B82F6', borderBottomColor: 'var(--color-border)' }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-semibold th-text-primary text-sm truncate group-hover:text-blue-400 transition-colors">{zone.name}</h3>
                      {zone.description && (
                        <p className="text-xs th-text-muted mt-0.5 truncate">{zone.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {myRole && <ZoneRoleBadge role={myRole} />}
                      <ChevronRight className="w-3.5 h-3.5 th-text-muted group-hover:th-text-secondary transition-colors" />
                    </div>
                  </div>
                </div>

                {/* Stats */}
                <div className="px-4 py-3 flex items-center gap-4 text-xs th-text-muted">
                  <span className="flex items-center gap-1.5">
                    <Server className="w-3.5 h-3.5 th-text-muted" />
                    {(zone.site_ids || []).length} {t('zones.dashboard.card_stats_sites')}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 th-text-muted" />
                    {(zone.members || []).length} {t('zones.dashboard.card_stats_members')}
                  </span>
                </div>

                {/* Actions */}
                <div className="px-4 pb-3 flex items-center justify-between">
                  <button
                    onClick={e => { e.stopPropagation(); navigate(`/zones/${zone.id}/sites`); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/40 border border-blue-500/30 text-blue-500 dark:text-blue-300 text-xs font-medium rounded-lg transition-colors"
                  >
                    <ChevronRight className="w-3.5 h-3.5" /> {t('zones.dashboard.card_action_enter')}
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); navigate(`/zones/${zone.id}/logs`); }}
                    className="text-[11px] th-text-muted hover:th-text-secondary transition-colors"
                  >
                    {t('zones.dashboard.card_action_logs')} →
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        // ── List view ──────────────────────────────────────────────────────────
        <div className="th-bg-surface border th-border rounded-xl overflow-hidden" style={{ backgroundColor: 'var(--color-bg-surface)', borderColor: 'var(--color-border)' }}>
          <table className="w-full text-sm">
            <thead className="th-bg-surface-alt border-b th-border" style={{ backgroundColor: 'var(--color-bg-surface-alt)', borderBottomColor: 'var(--color-border)' }}>
              <tr>
                <th className="px-5 py-3 text-left text-[11px] font-semibold th-text-muted uppercase tracking-wider">{t('zones.dashboard.table_header_zone')}</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold th-text-muted uppercase tracking-wider">{t('zones.dashboard.table_header_role')}</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold th-text-muted uppercase tracking-wider">{t('zones.dashboard.table_header_sites')}</th>
                <th className="px-5 py-3 text-left text-[11px] font-semibold th-text-muted uppercase tracking-wider">{t('zones.dashboard.table_header_members')}</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y" style={{ '--tw-divide-color': 'var(--color-border)' }}>
              {sorted.map((zone) => {
                const myRole = getMyZoneRole(zone);
                return (
                  <tr
                    key={zone.id}
                    className="hover:th-bg-surface-alt transition-colors cursor-pointer group"
                    style={{ '--tw-hover-bg': 'var(--color-bg-surface-alt)' }}
                    onClick={() => navigate(`/zones/${zone.id}/sites`)}
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: zone.color || '#3B82F6' }}
                        />
                        <div>
                          <div className="th-text-primary font-medium text-sm group-hover:text-blue-400 transition-colors">{zone.name}</div>
                          {zone.description && (
                            <div className="text-xs th-text-muted truncate max-w-xs">{zone.description}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      {myRole ? <ZoneRoleBadge role={myRole} /> : <span className="th-text-muted text-xs">—</span>}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="th-text-secondary text-xs font-medium">{(zone.site_ids || []).length}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="th-text-secondary text-xs font-medium">{(zone.members || []).length}</span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <button
                          onClick={e => { e.stopPropagation(); navigate(`/zones/${zone.id}/logs`); }}
                          className="text-[11px] th-text-muted hover:th-text-secondary transition-colors"
                        >
                          {t('zones.dashboard.card_action_logs')}
                        </button>
                        <ChevronRight className="w-4 h-4 th-text-muted group-hover:th-text-secondary transition-colors" />
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
