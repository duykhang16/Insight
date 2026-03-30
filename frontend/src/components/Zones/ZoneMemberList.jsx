import React, { useState, useRef, useEffect } from 'react';
import { UserMinus, Globe, MapPin, ChevronDown, ChevronUp, Check, X } from 'lucide-react';
import ZoneRoleBadge from './ZoneRoleBadge';
import apiClient from '../../api/apiClient';
import { useLanguage } from '../../context/LanguageContext';

const SitePermissionToggle = ({ zoneId, member, zoneSiteIds = [], zoneSiteNames = {}, onUpdated }) => {
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [allSites, setAllSites] = useState(member.all_sites ?? true);
  const [selectedSites, setSelectedSites] = useState(member.allowed_site_ids || []);
  const [hasChanges, setHasChanges] = useState(false);

  // Reset on member data change
  useEffect(() => {
    setAllSites(member.all_sites ?? true);
    setSelectedSites(member.allowed_site_ids || []);
    setHasChanges(false);
  }, [member.all_sites, member.allowed_site_ids]);

  const handleToggleAllSites = (val) => {
    setAllSites(val);
    if (val) setSelectedSites([]);
    setHasChanges(true);
  };

  const handleToggleSite = (siteId) => {
    setSelectedSites(prev => {
      const next = prev.includes(siteId)
        ? prev.filter(id => id !== siteId)
        : [...prev, siteId];
      setHasChanges(true);
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiClient.put(`/zones/${zoneId}/members/${encodeURIComponent(member.email)}/sites`, {
        all_sites: allSites,
        allowed_site_ids: allSites ? [] : selectedSites,
      });
      setHasChanges(false);
      onUpdated?.();
    } catch (err) {
      console.error('Save site permission failed:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setAllSites(member.all_sites ?? true);
    setSelectedSites(member.allowed_site_ids || []);
    setHasChanges(false);
    setExpanded(false);
  };

  return (
    <div className="mt-1">
      {/* Toggle button */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-[10px] th-text-muted hover:text-blue-400 transition-colors"
      >
        {allSites ? (
          <>
            <Globe className="w-3 h-3 text-emerald-400" />
            <span className="text-emerald-400">{t?.('zones.all_sites_access') || 'All sites'}</span>
          </>
        ) : (
          <>
            <MapPin className="w-3 h-3 text-amber-400" />
            <span className="text-amber-400">
              {selectedSites.length}/{zoneSiteIds.length} {t?.('zones.sites_label') || 'sites'}
            </span>
          </>
        )}
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>

      {/* Expanded panel */}
      {expanded && (
        <div className="mt-1.5 p-2 rounded th-bg-elevated border th-border space-y-2"
          style={{ backgroundColor: 'var(--color-bg-elevated)', borderColor: 'var(--color-border)' }}
        >
          {/* Toggle switch */}
          <div className="flex items-center justify-between">
            <label className="text-[11px] th-text-secondary flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={allSites}
                onChange={(e) => handleToggleAllSites(e.target.checked)}
                className="accent-emerald-500 w-3.5 h-3.5"
              />
              {t?.('zones.allow_all_sites') || 'Allow all sites'}
            </label>
          </div>

          {/* Site list (only when all_sites = false) */}
          {!allSites && (
            <div className="space-y-0.5 max-h-32 overflow-y-auto custom-scrollbar">
              {zoneSiteIds.length === 0 ? (
                <p className="text-[10px] th-text-muted text-center py-1">
                  {t?.('zones.no_sites_in_zone') || 'No sites in this zone'}
                </p>
              ) : (
                zoneSiteIds.map(siteId => {
                  const isChecked = selectedSites.includes(siteId);
                  return (
                    <label
                      key={siteId}
                      className={`flex items-center gap-2 px-1.5 py-1 rounded text-[11px] cursor-pointer transition-colors ${
                        isChecked ? 'th-bg-surface-alt th-text-primary' : 'th-text-muted hover:th-bg-surface-alt'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleToggleSite(siteId)}
                        className="accent-blue-500 w-3 h-3"
                      />
                      <span className="truncate">{zoneSiteNames[siteId] || siteId}</span>
                    </label>
                  );
                })
              )}
            </div>
          )}

          {/* Save/Cancel buttons */}
          {hasChanges && (
            <div className="flex gap-1.5 pt-1">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 text-[10px] bg-blue-600 hover:bg-blue-700 text-white py-1 rounded transition-colors disabled:opacity-50"
              >
                {saving ? '...' : (t?.('common.save') || 'Save')}
              </button>
              <button
                onClick={handleCancel}
                className="text-[10px] th-text-muted hover:th-text-secondary px-2 py-1"
              >
                {t?.('common.cancel') || 'Cancel'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};


const ZoneMemberList = ({ zoneId, members = [], onUpdated, isGlobalAdmin, zoneSiteIds = [], zoneSiteNames = {} }) => {
  const [loading, setLoading] = useState(null);

  const handleRemove = async (email) => {
    if (!confirm(`Xóa ${email} khỏi zone?`)) return;
    setLoading(`remove-${email}`);
    try {
      await apiClient.delete(`/zones/${zoneId}/members/${encodeURIComponent(email)}`);
      onUpdated?.();
    } catch (err) {
      console.error('Remove failed:', err);
    } finally {
      setLoading(null);
    }
  };

  if (!members.length) {
    return <p className="text-xs text-slate-500 py-2 px-1">Chưa có thành viên nào.</p>;
  }

  return (
    <div className="space-y-1">
      {members.map((m) => (
        <div
          key={m.email}
          className="py-1.5 px-2 rounded th-bg-surface-alt group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs th-text-secondary truncate flex-1 mr-2">{m.email}</span>
            <div className="flex items-center gap-2 shrink-0">
              <ZoneRoleBadge role={m.zone_role} />
              {isGlobalAdmin && (
                <button
                  onClick={() => handleRemove(m.email)}
                  disabled={loading === `remove-${m.email}`}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-slate-500 hover:text-rose-400"
                  title={`Xóa ${m.email}`}
                >
                  <UserMinus className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
          {/* Site-level permission */}
          {isGlobalAdmin && (
            <SitePermissionToggle
              zoneId={zoneId}
              member={m}
              zoneSiteIds={zoneSiteIds}
              zoneSiteNames={zoneSiteNames}
              onUpdated={onUpdated}
            />
          )}
        </div>
      ))}
    </div>
  );
};

export default ZoneMemberList;
