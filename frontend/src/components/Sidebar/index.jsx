import React from 'react';
import { NavLink } from 'react-router-dom';
import { Home, Activity, Bell, Users, Wifi, Monitor, Box, Sliders, Shield } from 'lucide-react';
import UserWidget from './UserWidget';
import ThemeLanguageToggle from '../ThemeLanguageToggle';
import { useLanguage } from '../../context/LanguageContext';

// ---------------------------------------------------------------------------
// Temporary feature flag — set to true to re-enable the Language and
// Dark/Light mode toggle buttons at the bottom of the sidebar.
// The <ThemeLanguageToggle /> component is NOT deleted, just hidden.
// ---------------------------------------------------------------------------
const ENABLE_UI_TOGGLES = false;

// userRole is passed as a React prop (sourced from App state) so the sidebar
// re-renders reactively when the role is resolved — no sessionStorage race.
const Sidebar = ({ onLogout, userRole = 'guest' }) => {
    const { t } = useLanguage();

    const getNavLinkClass = ({ isActive }) =>
        `flex items-center px-4 py-3 text-sm font-medium transition-colors ${isActive
            ? "bg-blue-600 text-white"
            : "text-gray-300 hover:bg-slate-800 hover:text-white"
        }`;

    return (
        <div className="flex flex-col w-64 bg-[#0F172A] border-r border-slate-800 h-full transition-colors duration-300">
            <div className="flex items-center justify-between px-4 h-16 border-b border-slate-800 gap-3">
                <div className="flex items-center gap-3">
                    <span className="text-xl font-black italic text-white tracking-widest uppercase">INSIGHT</span>
                    <div className="relative flex items-center justify-center h-2 w-2" title="Live Sync">
                        <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-50 animate-ping"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </div>
                </div>
            </div>
            <nav className="flex-1 overflow-y-auto pt-4 space-y-1">
                <NavLink to="/overview" className={getNavLinkClass}><Home className="w-5 h-5 mr-3" /> {t('sidebar.dashboard')}</NavLink>
                <NavLink to="/health" className={getNavLinkClass}><Activity className="w-5 h-5 mr-3" /> Health</NavLink>
                <NavLink to="/alerts" className={getNavLinkClass}><Bell className="w-5 h-5 mr-3" /> Alerts</NavLink>
                <NavLink to="/clients" className={getNavLinkClass}><Users className="w-5 h-5 mr-3" /> Clients</NavLink>
                <NavLink to="/networks" className={getNavLinkClass}><Wifi className="w-5 h-5 mr-3" /> Networks</NavLink>
                <NavLink to="/devices" className={getNavLinkClass}><Monitor className="w-5 h-5 mr-3" /> Devices</NavLink>
                <NavLink to="/applications" className={getNavLinkClass}><Box className="w-5 h-5 mr-3" /> Applications</NavLink>
                <NavLink to="/configuration" className={getNavLinkClass}><Sliders className="w-5 h-5 mr-3" /> Configuration</NavLink>
                {userRole === 'admin' && (
                    <NavLink to="/admin/logs" className={getNavLinkClass}><Shield className="w-5 h-5 mr-3" /> Admin Logs</NavLink>
                )}
            </nav>
            {/* Toggle section — controlled by ENABLE_UI_TOGGLES flag above */}
            {ENABLE_UI_TOGGLES && (
                <div className="p-4 border-t border-slate-800">
                    <ThemeLanguageToggle />
                </div>
            )}
            <UserWidget onLogout={onLogout} />
        </div>
    );
};

export default Sidebar;
