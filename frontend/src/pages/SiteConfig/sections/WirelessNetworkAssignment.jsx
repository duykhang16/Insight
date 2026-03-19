import React from 'react';
import { CheckCircle2, Router } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { formatAccessPointBands } from '../normalizers';
import { ActionButtons } from '../components/Panel';

const WirelessNetworkAssignment = ({
    form,
    isDirty,
    saving,
    isUpdateDisabled,
    selectedNetwork,
    selectedAccessPoints,
    siteId,
    setField,
    handle24GHzToggle,
    handleAccessPointBindingToggle,
    handleSave,
    handleCancel,
}) => {
    const navigate = useNavigate();

    if (!form) return null;

    return (
        <div className="rounded-[2rem] border border-white/10 bg-slate-900/90 p-6 md:p-8 shadow-2xl">
            <div className="grid gap-10 xl:grid-cols-[1fr,0.95fr]">
                <div className="space-y-8">
                    <div>
                        <h2 className="text-3xl font-black text-white">Radio</h2>
                        <p className="mt-2 text-sm text-slate-300">
                            This network is available on the following radio frequencies.
                        </p>
                    </div>

                    <div className="max-w-md rounded-2xl border border-white/10 bg-slate-950 p-4">
                        <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Radio Frequencies</div>
                        <div className="mt-4 space-y-3">
                            <label className="flex items-center gap-3 text-sm font-semibold text-slate-200">
                                <input
                                    type="checkbox"
                                    checked={form.isAvailableOn24GHzRadioBand}
                                    onChange={(event) => handle24GHzToggle(event.target.checked)}
                                    className="h-4 w-4 rounded border-slate-500 bg-slate-900 text-cyan-400 focus:ring-cyan-500"
                                />
                                2.4 GHz
                            </label>
                            <label className="flex items-center gap-3 text-sm font-semibold text-slate-200">
                                <input
                                    type="checkbox"
                                    checked={form.isAvailableOn5GHzRadioBand}
                                    onChange={(event) => setField('isAvailableOn5GHzRadioBand', event.target.checked)}
                                    className="h-4 w-4 rounded border-slate-500 bg-slate-900 text-cyan-400 focus:ring-cyan-500"
                                />
                                5 GHz
                            </label>
                            {selectedNetwork?.isAvailableOn6GHzRadioBand !== undefined && (
                                <label className="flex items-center gap-3 text-sm font-semibold text-slate-200">
                                    <input
                                        type="checkbox"
                                        checked={form.isAvailableOn6GHzRadioBand}
                                        onChange={(event) => setField('isAvailableOn6GHzRadioBand', event.target.checked)}
                                        className="h-4 w-4 rounded border-slate-500 bg-slate-900 text-cyan-400 focus:ring-cyan-500"
                                    />
                                    6 GHz
                                </label>
                            )}
                        </div>
                    </div>

                    {form.isAvailableOn24GHzRadioBand && (
                        <div className="max-w-md rounded-2xl border border-white/10 bg-slate-950 p-4">
                            <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Radio Options</div>
                            <div className="mt-4">
                                <label className="flex items-center gap-3 text-sm font-semibold text-slate-200">
                                    <input
                                        type="checkbox"
                                        checked={form.isLegacy80211bRatesEnabled}
                                        onChange={(event) => setField('isLegacy80211bRatesEnabled', event.target.checked)}
                                        className="h-4 w-4 rounded border-slate-500 bg-slate-900 text-cyan-400 focus:ring-cyan-500"
                                    />
                                    Extended 2.4 GHz range
                                </label>
                            </div>
                        </div>
                    )}
                </div>

                <div className="space-y-5">
                    <div>
                        <h2 className="text-3xl font-black text-white">Access Point</h2>
                        <p className="mt-2 text-sm text-slate-300">
                            Devices accepting client connections to this network.
                        </p>
                    </div>

                    {selectedAccessPoints.length === 0 ? (
                        <div className="flex min-h-[320px] flex-col items-center justify-center rounded-[2rem] border border-white/10 bg-slate-950 p-8 text-center">
                            <div className="inline-flex h-16 w-16 items-center justify-center rounded-full border border-cyan-400/30 bg-cyan-400/10 text-cyan-300">
                                <Router size={28} />
                            </div>
                            <h3 className="mt-6 text-4xl font-black text-white">No Access Points</h3>
                            <p className="mt-3 max-w-sm text-sm text-slate-400">
                                No access points in this site are currently bound to the selected SSID.
                            </p>
                            <button
                                type="button"
                                onClick={() => navigate(`/site/${siteId}/devices`)}
                                className="mt-6 inline-flex items-center rounded-xl border border-cyan-400/30 px-4 py-2 text-sm font-black text-cyan-300 transition-colors hover:bg-cyan-400/10"
                            >
                                View Devices
                            </button>
                        </div>
                    ) : (
                        <div className="rounded-[2rem] border border-white/10 bg-slate-950 p-6">
                            <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-4">
                                <div>
                                    <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Devices</div>
                                    <div className="mt-2 text-2xl font-black text-white">
                                        {selectedAccessPoints.length} {selectedAccessPoints.length === 1 ? 'Access Point' : 'Access Points'}
                                    </div>
                                </div>
                            </div>

                            <div className="mt-5 space-y-3">
                                {selectedAccessPoints.map((accessPoint) => (
                                    <div
                                        key={accessPoint.id}
                                        className="flex items-center gap-4 rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-4"
                                    >
                                        <label className="inline-flex cursor-pointer items-center">
                                            <input
                                                type="checkbox"
                                                checked={Boolean(accessPoint.isBoundToNetwork)}
                                                onChange={(event) => handleAccessPointBindingToggle(accessPoint.id, event.target.checked)}
                                                className="sr-only"
                                            />
                                            <span className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border transition-colors ${
                                                accessPoint.isBoundToNetwork
                                                    ? 'border-emerald-400 bg-emerald-400 text-slate-950'
                                                    : 'border-white/15 bg-slate-900 text-slate-500'
                                            }`}>
                                                {accessPoint.isBoundToNetwork ? <CheckCircle2 size={18} /> : <span className="h-4 w-4 rounded-[4px] border border-current" />}
                                            </span>
                                        </label>
                                        <div className="min-w-0 flex-1">
                                            <div className="truncate text-sm font-black text-white">{accessPoint.name}</div>
                                        </div>
                                        <div className="shrink-0 text-sm font-semibold text-slate-400">
                                            {formatAccessPointBands(accessPoint) || accessPoint.deviceModel || 'Bands unavailable'}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
            {isDirty && <ActionButtons onUpdate={handleSave} onCancel={handleCancel} saving={saving} disabled={isUpdateDisabled} />}
        </div>
    );
};

export default WirelessNetworkAssignment;
