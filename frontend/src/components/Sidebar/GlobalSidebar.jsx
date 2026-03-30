import React, { useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
<<<<<<< HEAD
import { ChevronDown } from 'lucide-react';
import {
    House, Sliders, ShieldCheck, Stack, LinkSimple, Users,
    Buildings, Scroll, CopySimple, Trash, ArrowsClockwise, GearSix, Layout,
    Monitor
} from '@phosphor-icons/react';
=======
import {
    Home, Sliders, Shield, Layers, Link2, Users,
    Building2, ScrollText, ChevronDown, Copy, Trash2, RefreshCw, Settings, Layout,
    Monitor
} from 'lucide-react';
>>>>>>> parent of 30b1732 (Delete frontend directory)
import UserWidget from './UserWidget';
import HelpTooltip from '../HelpTooltip';
import { useLanguage } from '../../context/LanguageContext';

const GlobalSidebar = ({ onLogout, userRole = 'guest', isZoneAdmin = false, rolePermissions = {} }) => {
    const { t } = useLanguage();
    const navigate = useNavigate();
    const location = useLocation();

    // Accordion: auto-expand if currently on /config
    const isOnConfig = location.pathname === '/config';
    const [configOpen, setConfigOpen] = useState(isOnConfig);

    const getNavLinkClass = ({ isActive }) =>
        `group relative flex items-center px-3 py-2.5 mx-2 text-sm font-medium rounded-lg transition-all duration-150 ${isActive
            ? 'bg-blue-600/10 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400'
            : 'th-text-secondary hover:bg-slate-100 dark:hover:bg-white/5 hover:th-text-primary'
        }`;

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
    const canSeeConfig = (userRole !== 'viewer' || isZoneAdmin) &&
        (canSeeClone || canSeeUpdate || canSeeBatchOps);

    // Sub-items for Configuration accordion
    const configSubItems = [
<<<<<<< HEAD
        { key: 'templates', label: t('config.tabs.templates') || 'Templates', icon: <Layout size={14} weight="duotone" />, help: '' },
        canSeeClone && {
            key: 'clone',
            label: t('config.tabs.clone') || 'Clone',
            icon: <CopySimple size={14} weight="duotone" />,
=======
        { key: 'templates', label: t('config.tabs.templates') || 'Templates', icon: <Layout size={14} />, help: '' },
        canSeeClone && {
            key: 'clone',
            label: t('config.tabs.clone') || 'Clone',
            icon: <Copy size={14} />,
>>>>>>> parent of 30b1732 (Delete frontend directory)
            help: t('config.help.clone'),
        },
        canSeeUpdate && {
            key: 'update',
            label: t('config.tabs.update') || 'Update',
<<<<<<< HEAD
            icon: <ArrowsClockwise size={14} weight="duotone" />,
=======
            icon: <RefreshCw size={14} />,
>>>>>>> parent of 30b1732 (Delete frontend directory)
            help: t('config.help.update'),
        },
        canSeeBatchOps && {
            key: 'batch_ops',
            label: t('config.tabs.batch_ops') || 'Batch Operations',
<<<<<<< HEAD
            icon: <GearSix size={14} weight="duotone" />,
=======
            icon: <Settings size={14} />,
>>>>>>> parent of 30b1732 (Delete frontend directory)
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
<<<<<<< HEAD
                    onClick={() => navigate('/zones')}
=======
                    onClick={() => navigate(userRole === 'super_admin' ? '/super/tenants' : '/zones')}
>>>>>>> parent of 30b1732 (Delete frontend directory)
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
<<<<<<< HEAD
=======
                {userRole !== 'super_admin' && (
>>>>>>> parent of 30b1732 (Delete frontend directory)
                <NavLink to="/zones" end className={getNavLinkClass}>
                    {({ isActive }) => (
                        <>
                            {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-blue-600 dark:bg-blue-400 rounded-r-full" />}
<<<<<<< HEAD
                            <House size={18} weight="duotone" className="mr-3 shrink-0" />
=======
                            <Home className="w-[18px] h-[18px] mr-3 shrink-0" />
>>>>>>> parent of 30b1732 (Delete frontend directory)
                            {t('sidebar.dashboard')}
                        </>
                    )}
                </NavLink>
<<<<<<< HEAD

                {/* Configuration accordion */}
                {canSeeConfig && (
=======
                )}

                {/* Configuration accordion */}
                {canSeeConfig && userRole !== 'super_admin' && (
>>>>>>> parent of 30b1732 (Delete frontend directory)
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
<<<<<<< HEAD
                                <Sliders size={18} weight="duotone" className="shrink-0" />
=======
                                <Sliders className="w-[18px] h-[18px] shrink-0" />
>>>>>>> parent of 30b1732 (Delete frontend directory)
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

                {/* Tenant Admin section */}
                {userRole === 'tenant_admin' && (
                    <>
                        <div className="px-4 pt-5 pb-1.5">
                            <span className="text-[10px] font-semibold th-text-muted uppercase tracking-widest">Admin</span>
                        </div>
                        <NavLink to="/admin/logs" className={getNavLinkClass}>
                            {({ isActive }) => (
                                <>
                                    {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-blue-600 dark:bg-blue-400 rounded-r-full" />}
<<<<<<< HEAD
                                    <ShieldCheck size={18} weight="duotone" className="mr-3 shrink-0" />
=======
                                    <Shield className="w-[18px] h-[18px] mr-3 shrink-0" />
>>>>>>> parent of 30b1732 (Delete frontend directory)
                                    {t('admin.logs.title')}
                                </>
                            )}
                        </NavLink>
                        <NavLink to="/admin/zones" className={getNavLinkClass}>
                            {({ isActive }) => (
                                <>
                                    {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-blue-600 dark:bg-blue-400 rounded-r-full" />}
<<<<<<< HEAD
                                    <Stack size={18} weight="duotone" className="mr-3 shrink-0" />
=======
                                    <Layers className="w-[18px] h-[18px] mr-3 shrink-0" />
>>>>>>> parent of 30b1732 (Delete frontend directory)
                                    {t('admin.zones.title')}
                                </>
                            )}
                        </NavLink>
                        <NavLink to="/admin/users" className={getNavLinkClass}>
                            {({ isActive }) => (
                                <>
                                    {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-blue-600 dark:bg-blue-400 rounded-r-full" />}
<<<<<<< HEAD
                                    <Users size={18} weight="duotone" className="mr-3 shrink-0" />
=======
                                    <Users className="w-[18px] h-[18px] mr-3 shrink-0" />
>>>>>>> parent of 30b1732 (Delete frontend directory)
                                    {t('admin.users.title')}
                                </>
                            )}
                        </NavLink>
                        <NavLink to="/admin/master" className={getNavLinkClass}>
                            {({ isActive }) => (
                                <>
                                    {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-blue-600 dark:bg-blue-400 rounded-r-full" />}
<<<<<<< HEAD
                                    <LinkSimple size={18} weight="duotone" className="mr-3 shrink-0" />
=======
                                    <Link2 className="w-[18px] h-[18px] mr-3 shrink-0" />
>>>>>>> parent of 30b1732 (Delete frontend directory)
                                    {t('admin.master.title')}
                                </>
                            )}
                        </NavLink>
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
<<<<<<< HEAD
                                    <Buildings size={18} weight="duotone" className="mr-3 shrink-0" />
=======
                                    <Building2 className="w-[18px] h-[18px] mr-3 shrink-0" />
>>>>>>> parent of 30b1732 (Delete frontend directory)
                                    {t('super.tenants.title')}
                                </>
                            )}
                        </NavLink>
                        <NavLink to="/super/users" className={getNavLinkClass}>
                            {({ isActive }) => (
                                <>
                                    {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-blue-600 dark:bg-blue-400 rounded-r-full" />}
<<<<<<< HEAD
                                    <Users size={18} weight="duotone" className="mr-3 shrink-0" />
=======
                                    <Users className="w-[18px] h-[18px] mr-3 shrink-0" />
>>>>>>> parent of 30b1732 (Delete frontend directory)
                                    {t('super.users.title')}
                                </>
                            )}
                        </NavLink>
                        <NavLink to="/super/permissions" className={getNavLinkClass}>
                            {({ isActive }) => (
                                <>
                                    {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-blue-600 dark:bg-blue-400 rounded-r-full" />}
<<<<<<< HEAD
                                    <ShieldCheck size={18} weight="duotone" className="mr-3 shrink-0" />
=======
                                    <Shield className="w-[18px] h-[18px] mr-3 shrink-0" />
>>>>>>> parent of 30b1732 (Delete frontend directory)
                                    {t('super.permissions.title')}
                                </>
                            )}
                        </NavLink>
                        <NavLink to="/super/logs" className={getNavLinkClass}>
                            {({ isActive }) => (
                                <>
                                    {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-blue-600 dark:bg-blue-400 rounded-r-full" />}
<<<<<<< HEAD
                                    <Scroll size={18} weight="duotone" className="mr-3 shrink-0" />
=======
                                    <ScrollText className="w-[18px] h-[18px] mr-3 shrink-0" />
>>>>>>> parent of 30b1732 (Delete frontend directory)
                                    {t('super.logs.title')}
                                </>
                            )}
                        </NavLink>
                        <NavLink to="/super/monitoring" className={getNavLinkClass}>
                            {({ isActive }) => (
                                <>
                                    {isActive && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-blue-600 dark:bg-blue-400 rounded-r-full" />}
<<<<<<< HEAD
                                    <Monitor size={18} weight="duotone" className="mr-3 shrink-0" />
=======
                                    <Monitor className="w-[18px] h-[18px] mr-3 shrink-0" />
>>>>>>> parent of 30b1732 (Delete frontend directory)
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
