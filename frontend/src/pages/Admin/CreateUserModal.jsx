import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Badge } from '@/components/ui/badge';
import { X } from 'lucide-react';
import apiClient from '../../api/apiClient';

const ROLE_LABEL = {
    admin: 'Admin',
    viewer: 'Viewer',
    delegator: 'Delegator',
};

const CREATE_ROLE_OPTIONS_BY_CALLER = {
    brand_admin: ['admin', 'viewer', 'delegator'],
    admin: ['viewer', 'delegator'],
};

const SITE_ROLE_OPTIONS_BY_CALLER = {
    brand_admin: ['viewer', 'delegator'],
    admin: ['viewer', 'delegator'],
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const getDomain = (email) => {
    const index = email.indexOf('@');
    return index >= 0 ? email.slice(index) : '';
};

const createAssignment = (zoneId, zoneName, zoneRole, allSites, allowedSiteIds = []) => ({
    zone_id: zoneId,
    zone_name: zoneName,
    zone_role: zoneRole,
    all_sites: allSites,
    allowed_site_ids: allowedSiteIds,
    site_role_overrides: {},
});

const hasActiveAssignedAdmin = (zone, availableAdmins, currentUserEmail) => {
    const activeAdminLookup = new Map(
        (availableAdmins || []).map((user) => [
            String(user.email || '').trim().toLowerCase(),
            user,
        ])
    );
    const brandAdminEmail = String(zone.brand_admin_email || currentUserEmail || '').trim().toLowerCase();

    return (zone.members || []).some((member) => {
        const memberEmail = String(member.email || '').trim().toLowerCase();
        if (!memberEmail || memberEmail === brandAdminEmail) {
            return false;
        }
        if (member.zone_role !== 'admin') {
            return false;
        }

        const adminUser = activeAdminLookup.get(memberEmail);
        if (!adminUser) {
            return true;
        }

        return !!adminUser.isApproved && !adminUser.is_locked;
    });
};

function EmailInput({ value, onChange, existingEmails, placeholder }) {
    const [suggestions, setSuggestions] = useState([]);
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        const close = (event) => {
            if (ref.current && !ref.current.contains(event.target)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, []);

    const handleChange = (event) => {
        const nextValue = event.target.value;
        onChange(nextValue);
        if (nextValue.includes('@')) {
            const domain = getDomain(nextValue);
            const prefix = nextValue.split('@')[0].toLowerCase();
            const matches = existingEmails.filter(
                (email) =>
                    email !== nextValue &&
                    getDomain(email) === domain &&
                    email.split('@')[0].toLowerCase().startsWith(prefix)
            );
            setSuggestions(matches.slice(0, 6));
            setOpen(matches.length > 0);
            return;
        }
        setSuggestions([]);
        setOpen(false);
    };

    return (
        <div ref={ref} className="relative">
            <input
                type="email"
                required
                value={value}
                onChange={handleChange}
                onFocus={() => {
                    if (suggestions.length) {
                        setOpen(true);
                    }
                }}
                className="w-full th-bg-elevated border border-slate-600 th-text-primary rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                placeholder={placeholder}
                autoComplete="off"
            />
            {open && (
                <ul className="absolute top-full left-0 right-0 mt-1 th-bg-elevated border th-border rounded shadow-xl z-50 max-h-40 overflow-y-auto">
                    {suggestions.map((suggestion) => (
                        <li
                            key={suggestion}
                            className="px-3 py-2 text-sm th-text-secondary hover:bg-slate-700 cursor-pointer"
                            onMouseDown={() => {
                                onChange(suggestion);
                                setOpen(false);
                            }}
                        >
                            {suggestion}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

const CreateUserModal = ({
    currentUserEmail,
    currentUserRole,
    existingEmails,
    availableAdmins = [],
    onClose,
    onCreated,
    t,
}) => {
    const [step, setStep] = useState(1);
    const [email, setEmail] = useState('');
    const [creating, setCreating] = useState(false);
    const [loadingScope, setLoadingScope] = useState(false);
    const [scopeError, setScopeError] = useState('');
    const [scopeSearch, setScopeSearch] = useState('');
    const [scopeZones, setScopeZones] = useState([]);
    const [assignedZones, setAssignedZones] = useState([]);
    const [parentAdminId, setParentAdminId] = useState('');
    const [checkingEmail, setCheckingEmail] = useState(false);
    const [emailExistsGlobal, setEmailExistsGlobal] = useState(false);
    const [validatedEmail, setValidatedEmail] = useState('');
    const emailCheckTimerRef = useRef(null);

    const creationUnderSelectedAdmin = currentUserRole === 'brand_admin' && !!parentAdminId;
    const creatingAdminAsBrandAdmin = currentUserRole === 'brand_admin' && !parentAdminId;
    const allowedZoneRoles = creationUnderSelectedAdmin
        ? ['viewer', 'delegator']
        : creatingAdminAsBrandAdmin
            ? ['admin']
            : (CREATE_ROLE_OPTIONS_BY_CALLER[currentUserRole] || ['viewer']);
    const allowedSiteRoles = creationUnderSelectedAdmin
        ? ['viewer', 'delegator']
        : creatingAdminAsBrandAdmin
            ? []
            : (SITE_ROLE_OPTIONS_BY_CALLER[currentUserRole] || ['viewer']);
    const defaultSiteRole = allowedSiteRoles[0] || 'viewer';
    const trimmedEmail = email.trim().toLowerCase();
    const isEmailValid = EMAIL_REGEX.test(trimmedEmail);
    const emailAlreadyExists = emailExistsGlobal || existingEmails.some((existingEmail) => existingEmail.toLowerCase() === trimmedEmail);
    const emailCheckPending = !!trimmedEmail && isEmailValid && validatedEmail !== trimmedEmail;

    const checkEmailAvailability = useCallback(async () => {
        const normalizedEmail = email.trim().toLowerCase();
        if (!EMAIL_REGEX.test(normalizedEmail)) {
            setEmailExistsGlobal(false);
            setValidatedEmail('');
            setScopeError('');
            return false;
        }

        setCheckingEmail(true);
        try {
            const response = await apiClient.post('/admin/users/check-email', { email: normalizedEmail });
            const available = !!response?.data?.available;
            setValidatedEmail(normalizedEmail);
            setEmailExistsGlobal(!available);
            if (!available) {
                setScopeError(response?.data?.message || t('admin.users.email_exists'));
                return true;
            }
            setScopeError('');
            return false;
        } catch (err) {
            setValidatedEmail(normalizedEmail);
            setEmailExistsGlobal(true);
            setScopeError(err?.response?.data?.detail || t('admin.users.email_exists'));
            return true;
        } finally {
            setCheckingEmail(false);
        }
    }, [email, t]);

    useEffect(() => {
        if (step !== 1) {
            return undefined;
        }

        if (emailCheckTimerRef.current) {
            clearTimeout(emailCheckTimerRef.current);
            emailCheckTimerRef.current = null;
        }

        if (!trimmedEmail) {
            setEmailExistsGlobal(false);
            setValidatedEmail('');
            setScopeError('');
            setCheckingEmail(false);
            return undefined;
        }

        if (!isEmailValid) {
            setEmailExistsGlobal(false);
            setValidatedEmail('');
            setScopeError('');
            setCheckingEmail(false);
            return undefined;
        }

        emailCheckTimerRef.current = setTimeout(() => {
            checkEmailAvailability();
        }, 250);

        return () => {
            if (emailCheckTimerRef.current) {
                clearTimeout(emailCheckTimerRef.current);
                emailCheckTimerRef.current = null;
            }
        };
    }, [step, trimmedEmail, isEmailValid, checkEmailAvailability]);

    const loadAssignableScope = useCallback(async () => {
        setLoadingScope(true);
        setScopeError('');

        try {
            const zoneEndpoint = currentUserRole === 'brand_admin' ? '/zones' : '/zones/my';
            const [zonesResult, sitesResult] = await Promise.allSettled([
                apiClient.get(zoneEndpoint),
                apiClient.get('/cloner/live-sites'),
            ]);

            if (zonesResult.status !== 'fulfilled') {
                throw zonesResult.reason;
            }

            const zoneList = zonesResult.value.data || [];
            const liveSites = sitesResult.status === 'fulfilled' ? (sitesResult.value.data || []) : [];
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
                    const scopeOwnerEmail = currentUserRole === 'brand_admin' && parentAdminId ? parentAdminId : currentUserEmail;
                    const callerMembership = (zone.members || []).find((member) => member.email === scopeOwnerEmail);

                    if (currentUserRole === 'admin' || (currentUserRole === 'brand_admin' && parentAdminId)) {
                        if (!callerMembership || callerMembership.zone_role !== 'admin') {
                            return null;
                        }
                    }

                    const controlledSiteIds = (currentUserRole === 'admin' || (currentUserRole === 'brand_admin' && parentAdminId))
                        ? (
                            callerMembership?.all_sites
                                ? zoneSiteIds
                                : zoneSiteIds.filter((siteId) => (callerMembership?.allowed_site_ids || []).includes(siteId))
                        )
                        : zoneSiteIds;

                    if (
                        currentUserRole === 'brand_admin' &&
                        !parentAdminId &&
                        hasActiveAssignedAdmin(zone, availableAdmins, currentUserEmail)
                    ) {
                        return null;
                    }

                    return {
                        zoneId: zone.id,
                        zoneName: zone.name || zone.id,
                        brand_admin_email: zone.brand_admin_email,
                        members: zone.members || [],
                        sites: controlledSiteIds.map((siteId) => ({
                            siteId,
                            siteName: siteNameMap.get(siteId) || siteId,
                        })),
                    };
                })
                .filter(Boolean)
                .sort((a, b) => a.zoneName.localeCompare(b.zoneName));

            setScopeZones(normalizedZones);
        } catch (err) {
            setScopeError(err.response?.data?.detail || t('admin.users.wizard_scope_load_failed'));
        } finally {
            setLoadingScope(false);
        }
    }, [availableAdmins, currentUserEmail, currentUserRole, parentAdminId, t]);

    useEffect(() => {
        loadAssignableScope();
    }, [loadAssignableScope]);

    const assignmentLookup = useMemo(
        () => new Map(assignedZones.map((entry) => [entry.zone_id, entry])),
        [assignedZones]
    );

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
                    return [{
                        type: 'zone',
                        entry,
                        selectedSites,
                    }];
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
    const inferredTargetRole = useMemo(() => {
        if (creationUnderSelectedAdmin) {
            if (
                assignedZones.some((entry) =>
                    entry.zone_role === 'delegator' ||
                    Object.values(entry.site_role_overrides || {}).includes('delegator')
                )
            ) {
                return 'delegator';
            }
            return 'viewer';
        }
        if (assignedZones.some((entry) => entry.zone_role === 'admin')) {
            return 'admin';
        }
        if (
            assignedZones.some((entry) =>
                entry.zone_role === 'delegator' ||
                Object.values(entry.site_role_overrides || {}).includes('delegator')
            )
        ) {
            return 'delegator';
        }
        return 'viewer';
    }, [assignedZones, creationUnderSelectedAdmin]);
    const sortedAvailableAdmins = useMemo(
        () => [...availableAdmins].sort((a, b) => a.email.localeCompare(b.email)),
        [availableAdmins]
    );

    const filteredScopeZones = useMemo(() => {
        const query = scopeSearch.trim().toLowerCase();
        return scopeZones
            .map((zone) => {
                if (!query) {
                    return { ...zone, visibleSites: zone.sites };
                }

                const zoneMatches = zone.zoneName.toLowerCase().includes(query);
                const visibleSites = zoneMatches
                    ? zone.sites
                    : zone.sites.filter((site) =>
                        site.siteName.toLowerCase().includes(query) || site.siteId.toLowerCase().includes(query)
                    );

                if (!zoneMatches && visibleSites.length === 0) {
                    return null;
                }

                return { ...zone, visibleSites };
            })
            .filter(Boolean);
    }, [scopeSearch, scopeZones]);

    const handleAddZone = (zone) => {
        setAssignedZones((prev) => {
            const existing = prev.find((entry) => entry.zone_id === zone.zoneId);
            if (existing?.all_sites) {
                return prev;
            }
            if (existing) {
                return prev.map((entry) => (
                    entry.zone_id === zone.zoneId
                        ? { ...entry, all_sites: true, allowed_site_ids: [] }
                        : entry
                ));
            }
            return [...prev, createAssignment(zone.zoneId, zone.zoneName, allowedZoneRoles[0], true)];
        });
    };

    const handleAddSite = (zone, site) => {
        if (creatingAdminAsBrandAdmin) {
            return;
        }
        setAssignedZones((prev) => {
            const existing = prev.find((entry) => entry.zone_id === zone.zoneId);
            if (existing?.all_sites) {
                return prev;
            }
            if (existing) {
                if (existing.allowed_site_ids.includes(site.siteId)) {
                    return prev;
                }
                return prev.map((entry) => (
                    entry.zone_id === zone.zoneId
                        ? {
                            ...entry,
                            allowed_site_ids: [...entry.allowed_site_ids, site.siteId],
                        }
                        : entry
                ));
            }
            return [...prev, createAssignment(zone.zoneId, zone.zoneName, defaultSiteRole, false, [site.siteId])];
        });
    };

    const handleRemoveAssignment = (zoneId) => {
        setAssignedZones((prev) => prev.filter((entry) => entry.zone_id !== zoneId));
    };

    const handleRemoveSite = (zoneId, siteId) => {
        setAssignedZones((prev) => prev.flatMap((entry) => {
            if (entry.zone_id !== zoneId || entry.all_sites) {
                return [entry];
            }
            const nextSiteIds = entry.allowed_site_ids.filter((id) => id !== siteId);
            if (nextSiteIds.length === 0) {
                return [];
            }
            const nextOverrides = { ...(entry.site_role_overrides || {}) };
            delete nextOverrides[siteId];
            return [{ ...entry, allowed_site_ids: nextSiteIds, site_role_overrides: nextOverrides }];
        }));
    };

    const handleRoleChange = (zoneId, nextRole) => {
        setAssignedZones((prev) => prev.map((entry) => {
            if (entry.zone_id !== zoneId) {
                return entry;
            }
            const nextOverrides = Object.fromEntries(
                Object.entries(entry.site_role_overrides || {}).filter(([, role]) => role !== nextRole)
            );
            return { ...entry, zone_role: nextRole, site_role_overrides: nextOverrides };
        }));
    };

    const handleSiteRoleChange = (zoneId, siteId, nextRole) => {
        setAssignedZones((prev) => prev.map((entry) => {
            if (entry.zone_id !== zoneId) {
                return entry;
            }
            const nextOverrides = { ...(entry.site_role_overrides || {}) };
            if (nextRole === entry.zone_role) {
                delete nextOverrides[siteId];
            } else {
                nextOverrides[siteId] = nextRole;
            }
            return {
                ...entry,
                site_role_overrides: nextOverrides,
            };
        }));
    };

    const handleSwitchToSpecificSites = (zoneId) => {
        setAssignedZones((prev) => prev.map((entry) => (
            entry.zone_id === zoneId
                ? {
                    ...entry,
                    zone_role: allowedSiteRoles.includes(entry.zone_role) ? entry.zone_role : defaultSiteRole,
                    all_sites: false,
                    allowed_site_ids: [],
                    site_role_overrides: {},
                }
                : entry
        )));
    };

    const handleSwitchToAllSites = (zoneId) => {
        setAssignedZones((prev) => prev.map((entry) => (
            entry.zone_id === zoneId ? { ...entry, all_sites: true, allowed_site_ids: [], site_role_overrides: {} } : entry
        )));
    };

    const handleSubmit = async () => {
        if (!isEmailValid || assignedZones.length === 0) {
            return;
        }

        setCreating(true);
        setScopeError('');
        try {
            await apiClient.post('/admin/users', {
                email: trimmedEmail,
                parent_admin_id: parentAdminId || undefined,
                assignments: assignedZones.map((entry) => ({
                    zone_id: entry.zone_id,
                    zone_role: entry.zone_role,
                    all_sites: entry.all_sites,
                    allowed_site_ids: entry.all_sites ? [] : entry.allowed_site_ids,
                    site_role_overrides: Object.entries(entry.site_role_overrides || {}).map(([site_id, zone_role]) => ({
                        site_id,
                        zone_role,
                    })),
                })),
            });
            onCreated(trimmedEmail);
        } catch (err) {
            setScopeError(err.response?.data?.detail || t('admin.users.error_create_failed'));
        } finally {
            setCreating(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm">
            <div className="flex min-h-full items-start justify-center px-4 py-4 md:py-6">
                <div className="th-bg-surface border th-border rounded-xl w-full max-w-6xl shadow-2xl overflow-hidden box-border flex max-h-[calc(100dvh-4rem)] md:max-h-[calc(100dvh-5rem)] flex-col">
                    <div className="flex items-center justify-between gap-3 border-b th-border px-6 py-4">
                    <div>
                        <h2 className="text-base font-semibold th-text-primary">{t('admin.users.create_new_account')}</h2>
                        <p className="text-xs text-slate-500 mt-1">
                            {step === 1 ? t('admin.users.wizard_step_one_hint') : t('admin.users.wizard_step_two_hint')}
                        </p>
                    </div>
                    <button onClick={onClose} className="text-slate-500 hover:th-text-primary">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto">
                    <div className="px-6 pt-4">
                        <div className="flex items-center gap-2 text-xs">
                            <span className={`px-2.5 py-1 rounded-full border ${step === 1 ? 'border-blue-500/40 bg-blue-500/10 text-blue-300' : 'th-border text-slate-500'}`}>
                                1. {t('admin.users.wizard_step_one_label')}
                            </span>
                            <span className="text-slate-600">→</span>
                            <span className={`px-2.5 py-1 rounded-full border ${step === 2 ? 'border-blue-500/40 bg-blue-500/10 text-blue-300' : 'th-border text-slate-500'}`}>
                                2. {t('admin.users.wizard_step_two_label')}
                            </span>
                        </div>
                    </div>

                    <div className="p-6">
                        {step === 1 ? (
                            <div className="max-w-xl space-y-4">
                                <div>
                                    <label className="block text-xs text-slate-400 mb-1">{t('admin.users.email_label')}</label>
                                    <EmailInput
                                        value={email}
                                        onChange={(nextValue) => {
                                            setEmail(nextValue);
                                            setEmailExistsGlobal(false);
                                            setValidatedEmail('');
                                            setScopeError('');
                                        }}
                                        existingEmails={existingEmails}
                                        placeholder={t('admin.users.email_placeholder')}
                                    />
                                    <p className="text-[11px] text-slate-500 mt-2">{t('admin.users.password_note')}</p>
                                    {email && !isEmailValid && (
                                        <p className="text-xs text-rose-400 mt-2">{t('admin.users.email_invalid')}</p>
                                    )}
                                    {emailAlreadyExists && (
                                        <p className="text-xs text-rose-400 mt-2">{t('admin.users.email_exists')}</p>
                                    )}
                                </div>
                                {currentUserRole === 'brand_admin' && (
                                    <div>
                                        <label className="block text-xs text-slate-400 mb-1">
                                            {t('admin.users.parent_admin_label') || 'Assign Under Admin'}
                                        </label>
                                        <select
                                            value={parentAdminId}
                                            onChange={(event) => {
                                                setParentAdminId(event.target.value);
                                                setAssignedZones([]);
                                            }}
                                            className="w-full th-bg-elevated border border-slate-600 th-text-primary rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                                        >
                                            <option value="">{t('admin.users.parent_admin_optional_placeholder') || 'Leave empty to create an admin'}</option>
                                            {sortedAvailableAdmins.map((adminUser) => (
                                                <option key={adminUser.id} value={adminUser.email}>
                                                    {adminUser.email}
                                                </option>
                                            ))}
                                        </select>
                                        <p className="text-[11px] text-slate-500 mt-2">
                                            {parentAdminId
                                                ? (t('admin.users.parent_admin_flow_hint') || 'This user will be created under the selected admin. The next step will only show the zones and sites that admin controls.')
                                                : (t('admin.users.parent_admin_optional_hint') || 'Leave this empty if you are creating a new admin. Choose an admin here when creating a viewer or delegator.')}
                                        </p>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="grid gap-4 lg:grid-cols-2">
                            <div className="rounded-xl border th-border p-4 min-h-[24rem] flex flex-col">
                                <div className="flex items-center justify-between gap-2 mb-3">
                                    <div>
                                        <h3 className="text-sm font-semibold th-text-primary">{t('admin.users.wizard_available_scope_title')}</h3>
                                        <p className="text-[11px] text-slate-500 mt-1">{t('admin.users.wizard_available_scope_hint')}</p>
                                    </div>
                                    <Badge variant="secondary" className="text-xs">{filteredScopeZones.length}</Badge>
                                </div>
                                <input
                                    type="text"
                                    value={scopeSearch}
                                    onChange={(event) => setScopeSearch(event.target.value)}
                                    placeholder={t('admin.users.wizard_scope_search_placeholder')}
                                    className="w-full mb-3 th-bg-elevated border border-slate-600 th-text-primary rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                                />
                                <div className="flex-1 min-h-0 overflow-y-auto pr-1 custom-scrollbar space-y-3">
                                    {loadingScope ? (
                                        <div className="rounded-lg border border-dashed th-border px-3 py-6 text-xs text-slate-500 text-center">
                                            {t('admin.users.wizard_scope_loading')}
                                        </div>
                                    ) : filteredScopeZones.length === 0 ? (
                                        <div className="rounded-lg border border-dashed th-border px-3 py-6 text-xs text-slate-500 text-center">
                                            {scopeSearch.trim() ? t('admin.users.wizard_scope_empty_filtered') : t('admin.users.wizard_scope_empty')}
                                        </div>
                                    ) : (
                                        filteredScopeZones.map((zone) => {
                                            const assignment = assignmentLookup.get(zone.zoneId);
                                            return (
                                                <div key={zone.zoneId} className="rounded-xl border th-border th-bg-elevated p-3">
                                                    <div className="flex items-start justify-between gap-3 mb-3">
                                                        <div>
                                                            <div className="text-sm font-semibold th-text-primary">{zone.zoneName}</div>
                                                            <div className="text-[11px] text-slate-500">{zone.sites.length} {t('zones.sites_label')}</div>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleAddZone(zone)}
                                                            className="px-2.5 py-1 text-xs rounded-lg bg-blue-600/15 text-blue-300 hover:bg-blue-600/25 transition-colors"
                                                        >
                                                            {assignment?.all_sites ? t('admin.users.wizard_all_sites_added') : t('admin.users.wizard_add_zone')}
                                                        </button>
                                                    </div>
                                                    {zone.visibleSites.length === 0 ? (
                                                        <div className="rounded-lg border border-dashed th-border px-3 py-3 text-xs text-slate-500 text-center">
                                                            {t('admin.users.wizard_scope_no_sites')}
                                                        </div>
                                                    ) : (
                                                        <div className="space-y-2">
                                                            {zone.visibleSites.map((site) => {
                                                                const siteAssigned = assignment?.all_sites || assignment?.allowed_site_ids.includes(site.siteId);
                                                                return (
                                                                    <div key={site.siteId} className="flex items-center justify-between gap-3 rounded-lg border th-border px-3 py-2">
                                                                        <div className="min-w-0">
                                                                            <div className="text-sm th-text-primary truncate">{site.siteName}</div>
                                                                            <div className="text-[11px] text-slate-500 truncate">{site.siteId}</div>
                                                                        </div>
                                                                        {!creatingAdminAsBrandAdmin && (
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => handleAddSite(zone, site)}
                                                                                disabled={!!assignment?.all_sites}
                                                                                className="px-2.5 py-1 text-xs rounded-lg bg-slate-700 hover:bg-slate-600 th-text-secondary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                                            >
                                                                                {siteAssigned ? t('common.done') : t('admin.users.wizard_add_site')}
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>

                            <div className="rounded-xl border th-border p-4 min-h-[24rem] flex flex-col">
                                <div className="flex items-center justify-between gap-2 mb-3">
                                    <div>
                                        <h3 className="text-sm font-semibold th-text-primary">{t('admin.users.wizard_assigned_scope_title')}</h3>
                                        <p className="text-[11px] text-slate-500 mt-1">{t('admin.users.wizard_assigned_scope_hint')}</p>
                                    </div>
                                    <Badge variant="secondary" className="text-xs">{assignedScopeItems.length}</Badge>
                                </div>
                                <div className="flex-1 min-h-0 overflow-y-auto pr-1 custom-scrollbar space-y-3">
                                    {assignedZones.length === 0 ? (
                                        <div className="rounded-lg border border-dashed th-border px-3 py-6 text-xs text-slate-500 text-center">
                                            {t('admin.users.wizard_assigned_scope_empty')}
                                        </div>
                                    ) : (
                                        assignedScopeItems.map((item) => {
                                            if (item.type === 'site') {
                                                return (
                                                    <div key={`${item.entry.zone_id}:${item.site.siteId}`} className="rounded-xl border th-border th-bg-elevated p-3">
                                                        <div className="flex items-start justify-between gap-3">
                                                            <div className="min-w-0 flex-1">
                                                                <div className="text-sm font-semibold th-text-primary truncate">{item.site.siteName}</div>
                                                                <div className="text-[11px] text-slate-500 truncate">{item.site.siteId}</div>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <select
                                                                    value={item.effectiveRole}
                                                                    onChange={(event) => handleSiteRoleChange(item.entry.zone_id, item.site.siteId, event.target.value)}
                                                                    className="w-28 th-bg-surface-alt border border-slate-600 th-text-primary rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-blue-500"
                                                                >
                                                                        {allowedSiteRoles.map((role) => (
                                                                            <option key={role} value={role}>{ROLE_LABEL[role]}</option>
                                                                        ))}
                                                                </select>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleRemoveSite(item.entry.zone_id, item.site.siteId)}
                                                                    className="text-slate-400 hover:text-rose-400"
                                                                >
                                                                    <X className="w-3 h-3" />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            }

                                            return (
                                                <div key={item.entry.zone_id} className="rounded-xl border th-border th-bg-elevated p-3">
                                                    <div className="flex items-start justify-between gap-3 mb-3">
                                                        <div>
                                                            <div className="text-sm font-semibold th-text-primary">{item.entry.zone_name}</div>
                                                            <div className="text-[11px] text-slate-500">
                                                                {t('admin.users.wizard_assignment_all_sites')}
                                                            </div>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleRemoveAssignment(item.entry.zone_id)}
                                                            className="text-xs text-rose-400 hover:text-rose-300"
                                                        >
                                                            {t('common.close')}
                                                        </button>
                                                    </div>

                                                    {creatingAdminAsBrandAdmin ? (
                                                        <div className="mb-3">
                                                            <Badge variant="secondary" className="text-xs">
                                                                {ROLE_LABEL.admin}
                                                            </Badge>
                                                        </div>
                                                    ) : (
                                                        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_10rem] mb-3">
                                                            <div className="flex flex-wrap gap-2">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleSwitchToAllSites(item.entry.zone_id)}
                                                                    className="px-2.5 py-1 rounded-lg text-xs transition-colors bg-blue-600/20 text-blue-300 border border-blue-500/30"
                                                                >
                                                                    {t('admin.users.wizard_assignment_all_sites')}
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleSwitchToSpecificSites(item.entry.zone_id)}
                                                                    className="px-2.5 py-1 rounded-lg text-xs transition-colors bg-slate-700 text-slate-300"
                                                                >
                                                                    {t('admin.users.wizard_assignment_specific_sites')}
                                                                </button>
                                                            </div>
                                                            <select
                                                                value={item.entry.zone_role}
                                                                onChange={(event) => handleRoleChange(item.entry.zone_id, event.target.value)}
                                                                className="w-full th-bg-surface-alt border border-slate-600 th-text-primary rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                                                            >
                                                                {allowedZoneRoles.map((role) => (
                                                                    <option key={role} value={role}>{ROLE_LABEL[role]}</option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                    )}
                                                    <div className="rounded-lg border border-dashed th-border px-3 py-3 text-xs text-slate-500">
                                                        {t('admin.users.wizard_assignment_all_sites_hint')}
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                            </div>
                        )}

                        {scopeError && <p className="text-xs text-rose-400 mt-4">{scopeError}</p>}
                    </div>
                </div>

                <div className="sticky bottom-0 flex items-center justify-between gap-2 border-t th-border th-bg-surface px-6 py-4">
                    <div className="text-xs text-slate-500">
                        {step === 1 ? t('admin.users.wizard_step_one_footer') : t('admin.users.wizard_step_two_footer')}
                    </div>
                    <div className="flex gap-2">
                        {step === 2 && (
                            <button
                                type="button"
                                onClick={() => setStep(1)}
                                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 th-text-secondary text-sm rounded-lg transition-colors"
                            >
                                {t('admin.users.wizard_back_button')}
                            </button>
                        )}
                        {step === 1 ? (
                            <button
                                type="button"
                                onClick={async () => {
                                    const exists = await checkEmailAvailability();
                                    if (!exists) {
                                        setStep(2);
                                    }
                                }}
                                disabled={!isEmailValid || emailAlreadyExists || checkingEmail || emailCheckPending}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 th-text-primary text-sm rounded-lg transition-colors disabled:opacity-50"
                            >
                                {checkingEmail ? (t('common.loading') || 'Loading...') : t('login.continue')}
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={handleSubmit}
                                disabled={creating || assignedZones.length === 0}
                                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 th-text-primary text-sm rounded-lg transition-colors disabled:opacity-50"
                            >
                                {creating ? t('admin.users.creating_button') : t('admin.users.create_button')}
                            </button>
                        )}
                    </div>
                </div>
            </div>
            </div>
        </div>
    , document.body);
};

export default CreateUserModal;
