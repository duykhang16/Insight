import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import apiClient from '../../api/apiClient';

const CALLER_ZONE_ROLES = {
    brand_admin: ['admin', 'viewer', 'delegator'],
    admin: ['viewer', 'delegator'],
};

const CALLER_SITE_ROLES = {
    brand_admin: ['viewer', 'delegator'],
    admin: ['viewer', 'delegator'],
};

const createAssignment = (zoneId, zoneName, zoneRole, allSites, allowedSiteIds = []) => ({
    zone_id: zoneId,
    zone_name: zoneName,
    zone_role: zoneRole,
    all_sites: allSites,
    allowed_site_ids: allowedSiteIds,
    site_role_overrides: {},
});

const UserAssignmentsModal = ({
    currentUserEmail,
    currentUserRole,
    targetUser,
    onClose,
    onSaved,
    t,
}) => {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [scopeSearch, setScopeSearch] = useState('');
    const [assignedSearch, setAssignedSearch] = useState('');
    const [scopeZones, setScopeZones] = useState([]);
    const [assignedZones, setAssignedZones] = useState([]);

    const scopeOwnerEmail = useMemo(() => {
        if (currentUserRole === 'admin') {
            return currentUserEmail;
        }
        if (currentUserRole === 'brand_admin' && ['viewer', 'delegator'].includes(targetUser?.role)) {
            return targetUser?.parent_admin_id || '';
        }
        return currentUserEmail;
    }, [currentUserRole, currentUserEmail, targetUser]);

    const allowedZoneRoles = useMemo(
        () => CALLER_ZONE_ROLES[currentUserRole] || ['viewer'],
        [currentUserRole]
    );
    const allowedSiteRoles = useMemo(
        () => CALLER_SITE_ROLES[currentUserRole] || ['viewer'],
        [currentUserRole]
    );

    const assignmentLookup = useMemo(
        () => new Map(assignedZones.map((entry) => [entry.zone_id, entry])),
        [assignedZones]
    );

    const loadData = useCallback(async () => {
        if (!targetUser) return;
        setLoading(true);
        setError('');
        try {
            const zoneEndpoint = currentUserRole === 'brand_admin' ? '/zones' : '/zones/my';
            const [assignmentRes, zonesResult, sitesResult] = await Promise.all([
                apiClient.get(`/admin/users/${targetUser.id}/assignments`),
                apiClient.get(zoneEndpoint),
                apiClient.get('/cloner/live-sites'),
            ]);

            const currentAssignments = assignmentRes.data?.assignments || [];
            const zoneList = zonesResult.data || [];
            const liveSites = sitesResult.data || [];
            const siteNameMap = new Map(liveSites.map((site) => [site.siteId, site.siteName || site.siteId]));

            const zoneDetails = await Promise.all(
                zoneList.map((zone) =>
                    apiClient.get(`/zones/${zone.id}`)
                        .then((res) => res.data)
                        .catch(() => zone)
                )
            );

            const normalizedZones = zoneDetails
                .map((zone) => {
                    const zoneSiteIds = Array.from(new Set(zone.site_ids || []));
                    const callerMembership = (zone.members || []).find((member) => member.email === scopeOwnerEmail);

                    if (scopeOwnerEmail && scopeOwnerEmail !== currentUserEmail) {
                        if (!callerMembership || callerMembership.zone_role !== 'admin') {
                            return null;
                        }
                    } else if (currentUserRole === 'admin') {
                        if (!callerMembership || callerMembership.zone_role !== 'admin') {
                            return null;
                        }
                    }

                    const controlledSiteIds = (currentUserRole === 'admin' || scopeOwnerEmail !== currentUserEmail)
                        ? (
                            callerMembership?.all_sites
                                ? zoneSiteIds
                                : zoneSiteIds.filter((siteId) => (callerMembership?.allowed_site_ids || []).includes(siteId))
                        )
                        : zoneSiteIds;

                    return {
                        zoneId: zone.id,
                        zoneName: zone.name || zone.id,
                        sites: controlledSiteIds.map((siteId) => ({
                            siteId,
                            siteName: siteNameMap.get(siteId) || siteId,
                        })),
                    };
                })
                .filter(Boolean)
                .sort((a, b) => a.zoneName.localeCompare(b.zoneName));

            const normalizedAssignments = currentAssignments.map((entry) => {
                const zone = normalizedZones.find((item) => item.zoneId === entry.zone_id);
                return {
                    zone_id: entry.zone_id,
                    zone_name: zone?.zoneName || entry.zone_id,
                    zone_role: entry.zone_role,
                    all_sites: !!entry.all_sites,
                    allowed_site_ids: entry.allowed_site_ids || [],
                    site_role_overrides: Object.fromEntries(
                        (entry.site_role_overrides || []).map((item) => [item.site_id, item.zone_role])
                    ),
                };
            });

            setScopeZones(normalizedZones);
            setAssignedZones(normalizedAssignments);
        } catch (err) {
            setError(err.response?.data?.detail || t('admin.users.wizard_scope_load_failed'));
        } finally {
            setLoading(false);
        }
    }, [currentUserRole, currentUserEmail, scopeOwnerEmail, targetUser, t]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const filteredScopeZones = useMemo(() => {
        const query = scopeSearch.trim().toLowerCase();
        return scopeZones
            .map((zone) => {
                if (!query) return { ...zone, visibleSites: zone.sites };
                const zoneMatches = zone.zoneName.toLowerCase().includes(query);
                const visibleSites = zoneMatches
                    ? zone.sites
                    : zone.sites.filter((site) =>
                        site.siteName.toLowerCase().includes(query) || site.siteId.toLowerCase().includes(query)
                    );
                if (!zoneMatches && visibleSites.length === 0) return null;
                return { ...zone, visibleSites };
            })
            .filter(Boolean);
    }, [scopeSearch, scopeZones]);

    const assignedScopeItems = useMemo(
        () => assignedZones
            .slice()
            .sort((a, b) => a.zone_name.localeCompare(b.zone_name))
            .flatMap((entry) => {
                const zone = scopeZones.find((item) => item.zoneId === entry.zone_id);
                const selectedSites = entry.all_sites
                    ? (zone?.sites || [])
                    : (zone?.sites || []).filter((site) => entry.allowed_site_ids.includes(site.siteId));

                if (entry.all_sites) {
                    return [{ type: 'zone', entry, selectedSites }];
                }

                return selectedSites.map((site) => ({
                    type: 'site',
                    entry,
                    site,
                    effectiveRole: (entry.site_role_overrides || {})[site.siteId] || entry.zone_role,
                }));
            }),
        [assignedZones, scopeZones]
    );

    const filteredAssignedScopeItems = useMemo(() => {
        const query = assignedSearch.trim().toLowerCase();
        if (!query) {
            return assignedScopeItems;
        }
        return assignedScopeItems.filter((item) => {
            if (item.type === 'zone') {
                return item.entry.zone_name.toLowerCase().includes(query);
            }
            return (
                item.entry.zone_name.toLowerCase().includes(query) ||
                item.site.siteName.toLowerCase().includes(query) ||
                item.site.siteId.toLowerCase().includes(query)
            );
        });
    }, [assignedScopeItems, assignedSearch]);

    const handleAddZone = (zone) => {
        const defaultRole = allowedZoneRoles[0] || 'viewer';
        setAssignedZones((prev) => {
            const existing = prev.find((entry) => entry.zone_id === zone.zoneId);
            if (existing?.all_sites) return prev;
            if (existing) {
                return prev.map((entry) => (
                    entry.zone_id === zone.zoneId
                        ? { ...entry, all_sites: true, allowed_site_ids: [], zone_role: defaultRole, site_role_overrides: {} }
                        : entry
                ));
            }
            return [...prev, createAssignment(zone.zoneId, zone.zoneName, defaultRole, true)];
        });
    };

    const handleAddSite = (zone, site) => {
        const defaultRole = allowedSiteRoles[0] || 'viewer';
        setAssignedZones((prev) => {
            const existing = prev.find((entry) => entry.zone_id === zone.zoneId);
            if (existing?.all_sites) return prev;
            if (existing) {
                if (existing.allowed_site_ids.includes(site.siteId)) return prev;
                return prev.map((entry) => (
                    entry.zone_id === zone.zoneId
                        ? {
                            ...entry,
                            zone_role: allowedZoneRoles.includes(entry.zone_role) ? entry.zone_role : defaultRole,
                            allowed_site_ids: [...entry.allowed_site_ids, site.siteId],
                            site_role_overrides: {
                                ...entry.site_role_overrides,
                                [site.siteId]: entry.site_role_overrides?.[site.siteId] || defaultRole,
                            },
                        }
                        : entry
                ));
            }
            return [...prev, createAssignment(zone.zoneId, zone.zoneName, defaultRole, false, [site.siteId])];
        });
    };

    const handleRemoveAssignment = (zoneId) => {
        setAssignedZones((prev) => prev.filter((entry) => entry.zone_id !== zoneId));
    };

    const handleRemoveSite = (zoneId, siteId) => {
        setAssignedZones((prev) => prev.flatMap((entry) => {
            if (entry.zone_id !== zoneId || entry.all_sites) return [entry];
            const nextSiteIds = entry.allowed_site_ids.filter((id) => id !== siteId);
            if (!nextSiteIds.length) return [];
            const nextOverrides = { ...(entry.site_role_overrides || {}) };
            delete nextOverrides[siteId];
            return [{
                ...entry,
                allowed_site_ids: nextSiteIds,
                site_role_overrides: nextOverrides,
            }];
        }));
    };

    const handleZoneRoleChange = (zoneId, role) => {
        setAssignedZones((prev) => prev.map((entry) => (
            entry.zone_id === zoneId ? { ...entry, zone_role: role } : entry
        )));
    };

    const handleSiteRoleChange = (zoneId, siteId, role) => {
        setAssignedZones((prev) => prev.map((entry) => (
            entry.zone_id === zoneId
                ? {
                    ...entry,
                    site_role_overrides: {
                        ...(entry.site_role_overrides || {}),
                        [siteId]: role,
                    },
                }
                : entry
        )));
    };

    const handleSave = async () => {
        setSaving(true);
        setError('');
        try {
            await apiClient.put(`/admin/users/${targetUser.id}/assignments`, {
                assignments: assignedZones.map((entry) => ({
                    zone_id: entry.zone_id,
                    zone_role: entry.zone_role,
                    all_sites: entry.all_sites,
                    allowed_site_ids: entry.allowed_site_ids,
                    site_role_overrides: Object.entries(entry.site_role_overrides || {}).map(([site_id, zone_role]) => ({
                        site_id,
                        zone_role,
                    })),
                })),
            });
            onSaved?.();
        } catch (err) {
            setError(err.response?.data?.detail || t('admin.users.error_update_failed'));
        } finally {
            setSaving(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center px-4 py-8 overflow-y-auto">
            <div className="w-full max-w-6xl th-bg-surface border th-border rounded-2xl shadow-2xl overflow-hidden">
                <div className="flex items-start justify-between gap-4 px-6 py-5 border-b th-border">
                    <div>
                        <h2 className="text-base font-semibold th-text-primary">{t('admin.users.scope_modal_title') || 'Quản lý zone/site của user'}</h2>
                        <p className="text-sm th-text-secondary mt-1">
                            <span className="font-medium th-text-primary">{targetUser?.email}</span>
                            {' · '}
                            {targetUser?.role}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-2 rounded-lg hover:bg-slate-700/60 th-text-secondary transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="p-6 space-y-4">
                    {error && (
                        <div className="text-sm text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-lg px-4 py-3">
                            {error}
                        </div>
                    )}

                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 min-h-[460px]">
                        <div className="th-bg-elevated border th-border rounded-xl p-4 flex flex-col min-h-0">
                            <div className="mb-3">
                                <h3 className="text-sm font-semibold th-text-primary">{t('admin.users.wizard_available_scope_title')}</h3>
                                <p className="text-[11px] text-slate-500 mt-1">{t('admin.users.wizard_available_scope_hint')}</p>
                            </div>
                            <input
                                type="text"
                                value={scopeSearch}
                                onChange={(e) => setScopeSearch(e.target.value)}
                                placeholder={t('admin.users.wizard_scope_search_placeholder')}
                                className="w-full th-bg-surface border th-border rounded-lg px-3 py-2 text-sm th-text-primary mb-3 focus:outline-none focus:border-blue-500"
                            />
                            <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1 custom-scrollbar">
                                {loading ? (
                                    <div className="text-sm text-slate-500 py-6 text-center">{t('admin.users.wizard_scope_loading')}</div>
                                ) : filteredScopeZones.length === 0 ? (
                                    <div className="text-sm text-slate-500 py-6 text-center">
                                        {scopeSearch.trim() ? t('admin.users.wizard_scope_empty_filtered') : t('admin.users.wizard_scope_empty')}
                                    </div>
                                ) : filteredScopeZones.map((zone) => {
                                    const assignment = assignmentLookup.get(zone.zoneId);
                                    return (
                                        <div key={zone.zoneId} className="rounded-xl border th-border th-bg-surface-alt p-3 space-y-3">
                                            <div className="flex items-center justify-between gap-3">
                                                <div>
                                                    <div className="text-sm font-semibold th-text-primary">{zone.zoneName}</div>
                                                    <div className="text-[11px] text-slate-500">{zone.sites.length} site</div>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => handleAddZone(zone)}
                                                    className="px-3 py-1.5 text-xs rounded-lg bg-blue-600/15 text-blue-400 hover:bg-blue-600/25 transition-colors"
                                                >
                                                    {assignment?.all_sites ? t('admin.users.wizard_all_sites_added') : t('admin.users.wizard_add_zone')}
                                                </button>
                                            </div>
                                            {zone.visibleSites.length === 0 ? (
                                                <p className="text-xs text-slate-500">{t('admin.users.wizard_scope_no_sites')}</p>
                                            ) : (
                                                <div className="space-y-2">
                                                    {zone.visibleSites.map((site) => {
                                                        const siteAssigned = assignment?.all_sites || assignment?.allowed_site_ids?.includes(site.siteId);
                                                        return (
                                                            <div key={site.siteId} className="flex items-center justify-between gap-3 rounded-lg border th-border px-3 py-2">
                                                                <div className="min-w-0">
                                                                    <div className="text-sm th-text-primary truncate">{site.siteName}</div>
                                                                    <div className="text-[11px] text-slate-500 truncate">{site.siteId}</div>
                                                                </div>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleAddSite(zone, site)}
                                                                    disabled={siteAssigned}
                                                                    className="px-3 py-1.5 text-xs rounded-lg bg-slate-700 text-slate-200 hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed"
                                                                >
                                                                    {siteAssigned ? t('common.done') : t('admin.users.wizard_add_site')}
                                                                </button>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="th-bg-elevated border th-border rounded-xl p-4 flex flex-col min-h-0">
                            <div className="mb-3">
                                <h3 className="text-sm font-semibold th-text-primary">{t('admin.users.scope_modal_current_title') || t('admin.users.wizard_assigned_scope_title')}</h3>
                                <p className="text-[11px] text-slate-500 mt-1">{t('admin.users.scope_modal_current_hint') || t('admin.users.wizard_assigned_scope_hint')}</p>
                            </div>
                            <input
                                type="text"
                                value={assignedSearch}
                                onChange={(e) => setAssignedSearch(e.target.value)}
                                placeholder={t('admin.users.scope_modal_current_search_placeholder') || t('admin.users.wizard_scope_search_placeholder')}
                                className="w-full th-bg-surface border th-border rounded-lg px-3 py-2 text-sm th-text-primary mb-3 focus:outline-none focus:border-blue-500"
                            />
                            <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1 custom-scrollbar">
                                {filteredAssignedScopeItems.length === 0 ? (
                                    <div className="text-sm text-slate-500 py-6 text-center">{t('admin.users.wizard_assigned_scope_empty')}</div>
                                ) : filteredAssignedScopeItems.map((item) => {
                                    if (item.type === 'zone') {
                                        return (
                                            <div key={`zone-${item.entry.zone_id}`} className="rounded-xl border th-border th-bg-surface-alt p-3 space-y-3">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div>
                                                        <div className="text-sm font-semibold th-text-primary">{item.entry.zone_name}</div>
                                                        <div className="text-[11px] text-slate-500">{t('admin.users.wizard_assignment_all_sites')}</div>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemoveAssignment(item.entry.zone_id)}
                                                        className="text-xs text-rose-400 hover:text-rose-300"
                                                    >
                                                        {t('admin.users.scope_modal_remove_button') || 'Remove'}
                                                    </button>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs text-slate-400">{t('admin.users.table_role')}</span>
                                                    <select
                                                        value={item.entry.zone_role}
                                                        onChange={(e) => handleZoneRoleChange(item.entry.zone_id, e.target.value)}
                                                        className="th-bg-surface border th-border rounded-lg px-3 py-2 text-sm th-text-primary"
                                                    >
                                                        {allowedZoneRoles.map((role) => (
                                                            <option key={role} value={role}>{role}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </div>
                                        );
                                    }

                                    return (
                                        <div key={`site-${item.entry.zone_id}-${item.site.siteId}`} className="rounded-xl border th-border th-bg-surface-alt p-3 space-y-3">
                                            <div className="flex items-start justify-between gap-3">
                                                <div>
                                                    <div className="text-sm font-semibold th-text-primary">{item.site.siteName}</div>
                                                    <div className="text-[11px] text-slate-500">{item.entry.zone_name}</div>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveSite(item.entry.zone_id, item.site.siteId)}
                                                    className="text-xs text-rose-400 hover:text-rose-300"
                                                >
                                                    {t('admin.users.scope_modal_remove_button') || 'Remove'}
                                                </button>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-slate-400">{t('admin.users.table_role')}</span>
                                                <select
                                                    value={item.effectiveRole}
                                                    onChange={(e) => handleSiteRoleChange(item.entry.zone_id, item.site.siteId, e.target.value)}
                                                    className="th-bg-surface border th-border rounded-lg px-3 py-2 text-sm th-text-primary"
                                                >
                                                    {allowedSiteRoles.map((role) => (
                                                        <option key={role} value={role}>{role}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="px-6 py-4 border-t th-border flex items-center justify-between gap-3">
                    <p className="text-xs text-slate-500">
                        {t('admin.users.scope_modal_footer') || 'Chỉ có thể gán zone/site trong phạm vi bạn được quyền quản lý.'}
                    </p>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-sm rounded-lg bg-slate-700 hover:bg-slate-600 th-text-secondary transition-colors"
                        >
                            {t('admin.users.cancel')}
                        </button>
                        <button
                            type="button"
                            onClick={handleSave}
                            disabled={saving}
                            className="px-4 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 th-text-primary transition-colors disabled:opacity-50"
                        >
                            {saving ? (t('admin.users.saving_button') || 'Saving...') : (t('admin.users.save_scope_button') || 'Lưu phạm vi')}
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default UserAssignmentsModal;
