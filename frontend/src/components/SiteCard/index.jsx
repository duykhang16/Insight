import React from 'react';
import { ArrowRight, WifiOff } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const SEVERITY_DOT = {
    good: 'bg-emerald-500',
    poor: 'bg-rose-500',
};

function getDurationLabel(seconds) {
    if (!seconds) return 'Last 24 hours';
    const hours = Math.round(seconds / 3600);
    if (hours <= 24) return `Last ${hours} hours`;
    return `Last ${Math.round(hours / 24)} days`;
}

function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
}

const SiteCard = ({ site }) => {
    const navigate = useNavigate();
    const score = site.healthScore?.score;
    const severity = site.healthScore?.scoreSeverity;
    const dotClass = SEVERITY_DOT[severity] || 'bg-slate-400';

    const counters = site.activeAlertsCounters || {};
    const majorCount = counters.activeMajorAlertsCount || 0;
    const minorCount = counters.activeMinorAlertsCount || 0;
    const hasAlerts = majorCount > 0 || minorCount > 0;

    const trend = capitalize(site.healthScoreTrend);
    const durationLabel = getDurationLabel(site.historyDurationSeconds);
    const isOffline = site.status === 'down';
    const siteId = site.siteId || site.id || site._id;

    return (
        <div
            onClick={() => navigate(`/overview/${siteId}`)}
            className="bg-slate-800 rounded-xl shadow-lg border border-white/5 hover:border-blue-500/40 hover:shadow-blue-500/10 transition-all cursor-pointer flex flex-col overflow-hidden"
        >
            {/* Header */}
            <div className="px-4 pt-4 pb-2">
                <h3 className="text-sm font-bold text-white truncate" title={site.siteName}>
                    {site.siteName}
                </h3>
            </div>

            {/* Body */}
            <div className="flex flex-1 px-4 py-3 gap-4">
                {/* Health column */}
                <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-400 mb-1">Health</p>
                    <div className="flex items-center gap-2">
                        <span className="text-3xl font-black text-white leading-none">
                            {score !== null && score !== undefined ? `${score}%` : '—'}
                        </span>
                        <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${dotClass}`} />
                    </div>
                    <p className="text-xs text-slate-400 mt-1">{capitalize(severity) || 'None'}</p>
                </div>

                {/* Alerts column — conditional */}
                {hasAlerts && (
                    <div className="flex-1 min-w-0">
                        <p className="text-xs text-slate-400 mb-1">Alerts</p>
                        {majorCount > 0 ? (
                            <>
                                <div className="flex items-center gap-1.5">
                                    {/* Red diamond */}
                                    <span className="text-rose-500 text-lg leading-none">◆</span>
                                    <span className="text-2xl font-black text-white leading-none">{majorCount}</span>
                                </div>
                                <p className="text-xs text-slate-400 mt-1">Major</p>
                            </>
                        ) : (
                            <>
                                <div className="flex items-center gap-1.5">
                                    {/* Orange triangle */}
                                    <span className="text-amber-400 text-lg leading-none">▲</span>
                                    <span className="text-2xl font-black text-white leading-none">{minorCount}</span>
                                </div>
                                <p className="text-xs text-slate-400 mt-1">Minor</p>
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="px-4 pb-4 flex items-center justify-between">
                <div>
                    <div className="flex items-center gap-1 text-slate-300 text-xs font-semibold">
                        <ArrowRight size={13} />
                        <span>{trend}</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{durationLabel}</p>
                </div>

                {/* Offline badge */}
                {isOffline && (
                    <div className="flex items-center gap-1 text-slate-400 text-xs">
                        <WifiOff size={13} />
                        <span>Offline</span>
                    </div>
                )}
            </div>
        </div>
    );
};

export default SiteCard;
