import React from 'react';

const WiredNetworkAssignment = ({ form, setField }) => {
    if (!form) return null;

    return (
        <div className="rounded-[2rem] border border-white/10 bg-slate-900/90 p-6 md:p-8 shadow-2xl">
            <div className="space-y-8">
                <div>
                    <h2 className="text-3xl font-black text-white">Network Assignment</h2>
                    <p className="mt-2 max-w-2xl text-sm text-slate-300">
                        This wired network assignment shell is ready in the new UI. Backend update wiring can be added next without changing the layout.
                    </p>
                </div>

                <div className="grid gap-6 xl:grid-cols-[1fr,0.9fr]">
                    <div className="rounded-[2rem] border border-white/10 bg-slate-950 p-6">
                        <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Assignment Scope</div>
                        <div className="mt-6 space-y-4">
                            <label className="flex items-center gap-3 rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-slate-200">
                                <input
                                    type="checkbox"
                                    checked={form.isEnabled}
                                    onChange={(event) => setField('isEnabled', event.target.checked)}
                                    className="h-4 w-4 rounded border-slate-500 bg-slate-900 text-cyan-400 focus:ring-cyan-500"
                                />
                                Apply assignment while this VLAN is enabled
                            </label>
                            <label className="flex items-center gap-3 rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-slate-200">
                                <input
                                    type="checkbox"
                                    checked={form.isIgmpSnoopingEnabled}
                                    onChange={(event) => setField('isIgmpSnoopingEnabled', event.target.checked)}
                                    className="h-4 w-4 rounded border-slate-500 bg-slate-900 text-cyan-400 focus:ring-cyan-500"
                                />
                                Maintain IGMP Snooping on assigned ports
                            </label>
                        </div>
                    </div>

                    <div className="rounded-[2rem] border border-white/10 bg-slate-950 p-6">
                        <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Summary</div>
                        <div className="mt-6 space-y-4 text-sm">
                            <div>
                                <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Current VLAN</div>
                                <div className="mt-2 text-2xl font-black text-white">{form.vlanId || '—'}</div>
                            </div>
                            <div>
                                <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">State</div>
                                <div className="mt-2 font-semibold text-white">{form.state}</div>
                            </div>
                            <p className="text-sm text-slate-400">
                                Frontend layout only for now. Save behavior for wired network assignment can be wired on top of this shell next.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default WiredNetworkAssignment;
