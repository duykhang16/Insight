import React from 'react';
import { NavLink } from 'react-router-dom';
import { Home, Sliders, Shield, Layers, Link2, Users, Building2, ScrollText } from 'lucide-react';
import UserWidget from './UserWidget';

const GlobalSidebar = ({ onLogout, userRole = 'guest', isZoneAdmin = false }) => {
    const getNavLinkClass = ({ isActive }) =>
        `flex items-center px-4 py-3 text-sm font-medium transition-colors ${
            isActive
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

            {/* Navigation */}
            <nav className="flex-1 overflow-y-auto pt-4 space-y-1">
                <NavLink to="/zones" end className={getNavLinkClass}>
                    <Home className="w-5 h-5 mr-3" />
                    Dashboard
                </NavLink>
                {/* Configuration — hidden for viewer UNLESS they are a Zone Admin */}
                {(userRole !== 'viewer' || isZoneAdmin) && (
                    <NavLink to="/config" className={getNavLinkClass}>
                        <Sliders className="w-5 h-5 mr-3" />
                        Configuration
                    </NavLink>
                )}

                {/* Tenant Admin section */}
                {userRole === 'tenant_admin' && (
                    <>
                        <div className="px-4 pt-4 pb-1">
                            <span className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest">Admin</span>
                        </div>
                        <NavLink to="/admin/logs" className={getNavLinkClass}>
                            <Shield className="w-5 h-5 mr-3" />
                            Admin Logs
                        </NavLink>
                        <NavLink to="/admin/zones" className={getNavLinkClass}>
                            <Layers className="w-5 h-5 mr-3" />
                            Zone Management
                        </NavLink>
                        <NavLink to="/admin/users" className={getNavLinkClass}>
                            <Users className="w-5 h-5 mr-3" />
                            User Management
                        </NavLink>
                        <NavLink to="/admin/master" className={getNavLinkClass}>
                            <Link2 className="w-5 h-5 mr-3" />
                            Master Account
                        </NavLink>
                    </>
                )}

                {/* Super Admin section */}
                {userRole === 'super_admin' && (
                    <>
                        <div className="px-4 pt-4 pb-1">
                            <span className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest">Super Admin</span>
                        </div>
                        <NavLink to="/super/tenants" className={getNavLinkClass}>
                            <Building2 className="w-5 h-5 mr-3" />
                            Tenant Management
                        </NavLink>
                        <NavLink to="/super/users" className={getNavLinkClass}>
                            <Users className="w-5 h-5 mr-3" />
                            All Users
                        </NavLink>
                        <NavLink to="/super/logs" className={getNavLinkClass}>
                            <ScrollText className="w-5 h-5 mr-3" />
                            System Logs
                        </NavLink>
                    </>
                )}
            </nav>

            <UserWidget onLogout={onLogout} />
        </div>
    );
};

export default GlobalSidebar;
