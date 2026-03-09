import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSite } from '../../context/SiteContext';
import { MapPin, Wifi, ChevronRight } from 'lucide-react';

const STATUS_BADGE = {
    up:   { label: 'Online',  cls: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' },
    down: { label: 'Offline', cls: 'bg-slate-500/10 text-slate-400 border border-slate-500/20' },
};

const GlobalDashboard = () => {
    const { sites, loadingSites, fetchSites } = useSite();
    const navigate = useNavigate();

    useEffect(() => { fetchSites(); }, []);

    if (loadingSites) return (
        <div className="p-8 flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-blue-500" />
        </div>
    );

    return (
        <div className="p-8 pb-32">
            <div className="mb-8">
                <h1 className="text-2xl font-black text-white tracking-tight">All Sites</h1>
                <p className="text-sm text-slate-400 mt-1">{sites.length} sites connected</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {sites.map(site => {
                    const id = site.siteId || site.id || site._id;
                    const name = site.siteName || site.name || id;
                    const role = site.internal_app_role || site.aruba_role_raw || '';
                    return (
                        <div
                            key={id}
                            onClick={() => navigate(`/site/${id}`)}
                            className="bg-[#0F172A] border border-slate-800 rounded-lg p-5 cursor-pointer hover:border-blue-500/50 hover:bg-slate-800/50 transition-all group"
                        >
                            <div className="flex items-start justify-between mb-3">
                                <div className="p-2 bg-slate-800 rounded-md border border-slate-700">
                                    <MapPin size={16} className="text-blue-400" />
                                </div>
                                <ChevronRight size={16} className="text-slate-600 group-hover:text-slate-400 transition-colors" />
                            </div>
                            <h3 className="text-sm font-bold text-white mb-1 truncate">{name}</h3>
                            <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                    <Wifi size={12} className="text-slate-500" />
                                    <span className="text-xs text-slate-500 uppercase tracking-wider">{role || 'Site'}</span>
                                </div>
                                {site.status && STATUS_BADGE[site.status] && (
                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${STATUS_BADGE[site.status].cls}`}>
                                        {STATUS_BADGE[site.status].label}
                                    </span>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default GlobalDashboard;
