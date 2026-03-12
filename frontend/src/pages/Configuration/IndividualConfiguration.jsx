import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Eye, EyeOff, LoaderCircle, Save, Trash2, Wifi, ShieldAlert, Router } from 'lucide-react';
import { useLocation, useParams } from 'react-router-dom';
import apiClient from '../../api/apiClient';
import { useSite } from '../../context/SiteContext';

const ROUTE_SECTION_MAP = {
    overview: 'overview',
    'ip-assignment': 'ip_assignment',
    'network-assignment': 'network_assignment',
    'access-control': 'access_control',
    schedule: 'schedule',
    'wireless-options': 'wireless_options',
};

const SECTION_LABEL_MAP = {
    overview: 'Overview',
    ip_assignment: 'IP Assignment',
    network_assignment: 'Network Assignment',
    access_control: 'Access Control',
    schedule: 'Schedule',
    wireless_options: 'Wireless Options',
};

const SECURITY_OPTIONS = [
    { id: 'wpa2_personal', label: 'WPA2 Personal', authentication: 'psk', security: 'wpa2', supported: true },
    { id: 'wpa23_personal', label: 'WPA2 + WPA3 Personal', authentication: 'psk', security: 'wpa3', supported: true },
    { id: 'wpa2_enterprise', label: 'WPA2 Enterprise', authentication: 'eap', security: 'wpa2', supported: false },
    { id: 'wpa23_enterprise', label: 'WPA2 + WPA3 Enterprise', authentication: 'eap', security: 'wpa3', supported: false },
];

const resolveSecurityOption = (network) =>
    SECURITY_OPTIONS.find(
        (option) => option.authentication === (network?.authentication || 'psk') && option.security === String(network?.security || 'wpa2').toLowerCase()
    )?.id || 'wpa23_personal';

const buildWirelessForm = (network) => ({
    mode: 'wireless',
    networkName: network?.networkName || '',
    isEnabled: network?.isEnabled !== false,
    state: network?.state || 'Active',
    wiredNetworkId: network?.wiredNetworkId || '',
    ipAddressingMode: network?.ipAddressingMode || 'internal',
    networkAddress: network?.dhcpScope?.network || '',
    subnetMask: network?.dhcpScope?.netmask || '255.255.255.0',
    dnsServerAssignationMode: network?.dhcpScope?.dns?.dnsServerAssignationMode || 'automatic',
    primaryDnsServer: network?.dhcpScope?.dns?.primaryDnsServer || '',
    secondaryDnsServer: network?.dhcpScope?.dns?.secondaryDnsServer || '',
    isAvailableOn24GHzRadioBand: Boolean(network?.isAvailableOn24GHzRadioBand),
    isAvailableOn5GHzRadioBand: Boolean(network?.isAvailableOn5GHzRadioBand),
    isAvailableOn6GHzRadioBand: Boolean(network?.isAvailableOn6GHzRadioBand),
    isLegacy80211bRatesEnabled: Boolean(network?.isLegacy80211bRatesEnabled),
    isSsidHidden: Boolean(network?.isSsidHidden),
    preSharedKey: network?.preSharedKey || '',
    health: network?.health || 'good',
    type: network?.usage || 'employee',
    authentication: network?.authentication || 'psk',
    security: String(network?.security || 'wpa3').toLowerCase(),
    securityOption: network?.securityOption || resolveSecurityOption(network),
});

const buildWiredForm = (network) => ({
    mode: 'wired',
    networkName: network?.networkName || `VLAN ${network?.vlanId ?? ''}`.trim(),
    isEnabled: network?.isEnabled !== false,
    state: network?.state || 'Active',
    health: network?.health || 'good',
    type: network?.usage || 'employee',
    vlanId: network?.vlanId ?? '',
    isIgmpSnoopingEnabled: Boolean(network?.isIgmpSnoopingEnabled ?? true),
    isDhcpArpProtectionEnabled: Boolean(network?.isDhcpArpProtectionEnabled),
});

const SUBNET_MASK_OPTIONS = [
    '255.255.255.0 (/24)',
    '255.255.0.0 (/16)',
    '255.0.0.0 (/8)',
];

const isValidIpv4Address = (value) => {
    if (!value) return false;
    const parts = value.trim().split('.');
    if (parts.length !== 4) return false;
    return parts.every((part) => {
        if (!/^\d+$/.test(part)) return false;
        const number = Number(part);
        return number >= 0 && number <= 255;
    });
};

const LabeledField = ({ label, children }) => (
    <label className="block">
        <span className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">{label}</span>
        <div className="mt-2">{children}</div>
    </label>
);

const Panel = ({ title, children }) => (
    <section className="space-y-5">
        <div>
            <h2 className="text-3xl font-black text-white">{title}</h2>
        </div>
        {children}
    </section>
);

const EmptyState = ({ message }) => (
    <div className="rounded-[2rem] border border-white/10 bg-slate-900/90 p-10 shadow-2xl">
        <h2 className="text-3xl font-black text-white">No Network Selected</h2>
        <p className="mt-4 max-w-2xl text-sm text-slate-400">{message}</p>
    </div>
);

const ActionButtons = ({ onUpdate, onCancel, saving, disabled }) => (
    <div className="flex items-center justify-end gap-3 pt-6 border-t border-slate-800">
        <button
            type="button"
            onClick={onCancel}
            disabled={disabled || saving}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-600 px-5 text-sm font-black uppercase tracking-[0.16em] text-slate-300 transition-colors hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
            Cancel
        </button>
        <button
            type="button"
            onClick={onUpdate}
            disabled={disabled || saving}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-emerald-400 px-5 text-sm font-black uppercase tracking-[0.16em] text-slate-950 shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_8px_24px_rgba(16,185,129,0.35)] transition-colors hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
            {saving ? <LoaderCircle size={14} className="animate-spin" /> : <Save size={14} />}
            Update
        </button>
    </div>
);

const IndividualConfiguration = () => {
    const { siteId } = useParams();
    const location = useLocation();
    const { sites, fetchSites } = useSite();
    const userRole = sessionStorage.getItem('userRole') || 'viewer';
    const [networks, setNetworks] = useState([]);
    const [selectedNetworkId, setSelectedNetworkId] = useState('');
    const [form, setForm] = useState(null);
    const [isDirty, setIsDirty] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [notification, setNotification] = useState(null);
    const [notificationVisible, setNotificationVisible] = useState(false);
    const pageTopRef = useRef(null);
    const lastSelectedNetworkIdRef = useRef('');

    const selectedSite = useMemo(
        () => sites.find((site) => String(site.siteId || site.id) === String(siteId)),
        [sites, siteId],
    );

    const selectedNetwork = useMemo(
        () => networks.find((network) => String(network.id) === String(selectedNetworkId)),
        [networks, selectedNetworkId],
    );

    const activeSection = useMemo(() => {
        const routeKey = location.pathname.split('/').pop() || 'overview';
        return ROUTE_SECTION_MAP[routeKey] || 'overview';
    }, [location.pathname]);
    const wiredOptions = useMemo(
        () => networks.filter((network) => network.networkKind === 'wired'),
        [networks],
    );
    const dnsValidation = useMemo(() => {
        if (!form || activeSection !== 'ip_assignment' || form.ipAddressingMode !== 'internal' || form.dnsServerAssignationMode !== 'static') {
            return { primary: '', secondary: '', hasError: false };
        }

        const primary = !form.primaryDnsServer
            ? 'Primary DNS Server is required.'
            : !isValidIpv4Address(form.primaryDnsServer)
                ? 'Primary DNS Server must be a valid IPv4 address.'
                : '';

        const secondary = form.secondaryDnsServer && !isValidIpv4Address(form.secondaryDnsServer)
            ? 'Secondary DNS Server must be a valid IPv4 address.'
            : '';

        return {
            primary,
            secondary,
            hasError: Boolean(primary || secondary),
        };
    }, [activeSection, form]);
    const scrollToTop = () => {
        pageTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    const clearNotification = () => {
        setNotification(null);
        setNotificationVisible(false);
    };
    const showNotification = (type, message) => {
        setNotification({ type, message });
    };

    const buildFormForNetwork = (network) => (
        network?.networkKind === 'wired' ? buildWiredForm(network) : buildWirelessForm(network)
    );
    const isUpdateDisabled = useMemo(() => {
        if (!form) return true;
        if (saving) return true;

        if (activeSection === 'ip_assignment' && selectedNetwork?.networkKind === 'wireless') {
            if (form.ipAddressingMode !== 'internal' && !form.wiredNetworkId) {
                return true;
            }
            if (form.ipAddressingMode === 'internal' && dnsValidation.hasError) {
                return true;
            }
        }

        return false;
    }, [activeSection, dnsValidation.hasError, form, saving, selectedNetwork]);

    useEffect(() => {
        if (sites.length === 0) {
            fetchSites();
        }
    }, [fetchSites, sites.length]);

    useEffect(() => {
        if (!siteId) return;

        const loadNetworks = async () => {
            try {
                setLoading(true);
                clearNotification();
                const response = await apiClient.get(`/config/sites/${siteId}/individual/networks`);
                const combinedNetworks = Array.isArray(response.data?.networks) ? response.data.networks : [];

                const firstNetwork = combinedNetworks[0] || null;
                setNetworks(combinedNetworks);
                setSelectedNetworkId(firstNetwork?.id || '');
                setForm(
                    firstNetwork
                        ? (firstNetwork.networkKind === 'wired' ? buildWiredForm(firstNetwork) : buildWirelessForm(firstNetwork))
                        : null
                );
                setIsDirty(false);
                setShowPassword(false);
            } catch (loadError) {
                console.error(loadError);
                showNotification('error', 'Failed to load the current site networks.');
                setNetworks([]);
                setSelectedNetworkId('');
                setForm(null);
            } finally {
                setLoading(false);
            }
        };

        loadNetworks();
    }, [siteId]);

    useEffect(() => {
        if (!selectedNetworkId) {
            setForm(null);
            lastSelectedNetworkIdRef.current = '';
            return;
        }
        const network = networks.find((item) => String(item.id) === String(selectedNetworkId));
        if (network) {
            setForm(network.networkKind === 'wired' ? buildWiredForm(network) : buildWirelessForm(network));
            setIsDirty(false);
            setShowPassword(false);
            if (lastSelectedNetworkIdRef.current && lastSelectedNetworkIdRef.current !== String(selectedNetworkId)) {
                clearNotification();
            }
            lastSelectedNetworkIdRef.current = String(selectedNetworkId);
        }
    }, [selectedNetworkId, networks]);

    useEffect(() => {
        clearNotification();
    }, [activeSection]);

    useEffect(() => {
        if (!notification?.message) {
            setNotificationVisible(false);
            return undefined;
        }

        setNotificationVisible(true);

        const fadeTimer = window.setTimeout(() => {
            setNotificationVisible(false);
        }, 6500);

        const clearTimer = window.setTimeout(() => {
            clearNotification();
        }, 7000);

        return () => {
            window.clearTimeout(fadeTimer);
            window.clearTimeout(clearTimer);
        };
    }, [notification]);

    if (userRole === 'viewer') {
        return (
            <div className="w-full h-full flex items-center justify-center pt-32">
                <div className="text-center bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-white/5 p-12 rounded-3xl shadow-xl max-w-md">
                    <ShieldAlert size={64} className="mx-auto mb-6 text-rose-500 opacity-80" />
                    <h2 className="text-2xl font-black uppercase tracking-widest text-slate-800 dark:text-white mb-3">Access Denied</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">
                        You do not have permission to view or modify individual configurations. Please contact your system administrator if you need access.
                    </p>
                </div>
            </div>
        );
    }

    const setField = (field, value) => {
        setIsDirty(true);
        setForm((current) => ({
            ...current,
            [field]: value,
        }));
    };

    const handleSecurityChange = (optionId) => {
        const option = SECURITY_OPTIONS.find((item) => item.id === optionId);
        if (!option || !option.supported) return;
        setIsDirty(true);
        setForm((current) => ({
            ...current,
            securityOption: optionId,
            authentication: option.authentication,
            security: option.security,
        }));
    };

    const handle24GHzToggle = (checked) => {
        setIsDirty(true);
        setForm((current) => ({
            ...current,
            isAvailableOn24GHzRadioBand: checked,
            isLegacy80211bRatesEnabled: checked ? current.isLegacy80211bRatesEnabled : false,
        }));
    };

    const handleCancel = () => {
        if (!selectedNetwork) return;
        clearNotification();
        setForm(buildFormForNetwork(selectedNetwork));
        setIsDirty(false);
        setShowPassword(false);
    };

    const handleSave = async () => {
        if (!siteId || !selectedNetwork || !form) return;

        if (selectedNetwork.networkKind === 'wireless' && activeSection === 'overview') {
            if (!form.networkName.trim()) {
                showNotification('error', 'Network name is required.');
                return;
            }
            if (!form.preSharedKey || form.preSharedKey.length < 8) {
                showNotification('error', 'PSK password must be at least 8 characters.');
                return;
            }
        } else if (selectedNetwork.networkKind === 'wireless' && activeSection === 'ip_assignment') {
            if (form.ipAddressingMode !== 'internal' && !form.wiredNetworkId) {
                showNotification('error', 'A wired network selection is required.');
                return;
            }
            if (form.ipAddressingMode === 'internal' && dnsValidation.hasError) {
                showNotification('error', dnsValidation.primary || dnsValidation.secondary || 'DNS server values are invalid.');
                return;
            }
        } else if (selectedNetwork.networkKind === 'wireless' && activeSection === 'network_assignment') {
            if (!form.isAvailableOn24GHzRadioBand && !form.isAvailableOn5GHzRadioBand && !form.isAvailableOn6GHzRadioBand) {
                showNotification('error', 'At least one radio frequency must remain enabled.');
                return;
            }
        } else {
            showNotification('error', selectedNetwork.networkKind === 'wired'
                ? 'Wired update is not wired yet.'
                : 'This section is not wired yet.');
            return;
        }

        setSaving(true);
        clearNotification();

        try {
            const isIpAssignment = activeSection === 'ip_assignment';
            const payload = isIpAssignment
                ? {
                    ipAddressingMode: form.ipAddressingMode,
                    wiredNetworkId: form.wiredNetworkId,
                    networkAddress: form.networkAddress,
                    subnetMask: form.subnetMask,
                    dnsServerAssignationMode: form.dnsServerAssignationMode,
                    primaryDnsServer: form.primaryDnsServer,
                    secondaryDnsServer: form.secondaryDnsServer,
                }
                : activeSection === 'network_assignment'
                    ? {
                        isAvailableOn24GHzRadioBand: form.isAvailableOn24GHzRadioBand,
                        isAvailableOn5GHzRadioBand: form.isAvailableOn5GHzRadioBand,
                        isAvailableOn6GHzRadioBand: form.isAvailableOn6GHzRadioBand,
                        isLegacy80211bRatesEnabled: form.isLegacy80211bRatesEnabled,
                    }
                : {
                    networkName: form.networkName.trim(),
                    isEnabled: form.isEnabled,
                    isSsidHidden: form.isSsidHidden,
                    authentication: form.authentication,
                    security: form.security,
                    preSharedKey: form.preSharedKey,
                };
            const response = await apiClient.put(
                isIpAssignment
                    ? `/config/sites/${siteId}/individual/networks/${selectedNetwork.id}/ip-assignment`
                    : activeSection === 'network_assignment'
                        ? `/config/sites/${siteId}/individual/networks/${selectedNetwork.id}/network-assignment`
                    : `/config/sites/${siteId}/individual/networks/${selectedNetwork.id}/overview`,
                payload,
            );
            const updatedNetwork = response.data?.network;
            if (!updatedNetwork) {
                throw new Error('Missing updated network payload.');
            }

            setNetworks((current) =>
                current.map((network) => (
                    String(network.id) === String(selectedNetwork.id) ? updatedNetwork : network
                ))
            );
            setForm(buildFormForNetwork(updatedNetwork));
            showNotification('success', response.data?.message || 'Update successfully');
            setIsDirty(false);
            setShowPassword(false);
            scrollToTop();
        } catch (saveError) {
            console.error(saveError);
            if (selectedNetwork) {
                setForm(buildFormForNetwork(selectedNetwork));
            }
            setIsDirty(false);
            setShowPassword(false);
            showNotification('error', saveError?.response?.data?.detail || 'Failed to save network changes.');
            scrollToTop();
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!siteId || !selectedNetwork) return;

        const confirmed = window.confirm(
            `Delete ${selectedNetwork.displayName}? This action cannot be undone directly.`,
        );
        if (!confirmed) return;

        setDeleting(true);
        clearNotification();

        try {
            const response = await apiClient.delete(
                `/config/sites/${siteId}/individual/networks/${selectedNetwork.id}`,
            );
            const deletedId = String(response.data?.deletedNetwork?.id || selectedNetwork.id);

            setNetworks((current) => {
                const nextNetworks = current.filter((network) => String(network.id) !== deletedId);
                const currentIndex = current.findIndex((network) => String(network.id) === deletedId);
                const nextSelected = nextNetworks[currentIndex] || nextNetworks[currentIndex - 1] || nextNetworks[0] || null;

                setSelectedNetworkId(nextSelected?.id || '');
                if (!nextSelected) {
                    setForm(null);
                }

                return nextNetworks;
            });
            setIsDirty(false);
            setShowPassword(false);
            showNotification('success', response.data?.message || `Deleted ${selectedNetwork.displayName}.`);
            scrollToTop();
        } catch (deleteError) {
            console.error(deleteError);
            showNotification('error', deleteError?.response?.data?.detail || 'Failed to delete network.');
            scrollToTop();
        } finally {
            setDeleting(false);
        }
    };

    const renderWirelessOverview = () => {
        if (!form) return null;

        return (
            <div className="rounded-[2rem] border border-white/10 bg-slate-900/90 p-6 md:p-8 shadow-2xl">
                <div className="grid gap-10 xl:grid-cols-[1fr,0.95fr]">
                    <Panel title="Identification">
                        <LabeledField label="Name">
                            <input
                                value={form.networkName}
                                onChange={(event) => setField('networkName', event.target.value)}
                                className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white focus:outline-none focus:border-cyan-400"
                            />
                        </LabeledField>
                        <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white">
                            <input
                                type="checkbox"
                                checked={form.isEnabled}
                                onChange={(event) => setField('isEnabled', event.target.checked)}
                                className="h-4 w-4 rounded border-slate-500 bg-slate-900 text-cyan-400 focus:ring-cyan-500"
                            />
                            <span className="font-semibold">Enabled</span>
                        </label>
                        <div className="space-y-4 text-sm">
                            <div>
                                <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Health</div>
                                <div className="mt-2 flex items-center gap-2 text-emerald-300 font-semibold">
                                    <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400"></span>
                                    {form.health}
                                </div>
                            </div>
                            <div>
                                <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">State</div>
                                <div className="mt-2 font-semibold text-white">{form.state}</div>
                            </div>
                            <div>
                                <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Network Usage</div>
                                <div className="mt-2 font-semibold text-white capitalize">{form.type}</div>
                            </div>
                        </div>
                    </Panel>

                    <Panel title="Security">
                        <div className="rounded-2xl border border-white/10 bg-slate-950 p-4">
                            <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Network Security</div>
                            <div className="mt-4 space-y-3">
                                {SECURITY_OPTIONS.map((option) => (
                                    <label
                                        key={option.id}
                                        className={`flex items-center gap-3 text-sm font-semibold ${option.supported ? 'text-slate-200' : 'text-slate-500'}`}
                                    >
                                        <input
                                            type="radio"
                                            name="network_security"
                                            checked={form.securityOption === option.id}
                                            onChange={() => handleSecurityChange(option.id)}
                                            disabled={!option.supported}
                                            className="h-4 w-4 border-slate-500 bg-slate-900 text-cyan-400 focus:ring-cyan-500 disabled:opacity-50"
                                        />
                                        {option.label}
                                    </label>
                                ))}
                            </div>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-slate-950 p-4">
                            <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Network Options</div>
                            <div className="mt-4">
                                <label className="flex items-center gap-3 text-sm font-semibold text-slate-200">
                                    <input
                                        type="checkbox"
                                        checked={form.isSsidHidden}
                                        onChange={(event) => setField('isSsidHidden', event.target.checked)}
                                        className="h-4 w-4 rounded border-slate-500 bg-slate-900 text-cyan-400 focus:ring-cyan-500"
                                    />
                                    Hidden Network
                                </label>
                            </div>
                        </div>
                        <div className="space-y-3">
                            <div>
                                <h3 className="text-2xl font-black text-white">Network Password (PSK)</h3>
                                <p className="mt-1 text-sm text-slate-400">Users need to authenticate with the password below.</p>
                            </div>
                            <LabeledField label="Network Password">
                                <div className="relative">
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        value={form.preSharedKey}
                                        onChange={(event) => setField('preSharedKey', event.target.value)}
                                        className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 pr-12 text-white focus:outline-none focus:border-cyan-400"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword((current) => !current)}
                                        className="absolute right-3 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-800 hover:text-white"
                                        aria-label={showPassword ? 'Hide network password' : 'Show network password'}
                                    >
                                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                    </button>
                                </div>
                            </LabeledField>
                        </div>
                        <div className="flex items-center justify-between gap-4 rounded-2xl border border-rose-500/20 bg-rose-500/5 p-4">
                            <div>
                                <h3 className="text-2xl font-black text-white">Delete Network</h3>
                                <p className="mt-1 text-sm text-slate-400">Permanently deletes the network.</p>
                            </div>
                            <button
                                type="button"
                                onClick={handleDelete}
                                disabled={saving || deleting}
                                className="inline-flex items-center gap-2 rounded-xl border border-cyan-400/50 px-4 py-2 text-sm font-black text-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {deleting ? <LoaderCircle size={15} className="animate-spin" /> : <Trash2 size={15} />}
                                Delete
                            </button>
                        </div>
                    </Panel>
                </div>
                {isDirty && <ActionButtons onUpdate={handleSave} onCancel={handleCancel} saving={saving} disabled={isUpdateDisabled} />}
            </div>
        );
    };

    const renderWiredOverview = () => {
        if (!form) return null;

        return (
            <div className="rounded-[2rem] border border-white/10 bg-slate-900/90 p-6 md:p-8 shadow-2xl">
                <div className="grid gap-10 xl:grid-cols-[1fr,0.95fr]">
                    <div className="space-y-10">
                        <Panel title="Identification">
                            <LabeledField label="Name">
                                <input
                                    value={form.networkName}
                                    onChange={(event) => setField('networkName', event.target.value)}
                                    className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white focus:outline-none focus:border-cyan-400"
                                />
                            </LabeledField>
                            <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white">
                                <input
                                    type="checkbox"
                                    checked={form.isEnabled}
                                    onChange={(event) => setField('isEnabled', event.target.checked)}
                                    className="h-4 w-4 rounded border-slate-500 bg-slate-900 text-cyan-400 focus:ring-cyan-500"
                                />
                                <span className="font-semibold">Enabled</span>
                            </label>
                            <div className="space-y-4 text-sm">
                                <div>
                                    <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Health</div>
                                    <div className="mt-2 flex items-center gap-2 text-emerald-300 font-semibold">
                                        <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400"></span>
                                        {form.health}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">State</div>
                                    <div className="mt-2 font-semibold text-white">{form.state}</div>
                                </div>
                                <div>
                                    <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Network Usage</div>
                                    <div className="mt-2 font-semibold text-white capitalize">{form.type}</div>
                                </div>
                            </div>
                        </Panel>

                        <Panel title="Properties">
                            <LabeledField label="VLAN">
                                <input value={form.vlanId} onChange={(event) => setField('vlanId', event.target.value)} className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white focus:outline-none focus:border-cyan-400" />
                            </LabeledField>
                            <div className="rounded-2xl border border-white/10 bg-slate-950 p-4">
                                <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Network Options</div>
                                <div className="mt-4">
                                    <label className="flex items-center gap-3 text-sm font-semibold text-slate-200">
                                        <input
                                            type="checkbox"
                                            checked={form.isIgmpSnoopingEnabled}
                                            onChange={(event) => setField('isIgmpSnoopingEnabled', event.target.checked)}
                                            className="h-4 w-4 rounded border-slate-500 bg-slate-900 text-cyan-400 focus:ring-cyan-500"
                                        />
                                        IGMP Snooping
                                    </label>
                                </div>
                            </div>
                        </Panel>
                    </div>

                    <Panel title="Security">
                        <div className="rounded-2xl border border-white/10 bg-slate-950 p-4">
                            <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Network Security</div>
                            <div className="mt-4">
                                <label className="flex items-center gap-3 text-sm font-semibold text-slate-200">
                                    <input
                                        type="checkbox"
                                        checked={form.isDhcpArpProtectionEnabled}
                                        onChange={(event) => setField('isDhcpArpProtectionEnabled', event.target.checked)}
                                        className="h-4 w-4 rounded border-slate-500 bg-slate-900 text-cyan-400 focus:ring-cyan-500"
                                    />
                                    DHCP and ARP Protections
                                </label>
                            </div>
                        </div>
                        <div className="flex items-center justify-between gap-4 rounded-2xl border border-rose-500/20 bg-rose-500/5 p-4">
                            <div>
                                <h3 className="text-2xl font-black text-white">Delete Network</h3>
                                <p className="mt-1 text-sm text-slate-400">Permanently deletes the network.</p>
                            </div>
                            <button
                                type="button"
                                onClick={handleDelete}
                                disabled={saving || deleting}
                                className="inline-flex items-center gap-2 rounded-xl border border-cyan-400/50 px-4 py-2 text-sm font-black text-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {deleting ? <LoaderCircle size={15} className="animate-spin" /> : <Trash2 size={15} />}
                                Delete
                            </button>
                        </div>
                    </Panel>
                </div>
                {isDirty && <ActionButtons onUpdate={handleSave} onCancel={handleCancel} saving={saving} disabled={isUpdateDisabled} />}
            </div>
        );
    };

    const renderPlaceholder = () => (
        <div className="rounded-[2rem] border border-white/10 bg-slate-900/90 p-10 shadow-2xl">
            <h2 className="text-3xl font-black text-white">{SECTION_LABEL_MAP[activeSection] || 'Configuration'}</h2>
            <p className="mt-4 max-w-2xl text-sm text-slate-400">
                This section is reserved for the next implementation step. Use the left navigation to move between site configuration sections.
            </p>
        </div>
    );

    const renderWirelessIpAssignment = () => {
        if (!form) return null;

        const isSpecificToThisNetwork = form.ipAddressingMode === 'internal';
        const dnsIsStatic = form.dnsServerAssignationMode === 'static';

        const formatAvailableIpAddresses = () => {
            if (form.subnetMask === '255.255.255.0') {
                return '253';
            }
            if (form.subnetMask === '255.255.0.0') {
                return '65533';
            }
            if (form.subnetMask === '255.0.0.0') {
                return '16777213';
            }
            return '—';
        };

        return (
            <div className="rounded-[2rem] border border-white/10 bg-slate-900/90 p-6 md:p-8 shadow-2xl">
                <div className="grid gap-10 xl:grid-cols-[1fr,0.95fr]">
                    <div className="space-y-8">
                        <div>
                            <h2 className="text-3xl font-black text-white">IP Addressing</h2>
                            <p className="mt-2 text-sm text-slate-300">
                                IP addressing for clients and devices connecting to this network.
                            </p>
                        </div>

                        <div className="max-w-md rounded-2xl border border-white/10 bg-slate-950 p-4">
                            <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">IP Address Assignment</div>
                            <div className="mt-4 space-y-3">
                                <label className="flex items-center gap-3 text-sm font-semibold text-slate-200">
                                    <input
                                        type="radio"
                                        name="ip_assignment_mode"
                                        checked={form.ipAddressingMode !== 'internal'}
                                        onChange={() => setField('ipAddressingMode', 'external')}
                                        className="h-4 w-4 border-slate-500 bg-slate-900 text-cyan-400 focus:ring-cyan-500"
                                    />
                                    Same as a Local Network (default)
                                </label>
                                <label className="flex items-center gap-3 text-sm font-semibold text-slate-200">
                                    <input
                                        type="radio"
                                        name="ip_assignment_mode"
                                        checked={isSpecificToThisNetwork}
                                        onChange={() => setField('ipAddressingMode', 'internal')}
                                        className="h-4 w-4 border-slate-500 bg-slate-900 text-cyan-400 focus:ring-cyan-500"
                                    />
                                    Specific to This Network
                                </label>
                            </div>
                        </div>

                        {isSpecificToThisNetwork ? (
                            <div className="space-y-5">
                                <LabeledField label="Network Address">
                                    <input
                                        value={form.networkAddress}
                                        onChange={(event) => setField('networkAddress', event.target.value)}
                                        className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white focus:outline-none focus:border-cyan-400"
                                    />
                                </LabeledField>

                                <LabeledField label="Subnet Mask">
                                    <select
                                        value={SUBNET_MASK_OPTIONS.includes(form.subnetMask) ? form.subnetMask : '255.255.255.0 (/24)'}
                                        onChange={(event) => setField('subnetMask', event.target.value.split(' ')[0])}
                                        className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white focus:outline-none focus:border-cyan-400"
                                    >
                                        {SUBNET_MASK_OPTIONS.map((option) => (
                                            <option key={option} value={option}>
                                                {option}
                                            </option>
                                        ))}
                                    </select>
                                </LabeledField>

                                <div className="space-y-4 pt-2">
                                    <div>
                                        <h3 className="text-2xl font-black text-white">Automatic IP Address Assignment</h3>
                                        <p className="mt-2 max-w-xl text-sm text-slate-300">
                                            Automatically assign IP addresses to clients and devices connecting to this network.
                                        </p>
                                    </div>
                                    <div className="space-y-5 text-sm">
                                        <div>
                                            <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Start IP Address</div>
                                            <div className="mt-2 font-semibold text-white">172.16.0.1</div>
                                        </div>
                                        <div>
                                            <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">End IP Address</div>
                                            <div className="mt-2 font-semibold text-white">172.16.0.254</div>
                                        </div>
                                        <div>
                                            <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Available IP Addresses</div>
                                            <div className="mt-2 font-semibold text-white">{formatAvailableIpAddresses()}</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <LabeledField label="Wired Network">
                                <select
                                    value={form.wiredNetworkId}
                                    onChange={(event) => setField('wiredNetworkId', event.target.value)}
                                    className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white focus:outline-none focus:border-cyan-400"
                                >
                                    <option value="">Choose wired network</option>
                                    {wiredOptions.map((network) => (
                                        <option key={network.id} value={network.id}>
                                            {network.displayName}
                                        </option>
                                    ))}
                                </select>
                            </LabeledField>
                        )}
                    </div>

                    <div className="space-y-5">
                        <div>
                            <h2 className="text-3xl font-black text-white">DNS Resolution</h2>
                            <p className="mt-2 text-sm text-slate-300">
                                Domains and hostname resolution for clients and devices connecting to this network.
                            </p>
                        </div>

                        <div className="max-w-md rounded-2xl border border-white/10 bg-slate-950 p-4">
                            <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">DNS Servers</div>
                            <div className="mt-4 space-y-3">
                                <label className="flex items-center gap-3 text-sm font-semibold text-slate-200">
                                    <input
                                        type="radio"
                                        name="dns_resolution_mode"
                                        checked={!dnsIsStatic}
                                        onChange={() => setField('dnsServerAssignationMode', 'automatic')}
                                        className="h-4 w-4 border-slate-500 bg-slate-900 text-cyan-400 focus:ring-cyan-500"
                                    />
                                    Automatic (default)
                                </label>
                                <label className="flex items-center gap-3 text-sm font-semibold text-slate-200">
                                    <input
                                        type="radio"
                                        name="dns_resolution_mode"
                                        checked={dnsIsStatic}
                                        onChange={() => setField('dnsServerAssignationMode', 'static')}
                                        className="h-4 w-4 border-slate-500 bg-slate-900 text-cyan-400 focus:ring-cyan-500"
                                    />
                                    Static
                                </label>
                            </div>
                        </div>

                        <LabeledField label="Primary DNS Server">
                            <input
                                value={dnsIsStatic ? form.primaryDnsServer : '-'}
                                onChange={(event) => setField('primaryDnsServer', event.target.value)}
                                disabled={!dnsIsStatic}
                                placeholder={dnsIsStatic ? '' : '-'}
                                className={`w-full max-w-md rounded-2xl border bg-slate-950 px-4 py-3 text-white focus:outline-none disabled:cursor-not-allowed disabled:text-slate-500 ${
                                    dnsValidation.primary
                                        ? 'border-rose-500/60 focus:border-rose-400'
                                        : 'border-white/10 focus:border-cyan-400'
                                }`}
                            />
                            {dnsValidation.primary && (
                                <p className="mt-2 text-sm font-medium text-rose-300">{dnsValidation.primary}</p>
                            )}
                        </LabeledField>

                        <LabeledField label="Secondary DNS Server">
                            <input
                                value={dnsIsStatic ? form.secondaryDnsServer : '-'}
                                onChange={(event) => setField('secondaryDnsServer', event.target.value)}
                                disabled={!dnsIsStatic}
                                placeholder={dnsIsStatic ? '' : '-'}
                                className={`w-full max-w-md rounded-2xl border bg-slate-950 px-4 py-3 text-white focus:outline-none disabled:cursor-not-allowed disabled:text-slate-500 ${
                                    dnsValidation.secondary
                                        ? 'border-rose-500/60 focus:border-rose-400'
                                        : 'border-white/10 focus:border-cyan-400'
                                }`}
                            />
                            {dnsValidation.secondary && (
                                <p className="mt-2 text-sm font-medium text-rose-300">{dnsValidation.secondary}</p>
                            )}
                        </LabeledField>
                    </div>
                </div>
                {isDirty && <ActionButtons onUpdate={handleSave} onCancel={handleCancel} saving={saving} disabled={isUpdateDisabled} />}
            </div>
        );
    };

    const renderWirelessNetworkAssignment = () => {
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

                        <div className="flex min-h-[320px] flex-col items-center justify-center rounded-[2rem] border border-white/10 bg-slate-950 p-8 text-center">
                            <div className="inline-flex h-16 w-16 items-center justify-center rounded-full border border-cyan-400/30 bg-cyan-400/10 text-cyan-300">
                                <Router size={28} />
                            </div>
                            <h3 className="mt-6 text-4xl font-black text-white">No Access Points</h3>
                            <p className="mt-3 max-w-sm text-sm text-slate-400">
                                Access point assignment is not wired yet for this section. This panel is a placeholder for the next implementation step.
                            </p>
                            <button
                                type="button"
                                disabled
                                className="mt-6 inline-flex items-center rounded-xl border border-cyan-400/30 px-4 py-2 text-sm font-black text-cyan-300 opacity-60"
                            >
                                View Devices
                            </button>
                        </div>
                    </div>
                </div>
                {isDirty && <ActionButtons onUpdate={handleSave} onCancel={handleCancel} saving={saving} disabled={isUpdateDisabled} />}
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-slate-950 p-6 md:p-8 text-slate-100">
            <div className="mx-auto max-w-7xl space-y-6">
                <div ref={pageTopRef} />
                {loading ? (
                    <div className="flex min-h-[520px] flex-col items-center justify-center gap-4 rounded-[2rem] border border-white/10 bg-slate-900/90 shadow-2xl">
                        <LoaderCircle size={28} className="animate-spin text-cyan-300" />
                        <div className="flex items-center gap-2 text-slate-300">
                            <Wifi size={18} className="text-cyan-300" />
                            Loading site networks...
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                            <div>
                                <div className="text-xs font-black uppercase tracking-[0.28em] text-slate-400">
                                    {selectedNetwork?.networkKind === 'wired' ? 'Wired Network' : 'Wireless Network'}
                                </div>
                                <h1 className="mt-2 text-4xl font-black text-white">
                                    {selectedNetwork?.displayName}
                                </h1>
                                <p className="mt-2 text-sm text-slate-400">
                                    {selectedSite?.siteName || siteId}
                                </p>
                            </div>
                            <div className="min-w-[320px]">
                                <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Network</div>
                                <select
                                    value={selectedNetworkId}
                                    onChange={(event) => setSelectedNetworkId(event.target.value)}
                                    disabled={networks.length === 0}
                                    className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-white focus:outline-none focus:border-cyan-400 disabled:opacity-50"
                                >
                                    {networks.length === 0 && <option value="">No networks</option>}
                                    {networks.map((network) => (
                                        <option key={network.id} value={network.id}>
                                            {network.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {notification?.message && (
                            <div className={`flex items-start gap-3 rounded-2xl border px-4 py-3 transition-all duration-500 ${
                                notification.type === 'error'
                                    ? 'border-rose-500/30 bg-rose-500/10 text-rose-200'
                                    : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                            } ${
                                notificationVisible
                                    ? 'translate-y-0 opacity-100'
                                    : '-translate-y-2 opacity-0'
                            }`}>
                                {notification.type === 'error' ? <AlertTriangle size={18} className="mt-0.5 shrink-0" /> : <CheckCircle2 size={18} className="mt-0.5 shrink-0" />}
                                <span className="text-sm font-medium">{notification.message}</span>
                            </div>
                        )}

                        <div className="space-y-6">
                            {!selectedNetwork || !form ? (
                        <EmptyState message="The selected site does not have any remaining individual-configurable networks." />
                    ) : activeSection === 'ip_assignment' && selectedNetwork?.networkKind === 'wireless' ? (
                        renderWirelessIpAssignment()
                    ) : activeSection === 'network_assignment' && selectedNetwork?.networkKind === 'wireless' ? (
                        renderWirelessNetworkAssignment()
                    ) : activeSection === 'overview' ? (
                        selectedNetwork?.networkKind === 'wired' ? renderWiredOverview() : renderWirelessOverview()
                    ) : (
                        renderPlaceholder()
                    )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default IndividualConfiguration;
