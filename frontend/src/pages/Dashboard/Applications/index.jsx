import React, { useState, useMemo, useEffect } from 'react';
import { RefreshCw, AlertCircle, Search, LayoutGrid } from 'lucide-react';
import apiClient from '../../../api/apiClient';
import { useSite } from '../../../context/SiteContext';
import { processApplicationData } from './applicationProcessor';
import ApplicationTable from './ApplicationTable';
import useIntervalFetch from '../../../hooks/useIntervalFetch';
import { useSettings } from '../../../context/SettingsContext';
import SyncIndicator from '../../../components/SyncIndicator';

const Applications = () => {
    const [dashboardData, setDashboardData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [error, setError] = useState('');
    const [lastUpdated, setLastUpdated] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [sortConfig, setSortConfig] = useState({ key: 'usage', direction: 'desc' });

    const { selectedSiteId, sites, fetchSites } = useSite();
    const { isAutoRefreshEnabled } = useSettings();

    useEffect(() => {
        if (sites.length === 0) fetchSites();
    }, []);

    useEffect(() => {
        if (selectedSiteId) fetchDashboardData(selectedSiteId);
    }, [selectedSiteId]);

    const fetchDashboardData = async (siteId, silent = false) => {
        if (!silent) setLoading(true);
        else setIsRefreshing(true);

        setError('');
        try {
            const res = await apiClient.get(`/overview/sites/${siteId}/dashboard`);
            setDashboardData(res.data);
            setLastUpdated(new Date());
        } catch (err) {
            console.error("Applications fetch error:", err);
            if (!silent) setError("Failed to synchronize application traffic analytics.");
        } finally {
            if (!silent) setLoading(false);
            else setIsRefreshing(false);
        }
    };

    // Auto-polling conditionally based on settings
    useIntervalFetch(() => {
        if (selectedSiteId && !loading) {
            fetchDashboardData(selectedSiteId, true);
        }
    }, isAutoRefreshEnabled ? 60000 : null, [selectedSiteId, loading, isAutoRefreshEnabled]);


    const handleSort = (key) => {
        setSortConfig(prev => ({
            key,
            direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const processedData = useMemo(() => {
        const { categories } = processApplicationData(dashboardData);

        let result = [...categories];

        // Filtering
        if (searchTerm) {
            result = result.filter(n =>
                n.meta.name.toLowerCase().includes(searchTerm.toLowerCase())
            );
        }

        // Sorting
        result.sort((a, b) => {
            let valA, valB;
            switch (sortConfig.key) {
                case 'name':
                    valA = a.meta.name.toLowerCase();
                    valB = b.meta.name.toLowerCase();
                    break;
                case 'usage':
                    valA = a.usage;
                    valB = b.usage;
                    break;
                case 'percentage':
                    valA = a.percentage;
                    valB = b.percentage;
                    break;
                default:
                    return 0;
            }

            if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
            if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });

        return result;
    }, [dashboardData, searchTerm, sortConfig]);

    return (
        <div className="p-8 pb-32 font-sans overflow-hidden bg-slate-950 min-h-screen">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                <div>
                    <h1 className="text-2xl font-black text-white tracking-tight italic uppercase">Application Traffic</h1>
                    <p className="text-sm text-slate-400 mt-1">
                        Deep Packet Inspection for {sites.find(s => s.siteId === selectedSiteId)?.siteName || 'current site'}
                    </p>
                </div>

                <div className="flex items-center gap-4">
                    <SyncIndicator isSyncing={loading || isRefreshing} lastUpdated={lastUpdated} />
                </div>
            </div>

            {/* Filter Toolbar */}
            <div className="flex flex-wrap items-center gap-4 mb-6">
                <div className="relative flex-1 min-w-[320px]">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                    <input
                        type="text"
                        placeholder="Search App Category (e.g. streaming, web)..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full h-14 pl-12 pr-4 bg-slate-900 border border-white/5 rounded-2xl text-white text-sm focus:outline-none focus:border-indigo-500/50 shadow-inner transition-all hover:bg-slate-800/50"
                    />
                </div>

                <div className="bg-slate-900 border border-white/5 rounded-2xl h-14 px-5 flex items-center gap-4 shadow-xl">
                    <LayoutGrid size={18} className="text-indigo-400" />
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        {processedData.length} Categories Tracked
                    </span>
                </div>
            </div>

            {error && (
                <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-center gap-3 text-rose-400">
                    <AlertCircle size={20} />
                    <span className="text-sm font-bold">{error}</span>
                </div>
            )}

            <ApplicationTable
                data={processedData}
                sortConfig={sortConfig}
                onSort={handleSort}
                loading={loading}
            />
        </div>
    );
};

export default Applications;
