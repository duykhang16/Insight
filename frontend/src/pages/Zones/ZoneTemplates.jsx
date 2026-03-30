import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Server, RefreshCw } from 'lucide-react';
import apiClient from '../../api/apiClient';
import { useSite } from '../../context/SiteContext';
import { useZone } from '../../context/ZoneContext';
import { useLanguage } from '../../context/LanguageContext';
import ZoneHeader from '../../components/Zones/ZoneHeader';
import TemplateCard from '../../components/Zones/TemplateCard';

const ZoneTemplates = () => {
  const { t } = useLanguage();
  const { zoneId } = useParams();
  const navigate = useNavigate();
  const { sites, fetchSites, loadingSites } = useSite();
  const { getZone, fetchZones } = useZone();

  const [zone, setZone] = useState(() => getZone(zoneId) || null);
  const [loadingZone, setLoadingZone] = useState(!zone);
  const [templates, setTemplates] = useState([]);

  const fetchZone = useCallback(async () => {
    const cached = getZone(zoneId);
    if (cached) {
      setZone(cached);
      setLoadingZone(false);
      return;
    }
    setLoadingZone(true);
    try {
      const res = await apiClient.get(`/zones/${zoneId}`);
      setZone(res.data);
    } catch (err) {
      console.error('Failed to fetch zone:', err);
    } finally {
      setLoadingZone(false);
    }
  }, [zoneId, getZone]);

  // Sync with context if zone data changes externally
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
    fetchZones();
    fetchZone();
    fetchSites();
    apiClient.get('/templates').then(res => setTemplates(res.data || [])).catch(() => {});
  };

  // Compute template → site count within this zone
  const zoneSiteIds = new Set((zone?.site_ids || []).map(String));
  const zoneSites = sites.filter(s => {
    const id = String(s.siteId || s.id || s._id);
    return zoneSiteIds.has(id);
  });

  const templateGroups = buildTemplateGroups(zoneSites, templates);
  const totalSites = zoneSites.length;

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
        <button
          onClick={() => navigate('/zones')}
          className="mt-6 px-4 py-2 th-bg-surface-alt hover:th-bg-elevated th-text-primary rounded-lg transition-colors flex items-center gap-2 text-sm"
          style={{ backgroundColor: 'var(--color-bg-surface-alt)' }}
        >
          {t('zones.sites.error_back_button')}
        </button>
      </div>
    );
  }

  return (
    <div className="p-6">
      <ZoneHeader
        zone={zone}
        backTo="/zones"
        onZoneRenamed={(newName) => setZone(prev => ({ ...prev, name: newName }))}
        badge={
          <span
            className="text-xs th-text-muted th-bg-surface-alt px-2 py-0.5 rounded-full ml-1"
            style={{ backgroundColor: 'var(--color-bg-surface-alt)' }}
          >
            {totalSites} sites
          </span>
        }
        actions={
          <>
            <button
              onClick={() => navigate(`/zones/${zoneId}/logs`)}
              className="px-3 py-1.5 text-xs th-text-muted hover:th-text-primary border th-border hover:border-blue-500/50 rounded-lg transition-colors"
              style={{ borderColor: 'var(--color-border)' }}
            >
              {t('zones.sites.button_view_logs')}
            </button>
            <button
              onClick={handleRefresh}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs th-text-muted hover:th-text-primary border th-border hover:border-blue-500/50 rounded-lg transition-colors"
              style={{ borderColor: 'var(--color-border)' }}
            >
              <RefreshCw className="w-3.5 h-3.5" /> {t('zones.sites.button_refresh')}
            </button>
          </>
        }
      />

      {/* Template grid */}
      {totalSites === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 th-text-muted">
          <Server className="w-12 h-12 mb-3 opacity-20" />
          <p className="text-sm">{t('zones.sites.empty_state_message')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {/* Template cards (those with at least 1 site) */}
          {templateGroups.map(group => (
            <TemplateCard
              key={group.templateId || '__general__'}
              template={group.template}
              siteCount={group.count}
              isGeneral={group.isGeneral}
              onClick={() => {
                const param = group.isGeneral ? 'general' : group.templateId;
                navigate(`/zones/${zoneId}/sites?template=${param}`);
              }}
            />
          ))}
        </div>
      )}

      {/* Quick action: view all sites */}
      {totalSites > 0 && (
        <div className="mt-6 flex justify-center">
          <button
            onClick={() => navigate(`/zones/${zoneId}/sites`)}
            className="px-5 py-2 text-xs th-text-muted hover:th-text-primary border th-border hover:border-blue-500/50 rounded-lg transition-colors"
            style={{ borderColor: 'var(--color-border)' }}
          >
            View all {totalSites} sites →
          </button>
        </div>
      )}
    </div>
  );
};

/**
 * Build an array of { templateId, template, count, isGeneral }
 * from the zone's sites and the full template list.
 * Only includes groups with count > 0. "General" group is always last.
 */
function buildTemplateGroups(zoneSites, templates) {
  const buckets = {};   // templateId → count
  let generalCount = 0;

  zoneSites.forEach(site => {
    const tplId = site.template?.id;
    if (tplId) {
      buckets[tplId] = (buckets[tplId] || 0) + 1;
    } else {
      generalCount++;
    }
  });

  const groups = [];

  // Templates with sites — preserve order from API
  templates.forEach(tpl => {
    if (buckets[tpl.id]) {
      groups.push({
        templateId: tpl.id,
        template: tpl,
        count: buckets[tpl.id],
        isGeneral: false,
      });
    }
  });

  // Orphan templates (in buckets that weren't found in templates list — just in case)
  Object.keys(buckets).forEach(tplId => {
    if (!groups.find(g => g.templateId === tplId)) {
      // Find template info from site data
      const site = zoneSites.find(s => s.template?.id === tplId);
      groups.push({
        templateId: tplId,
        template: site?.template || { id: tplId, name: tplId, color: '#6366f1' },
        count: buckets[tplId],
        isGeneral: false,
      });
    }
  });

  // General (no template) — always last
  if (generalCount > 0) {
    groups.push({
      templateId: null,
      template: null,
      count: generalCount,
      isGeneral: true,
    });
  }

  return groups;
}

export default ZoneTemplates;
