import React, { useState, useEffect, useRef } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { Home, ArrowLeft, Activity, Bell, Users, Wifi, Monitor, Box, ChevronDown, Search, Server, Check, SlidersHorizontal } from 'lucide-react';
import UserWidget from './UserWidget';
import { useSite } from '../../context/SiteContext';
import apiClient from '../../api/apiClient';
import { Button } from '../ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '../ui/dialog';

const CONFIG_DIRTY_STATE_KEY = 'individualConfigurationDirty';
const CONFIG_DIRTY_EVENT = 'individualConfigurationDirtyChange';
const CONFIG_DISCARD_EVENT = 'individualConfigurationDiscardChanges';

const CONFIGURATION_SECTIONS = [
    { key: 'overview', label: 'Overview' },
    { key: 'ip-assignment', label: 'IP Assignment' },
    { key: 'network-assignment', label: 'Network Assignment' },
    { key: 'access-control', label: 'Access Control' },
    { key: 'schedule', label: 'Schedule' },
    { key: 'wireless-options', label: 'Wireless Options' },
];

const WIRED_CONFIGURATION_SECTIONS = [
    { key: 'overview', label: 'Overview' },
    { key: 'network-assignment', label: 'Network Assignment' },
    { key: 'access-control', label: 'Access Control' },
];

const SiteSidebar = ({ siteId, onLogout, userRole = 'guest' }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const { sites, setSelectedSiteId } = useSite();

    const [isSwitcherOpen, setIsSwitcherOpen] = useState(false);
    const [isConfigurationOpen, setIsConfigurationOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [zones, setZones] = useState([]);
    const [hasSwitchDevices, setHasSwitchDevices] = useState(null);
    const [hasUnsavedConfigurationChanges, setHasUnsavedConfigurationChanges] = useState(
        () => sessionStorage.getItem(CONFIG_DIRTY_STATE_KEY) === 'true'
    );
    const [showLeaveModal, setShowLeaveModal] = useState(false);
    const switcherRef = useRef(null);
    const pendingNavigationRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (switcherRef.current && !switcherRef.current.contains(event.target)) {
                setIsSwitcherOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        const handleDirtyStateChange = (event) => {
            setHasUnsavedConfigurationChanges(Boolean(event.detail?.isDirty));
        };

        window.addEventListener(CONFIG_DIRTY_EVENT, handleDirtyStateChange);
        return () => window.removeEventListener(CONFIG_DIRTY_EVENT, handleDirtyStateChange);
    }, []);

    useEffect(() => {
        let cancelled = false;

        const fetchInventoryCapabilities = async () => {
            if (!siteId) {
                setHasSwitchDevices(null);
                return;
            }

            try {
                const res = await apiClient.get(`/overview/sites/${siteId}/inventory`);
                if (cancelled) {
                    return;
                }

                const devices = Array.isArray(res.data) ? res.data : [];
                const hasSwitchLikeDevice = devices.some((device) => {
                    const deviceType = String(device?.deviceType || '').toLowerCase();
                    return deviceType === 'switch' || deviceType === 'stack';
                });
                setHasSwitchDevices(hasSwitchLikeDevice);
            } catch (error) {
                if (!cancelled) {
                    setHasSwitchDevices(null);
                }
            }
        };

        fetchInventoryCapabilities();
        return () => {
            cancelled = true;
        };
    }, [siteId]);

    // Fetch zones eagerly on mount so we can resolve the parent zone for back-navigation
    useEffect(() => {
        if (zones.length === 0) {
            const endpoint = '/zones/my';
            import('../../api/apiClient').then(({ default: apiClient }) => {
                apiClient.get(endpoint).then(res => {
                    setZones(res.data);
                }).catch(err => console.error(err));
            });
        }
    }, [zones.length]);

    // Resolve the parent zone that contains the current site
    const parentZone = zones.find(z =>
        (z.site_ids || []).map(String).includes(String(siteId))
    );

    const handleSiteSelect = (id) => {
        if (setSelectedSiteId) setSelectedSiteId(id);
        setIsSwitcherOpen(false);
        setSearchQuery('');
        requestNavigation(`/site/${id}`, { closeConfiguration: true });
    };

    const currentSite = sites.find(
        s => (s.siteId || s.id || s._id) === siteId
    );
    const siteName = currentSite
        ? (currentSite.siteName || currentSite.name || siteId)
        : siteId;

    const getGroupedSites = () => {
        const filtered = sites.filter(s => {
            const name = String(s.siteName || s.name || s.siteId || s.id || '');
            return name.toLowerCase().includes(searchQuery.toLowerCase());
        });

        const groups = [];
        const inZoneSiteIds = new Set();

        zones.forEach(zone => {
            const zSites = [];
            (zone.site_ids || []).forEach(zId => {
                const found = filtered.find(s => String(s.siteId || s.id || s._id) === String(zId));
                if (found) {
                    zSites.push(found);
                    inZoneSiteIds.add(String(zId));
                }
            });
            if (zSites.length > 0) {
                zSites.sort((a, b) => String(a.siteName || '').localeCompare(String(b.siteName || '')));
                groups.push({
                    id: zone.id || zone._id || zone.name,
                    name: zone.name,
                    color: zone.color,
                    sites: zSites
                });
            }
        });

        const standalone = filtered.filter(s => {
            const id = String(s.siteId || s.id || s._id);
            return !inZoneSiteIds.has(id);
        });

        if (standalone.length > 0) {
            standalone.sort((a, b) => String(a.siteName || '').localeCompare(String(b.siteName || '')));
            groups.push({
                id: 'standalone',
                name: 'Standalone Sites',
                color: '#64748B',
                sites: standalone
            });
        }

        return groups;
    };

    const groupedSites = getGroupedSites();
    const isConfigurationSectionActive = location.pathname.startsWith(`/site/${siteId}/configuration`) || location.pathname === `/site/${siteId}/cloner`;
    const networkKey = new URLSearchParams(location.search).get('networkKey') || '';
    const selectedNetworkKind = networkKey.startsWith('wired:')
        ? 'wired'
        : networkKey.startsWith('wireless:')
            ? 'wireless'
            : '';
    const configurationSections = selectedNetworkKind === 'wired'
        ? WIRED_CONFIGURATION_SECTIONS.filter((section) => (
            section.key !== 'network-assignment' || hasSwitchDevices !== false
        ))
        : CONFIGURATION_SECTIONS;

    const isConfigurationPath = location.pathname.startsWith(`/site/${siteId}/configuration`);

    const requestNavigation = (targetPath, { closeConfiguration = true } = {}) => {
        const currentPath = `${location.pathname}${location.search}`;

        if (targetPath === currentPath) {
            return;
        }

        if (hasUnsavedConfigurationChanges && isConfigurationPath) {
            pendingNavigationRef.current = { targetPath, closeConfiguration };
            setShowLeaveModal(true);
            return;
        }

        if (closeConfiguration) {
            setIsConfigurationOpen(false);
        }
        navigate(targetPath);
    };

    const handleStayOnPage = () => {
        pendingNavigationRef.current = null;
        setShowLeaveModal(false);
    };

    const handleLeavePage = () => {
        const pendingNavigation = pendingNavigationRef.current;
        pendingNavigationRef.current = null;
        setShowLeaveModal(false);
        setHasUnsavedConfigurationChanges(false);
        sessionStorage.setItem(CONFIG_DIRTY_STATE_KEY, 'false');
        window.dispatchEvent(new CustomEvent(CONFIG_DIRTY_EVENT, {
            detail: { isDirty: false },
        }));
        window.dispatchEvent(new CustomEvent(CONFIG_DISCARD_EVENT));

        if (!pendingNavigation) {
            return;
        }

        if (pendingNavigation.closeConfiguration) {
            setIsConfigurationOpen(false);
        }
        navigate(pendingNavigation.targetPath);
    };

    const handleConfigurationToggle = () => {
        if (isConfigurationOpen) {
            setIsConfigurationOpen(false);
            return;
        }

        setIsConfigurationOpen(true);
        requestNavigation(`/site/${siteId}/configuration/overview${location.search}`, { closeConfiguration: false });
    };

    useEffect(() => {
        if (isConfigurationSectionActive) {
            setIsConfigurationOpen(true);
        }
    }, [isConfigurationSectionActive]);

    useEffect(() => {
        if (!location.pathname.startsWith(`/site/${siteId}/configuration`) && location.pathname !== `/site/${siteId}/cloner`) {
            setIsConfigurationOpen(false);
        }
    }, [location.pathname, siteId]);

    const getNavLinkClass = ({ isActive }) =>
        `group relative flex items-center px-3 py-2.5 mx-2 text-sm font-medium rounded-lg transition-all duration-150 ${isActive
            ? 'bg-blue-600/10 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400'
            : 'th-text-secondary hover:bg-slate-100 dark:hover:bg-white/5 hover:th-text-primary'
        }`;

    const configurationParentClass = 'group relative flex w-full items-center px-3 py-2.5 mx-2 text-sm font-medium rounded-lg transition-all duration-150 th-text-secondary hover:bg-slate-100 dark:hover:bg-white/5 hover:th-text-primary';

    const getConfigurationLinkClass = ({ isActive }) =>
        `group relative ml-7 mr-2 flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150 ${
            isActive
                ? 'bg-blue-600/10 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400'
                : 'th-text-secondary hover:bg-slate-100 dark:hover:bg-white/5 hover:th-text-primary'
        }`;

    return (
        <div className="flex flex-col w-64 th-bg-sidebar border-r th-border h-full transition-colors duration-200">
            <Dialog open={showLeaveModal} onOpenChange={(open) => { if (!open) handleStayOnPage(); }}>
                <DialogContent className="sm:max-w-[520px] border-white/10 bg-slate-800 p-0 text-slate-100" showCloseButton={false}>
                    <DialogHeader className="px-8 pt-8">
                        <DialogTitle className="text-5xl font-black tracking-tight text-slate-100">Leave Page?</DialogTitle>
                        <DialogDescription className="pt-2 text-lg font-semibold text-slate-300">
                            All changes will be lost.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="mt-6 border-white/10 bg-slate-800/95 px-8 pb-8 pt-4 sm:justify-end">
                        <Button variant="ghost" size="lg" onClick={handleStayOnPage} className="text-base font-black text-slate-100 hover:bg-slate-700 hover:text-white">
                            Stay on Page
                        </Button>
                        <Button size="lg" onClick={handleLeavePage} className="bg-emerald-500 px-6 text-base font-black text-white hover:bg-emerald-400">
                            Leave Page
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            {/* Brand header */}
            <div className="flex items-center px-4 h-14 border-b th-border">
                <button
                    onClick={() => requestNavigation('/zones')}
                    className="flex items-center gap-3 hover:opacity-80 transition-opacity"
                >
                    <span className="text-lg font-black italic th-text-primary tracking-widest uppercase">INSIGHT</span>
                    <div className="relative flex items-center justify-center h-2 w-2" title="Live Sync">
                        <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-50 animate-ping"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </div>
                </button>
            </div>

            {/* Back to parent Zone */}
            <div className="px-3 pt-3 pb-1">
                <button
                    onClick={() => requestNavigation(parentZone ? `/zones/${parentZone.id || parentZone._id}/sites` : '/zones')}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold th-text-muted hover:th-text-primary hover:th-bg-surface-alt rounded-md transition-colors"
                >
                    <ArrowLeft size={14} />
                    {parentZone ? parentZone.name : 'Zones'}
                </button>
            </div>

            {/* Site Switcher */}
            <div className="px-3 pb-2 border-b th-border relative" style={{ borderColor: 'var(--color-border-subtle)' }} ref={switcherRef}>
                <p className="text-[10px] font-black uppercase tracking-widest th-text-muted px-1 mb-1">Current Site</p>
                <button
                    onClick={() => setIsSwitcherOpen(!isSwitcherOpen)}
                    className={`w-full flex items-center justify-between px-3 py-2 th-bg-surface-alt hover:th-bg-elevated border ${isSwitcherOpen ? 'border-emerald-500/50' : 'th-border'} rounded-lg transition-all text-left group`}
                >
                    <div className="flex flex-col min-w-0 pr-2">
                        <span className="text-[13px] font-bold th-text-primary truncate mt-0.5" title={siteName}>{siteName}</span>
                    </div>
                    <ChevronDown size={14} className={`th-text-muted transition-transform ${isSwitcherOpen ? 'rotate-180 text-emerald-400' : 'group-hover:th-text-secondary'}`} />
                </button>

                {/* Dropdown Menu */}
                {isSwitcherOpen && (
                    <div className="absolute top-[calc(100%+4px)] left-3 right-3 th-bg-dropdown border th-border rounded-xl shadow-2xl z-50 flex flex-col max-h-[400px]" style={{ borderColor: 'var(--color-dropdown-border)' }}>
                        <div className="p-2 border-b th-border shrink-0">
                            <div className="relative">
                                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 th-text-muted" />
                                <input
                                    type="text"
                                    placeholder="Search site..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    autoFocus
                                    className="w-full th-bg-surface border th-border rounded-lg pl-8 pr-3 py-1.5 text-xs th-text-primary placeholder:th-text-muted focus:outline-none focus:border-emerald-500/50"
                                    style={{ backgroundColor: 'var(--color-bg-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
                                />
                            </div>
                        </div>
                        <div className="overflow-y-auto flex-1 p-2 space-y-3 custom-scrollbar">
                            {groupedSites.length === 0 ? (
                                <p className="text-xs text-center th-text-muted py-4">No sites found</p>
                            ) : (
                                groupedSites.map(group => (
                                    <div key={group.id}>
                                        <div className="flex items-center gap-1.5 px-1 mb-1.5 opacity-80">
                                            <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: group.color || '#3B82F6' }} />
                                            <span className="text-[10px] font-bold uppercase tracking-wider th-text-muted truncate">{group.name}</span>
                                        </div>
                                        <div className="space-y-0.5">
                                            {group.sites.map(s => {
                                                const id = s.siteId || s.id || s._id;
                                                const name = s.siteName || s.name || id;
                                                const isSelected = id === siteId;
                                                return (
                                                    <button
                                                        key={id}
                                                        onClick={() => handleSiteSelect(id)}
                                                        className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-left transition-colors ${isSelected ? 'bg-emerald-500/10 text-emerald-400' : 'hover:th-bg-surface-alt th-text-secondary hover:th-text-primary'}`}
                                                    >
                                                        <div className="flex items-center gap-2 overflow-hidden pr-2">
                                                            <Server size={12} className={`shrink-0 ${isSelected ? 'text-emerald-500' : 'th-text-muted'}`} />
                                                            <span className="text-xs truncate">{name}</span>
                                                        </div>
                                                        {isSelected && <Check size={12} className="text-emerald-500 shrink-0" />}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Site-scoped navigation */}
            <nav className="flex-1 overflow-y-auto pt-3 space-y-0.5">
                <NavLink to={`/site/${siteId}`} end className={getNavLinkClass} onClick={(event) => { event.preventDefault(); requestNavigation(`/site/${siteId}`); }}>
                    {({ isActive }) => (
                        <>
                            {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-blue-600 dark:bg-blue-400 rounded-r-full" />}
                            <Home className="w-[18px] h-[18px] mr-3 shrink-0" />
                            Overview
                        </>
                    )}
                </NavLink>
                <NavLink to={`/site/${siteId}/health`} className={getNavLinkClass} onClick={(event) => { event.preventDefault(); requestNavigation(`/site/${siteId}/health`); }}>
                    {({ isActive }) => (
                        <>
                            {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-blue-600 dark:bg-blue-400 rounded-r-full" />}
                            <Activity className="w-[18px] h-[18px] mr-3 shrink-0" />
                            Health
                        </>
                    )}
                </NavLink>
                <NavLink to={`/site/${siteId}/alerts`} className={getNavLinkClass} onClick={(event) => { event.preventDefault(); requestNavigation(`/site/${siteId}/alerts`); }}>
                    {({ isActive }) => (
                        <>
                            {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-blue-600 dark:bg-blue-400 rounded-r-full" />}
                            <Bell className="w-[18px] h-[18px] mr-3 shrink-0" />
                            Alerts
                        </>
                    )}
                </NavLink>
                <NavLink to={`/site/${siteId}/clients`} className={getNavLinkClass} onClick={(event) => { event.preventDefault(); requestNavigation(`/site/${siteId}/clients`); }}>
                    {({ isActive }) => (
                        <>
                            {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-blue-600 dark:bg-blue-400 rounded-r-full" />}
                            <Users className="w-[18px] h-[18px] mr-3 shrink-0" />
                            Clients
                        </>
                    )}
                </NavLink>
                <NavLink to={`/site/${siteId}/networks`} className={getNavLinkClass} onClick={(event) => { event.preventDefault(); requestNavigation(`/site/${siteId}/networks`); }}>
                    {({ isActive }) => (
                        <>
                            {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-blue-600 dark:bg-blue-400 rounded-r-full" />}
                            <Wifi className="w-[18px] h-[18px] mr-3 shrink-0" />
                            Networks
                        </>
                    )}
                </NavLink>
                <div className="space-y-0.5">
                    <button
                        type="button"
                        onClick={handleConfigurationToggle}
                        className={configurationParentClass}
                    >
                        <SlidersHorizontal className="w-[18px] h-[18px] mr-3 shrink-0" />
                        <span className="flex-1 text-left">Configuration</span>
                        <ChevronDown
                            size={14}
                            className={`shrink-0 transition-transform ${isConfigurationOpen ? 'rotate-180 th-text-primary' : 'th-text-muted group-hover:th-text-secondary'}`}
                        />
                    </button>
                    {isConfigurationOpen && (
                        <div className="space-y-0.5 pb-1">
                            {configurationSections.map((section) => (
                                <NavLink
                                    key={section.key}
                                    to={`/site/${siteId}/configuration/${section.key}${location.search}`}
                                    onClick={(event) => {
                                        event.preventDefault();
                                        requestNavigation(`/site/${siteId}/configuration/${section.key}${location.search}`, { closeConfiguration: false });
                                    }}
                                    className={getConfigurationLinkClass}
                                >
                                    {({ isActive }) => (
                                        <>
                                            {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 bg-blue-600 dark:bg-blue-400 rounded-r-full" />}
                                            <span>{section.label}</span>
                                        </>
                                    )}
                                </NavLink>
                            ))}
                        </div>
                    )}
                </div>
                <NavLink to={`/site/${siteId}/devices`} className={getNavLinkClass} onClick={(event) => { event.preventDefault(); requestNavigation(`/site/${siteId}/devices`); }}>
                    {({ isActive }) => (
                        <>
                            {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-blue-600 dark:bg-blue-400 rounded-r-full" />}
                            <Monitor className="w-[18px] h-[18px] mr-3 shrink-0" />
                            Devices
                        </>
                    )}
                </NavLink>
                <NavLink to={`/site/${siteId}/applications`} className={getNavLinkClass} onClick={(event) => { event.preventDefault(); requestNavigation(`/site/${siteId}/applications`); }}>
                    {({ isActive }) => (
                        <>
                            {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-blue-600 dark:bg-blue-400 rounded-r-full" />}
                            <Box className="w-[18px] h-[18px] mr-3 shrink-0" />
                            Applications
                        </>
                    )}
                </NavLink>
            </nav>

            <UserWidget onLogout={onLogout} />
        </div>
    );
};

export default SiteSidebar;
