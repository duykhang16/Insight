import React, { useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
    Home, Sliders, Shield, Layers, Link2, Users,
    Building2, ScrollText, ChevronDown, Copy, Trash2
} from 'lucide-react';
import UserWidget from './UserWidget';
import ThemeLanguageToggle from '../ThemeLanguageToggle';
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
        `flex items-center px-4 py-3 text-sm font-medium transition-colors ${isActive
            ? 'bg-blue-600 th-text-primary'
            : 'th-text-secondary hover:th-bg-surface-alt hover:th-text-primary'
        }`;

    // Navigate to /config and set tab via search param
    const goToConfigTab = (tab) => {
        navigate(`/config?tab=${tab}`);
    };

    // Permission flags
    const canSeeCloneSync = rolePermissions.full_clone === true || rolePermissions.smart_sync === true;
    const canSeeBatchProvision = rolePermissions.batch_provision === true;
    const canSeeBatchAccess = rolePermissions.batch_access === true;
    const canSeeBatchDelete = rolePermissions.batch_delete === true;
    const canSeeConfig = (userRole !== 'viewer' || isZoneAdmin) &&
        (canSeeCloneSync || canSeeBatchProvision || canSeeBatchAccess || canSeeBatchDelete);

    // Sub-items for Configuration accordion
    const configSubItems = [
        canSeeCloneSync && {
            key: 'clone',
            label: t('config.tabs.clone_sync'),
            icon: <Copy size={14} />,
            help: t('config.help.clone_sync'),
        },
        canSeeBatchProvision && {
            key: 'batch_provision',
            label: t('config.tabs.batch_provision'),
            icon: <Layers size={14} />,
            help: t('config.help.batch_provision'),
        },
        canSeeBatchAccess && {
            key: 'batch_access',
            label: t('config.tabs.batch_access'),
            icon: <Users size={14} />,
            help: t('config.help.batch_access'),
        },
        canSeeBatchDelete && {
            key: 'batch_delete',
            label: t('config.tabs.batch_delete'),
            icon: <Trash2 size={14} />,
            help: t('config.help.batch_delete'),
        },
    ].filter(Boolean);

    // Check if a config sub-tab is active
    const currentTab = new URLSearchParams(location.search).get('tab');
    const isConfigSubActive = (key) => isOnConfig && currentTab === key;

    return (
        <div className="flex flex-col w-64 th-bg-sidebar border-r th-border h-full transition-colors duration-200">
            {/* Brand header */}
            <div className="flex items-center justify-between px-4 h-16 border-b th-border gap-3">
                <div className="flex items-center gap-3">
                    <span className="text-xl font-black italic th-text-primary tracking-widest uppercase">INSIGHT</span>
                    <div className="relative flex items-center justify-center h-2 w-2" title="Live Sync">
                        <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-50 animate-ping"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </div>
                </div>
                <ThemeLanguageToggle />
            </div>

            {/* Navigation */}
            <nav className="flex-1 overflow-y-auto pt-4 space-y-1">
                <NavLink to="/zones" end className={getNavLinkClass}>
                    <Home className="w-5 h-5 mr-3" />
                    {t('sidebar.dashboard')}
                </NavLink>

                {/* Configuration accordion */}
                {canSeeConfig && (
                    <div>
                        {/* Accordion trigger */}
                        <button
                            onClick={() => setConfigOpen(v => !v)}
                            className={`w-full flex items-center justify-between px-4 py-3 text-sm font-medium transition-colors ${
                                isOnConfig
                                    ? 'text-blue-500 dark:text-blue-400 bg-blue-50 dark:bg-blue-600/10'
                                    : 'th-text-secondary hover:th-bg-surface-alt hover:th-text-primary'
                            }`}
                        >
                            <span className="flex items-center gap-3">
                                <Sliders className="w-5 h-5" />
                                {t('sidebar.configuration')}
                            </span>
                            <ChevronDown
                                size={14}
                                className={`transition-transform duration-200 ${configOpen ? 'rotate-180' : ''}`}
                            />
                        </button>

                        {/* Sub-items */}
                        {configOpen && (
                            <div className="pl-4 pb-1 space-y-0.5">
                                {configSubItems.map(item => (
                                    <button
                                        key={item.key}
                                        onClick={() => goToConfigTab(item.key)}
                                        className={`w-full flex items-center justify-between pl-5 pr-3 py-2.5 text-xs font-medium rounded-lg transition-colors group ${
                                            isConfigSubActive(item.key)
                                                ? 'bg-blue-600 th-text-primary'
                                                : 'th-text-muted hover:th-bg-surface-alt hover:th-text-primary'
                                        }`}
                                    >
                                        <span className="flex items-center gap-2">
                                            <span className={`w-1 h-1 rounded-full ${isConfigSubActive(item.key) ? 'bg-white' : 'th-text-muted'}`} style={{ backgroundColor: isConfigSubActive(item.key) ? undefined : 'var(--color-text-muted)' }} />
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
                        )}
                    </div>
                )}

                {/* Tenant Admin section */}
                {userRole === 'tenant_admin' && (
                    <>
                        <div className="px-4 pt-4 pb-1">
                            <span className="text-[10px] font-semibold th-text-muted uppercase tracking-widest">Admin</span>
                        </div>
                        <NavLink to="/admin/logs" className={getNavLinkClass}>
                            <Shield className="w-5 h-5 mr-3" />
                            {t('admin.logs.title')}
                        </NavLink>
                        <NavLink to="/admin/zones" className={getNavLinkClass}>
                            <Layers className="w-5 h-5 mr-3" />
                            {t('admin.zones.title')}
                        </NavLink>
                        <NavLink to="/admin/users" className={getNavLinkClass}>
                            <Users className="w-5 h-5 mr-3" />
                            {t('admin.users.title')}
                        </NavLink>
                        <NavLink to="/admin/master" className={getNavLinkClass}>
                            <Link2 className="w-5 h-5 mr-3" />
                            {t('admin.master.title')}
                        </NavLink>
                    </>
                )}

                {/* Super Admin section */}
                {userRole === 'super_admin' && (
                    <>
                        <div className="px-4 pt-4 pb-1">
                            <span className="text-[10px] font-semibold th-text-muted uppercase tracking-widest">Super Admin</span>
                        </div>
                        <NavLink to="/super/tenants" className={getNavLinkClass}>
                            <Building2 className="w-5 h-5 mr-3" />
                            {t('super.tenants.title')}
                        </NavLink>
                        <NavLink to="/super/users" className={getNavLinkClass}>
                            <Users className="w-5 h-5 mr-3" />
                            {t('super.users.title')}
                        </NavLink>
                        <NavLink to="/super/permissions" className={getNavLinkClass}>
                            <Shield className="w-5 h-5 mr-3" />
                            {t('super.permissions.title')}
                        </NavLink>
                        <NavLink to="/super/logs" className={getNavLinkClass}>
                            <ScrollText className="w-5 h-5 mr-3" />
                            {t('super.logs.title')}
                        </NavLink>
                    </>
                )}
            </nav>

            <UserWidget onLogout={onLogout} />
        </div>
    );
};

export default GlobalSidebar;
