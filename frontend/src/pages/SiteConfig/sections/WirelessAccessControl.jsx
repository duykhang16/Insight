import React from 'react';
import { AlertTriangle, ArrowLeft, CheckCircle2, Info, LoaderCircle, Monitor, Search } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '../../../components/ui/dialog';
import { isValidIpv4Address, getAllowListClientKey } from '../normalizers';
import { LabeledField, ActionButtons } from '../components/Panel';

const AccessControlToggleRow = ({ label, checked, onChange, disabled = false, muted = false }) => (
    <label className={`flex items-center gap-4 px-3 py-3 text-sm font-black ${disabled ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'} ${muted ? 'text-slate-400' : 'text-slate-100'}`}>
        <span className={`inline-flex h-7 w-7 items-center justify-center rounded-[6px] border transition-colors ${
            checked
                ? 'border-emerald-400 bg-emerald-400 text-slate-950'
                : 'border-white/20 bg-slate-900 text-slate-500'
        }`}>
            <input
                type="checkbox"
                checked={checked}
                onChange={(event) => onChange(event.target.checked)}
                disabled={disabled}
                className="sr-only"
            />
            {checked ? <CheckCircle2 size={16} /> : <span className="h-4 w-4 rounded-[4px] border border-current" />}
        </span>
        <span>{label}</span>
    </label>
);

const WirelessAccessControl = ({
    selectedNetwork,
    accessControlState,
    isDirty,
    saving,
    showAddAllowedIpModal,
    newAllowedIpAddress,
    setNewAllowedIpAddress,
    allowedIpInputTouched,
    setAllowedIpInputTouched,
    showSpecificClientsSelector,
    specificClientsDiscoveryActive,
    specificClientsSearchQuery,
    setSpecificClientsSearchQuery,
    selectedSpecificClientKeys,
    specificClientsLoading,
    specificClientsSubmitting,
    availableSpecificClients,
    filteredAvailableClients,
    handleAccessRestrictionToggle,
    handleOpenAddAllowedIpModal,
    handleCloseAddAllowedIpModal,
    handleAddAllowedIpAddress,
    handleRemoveAllowedIpAddress,
    handleOpenSpecificClientsSelector,
    handleCloseSpecificClientsSelector,
    handleSearchSpecificClients,
    handleFilterSpecificClients,
    handleSpecificClientSelectionToggle,
    handleAddSelectedSpecificClients,
    handleRemoveAllowedClient,
    handleSave,
    handleCancel,
}) => {
    if (!selectedNetwork || !accessControlState) return null;

    const hasAllowedDestinationIpAddresses = accessControlState.allowedDestinationIpAddresses.length > 0;
    const hasAllowedClients = accessControlState.allowedClients.length > 0;
    const shouldShowAllowedDestinationPanel = accessControlState.isNetworkDestinationsEnabled && accessControlState.isSpecificIpAddressEnabled;
    const shouldShowAllowedClientsPanel = accessControlState.isSpecificClientsEnabled;
    const showRightColumn = shouldShowAllowedDestinationPanel || shouldShowAllowedClientsPanel;
    const isAccessControlValid = (
        (!accessControlState.isSpecificIpAddressEnabled || hasAllowedDestinationIpAddresses)
        && (!accessControlState.isSpecificClientsEnabled || hasAllowedClients)
    );
    const allowedIpValidationMessage = allowedIpInputTouched && !newAllowedIpAddress.trim()
        ? 'This field is required.'
        : allowedIpInputTouched && !isValidIpv4Address(newAllowedIpAddress.trim())
            ? 'Enter a valid IPv4 address.'
            : '';

    if (showSpecificClientsSelector) {
        return (
            <div className="space-y-6">
                <div className="mx-auto max-w-3xl rounded-[2rem] border border-white/10 bg-slate-900/90 p-6 shadow-2xl md:p-8">
                    <div className="space-y-6">
                        <div>
                            <h2 className="text-5xl font-black tracking-tight text-white">Select Clients to Allow</h2>
                            <p className="mt-3 max-w-2xl text-lg font-semibold leading-9 text-slate-300">
                                Search for clients connected to {selectedNetwork.displayName || selectedNetwork.networkName}, and select the ones to allow.
                            </p>
                        </div>

                        <div className="max-w-xl rounded-2xl border border-amber-500/30 bg-amber-500/20 p-4 text-amber-100">
                            <div className="flex items-start gap-3">
                                <AlertTriangle size={20} className="mt-0.5 shrink-0 text-amber-300" />
                                <p className="text-sm font-semibold leading-7">
                                    Network access restrictions are disabled while searching to allow clients to connect.
                                </p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            {availableSpecificClients.length > 0 && (
                                <>
                                    <div className="flex flex-col gap-3 sm:flex-row">
                                        <div className="flex-1">
                                            <input
                                                value={specificClientsSearchQuery}
                                                onChange={(event) => setSpecificClientsSearchQuery(event.target.value)}
                                                placeholder="Search"
                                                className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white focus:border-cyan-400 focus:outline-none"
                                            />
                                        </div>
                                        <Button
                                            type="button"
                                            onClick={handleFilterSpecificClients}
                                            disabled={specificClientsSubmitting}
                                            className="border border-cyan-400 bg-transparent px-6 text-base font-black text-white hover:bg-cyan-400/10"
                                        >
                                            <Search size={16} className="mr-2" />
                                            Search
                                        </Button>
                                    </div>

                                    <div className="text-sm font-black text-slate-300">
                                        {filteredAvailableClients.length} {filteredAvailableClients.length === 1 ? 'item' : 'items'}
                                    </div>
                                </>
                            )}

                            {availableSpecificClients.length === 0 ? (
                                <div className="flex min-h-[280px] flex-col items-center justify-center rounded-[2rem] border border-white/10 bg-slate-950/70 p-8 text-center">
                                    <div className="inline-flex h-16 w-16 items-center justify-center text-emerald-400">
                                        <Monitor size={42} strokeWidth={2.2} />
                                    </div>
                                    <h3 className="mt-6 text-4xl font-black text-white">No New Clients</h3>
                                    <p className="mt-3 max-w-sm text-sm text-slate-300">
                                        Connect new clients to the network.
                                    </p>
                                    {!specificClientsDiscoveryActive && (
                                        <Button
                                            type="button"
                                            onClick={handleSearchSpecificClients}
                                            disabled={specificClientsLoading || specificClientsSubmitting}
                                            className="mt-6 border border-cyan-400 bg-transparent px-6 text-base font-black text-white hover:bg-cyan-400/10 disabled:bg-slate-700 disabled:text-slate-400"
                                        >
                                            {specificClientsLoading ? <LoaderCircle size={16} className="mr-2 animate-spin" /> : <Search size={16} className="mr-2" />}
                                            Search
                                        </Button>
                                    )}
                                </div>
                            ) : (
                                <div className="rounded-[2rem] border border-white/10 bg-slate-950/70 p-6">
                                    <div className="border-b border-white/10 pb-4">
                                        <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Client</div>
                                    </div>
                                    <div className="mt-4 space-y-3">
                                        {filteredAvailableClients.map((client) => {
                                            const clientKey = getAllowListClientKey(client);
                                            const checked = selectedSpecificClientKeys.includes(clientKey);
                                            return (
                                                <label
                                                    key={clientKey}
                                                    className="flex cursor-pointer items-start gap-4 rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-4"
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={checked}
                                                        onChange={(event) => handleSpecificClientSelectionToggle(clientKey, event.target.checked)}
                                                        className="mt-1 h-4 w-4 rounded border-slate-500 bg-slate-900 text-cyan-400 focus:ring-cyan-500"
                                                    />
                                                    <div className="min-w-0 flex-1">
                                                        <div className="text-sm font-black text-white">{client.clientName}</div>
                                                        <div className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                                            {client.macAddress}
                                                            {client.ipAddress ? ` · ${client.ipAddress}` : ''}
                                                        </div>
                                                    </div>
                                                </label>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="flex flex-col justify-between gap-3 border-t border-white/10 pt-6 sm:flex-row">
                            <Button
                                type="button"
                                variant="ghost"
                                size="lg"
                                onClick={handleCloseSpecificClientsSelector}
                                disabled={specificClientsSubmitting}
                                className="text-base font-black text-slate-100 hover:bg-slate-700 hover:text-white"
                            >
                                <ArrowLeft size={16} className="mr-2" />
                                Back
                            </Button>
                            <Button
                                type="button"
                                size="lg"
                                onClick={handleAddSelectedSpecificClients}
                                disabled={selectedSpecificClientKeys.length === 0 || specificClientsSubmitting}
                                className="bg-emerald-500 px-6 text-base font-black text-white hover:bg-emerald-400 disabled:bg-slate-700 disabled:text-slate-400"
                            >
                                {specificClientsSubmitting ? <LoaderCircle size={16} className="mr-2 animate-spin" /> : null}
                                Add Clients
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

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

            <div className="space-y-6">
                <div className="rounded-[2rem] border border-white/10 bg-slate-900/90 p-6 md:p-8 shadow-2xl">
                    <div className={`grid gap-10 ${showRightColumn ? 'xl:grid-cols-[1fr,1.18fr]' : 'xl:grid-cols-[1fr,0.92fr]'}`}>
                    <div className="space-y-8">
                        <div>
                            <h2 className="text-3xl font-black text-white">Network Access</h2>
                            <p className="mt-2 text-sm text-slate-300">
                                Access restrictions for clients connecting to this wireless network.
                            </p>
                        </div>

                        <div className="max-w-xl rounded-2xl border border-white/10 bg-slate-950 p-4">
                            <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Access Restrictions</div>
                            <div className={`mt-4 overflow-hidden rounded-2xl border transition-colors ${
                                accessControlState.isNetworkDestinationsEnabled || accessControlState.isSpecificClientsEnabled
                                    ? 'border-cyan-400 shadow-[0_0_0_1px_rgba(34,211,238,0.2)]'
                                    : 'border-white/10'
                            }`}>
                                <AccessControlToggleRow
                                    label="Network Destinations"
                                    checked={accessControlState.isNetworkDestinationsEnabled}
                                    onChange={(checked) => handleAccessRestrictionToggle('isNetworkDestinationsEnabled', checked)}
                                />
                                <div className="border-t border-white/10" />
                                <AccessControlToggleRow
                                    label="Specific Clients"
                                    checked={accessControlState.isSpecificClientsEnabled}
                                    onChange={(checked) => handleAccessRestrictionToggle('isSpecificClientsEnabled', checked)}
                                />
                            </div>
                            {accessControlState.isSpecificClientsEnabled && !hasAllowedClients && (
                                <p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">
                                    Add at least one allowed client before updating this section.
                                </p>
                            )}
                        </div>

                        {accessControlState.isNetworkDestinationsEnabled && (
                            <div className="space-y-5">
                                <div>
                                    <h3 className="text-3xl font-black text-white">Allowed Destinations</h3>
                                    <p className="mt-2 text-sm text-slate-300">
                                        Client can access the following network destinations.
                                    </p>
                                </div>

                                <div className="max-w-xl rounded-2xl bg-slate-700/60 p-4 text-slate-100">
                                    <div className="flex items-center gap-3">
                                        <div className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 text-slate-200">
                                            <Info size={18} />
                                        </div>
                                        <p className="max-w-lg text-sm font-semibold leading-7 text-slate-200">
                                            Internet access is required for clients to operate on this network.
                                        </p>
                                    </div>
                                </div>

                                <div className="max-w-xl">
                                    <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">Network Destinations</div>
                                    <div className={`mt-3 overflow-hidden rounded-2xl border transition-colors ${
                                        accessControlState.isSpecificIpAddressEnabled
                                            ? 'border-cyan-400 shadow-[0_0_0_1px_rgba(34,211,238,0.2)]'
                                            : 'border-white/10'
                                    }`}>
                                        <AccessControlToggleRow
                                            label="Internet"
                                            checked={true}
                                            onChange={() => {}}
                                            disabled={true}
                                            muted={true}
                                        />
                                        <div className="border-t border-white/10" />
                                        <AccessControlToggleRow
                                            label="Specific IP Address"
                                            checked={accessControlState.isSpecificIpAddressEnabled}
                                            onChange={(checked) => handleAccessRestrictionToggle('isSpecificIpAddressEnabled', checked)}
                                        />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                        <div className={shouldShowAllowedDestinationPanel && shouldShowAllowedClientsPanel ? 'grid gap-6 xl:grid-cols-2' : 'space-y-5'}>
                            {shouldShowAllowedDestinationPanel && (
                                <div className="space-y-5">
                                    <div>
                                        <h3 className="text-3xl font-black text-white">Allowed Destination IP Addresses</h3>
                                        <p className="mt-2 text-sm text-slate-300">
                                            Clients can access the following IP addresses.
                                        </p>
                                    </div>

                                    {accessControlState.allowedDestinationIpAddresses.length === 0 ? (
                                        <div className="flex min-h-[360px] flex-col items-center justify-center rounded-[2rem] border border-white/10 bg-transparent p-8 text-center">
                                            <div className="inline-flex h-16 w-16 items-center justify-center text-emerald-400">
                                                <Monitor size={42} strokeWidth={2.2} />
                                            </div>
                                            <h4 className="mt-6 text-4xl font-black text-white">No IP Addresses Allowed</h4>
                                            <p className="mt-3 max-w-sm text-sm text-slate-300">
                                                Add IP addresses to allow on the network.
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
                                                {accessControlState.allowedDestinationIpAddresses.map((ipAddress) => (
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
                            {shouldShowAllowedClientsPanel && (
                                <div className="space-y-5">
                                    <div>
                                        <h3 className="text-3xl font-black text-white">Allowed Clients</h3>
                                        <p className="mt-2 text-sm text-slate-300">
                                            Only the following clients can access the network.
                                        </p>
                                    </div>

                                    {accessControlState.allowedClients.length === 0 ? (
                                        <div className="flex min-h-[360px] flex-col items-center justify-center rounded-[2rem] border border-white/10 bg-transparent p-8 text-center">
                                            <div className="inline-flex h-16 w-16 items-center justify-center text-emerald-400">
                                                <Monitor size={42} strokeWidth={2.2} />
                                            </div>
                                            <h4 className="mt-6 text-4xl font-black text-white">No Clients Allowed</h4>
                                            <p className="mt-3 max-w-sm text-sm text-slate-300">
                                                Add clients to allow on the network.
                                            </p>
                                            <Button
                                                size="lg"
                                                onClick={handleOpenSpecificClientsSelector}
                                                disabled={specificClientsLoading || specificClientsSubmitting}
                                                className="mt-6 border border-emerald-400 bg-transparent px-6 text-base font-black text-white hover:bg-emerald-400/10 disabled:bg-slate-700 disabled:text-slate-400"
                                            >
                                                {specificClientsLoading ? <LoaderCircle size={16} className="mr-2 animate-spin" /> : null}
                                                Add
                                            </Button>
                                        </div>
                                    ) : (
                                        <div className="rounded-[2rem] border border-white/10 bg-slate-950 p-6">
                                            <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-4">
                                                <div>
                                                    <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Allowed Clients</div>
                                                    <div className="mt-2 text-sm font-semibold text-slate-300">
                                                        {accessControlState.allowedClients.length} {accessControlState.allowedClients.length === 1 ? 'client' : 'clients'}
                                                    </div>
                                                </div>
                                                <Button
                                                    size="sm"
                                                    onClick={handleOpenSpecificClientsSelector}
                                                    disabled={specificClientsLoading || specificClientsSubmitting}
                                                    className="border border-emerald-400 bg-transparent px-4 text-xs font-black text-white hover:bg-emerald-400/10 disabled:bg-slate-700 disabled:text-slate-400"
                                                >
                                                    Add
                                                </Button>
                                            </div>
                                            <div className="mt-5 space-y-3">
                                                {accessControlState.allowedClients.map((client) => (
                                                    <div
                                                        key={getAllowListClientKey(client)}
                                                        className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-4"
                                                    >
                                                        <div className="min-w-0 flex-1">
                                                            <div className="text-sm font-black text-white">{client.clientName}</div>
                                                            <div className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                                                {client.macAddress}
                                                                {client.ipAddress ? ` · ${client.ipAddress}` : ''}
                                                            </div>
                                                        </div>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => handleRemoveAllowedClient(client)}
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
                </div>
                {isDirty && (
                    <ActionButtons
                        onUpdate={handleSave}
                        onCancel={handleCancel}
                        saving={saving}
                        disabled={false}
                        updateDisabled={!isAccessControlValid}
                    />
                )}
            </div>
        </>
    );
};

export default WirelessAccessControl;
