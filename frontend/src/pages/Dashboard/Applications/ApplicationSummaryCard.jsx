import React, { useMemo } from 'react';
import { Box, ArrowRight } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { formatBytes } from '../../../api/apiClient';
import { processApplicationData } from './applicationProcessor';
import { useNavigate } from 'react-router-dom';

const ApplicationSummaryCard = ({ dashboardData, loading }) => {
    const navigate = useNavigate();
    const { totalUsage, categories } = useMemo(() => {
        return processApplicationData(dashboardData);
    }, [dashboardData]);

    const top5 = categories.slice(0, 5);

    // Data for Recharts
    const chartData = useMemo(() => {
        const data = top5.map(cat => ({
            name: cat.meta.name,
            value: cat.usage,
            color: cat.meta.hex
        }));

        // Add "Others" if any
        const othersUsage = categories.slice(5).reduce((sum, cat) => sum + cat.usage, 0);
        if (othersUsage > 0) {
            data.push({ name: 'Others', value: othersUsage, color: '#475569' });
        }
        return data;
    }, [top5, categories]);

    if (loading) {
        return (
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-xl border border-slate-200 dark:border-white/5 animate-pulse min-h-[400px]">
                <div className="h-4 w-32 bg-slate-200 dark:bg-slate-800 rounded mb-8"></div>
                <div className="flex justify-center mb-8">
                    <div className="w-40 h-40 rounded-full bg-slate-200 dark:bg-slate-800"></div>
                </div>
                <div className="space-y-4">
                    {[1, 2, 3].map(i => <div key={i} className="h-4 w-full bg-slate-200 dark:bg-slate-800 rounded"></div>)}
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white dark:bg-slate-900 rounded-[2rem] p-6 shadow-xl dark:shadow-2xl border border-slate-200 dark:border-white/5 relative overflow-hidden group hover:border-indigo-300 dark:hover:border-indigo-500/20 transition-all duration-500 flex flex-col h-full">
            <div className="absolute -right-6 -top-6 opacity-[0.03] group-hover:scale-110 transition-transform duration-700 pointer-events-none">
                <Box size={160} />
            </div>

            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-indigo-50 dark:bg-indigo-500/10 rounded-2xl border border-indigo-100 dark:border-indigo-500/20 shadow-inner">
                        <Box size={22} className="text-indigo-500 dark:text-indigo-400" />
                    </div>
                    <div>
                        <h2 className="text-sm font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Applications</h2>
                        <div className="text-xl font-black text-slate-800 dark:text-white tracking-tighter mt-0.5">
                            {formatBytes(totalUsage)}
                            <span className="text-[10px] text-slate-400 dark:text-slate-500 ml-2 font-bold uppercase tracking-widest">Total 24h</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex-1 flex flex-col lg:flex-row items-center gap-8 mb-4 min-w-0 w-full">
                {/* Chart Area */}
                <div className="w-full lg:w-1/2 min-w-0 relative" style={{ height: 200, minHeight: 200 }}>
                    {chartData.length > 0 && (
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={chartData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={55}
                                    outerRadius={80}
                                    paddingAngle={4}
                                    dataKey="value"
                                    stroke="none"
                                >
                                    {chartData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Pie>
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                                    itemStyle={{ color: '#fff', fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase' }}
                                    formatter={(value) => [formatBytes(value), 'Usage']}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    )}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
                        <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-none">Total</div>
                        <div className="text-base font-black text-slate-800 dark:text-white tracking-tight">24h</div>
                    </div>
                </div>

                {/* List Area */}
                <div className="w-full lg:w-1/2 space-y-3.5">
                    {top5.map((cat) => (
                        <div key={cat.id} className="group/item">
                            <div className="flex justify-between items-center mb-1.5">
                                <span className="text-[10px] font-black text-slate-600 dark:text-slate-300 uppercase tracking-widest flex items-center gap-2">
                                    <div
                                        className="w-1.5 h-1.5 rounded-full shadow-[0_0_5px] shadow-current"
                                        style={{ backgroundColor: cat.meta.hex, color: cat.meta.hex }}
                                    ></div>
                                    {cat.meta.name}
                                </span>
                                <span className="text-[10px] font-mono text-indigo-500 dark:text-indigo-400 font-bold">{cat.percentage.toFixed(1)}%</span>
                            </div>
                            <div className="w-full h-1 bg-slate-100 dark:bg-slate-800/50 rounded-full overflow-hidden border border-slate-200 dark:border-white/5">
                                <div
                                    className="h-full transition-all duration-1000 shadow-[0_0_8px_rgba(0,0,0,0.3)]"
                                    style={{
                                        width: `${cat.percentage}%`,
                                        backgroundColor: cat.meta.hex
                                    }}
                                ></div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="mt-auto pt-6 border-t border-slate-100 dark:border-white/5">
                <button
                    onClick={() => navigate(`/site/${dashboardData?.siteId || Object.values(dashboardData || {})[0]?.siteId || 'current'}/applications`)}
                    className="flex items-center justify-between w-full h-12 px-6 bg-slate-50 dark:bg-slate-800/50 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 rounded-2xl border border-slate-200 dark:border-white/5 hover:border-indigo-300 dark:hover:border-indigo-500/30 transition-all group/btn"
                >
                    <span className="text-[10px] font-black text-slate-500 dark:text-slate-400 group-hover/btn:text-indigo-600 dark:group-hover/btn:text-white uppercase tracking-widest">Explore Full Traffic</span>
                    <ArrowRight size={14} className="text-slate-400 dark:text-slate-600 group-hover/btn:translate-x-1 group-hover/btn:text-indigo-500 dark:group-hover/btn:text-indigo-400 transition-all" />
                </button>
            </div>
        </div>
    );
};

export default ApplicationSummaryCard;
