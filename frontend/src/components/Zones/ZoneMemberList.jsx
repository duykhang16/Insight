import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { UserMinus, Globe, MapPin, ChevronDown, ChevronUp, Check, X } from 'lucide-react';
import ZoneRoleBadge from './ZoneRoleBadge';
import apiClient from '../../api/apiClient';
import { useLanguage } from '../../context/LanguageContext';
const ZONE_ROLE_OPTIONS = ['admin', 'viewer', 'delegator'];
const SITE_ROLE_OPTIONS = ['viewer', 'delegator'];

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SitePermissionToggle = ({
  zoneId,
  member,
  zoneSiteIds = [],
  zoneSiteNames = {},
  onUpdated,
  allUsers = [],
  onAllSitesPreview,
}) => {
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [allSites, setAllSites] = useState(member.all_sites ?? true);
  const [selectedSites, setSelectedSites] = useState(member.allowed_site_ids || []);
  const [siteRoles, setSiteRoles] = useState(
    Object.fromEntries((member.site_role_overrides || []).map((item) => [item.site_id, item.zone_role]))
  );
  const [hasChanges, setHasChanges] = useState(false);
  const [showReplacementModal, setShowReplacementModal] = useState(false);
  const [replacementMode, setReplacementMode] = useState('existing');
  const [replacementExistingEmail, setReplacementExistingEmail] = useState('');
  const [replacementNewEmail, setReplacementNewEmail] = useState('');
  const getEffectiveSiteRole = (siteId) => siteRoles[siteId] || (member.zone_role === 'admin' ? 'viewer' : member.zone_role);
  const replacementCandidates = allUsers.filter((user) => {
    const email = String(user?.email || '').trim().toLowerCase();
    const role = String(user?.role || '').trim().toLowerCase();
    return email && email !== member.email.toLowerCase() && role !== 'brand_admin' && role !== 'super_admin';
  });
  const normalizedReplacementNewEmail = replacementNewEmail.trim().toLowerCase();
  const replacementNewEmailExists = replacementCandidates.some((user) => user.email.toLowerCase() === normalizedReplacementNewEmail);
  const replacementNewEmailValid = EMAIL_REGEX.test(normalizedReplacementNewEmail);

  // Reset on member data change
  useEffect(() => {
    setAllSites(member.all_sites ?? true);
    setSelectedSites(member.allowed_site_ids || []);
    setSiteRoles(Object.fromEntries((member.site_role_overrides || []).map((item) => [item.site_id, item.zone_role])));
    setHasChanges(false);
    setShowReplacementModal(false);
    setReplacementMode('existing');
    setReplacementExistingEmail('');
    setReplacementNewEmail('');
    onAllSitesPreview?.(member.email, member.all_sites ?? true);
  }, [member.all_sites, member.allowed_site_ids, member.site_role_overrides]);

  const handleToggleAllSites = (val) => {
    if (!val && allSites && member.zone_role === 'admin') {
      setShowReplacementModal(true);
      return;
    }
    setAllSites(val);
    if (val) {
      setSelectedSites([]);
      setSiteRoles({});
      setReplacementExistingEmail('');
      setReplacementNewEmail('');
    }
    onAllSitesPreview?.(member.email, val);
    setHasChanges(true);
  };

  const handleReplacementConfirm = () => {
    const selectedEmail = replacementMode === 'existing'
      ? replacementExistingEmail.trim().toLowerCase()
      : normalizedReplacementNewEmail;

    if (!selectedEmail) return;
    if (replacementMode === 'new' && (!replacementNewEmailValid || replacementNewEmailExists)) return;

    setShowReplacementModal(false);
    setAllSites(false);
    setSelectedSites([]);
    setSiteRoles({});
    setReplacementExistingEmail(replacementMode === 'existing' ? selectedEmail : '');
    setReplacementNewEmail(replacementMode === 'new' ? selectedEmail : '');
    onAllSitesPreview?.(member.email, false);
    setHasChanges(true);
  };

  const handleReplacementCancel = () => {
    setShowReplacementModal(false);
    setReplacementMode('existing');
    setReplacementExistingEmail('');
    setReplacementNewEmail('');
  };

  const handleToggleSite = (siteId) => {
    setSelectedSites(prev => {
      const next = prev.includes(siteId)
        ? prev.filter(id => id !== siteId)
        : [...prev, siteId];
      setSiteRoles(current => {
        if (next.includes(siteId)) {
          return { ...current, [siteId]: current[siteId] || (member.zone_role === 'admin' ? 'viewer' : member.zone_role) };
        }
        const copy = { ...current };
        delete copy[siteId];
        return copy;
      });
      setHasChanges(true);
      return next;
    });
  };

  const handleSiteRoleChange = (siteId, zoneRole) => {
    setSiteRoles(prev => ({ ...prev, [siteId]: zoneRole }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiClient.put(`/zones/${zoneId}/members/${encodeURIComponent(member.email)}/sites`, {
        all_sites: allSites,
        allowed_site_ids: allSites ? [] : selectedSites,
        site_role_overrides: allSites
          ? []
          : selectedSites.map((siteId) => ({
              site_id: siteId,
              zone_role: getEffectiveSiteRole(siteId),
            })),
        replacement_admin_email: allSites ? undefined : (replacementExistingEmail || normalizedReplacementNewEmail || undefined),
      });
      setHasChanges(false);
      setReplacementExistingEmail('');
      setReplacementNewEmail('');
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
    setSiteRoles(Object.fromEntries((member.site_role_overrides || []).map((item) => [item.site_id, item.zone_role])));
    setReplacementExistingEmail('');
    setReplacementNewEmail('');
    onAllSitesPreview?.(member.email, member.all_sites ?? true);
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
                    <div
                      key={siteId}
                      className={`flex items-center gap-2 px-1.5 py-1 rounded text-[11px] transition-colors ${
                        isChecked ? 'th-bg-surface-alt th-text-primary' : 'th-text-muted hover:th-bg-surface-alt'
                      }`}
                    >
                      <label className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleSite(siteId)}
                          className="accent-blue-500 w-3 h-3"
                        />
                        <span className="truncate">{zoneSiteNames[siteId] || siteId}</span>
                      </label>
                      {isChecked && (
                        <select
                          value={getEffectiveSiteRole(siteId)}
                          onChange={(e) => handleSiteRoleChange(siteId, e.target.value)}
                          className="w-24 text-[10px] th-bg-elevated border th-border rounded px-1.5 py-1 th-text-primary focus:outline-none focus:border-blue-500"
                        >
                          {SITE_ROLE_OPTIONS.map((role) => (
                            <option key={role} value={role}>
                              {t(`admin.zones.role_${role}`) || role}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
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

      {showReplacementModal && createPortal(
        <div className="fixed inset-0 z-[100] flex items-start justify-center bg-slate-950/70 px-4 pt-16 pb-6">
          <div
            className="w-full max-w-xl rounded-2xl border th-border th-bg-surface shadow-2xl"
            style={{ backgroundColor: 'var(--color-bg-surface)', borderColor: 'var(--color-border)' }}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b th-border" style={{ borderColor: 'var(--color-border)' }}>
              <div>
                <h3 className="text-lg font-semibold th-text-primary">
                  {t?.('admin.zones.replace_admin_title') || 'Choose Replacement Admin'}
                </h3>
                <p className="text-sm th-text-muted mt-1">
                  {t?.('admin.zones.replace_admin_hint') || 'Before switching this zone admin to specific sites, choose who will inherit full zone admin authority.'}
                </p>
              </div>
              <button
                onClick={handleReplacementCancel}
                className="p-2 rounded-lg th-text-muted hover:th-text-secondary hover:th-bg-surface-alt transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setReplacementMode('existing')}
                  className={`rounded-lg px-3 py-2 text-sm border transition-colors ${
                    replacementMode === 'existing'
                      ? 'border-blue-500 bg-blue-500/10 text-blue-300'
                      : 'th-border th-text-muted hover:th-text-secondary'
                  }`}
                  style={replacementMode === 'existing' ? undefined : { borderColor: 'var(--color-border)' }}
                >
                  {t?.('admin.zones.replace_admin_existing') || 'Use existing user'}
                </button>
                <button
                  type="button"
                  onClick={() => setReplacementMode('new')}
                  className={`rounded-lg px-3 py-2 text-sm border transition-colors ${
                    replacementMode === 'new'
                      ? 'border-blue-500 bg-blue-500/10 text-blue-300'
                      : 'th-border th-text-muted hover:th-text-secondary'
                  }`}
                  style={replacementMode === 'new' ? undefined : { borderColor: 'var(--color-border)' }}
                >
                  {t?.('admin.zones.replace_admin_new') || 'Create new admin'}
                </button>
              </div>

              {replacementMode === 'existing' ? (
                <div className="space-y-2">
                  <label className="text-sm th-text-secondary">
                    {t?.('admin.zones.replace_admin_existing_label') || 'Existing user'}
                  </label>
                  <select
                    value={replacementExistingEmail}
                    onChange={(e) => setReplacementExistingEmail(e.target.value)}
                    className="w-full rounded-xl border th-border th-bg-elevated px-3 py-2.5 th-text-primary focus:outline-none focus:border-blue-500"
                    style={{ backgroundColor: 'var(--color-bg-elevated)', borderColor: 'var(--color-border)' }}
                  >
                    <option value="">{t?.('admin.zones.replace_admin_existing_placeholder') || 'Select a user...'}</option>
                    {replacementCandidates.map((user) => (
                      <option key={user.email} value={user.email}>
                        {user.email} ({user.role})
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="text-sm th-text-secondary">
                    {t?.('admin.zones.replace_admin_new_label') || 'New admin email'}
                  </label>
                  <input
                    type="email"
                    value={replacementNewEmail}
                    onChange={(e) => setReplacementNewEmail(e.target.value)}
                    placeholder={t?.('admin.zones.replace_admin_new_placeholder') || 'new-admin@brand.com'}
                    className="w-full rounded-xl border th-border th-bg-elevated px-3 py-2.5 th-text-primary focus:outline-none focus:border-blue-500"
                    style={{ backgroundColor: 'var(--color-bg-elevated)', borderColor: 'var(--color-border)' }}
                  />
                  {replacementNewEmail && !replacementNewEmailValid && (
                    <p className="text-xs text-rose-400">
                      {t?.('admin.zones.replace_admin_invalid_email') || 'Replacement admin email is not valid.'}
                    </p>
                  )}
                  {replacementNewEmailValid && replacementNewEmailExists && (
                    <p className="text-xs text-amber-400">
                      {t?.('admin.zones.replace_admin_email_exists') || 'This email already exists. Choose it from the existing list instead.'}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 px-5 py-4 border-t th-border" style={{ borderColor: 'var(--color-border)' }}>
              <button
                type="button"
                onClick={handleReplacementCancel}
                className="rounded-xl px-4 py-2 text-sm th-text-muted hover:th-text-secondary transition-colors"
              >
                {t?.('common.cancel') || 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handleReplacementConfirm}
                disabled={
                  replacementMode === 'existing'
                    ? !replacementExistingEmail
                    : (!replacementNewEmailValid || replacementNewEmailExists)
                }
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {t?.('common.continue') || 'Continue'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};


const ScopeBadge = ({ allSites, role, t }) => {
  if (!allSites) {
    return (
      <span className="text-xs rounded px-2 py-1 border border-amber-500/30 bg-amber-500/10 text-amber-300">
        {t?.('zones.specific_sites') || 'Specific Sites'}
      </span>
    );
  }

  return <ZoneRoleBadge role={role} />;
};

const ZoneMemberList = ({
  zoneId,
  members = [],
  onUpdated,
  isGlobalAdmin,
  zoneSiteIds = [],
  zoneSiteNames = {},
  protectedEmail = '',
  allUsers = [],
}) => {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(null);
  const [roleSaving, setRoleSaving] = useState(null);
  const [allSitesPreview, setAllSitesPreview] = useState({});

  useEffect(() => {
    setAllSitesPreview({});
  }, [members]);

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

  const handleRoleChange = async (email, zoneRole) => {
    setRoleSaving(email);
    try {
      await apiClient.put(`/zones/${zoneId}/members/${encodeURIComponent(email)}`, {
        zone_role: zoneRole,
      });
      onUpdated?.();
    } catch (err) {
      console.error('Update zone role failed:', err);
    } finally {
      setRoleSaving(null);
    }
  };

  if (!members.length) {
    return <p className="text-xs text-slate-500 py-2 px-1">Chưa có thành viên nào.</p>;
  }

  return (
    <div className="space-y-1">
      {members.map((m) => {
        const isProtectedMember = protectedEmail && m.email.toLowerCase() === protectedEmail.toLowerCase();
        const displayAllSites = allSitesPreview[m.email] ?? (m.all_sites ?? true);
        return (
        <div
          key={m.email}
          className="py-1.5 px-2 rounded th-bg-surface-alt group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs th-text-secondary truncate flex-1 mr-2">{m.email}</span>
            <div className="flex items-center gap-2 shrink-0">
              {isGlobalAdmin && !isProtectedMember && displayAllSites ? (
                <select
                  value={m.zone_role}
                  onChange={(e) => handleRoleChange(m.email, e.target.value)}
                  disabled={roleSaving === m.email}
                  className="text-xs th-bg-elevated border th-border rounded px-2 py-1 th-text-primary focus:outline-none focus:border-blue-500 disabled:opacity-50"
                >
                  {ZONE_ROLE_OPTIONS.map((role) => (
                    <option key={role} value={role}>
                      {t(`admin.zones.role_${role}`) || role}
                    </option>
                  ))}
                </select>
              ) : (
                <BadgeOrProtectedLabel
                  isProtectedMember={isProtectedMember}
                  role={m.zone_role}
                  allSites={displayAllSites}
                  t={t}
                />
              )}
              {isGlobalAdmin && !isProtectedMember && (
                <button
                  onClick={() => handleRemove(m.email)}
                  disabled={loading === `remove-${m.email}` || roleSaving === m.email}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-slate-500 hover:text-rose-400"
                  title={`Xóa ${m.email}`}
                >
                  <UserMinus className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
          {/* Site-level permission */}
          {isGlobalAdmin && !isProtectedMember && (
            <SitePermissionToggle
              zoneId={zoneId}
              member={m}
              zoneSiteIds={zoneSiteIds}
              zoneSiteNames={zoneSiteNames}
              onUpdated={onUpdated}
              allUsers={allUsers}
              onAllSitesPreview={(email, value) => setAllSitesPreview((prev) => ({ ...prev, [email]: value }))}
            />
          )}
        </div>
        );
      })}
    </div>
  );
};

const BadgeOrProtectedLabel = ({ isProtectedMember, role, allSites, t }) => {
  if (isProtectedMember) {
    return (
      <span className="text-xs rounded px-2 py-1 border border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
        Brand Admin
      </span>
    );
  }

  return <ScopeBadge allSites={allSites} role={role} t={t} />;
};

export default ZoneMemberList;
