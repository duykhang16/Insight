import React, { useState } from 'react';
import { LayoutGrid, List, Search, Plus } from 'lucide-react';
import SiteCard from './index';

const SiteGrid = ({ sites = [], loading = false }) => {
    const [search, setSearch] = useState('');
    const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list'

    const filtered = sites.filter(site =>
        (site.siteName || site.name || '').toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="mb-8">
            {/* Page Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5">
                <div>
                    <h1 className="text-2xl font-black text-white tracking-tight">Sites</h1>
                    <p className="text-sm text-slate-400 mt-0.5">
                        {loading ? 'Loading…' : `${filtered.length} item${filtered.length !== 1 ? 's' : ''}`}
                    </p>
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                    {/* Search */}
                    <div className="relative">
                        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        <input
                            type="text"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Search Sites"
                            className="pl-9 pr-4 h-9 bg-slate-800 border border-white/5 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50 w-48"
                        />
                    </div>

                    {/* View toggle */}
                    <div className="flex items-center bg-slate-800 border border-white/5 rounded-lg overflow-hidden">
                        <button
                            onClick={() => setViewMode('grid')}
                            className={`p-2 transition-colors ${viewMode === 'grid' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
                            title="Grid view"
                        >
                            <LayoutGrid size={16} />
                        </button>
                        <button
                            onClick={() => setViewMode('list')}
                            className={`p-2 transition-colors ${viewMode === 'list' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
                            title="List view"
                        >
                            <List size={16} />
                        </button>
                    </div>

                    {/* Create Site — placeholder */}
                    <button className="flex items-center gap-2 h-9 px-4 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-lg transition-colors">
                        <Plus size={15} />
                        Create Site
                    </button>
                </div>
            </div>

            {/* Grid / List */}
            {loading ? (
                <div className={viewMode === 'grid'
                    ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'
                    : 'flex flex-col gap-3'
                }>
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="bg-slate-800 rounded-xl h-36 animate-pulse border border-white/5" />
                    ))}
                </div>
            ) : filtered.length === 0 ? (
                <div className="text-slate-500 text-sm py-8 text-center">
                    {search ? `No sites matching "${search}"` : 'No sites available.'}
                </div>
            ) : (
                <div className={viewMode === 'grid'
                    ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4'
                    : 'flex flex-col gap-3'
                }>
                    {filtered.map(site => (
                        <SiteCard key={site.siteId || site.id || site._id} site={site} />
                    ))}
                </div>
            )}
        </div>
    );
};

export default SiteGrid;
