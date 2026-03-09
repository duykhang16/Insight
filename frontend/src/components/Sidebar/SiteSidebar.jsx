import React, { useState, useEffect, useRef } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Home, Sliders, ArrowLeft, Activity, Bell, Users, Wifi, Monitor, Box, ChevronDown, Search, Server, Check } from 'lucide-react';
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

    useEffect(() => {
        if (isSwitcherOpen && zones.length === 0) {
            const endpoint = userRole === 'admin' ? '/zones' : '/zones/my';
            import('../../api/apiClient').then(({ default: apiClient }) => {
                apiClient.get(endpoint).then(res => {
                    setZones(res.data);
                }).catch(err => console.error(err));
            });
        }
    }, [isSwitcherOpen, zones.length]);

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
        `flex items-center px-4 py-3 text-sm font-medium transition-colors ${isActive
            ? 'bg-blue-600 text-white'
            : 'text-gray-300 hover:bg-slate-800 hover:text-white'
        }`;

    return (
        <div className="flex flex-col w-64 bg-[#0F172A] border-r border-slate-800 h-full">
            {/* Brand header */}
            <div className="flex items-center justify-between px-4 h-16 border-b border-slate-800 gap-3">
                <div className="flex items-center gap-3">
                    <span className="text-xl font-black italic text-white tracking-widest uppercase">INSIGHT</span>
                    <div className="relative flex items-center justify-center h-2 w-2" title="Live Sync">
                        <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-50 animate-ping"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </div>
                </div>
            </div>

            {/* Back to Zones */}
            <div className="px-3 pt-3 pb-1">
                <button
                    onClick={() => navigate('/zones')}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-slate-400 hover:text-white hover:bg-slate-800 rounded-md transition-colors"
                >
                    <ArrowLeft size={14} />
                    Zones
                </button>
            </div>

            {/* Site Switcher */}
            <div className="px-3 pb-2 border-b border-slate-800/50 relative" ref={switcherRef}>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 px-1 mb-1">Current Site</p>
                <button
                    onClick={() => setIsSwitcherOpen(!isSwitcherOpen)}
                    className={`w-full flex items-center justify-between px-3 py-2 bg-slate-800/40 hover:bg-slate-700/60 border ${isSwitcherOpen ? 'border-emerald-500/50' : 'border-slate-700'} rounded-lg transition-all text-left group`}
                >
                    <div className="flex flex-col min-w-0 pr-2">
                        <span className="text-[13px] font-bold text-white truncate mt-0.5" title={siteName}>{siteName}</span>
                    </div>
                    <ChevronDown size={14} className={`text-slate-400 transition-transform ${isSwitcherOpen ? 'rotate-180 text-emerald-400' : 'group-hover:text-slate-300'}`} />
                </button>

                {/* Dropdown Menu */}
                {isSwitcherOpen && (
                    <div className="absolute top-[calc(100%+4px)] left-3 right-3 bg-[#1E293B] border border-slate-600 rounded-xl shadow-2xl z-50 flex flex-col max-h-[400px]">
                        <div className="p-2 border-b border-slate-700 shrink-0">
                            <div className="relative">
                                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                    type="text"
                                    placeholder="Search site..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    autoFocus
                                    className="w-full bg-[#0F172A] border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50"
                                />
                            </div>
                        </div>
                        <div className="overflow-y-auto flex-1 p-2 space-y-3 custom-scrollbar">
                            {groupedSites.length === 0 ? (
                                <p className="text-xs text-center text-slate-500 py-4">No sites found</p>
                            ) : (
                                groupedSites.map(group => (
                                    <div key={group.id}>
                                        <div className="flex items-center gap-1.5 px-1 mb-1.5 opacity-80">
                                            <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: group.color || '#3B82F6' }} />
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 truncate">{group.name}</span>
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
                                                        className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-left transition-colors ${isSelected ? 'bg-emerald-500/10 text-emerald-400' : 'hover:bg-slate-800 text-slate-300 hover:text-white'}`}
                                                    >
                                                        <div className="flex items-center gap-2 overflow-hidden pr-2">
                                                            <Server size={12} className={`shrink-0 ${isSelected ? 'text-emerald-500' : 'text-slate-500'}`} />
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
            <nav className="flex-1 overflow-y-auto pt-4 space-y-1">
                <NavLink to={`/site/${siteId}`} end className={getNavLinkClass}>
                    <Home className="w-5 h-5 mr-3" />
                    Overview
                </NavLink>
                <NavLink to={`/site/${siteId}/health`} className={getNavLinkClass}>
                    <Activity className="w-5 h-5 mr-3" />
                    Health
                </NavLink>
                <NavLink to={`/site/${siteId}/alerts`} className={getNavLinkClass}>
                    <Bell className="w-5 h-5 mr-3" />
                    Alerts
                </NavLink>
                <NavLink to={`/site/${siteId}/clients`} className={getNavLinkClass}>
                    <Users className="w-5 h-5 mr-3" />
                    Clients
                </NavLink>
                <NavLink to={`/site/${siteId}/networks`} className={getNavLinkClass}>
                    <Wifi className="w-5 h-5 mr-3" />
                    Networks
                </NavLink>
                <NavLink to={`/site/${siteId}/devices`} className={getNavLinkClass}>
                    <Monitor className="w-5 h-5 mr-3" />
                    Devices
                </NavLink>
                <NavLink to={`/site/${siteId}/applications`} className={getNavLinkClass}>
                    <Box className="w-5 h-5 mr-3" />
                    Applications
                </NavLink>
                <NavLink to={`/site/${siteId}/cloner`} className={getNavLinkClass}>
                    <Sliders className="w-5 h-5 mr-3" />
                    Configuration
                </NavLink>
            </nav>

            <UserWidget onLogout={onLogout} />
        </div>
    );
};

export default SiteSidebar;
