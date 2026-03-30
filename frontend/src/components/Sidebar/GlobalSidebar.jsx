import React, { useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import {
    House, Sliders, ShieldCheck, Stack, LinkSimple, Users,
    Buildings, Scroll, CopySimple, Trash, ArrowsClockwise, GearSix, Layout,
    Monitor
} from '@phosphor-icons/react';
import UserWidget from './UserWidget';
import HelpTooltip from '../HelpTooltip';
import { useLanguage } from '../../context/LanguageContext';
import { useZone } from '../../context/ZoneContext';
import { useSite } from '../../context/SiteContext';

const GlobalSidebar = ({ onLogout, userRole = 'guest', isZoneAdmin = false, rolePermissions = {} }) => {
    const { t } = useLanguage();
    const navigate = useNavigate();
    const location = useLocation();
    const { zones, loadingZones } = useZone();
    const { sites, loadingSites } = useSite();

    // Accordion: auto-expand if currently on /config
    const isOnConfig = location.pathname === '/config';
    const [configOpen, setConfigOpen] = useState(isOnConfig);
    const hasNoScope =
        ['admin', 'viewer', 'delegator'].includes(userRole) &&
        !loadingZones &&
        !loadingSites &&
        zones.length === 0 &&
        sites.length === 0;

    const getNavLinkClass = ({ isActive }) =>
        `group relative flex items-center px-3 py-2.5 mx-2 text-sm font-medium rounded-lg transition-all duration-150 ${isActive
            ? 'bg-blue-600/10 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400'
            : 'th-text-secondary hover:bg-slate-100 dark:hover:bg-white/5 hover:th-text-primary'
        }`;

    const disabledNavLinkClass = 'group relative flex items-center px-3 py-2.5 mx-2 text-sm font-medium rounded-lg transition-all duration-150 th-text-muted opacity-50 cursor-not-allowed';

    // Navigate to /config and set tab via search param
    const goToConfigTab = (tab) => {
        navigate(`/config?tab=${tab}`);
    };

    // Permission flags
    const canSeeCloneConfig = rolePermissions.full_clone === true;
    const canSeeCloneSite = rolePermissions.batch_provision === true;
    const canSeeClone = canSeeCloneConfig || canSeeCloneSite;
    const canSeeSmartSync = rolePermissions.smart_sync === true;
    const canSeeUpdate = canSeeSmartSync;
    const canSeeBatchAccess = rolePermissions.batch_access === true;
    const canSeeBatchDelete = rolePermissions.batch_delete === true;
    const canSeeBatchOps = canSeeBatchAccess || canSeeBatchDelete;
    const canSeeConfig = (!['viewer', 'delegator'].includes(userRole) || isZoneAdmin) &&
        (canSeeClone || canSeeUpdate || canSeeBatchOps);

    // Sub-items for Configuration accordion
    const configSubItems = [
        { key: 'templates', label: t('config.tabs.templates') || 'Templates', icon: <Layout size={14} weight="duotone" />, help: '' },
        canSeeClone && {
            key: 'clone',
            label: t('config.tabs.clone') || 'Clone',
            icon: <CopySimple size={14} weight="duotone" />,
            help: t('config.help.clone'),
        },
        canSeeUpdate && {
            key: 'update',
            label: t('config.tabs.update') || 'Update',
            icon: <ArrowsClockwise size={14} weight="duotone" />,
            help: t('config.help.update'),
        },
        canSeeBatchOps && {
            key: 'batch_ops',
            label: t('config.tabs.batch_ops') || 'Batch Operations',
            icon: <GearSix size={14} weight="duotone" />,
            help: t('config.help.batch_ops'),
        },
    ].filter(Boolean);

    // Check if a config sub-tab is active
    const currentTab = new URLSearchParams(location.search).get('tab');
    const isConfigSubActive = (key) => isOnConfig && currentTab === key;

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

            {/* Navigation */}
            <nav className="flex-1 overflow-y-auto pt-3 space-y-0.5">
                {hasNoScope ? (
                    <button
                        type="button"
                        disabled
                        className={disabledNavLinkClass}
                        title={t('no_assignments.title')}
                    >
                        <House size={18} weight="duotone" className="mr-3 shrink-0" />
                        {t('sidebar.dashboard')}
                    </button>
                ) : (
                    <NavLink to="/zones" end className={getNavLinkClass}>
                        {({ isActive }) => (
                            <>
                                {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-blue-600 dark:bg-blue-400 rounded-r-full" />}
                                <House size={18} weight="duotone" className="mr-3 shrink-0" />
                                {t('sidebar.dashboard')}
                            </>
                        )}
                    </NavLink>
                )}

                {/* Configuration accordion */}
                {canSeeConfig && (
                    <div>
                        {/* Accordion trigger */}
                        <button
                            onClick={() => setConfigOpen(v => !v)}
                            className={`group w-full flex items-center justify-between px-3 py-2.5 mx-2 text-sm font-medium rounded-lg transition-all duration-150 ${
                                isOnConfig
                                    ? 'bg-blue-600/10 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400'
                                    : 'th-text-secondary hover:bg-slate-100 dark:hover:bg-white/5 hover:th-text-primary'
                            }`}
                            style={{ width: 'calc(100% - 1rem)' }}
                        >
                            <span className="flex items-center gap-3">
                                <Sliders size={18} weight="duotone" className="shrink-0" />
                                {t('sidebar.configuration')}
                            </span>
                            <ChevronDown
                                size={14}
                                className={`transition-transform duration-200 opacity-60 group-hover:opacity-100 ${configOpen ? 'rotate-180' : ''}`}
                            />
                        </button>

                        {/* Sub-items with smooth reveal */}
                        <div
                            className="overflow-hidden transition-all duration-200 ease-out"
                            style={{
                                maxHeight: configOpen ? `${configSubItems.length * 44 + 8}px` : '0px',
                                opacity: configOpen ? 1 : 0,
                            }}
                        >
                            <div className="pl-4 pt-1 pb-1 space-y-0.5">
                                {configSubItems.map(item => (
                                    <button
                                        key={item.key}
                                        onClick={() => goToConfigTab(item.key)}
                                        className={`w-full flex items-center justify-between pl-5 pr-3 py-2 mx-2 text-xs font-medium rounded-lg transition-all duration-150 group ${
                                            isConfigSubActive(item.key)
                                                ? 'bg-blue-600/10 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400'
                                                : 'th-text-muted hover:bg-slate-100 dark:hover:bg-white/5 hover:th-text-primary'
                                        }`}
                                        style={{ width: 'calc(100% - 1.5rem)' }}
                                    >
                                        <span className="flex items-center gap-2.5">
                                            <span className={`w-1.5 h-1.5 rounded-full transition-colors ${
                                                isConfigSubActive(item.key) 
                                                    ? 'bg-blue-500 dark:bg-blue-400' 
                                                    : 'bg-slate-300 dark:bg-slate-600 group-hover:bg-slate-400 dark:group-hover:bg-slate-500'
                                            }`} />
                                            {item.icon}
                                            {item.label}
                                        </span>
                                        {item.help && (
                                            <HelpTooltip
                                                content={item.help}
                                                variant="sidebar"
                                                position="right"
                                            />
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* Brand Admin / Admin section */}
                {['brand_admin', 'admin'].includes(userRole) && (
                    <>
                        <div className="px-4 pt-5 pb-1.5">
                            <span className="text-[10px] font-semibold th-text-muted uppercase tracking-widest">Admin</span>
                        </div>
                        <NavLink to="/admin/logs" className={getNavLinkClass}>
                            {({ isActive }) => (
                                <>
                                    {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-blue-600 dark:bg-blue-400 rounded-r-full" />}
                                    <ShieldCheck size={18} weight="duotone" className="mr-3 shrink-0" />
                                    {t('admin.logs.title')}
                                </>
                            )}
                        </NavLink>
                        {userRole === 'brand_admin' && (
                            <NavLink to="/admin/zones" className={getNavLinkClass}>
                                {({ isActive }) => (
                                    <>
                                        {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-blue-600 dark:bg-blue-400 rounded-r-full" />}
                                        <Stack size={18} weight="duotone" className="mr-3 shrink-0" />
                                        {t('admin.zones.title')}
                                    </>
                                )}
                            </NavLink>
                        )}
                        <NavLink to="/admin/users" className={getNavLinkClass}>
                            {({ isActive }) => (
                                <>
                                    {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-blue-600 dark:bg-blue-400 rounded-r-full" />}
                                    <Users size={18} weight="duotone" className="mr-3 shrink-0" />
                                    {t('admin.users.title')}
                                </>
                            )}
                        </NavLink>
                        {userRole === 'brand_admin' && (
                            <NavLink to="/admin/master" className={getNavLinkClass}>
                                {({ isActive }) => (
                                    <>
                                        {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-blue-600 dark:bg-blue-400 rounded-r-full" />}
                                        <LinkSimple size={18} weight="duotone" className="mr-3 shrink-0" />
                                        {t('admin.master.title')}
                                    </>
                                )}
                            </NavLink>
                        )}
                    </>
                )}

                {/* Super Admin section */}
                {userRole === 'super_admin' && (
                    <>
                        <div className="px-4 pt-5 pb-1.5">
                            <span className="text-[10px] font-semibold th-text-muted uppercase tracking-widest">Super Admin</span>
                        </div>
                        <NavLink to="/super/tenants" className={getNavLinkClass}>
                            {({ isActive }) => (
                                <>
                                    {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-blue-600 dark:bg-blue-400 rounded-r-full" />}
                                    <Buildings size={18} weight="duotone" className="mr-3 shrink-0" />
                                    {t('super.tenants.title')}
                                </>
                            )}
                        </NavLink>
                        <NavLink to="/super/users" className={getNavLinkClass}>
                            {({ isActive }) => (
                                <>
                                    {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-blue-600 dark:bg-blue-400 rounded-r-full" />}
                                    <Users size={18} weight="duotone" className="mr-3 shrink-0" />
                                    {t('super.users.title')}
                                </>
                            )}
                        </NavLink>
                        <NavLink to="/super/permissions" className={getNavLinkClass}>
                            {({ isActive }) => (
                                <>
                                    {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-blue-600 dark:bg-blue-400 rounded-r-full" />}
                                    <ShieldCheck size={18} weight="duotone" className="mr-3 shrink-0" />
                                    {t('super.permissions.title')}
                                </>
                            )}
                        </NavLink>
                        <NavLink to="/super/logs" className={getNavLinkClass}>
                            {({ isActive }) => (
                                <>
                                    {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-blue-600 dark:bg-blue-400 rounded-r-full" />}
                                    <Scroll size={18} weight="duotone" className="mr-3 shrink-0" />
                                    {t('super.logs.title')}
                                </>
                            )}
                        </NavLink>
                        <NavLink to="/super/monitoring" className={getNavLinkClass}>
                            {({ isActive }) => (
                                <>
                                    {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-blue-600 dark:bg-blue-400 rounded-r-full" />}
                                    <Monitor size={18} weight="duotone" className="mr-3 shrink-0" />
                                    {t('monitoring.title')}
                                </>
                            )}
                        </NavLink>
                    </>
                )}
            </nav>

            <UserWidget onLogout={onLogout} />
        </div>
    );
};

export default GlobalSidebar;
