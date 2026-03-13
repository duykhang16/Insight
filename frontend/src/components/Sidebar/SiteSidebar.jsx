import React, { useState, useEffect, useRef } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Home, ArrowLeft, Activity, Bell, Users, Wifi, Monitor, Box, ChevronDown, Search, Server, Check } from 'lucide-react';
import UserWidget from './UserWidget';
import { useSite } from '../../context/SiteContext';

const SiteSidebar = ({ siteId, onLogout, userRole = 'guest' }) => {
    const navigate = useNavigate();
    const { sites, setSelectedSiteId } = useSite();

    const [isSwitcherOpen, setIsSwitcherOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [zones, setZones] = useState([]);
    const switcherRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (switcherRef.current && !switcherRef.current.contains(event.target)) {
                setIsSwitcherOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Fetch zones eagerly on mount so we can resolve the parent zone for back-navigation
    useEffect(() => {
        if (zones.length === 0) {
            const endpoint = userRole === 'admin' ? '/zones' : '/zones/my';
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
        navigate(`/site/${id}`);
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

    const getNavLinkClass = ({ isActive }) =>
        `group relative flex items-center px-3 py-2.5 mx-2 text-sm font-medium rounded-lg transition-all duration-150 ${isActive
            ? 'bg-blue-600/10 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400'
            : 'th-text-secondary hover:bg-slate-100 dark:hover:bg-white/5 hover:th-text-primary'
        }`;

    return (
        <div className="flex flex-col w-64 th-bg-sidebar border-r th-border h-full transition-colors duration-200">
            {/* Brand header */}
            <div className="flex items-center px-4 h-14 border-b th-border">
                <button
                    onClick={() => navigate('/zones')}
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
                    onClick={() => navigate(parentZone ? `/zones/${parentZone.id || parentZone._id}/sites` : '/zones')}
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
                <NavLink to={`/site/${siteId}`} end className={getNavLinkClass}>
                    {({ isActive }) => (
                        <>
                            {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-blue-600 dark:bg-blue-400 rounded-r-full" />}
                            <Home className="w-[18px] h-[18px] mr-3 shrink-0" />
                            Overview
                        </>
                    )}
                </NavLink>
                <NavLink to={`/site/${siteId}/health`} className={getNavLinkClass}>
                    {({ isActive }) => (
                        <>
                            {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-blue-600 dark:bg-blue-400 rounded-r-full" />}
                            <Activity className="w-[18px] h-[18px] mr-3 shrink-0" />
                            Health
                        </>
                    )}
                </NavLink>
                <NavLink to={`/site/${siteId}/alerts`} className={getNavLinkClass}>
                    {({ isActive }) => (
                        <>
                            {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-blue-600 dark:bg-blue-400 rounded-r-full" />}
                            <Bell className="w-[18px] h-[18px] mr-3 shrink-0" />
                            Alerts
                        </>
                    )}
                </NavLink>
                <NavLink to={`/site/${siteId}/clients`} className={getNavLinkClass}>
                    {({ isActive }) => (
                        <>
                            {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-blue-600 dark:bg-blue-400 rounded-r-full" />}
                            <Users className="w-[18px] h-[18px] mr-3 shrink-0" />
                            Clients
                        </>
                    )}
                </NavLink>
                <NavLink to={`/site/${siteId}/networks`} className={getNavLinkClass}>
                    {({ isActive }) => (
                        <>
                            {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-blue-600 dark:bg-blue-400 rounded-r-full" />}
                            <Wifi className="w-[18px] h-[18px] mr-3 shrink-0" />
                            Networks
                        </>
                    )}
                </NavLink>
                <NavLink to={`/site/${siteId}/devices`} className={getNavLinkClass}>
                    {({ isActive }) => (
                        <>
                            {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-blue-600 dark:bg-blue-400 rounded-r-full" />}
                            <Monitor className="w-[18px] h-[18px] mr-3 shrink-0" />
                            Devices
                        </>
                    )}
                </NavLink>
                <NavLink to={`/site/${siteId}/applications`} className={getNavLinkClass}>
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
