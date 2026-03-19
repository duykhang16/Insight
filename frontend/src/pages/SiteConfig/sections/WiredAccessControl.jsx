import React from 'react';
import { Info, Monitor } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '../../../components/ui/dialog';
import { isValidIpv4Address } from '../normalizers';
import { LabeledField } from '../components/Panel';

const WiredAccessControl = ({
    form,
    setField,
    showAddAllowedIpModal,
    newAllowedIpAddress,
    setNewAllowedIpAddress,
    allowedIpInputTouched,
    setAllowedIpInputTouched,
    handleOpenAddAllowedIpModal,
    handleCloseAddAllowedIpModal,
    handleAddAllowedIpAddress,
    handleRemoveAllowedIpAddress,
}) => {
    if (!form) return null;

    const allowedIpValidationMessage = allowedIpInputTouched && !newAllowedIpAddress.trim()
        ? 'This field is required.'
        : allowedIpInputTouched && !isValidIpv4Address(newAllowedIpAddress.trim())
            ? 'Enter a valid IPv4 address.'
            : '';

    return (
        <>
            <Dialog open={showAddAllowedIpModal} onOpenChange={(open) => { if (!open) handleCloseAddAllowedIpModal(); }}>
                <DialogContent className="sm:max-w-[760px] border-white/10 bg-slate-800 p-0 text-slate-100" showCloseButton={false}>
                    <DialogHeader className="px-7 pt-7">
                        <DialogTitle className="text-5xl font-black tracking-tight text-slate-100">Add Allowed IP Address</DialogTitle>
                        <DialogDescription className="pt-2 text-lg font-semibold text-slate-300">
                            Enter a destination IP address to allow on the network.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="px-7 pt-3">
                        <LabeledField label="IP Address *">
                            <input
                                value={newAllowedIpAddress}
                                onChange={(event) => setNewAllowedIpAddress(event.target.value)}
                                onBlur={() => setAllowedIpInputTouched(true)}
                                className={`w-full rounded-2xl border bg-slate-900 px-4 py-3 text-white focus:outline-none ${
                                    allowedIpValidationMessage
                                        ? 'border-rose-500/70 focus:border-rose-400'
                                        : 'border-cyan-400 focus:border-cyan-300'
                                }`}
                            />
                            {allowedIpValidationMessage && (
                                <div className="mt-2 flex items-center gap-2 text-sm font-medium text-slate-200">
                                    <Info size={14} className="text-slate-400" />
                                    <span>{allowedIpValidationMessage}</span>
                                </div>
                            )}
                        </LabeledField>
                    </div>
                    <DialogFooter className="mt-6 border-white/10 bg-slate-800/95 px-7 pb-7 pt-4 sm:justify-end">
                        <Button variant="ghost" size="lg" onClick={handleCloseAddAllowedIpModal} className="text-base font-black text-slate-100 hover:bg-slate-700 hover:text-white">
                            Cancel
                        </Button>
                        <Button
                            size="lg"
                            onClick={handleAddAllowedIpAddress}
                            disabled={!isValidIpv4Address(newAllowedIpAddress.trim())}
                            className="bg-slate-700 px-6 text-base font-black text-slate-200 hover:bg-slate-600 disabled:bg-slate-700 disabled:text-slate-400"
                        >
                            Add IP Address
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <div className="rounded-[2rem] border border-white/10 bg-slate-900/90 p-6 md:p-8 shadow-2xl">
                <div className="space-y-8">
                    <div>
                        <h2 className="text-3xl font-black text-white">Network Access</h2>
                        <p className="mt-2 max-w-2xl text-sm text-slate-300">
                            Access restrictions for traffic moving through this wired network.
                        </p>
                    </div>

                    <div className="max-w-3xl rounded-[2rem] border border-white/10 bg-slate-950 p-6">
                        <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Access Restrictions</div>
                        <div className="mt-6">
                            <label className="flex items-center gap-3 rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-slate-200">
                                <input
                                    type="checkbox"
                                    checked={form.isNetworkDestinationsRestricted}
                                    onChange={(event) => setField('isNetworkDestinationsRestricted', event.target.checked)}
                                    className="h-4 w-4 rounded border-slate-500 bg-slate-900 text-cyan-400 focus:ring-cyan-500"
                                />
                                Network Destinations
                            </label>
                        </div>
                    </div>

                    {form.isNetworkDestinationsRestricted && (
                        <div className="space-y-5">
                            <div>
                                <h3 className="text-3xl font-black text-white">Allowed Destination IP Addresses</h3>
                                <p className="mt-2 text-sm text-slate-300">
                                    Clients can access the following IP addresses.
                                </p>
                            </div>

                            {form.allowedDestinationIpAddresses.length === 0 ? (
                                <div className="flex min-h-[360px] flex-col items-center justify-center rounded-[2rem] border border-white/10 bg-transparent p-8 text-center">
                                    <div className="inline-flex h-16 w-16 items-center justify-center text-emerald-400">
                                        <Monitor size={42} strokeWidth={2.2} />
                                    </div>
                                    <h4 className="mt-6 text-4xl font-black text-white">No IP Addresses Allowed</h4>
                                    <p className="mt-3 max-w-sm text-sm text-slate-300">
                                        Add IP addresses to allow on the wired network.
                                    </p>
                                    <Button
                                        size="lg"
                                        onClick={handleOpenAddAllowedIpModal}
                                        className="mt-6 border border-emerald-400 bg-transparent px-6 text-base font-black text-white hover:bg-emerald-400/10"
                                    >
                                        Add
                                    </Button>
                                </div>
                            ) : (
                                <div className="rounded-[2rem] border border-white/10 bg-slate-950 p-6">
                                    <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-4">
                                        <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Allowed IP Addresses</div>
                                        <Button
                                            size="sm"
                                            onClick={handleOpenAddAllowedIpModal}
                                            className="border border-emerald-400 bg-transparent px-4 text-xs font-black text-white hover:bg-emerald-400/10"
                                        >
                                            Add
                                        </Button>
                                    </div>
                                    <div className="mt-5 space-y-3">
                                        {form.allowedDestinationIpAddresses.map((ipAddress) => (
                                            <div key={ipAddress} className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-4">
                                                <div className="text-sm font-black text-white">{ipAddress}</div>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleRemoveAllowedIpAddress(ipAddress)}
                                                    className="text-sm font-black text-slate-300 hover:bg-slate-800 hover:text-white"
                                                >
                                                    Delete
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </>
    );
};

export default WiredAccessControl;
