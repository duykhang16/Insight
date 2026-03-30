import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, LoaderCircle, Plus, ShieldAlert, Wifi } from 'lucide-react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import apiClient from '../../api/apiClient';
import { Button } from '../../components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '../../components/ui/dialog';

// ── Shared modules ──
import {
    SECTION_LABEL_MAP,
    SECURITY_OPTIONS,
    DEFAULT_INTERNAL_NETWORK_ADDRESS,
    DEFAULT_INTERNAL_SUBNET_MASK,
} from './constants';

import {
    buildFormForNetwork,
    buildWirelessAccessControlState,
    buildNetworkWithAllowList,
    mergeAllowListIntoAccessControlState,
    mergeSpecificClientSelectionIntoAccessControlState,
    isWirelessAccessControlDirty,
    normalizeAccessPoints,
    normalizeAllowListClients,
    getAllowListClientKey,
    getNetworkKey,
} from './normalizers';

import { LabeledField, Panel, EmptyState, ActionButtons } from './components/Panel';
import {
    WirelessOverview,
    WiredOverview,
    WiredNetworkAssignment,
    WiredAccessControl,
    WirelessIpAssignment,
    WirelessNetworkAssignment,
    WirelessAccessControl,
} from './sections';
import { useNotification, useDirtyState, useSiteNetworks } from './hooks';

const SiteConfig = () => {
    const { siteId, section } = useParams();
    const location = useLocation();
    const navigate = useNavigate();
    const userRole = sessionStorage.getItem('userRole') || 'viewer';
    const pageTopRef = useRef(null);
    const specificClientsPollRef = useRef(null);
    const pendingNetworkKeyRef = useRef('');

    // ── Hooks ──
    const {
        networks, setNetworks,
        selectedNetworkKey, setSelectedNetworkKey,
        form, setForm,
        loading,
        saving, setSaving,
        deleting, setDeleting,
        showPassword, setShowPassword,
        accessControlState, setAccessControlState,
        hasSwitchDevices,
        selectedSite,
        selectedNetwork,
        activeSection,
        wiredOptions,
        selectedAccessPoints,
        dnsValidation,
        isUpdateDisabled,
        initialRouteNetwork,
        syncSelectionToQuery,
    } = useSiteNetworks({ siteId, section });

    const { notification, visible: notificationVisible, show: showNotification, clear: clearNotification } = useNotification();

    // ── Access control UI state ──
    const [showAddAllowedIpModal, setShowAddAllowedIpModal] = useState(false);
    const [newAllowedIpAddress, setNewAllowedIpAddress] = useState('');
    const [allowedIpInputTouched, setAllowedIpInputTouched] = useState(false);
    const [showSpecificClientsSelector, setShowSpecificClientsSelector] = useState(false);
    const [specificClientsDiscoveryActive, setSpecificClientsDiscoveryActive] = useState(false);
    const [specificClientsSearchQuery, setSpecificClientsSearchQuery] = useState('');
    const [specificClientsAppliedSearchTerm, setSpecificClientsAppliedSearchTerm] = useState('');
    const [selectedSpecificClientKeys, setSelectedSpecificClientKeys] = useState([]);
    const [specificClientsLoading, setSpecificClientsLoading] = useState(false);
    const [specificClientsRefreshing, setSpecificClientsRefreshing] = useState(false);
    const [specificClientsSubmitting, setSpecificClientsSubmitting] = useState(false);

    // ── Derived from access control ──
    const availableSpecificClients = useMemo(() => {
        const allowedClientKeys = new Set(
            normalizeAllowListClients(accessControlState?.allowedClients).map((client) => getAllowListClientKey(client))
        );
        return normalizeAllowListClients(accessControlState?.availableClients).filter((client) => {
            const clientKey = getAllowListClientKey(client);
            return clientKey && !allowedClientKeys.has(clientKey);
        });
    }, [accessControlState?.allowedClients, accessControlState?.availableClients]);

    const filteredAvailableClients = useMemo(() => {
        const searchTerm = specificClientsAppliedSearchTerm.trim().toLowerCase();
        if (!searchTerm) return availableSpecificClients;
        return availableSpecificClients.filter((client) => (
            [client.clientName, client.macAddress, client.ipAddress, client.clientType]
                .some((value) => String(value || '').toLowerCase().includes(searchTerm))
        ));
    }, [availableSpecificClients, specificClientsAppliedSearchTerm]);

    const isAccessControlDirty = useMemo(
        () => isWirelessAccessControlDirty(accessControlState, selectedNetwork),
        [accessControlState, selectedNetwork],
    );

    const scrollToTop = () => {
        pageTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    const resetSpecificClientsUi = () => {
        setShowSpecificClientsSelector(false);
        setSpecificClientsDiscoveryActive(false);
        setSpecificClientsSearchQuery('');
        setSpecificClientsAppliedSearchTerm('');
        setSelectedSpecificClientKeys([]);
        setSpecificClientsLoading(false);
        setSpecificClientsRefreshing(false);
        setSpecificClientsSubmitting(false);
    };

    const updateAccessControlDraft = (updater, baselineNetwork = selectedNetwork) => {
        setAccessControlState((current) => {
            const nextState = typeof updater === 'function' ? updater(current) : updater;
            if (baselineNetwork?.networkKind === 'wireless') {
                dirty.setIsDirty(isWirelessAccessControlDirty(nextState, baselineNetwork));
            }
            return nextState;
        });
    };

    const syncNetworkAllowList = (allowList, networkName) => {
        if (!selectedNetwork) return null;
        const nextNetwork = buildNetworkWithAllowList(selectedNetwork, allowList, networkName);
        setNetworks((currentNetworks) => currentNetworks.map((network) => (
            getNetworkKey(network) === getNetworkKey(selectedNetwork) ? nextNetwork : network
        )));
        return nextNetwork;
    };

    const resetUnsavedChanges = () => {
        clearNotification();
        setShowPassword(false);
        resetSpecificClientsUi();
        if (selectedNetwork) {
            setForm(buildFormForNetwork(selectedNetwork));
            if (selectedNetwork.networkKind === 'wireless') {
                setAccessControlState(buildWirelessAccessControlState(selectedNetwork));
            }
        } else {
            setForm(null);
            setAccessControlState(buildWirelessAccessControlState(null));
        }
        setShowAddAllowedIpModal(false);
        setNewAllowedIpAddress('');
        setAllowedIpInputTouched(false);
        dirty.setIsDirty(false);
    };

    // ── Dirty state hook ──
    const dirty = useDirtyState({
        isOnPage: location.pathname.startsWith(`/site/${siteId}/configuration`),
        onDiscard: resetUnsavedChanges,
    });

    // ── Section change cleanup ──
    useEffect(() => {
        clearNotification();
        resetSpecificClientsUi();
    }, [activeSection]);

    // ── Wired section redirect if no switches ──
    useEffect(() => {
        if (siteId && selectedNetwork?.networkKind === 'wired' && activeSection === 'network_assignment' && hasSwitchDevices === false) {
            navigate(`/site/${siteId}/configuration/overview${location.search}`, { replace: true });
        }
    }, [activeSection, hasSwitchDevices, location.search, navigate, selectedNetwork, siteId]);

    // ── Specific clients polling ──
    useEffect(() => {
        if (!showSpecificClientsSelector || !specificClientsDiscoveryActive || !siteId || selectedNetwork?.networkKind !== 'wireless') {
            if (specificClientsPollRef.current) {
                window.clearInterval(specificClientsPollRef.current);
                specificClientsPollRef.current = null;
            }
            return undefined;
        }
        specificClientsPollRef.current = window.setInterval(() => {
            void (async () => {
                try {
                    setSpecificClientsRefreshing(true);
                    const response = await apiClient.get(`/config/sites/${siteId}/individual/networks/${selectedNetwork.id}/specific-clients`);
                    const allowList = response.data?.allowList || {};
                    const nextNetwork = syncNetworkAllowList(allowList, response.data?.networkName);
                    updateAccessControlDraft((current) => mergeAllowListIntoAccessControlState(current, allowList), nextNetwork || selectedNetwork);
                } catch (pollError) {
                    console.error(pollError);
                } finally {
                    setSpecificClientsRefreshing(false);
                }
            })();
        }, 5000);
        return () => {
            if (specificClientsPollRef.current) {
                window.clearInterval(specificClientsPollRef.current);
                specificClientsPollRef.current = null;
            }
        };
    }, [showSpecificClientsSelector, specificClientsDiscoveryActive, siteId, selectedNetwork?.id]);

    // ── Role gate ──
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
        dirty.setIsDirty(true);
        setForm((current) => ({
            ...current,
            [field]: value,
        }));
    };

    const handleSecurityChange = (optionId) => {
        const option = SECURITY_OPTIONS.find((item) => item.id === optionId);
        if (!option || !option.supported) return;
        dirty.setIsDirty(true);
        setForm((current) => ({
            ...current,
            securityOption: optionId,
            authentication: option.authentication,
            security: option.security,
        }));
    };

    const handle24GHzToggle = (checked) => {
        dirty.setIsDirty(true);
        setForm((current) => ({
            ...current,
            isAvailableOn24GHzRadioBand: checked,
            isLegacy80211bRatesEnabled: checked ? current.isLegacy80211bRatesEnabled : false,
        }));
    };

    const handleSpecificNetworkMode = () => {
        dirty.setIsDirty(true);
        setForm((current) => ({
            ...current,
            ipAddressingMode: 'internal',
            networkAddress: current?.networkAddress || DEFAULT_INTERNAL_NETWORK_ADDRESS,
            subnetMask: current?.subnetMask || DEFAULT_INTERNAL_SUBNET_MASK,
        }));
    };

    const handleAccessPointBindingToggle = (accessPointId, checked) => {
        dirty.setIsDirty(true);
        setForm((current) => ({
            ...current,
            accessPoints: normalizeAccessPoints(current?.accessPoints).map((accessPoint) => (
                accessPoint.id === accessPointId
                    ? { ...accessPoint, isBoundToNetwork: checked }
                    : accessPoint
            )),
        }));
    };

    const handleCancel = () => {
        if (!selectedNetwork) return;
        resetUnsavedChanges();
    };

    // ── Network selector ──
    const handleSelectedNetworkChange = (key) => {
        if (dirty.isDirty) {
            pendingNetworkKeyRef.current = key;
            dirty.setShowLeaveModal(true);
            return;
        }
        setSelectedNetworkKey(key);
        const network = networks.find((n) => getNetworkKey(n) === key);
        if (network) {
            syncSelectionToQuery(network);
            setForm(buildFormForNetwork(network));
            if (network.networkKind === 'wireless') {
                setAccessControlState(buildWirelessAccessControlState(network));
            }
        }
        setShowPassword(false);
        clearNotification();
        resetSpecificClientsUi();
    };

    // ── Access control toggles ──
    const handleAccessRestrictionToggle = (field, checked) => {
        dirty.setIsDirty(true);
        updateAccessControlDraft((current) => ({
            ...current,
            [field]: checked,
        }));
    };

    // ── Allowed IP modal handlers ──
    const handleOpenAddAllowedIpModal = () => {
        setNewAllowedIpAddress('');
        setAllowedIpInputTouched(false);
        setShowAddAllowedIpModal(true);
    };

    const handleCloseAddAllowedIpModal = () => {
        setShowAddAllowedIpModal(false);
        setNewAllowedIpAddress('');
        setAllowedIpInputTouched(false);
    };

    const handleAddAllowedIpAddress = () => {
        const trimmed = newAllowedIpAddress.trim();
        if (!trimmed) return;
        dirty.setIsDirty(true);

        if (selectedNetwork?.networkKind === 'wired') {
            setForm((current) => ({
                ...current,
                allowedDestinationIpAddresses: [
                    ...(current.allowedDestinationIpAddresses || []),
                    trimmed,
                ],
            }));
        } else {
            updateAccessControlDraft((current) => ({
                ...current,
                allowedDestinationIpAddresses: [
                    ...(current.allowedDestinationIpAddresses || []),
                    trimmed,
                ],
            }));
        }
        setShowAddAllowedIpModal(false);
        setNewAllowedIpAddress('');
        setAllowedIpInputTouched(false);
    };

    const handleRemoveAllowedIpAddress = (ipAddress) => {
        dirty.setIsDirty(true);

        if (selectedNetwork?.networkKind === 'wired') {
            setForm((current) => ({
                ...current,
                allowedDestinationIpAddresses: (current.allowedDestinationIpAddresses || []).filter(
                    (ip) => ip !== ipAddress,
                ),
            }));
        } else {
            updateAccessControlDraft((current) => ({
                ...current,
                allowedDestinationIpAddresses: (current.allowedDestinationIpAddresses || []).filter(
                    (ip) => ip !== ipAddress,
                ),
            }));
        }
    };

    // ── Remove allowed client ──
    const handleRemoveAllowedClient = (client) => {
        dirty.setIsDirty(true);
        const clientKey = getAllowListClientKey(client);
        updateAccessControlDraft((current) => ({
            ...current,
            allowedClients: normalizeAllowListClients(current.allowedClients).filter(
                (existingClient) => getAllowListClientKey(existingClient) !== clientKey,
            ),
        }));
    };

    const refreshSpecificClients = async ({ silent = false } = {}) => {
        if (!siteId || !selectedNetwork || selectedNetwork.networkKind !== 'wireless') {
            return null;
        }

        if (silent) {
            setSpecificClientsRefreshing(true);
        } else {
            setSpecificClientsLoading(true);
        }

        try {
            const response = await apiClient.get(`/config/sites/${siteId}/individual/networks/${selectedNetwork.id}/specific-clients`);
            const allowList = response.data?.allowList || {};
            const nextNetwork = syncNetworkAllowList(allowList, response.data?.networkName);
            updateAccessControlDraft((current) => mergeAllowListIntoAccessControlState(current, allowList), nextNetwork || selectedNetwork);
            return response.data;
        } finally {
            if (silent) {
                setSpecificClientsRefreshing(false);
            } else {
                setSpecificClientsLoading(false);
            }
        }
    };

    const handleOpenSpecificClientsSelector = async () => {
        if (!siteId || !selectedNetwork || selectedNetwork.networkKind !== 'wireless') {
            return;
        }

        clearNotification();
        setShowSpecificClientsSelector(true);
        setSpecificClientsDiscoveryActive(false);
        setSpecificClientsSearchQuery('');
        setSpecificClientsAppliedSearchTerm('');
        setSelectedSpecificClientKeys([]);
        setAccessControlState((current) => ({
            ...current,
            availableClients: [],
        }));
    };

    const handleCloseSpecificClientsSelector = async () => {
        if (!siteId || !selectedNetwork || selectedNetwork.networkKind !== 'wireless') {
            resetSpecificClientsUi();
            return;
        }

        if (!specificClientsDiscoveryActive) {
            resetSpecificClientsUi();
            return;
        }

        setSpecificClientsSubmitting(true);

        try {
            const response = await apiClient.put(
                `/config/sites/${siteId}/individual/networks/${selectedNetwork.id}/specific-clients/extend`,
                {
                    id: accessControlState.allowListId,
                    isAllowListEnabled: accessControlState.isSpecificClientsEnabled && accessControlState.allowedClients.length > 0,
                    isExtendAllowListEnabled: false,
                },
            );
            const allowList = response.data?.allowList || {};
            const nextNetwork = syncNetworkAllowList(allowList, response.data?.networkName);
            updateAccessControlDraft((current) => mergeAllowListIntoAccessControlState(current, allowList), nextNetwork || selectedNetwork);
        } catch (closeError) {
            console.error(closeError);
            showNotification('error', closeError?.response?.data?.detail || 'Failed to close specific-clients search.');
            scrollToTop();
            return;
        } finally {
            setSpecificClientsSubmitting(false);
        }

        resetSpecificClientsUi();
    };

    const handleSpecificClientSelectionToggle = (clientKey, checked) => {
        setSelectedSpecificClientKeys((currentKeys) => (
            checked
                ? (currentKeys.includes(clientKey) ? currentKeys : [...currentKeys, clientKey])
                : currentKeys.filter((existingKey) => existingKey !== clientKey)
        ));
    };

    const handleSearchSpecificClients = async () => {
        try {
            setSpecificClientsLoading(true);
            clearNotification();

            const response = await apiClient.put(
                `/config/sites/${siteId}/individual/networks/${selectedNetwork.id}/specific-clients/extend`,
                {
                    id: accessControlState.allowListId,
                    isAllowListEnabled: true,
                    isExtendAllowListEnabled: true,
                },
            );
            const allowList = response.data?.allowList || {};
            const nextNetwork = syncNetworkAllowList(allowList, response.data?.networkName);
            updateAccessControlDraft((current) => ({
                ...mergeAllowListIntoAccessControlState(current, allowList),
                isSpecificClientsEnabled: true,
            }), nextNetwork || selectedNetwork);
            setSpecificClientsDiscoveryActive(true);
        } catch (searchError) {
            console.error(searchError);
            showNotification('error', searchError?.response?.data?.detail || 'Failed to start client discovery.');
            scrollToTop();
        } finally {
            setSpecificClientsLoading(false);
        }
    };

    const handleFilterSpecificClients = () => {
        setSpecificClientsAppliedSearchTerm(specificClientsSearchQuery.trim());
    };

    const handleAddSelectedSpecificClients = async () => {
        if (!siteId || !selectedNetwork || selectedNetwork.networkKind !== 'wireless' || selectedSpecificClientKeys.length === 0) {
            return;
        }

        clearNotification();

        try {
            const selectedClients = filteredAvailableClients.filter((client) => (
                selectedSpecificClientKeys.includes(getAllowListClientKey(client))
            ));
            updateAccessControlDraft((current) => (
                mergeSpecificClientSelectionIntoAccessControlState(current, selectedClients)
            ));
            dirty.setIsDirty(true);
            resetSpecificClientsUi();
        } catch (selectionError) {
            console.error(selectionError);
            showNotification('error', 'Failed to stage selected clients.');
            scrollToTop();
        }
    };

    const handleSave = async () => {
        if (!siteId || !selectedNetwork || !form) return;

        const isWireless = selectedNetwork.networkKind === 'wireless';
        const isWiredOverview = selectedNetwork.networkKind === 'wired' && activeSection === 'overview';
        const isWiredAccessControl = selectedNetwork.networkKind === 'wired' && activeSection === 'access_control';
        const isIpAssignment = isWireless && activeSection === 'ip_assignment';
        const isNetworkAssignment = isWireless && activeSection === 'network_assignment';
        const isAccessControl = isWireless && activeSection === 'access_control';

        if (isWiredOverview) {
            if (!form.networkName.trim()) {
                showNotification('error', 'Network name is required.');
                return;
            }
            const vlanValue = String(form.vlanId || '').trim();
            if (!/^\d+$/.test(vlanValue)) {
                showNotification('error', 'VLAN must be a valid integer.');
                return;
            }
            const vlanId = Number(vlanValue);
            if (vlanId < 1 || vlanId > 4094) {
                showNotification('error', 'VLAN must be between 1 and 4094.');
                return;
            }
        } else if (isWireless && activeSection === 'overview') {
            if (!form.networkName.trim()) {
                showNotification('error', 'Network name is required.');
                return;
            }
            if (!form.preSharedKey || form.preSharedKey.length < 8) {
                showNotification('error', 'PSK password must be at least 8 characters.');
                return;
            }
        } else if (isIpAssignment) {
            if (form.ipAddressingMode !== 'internal' && !form.wiredNetworkId) {
                showNotification('error', 'A wired network selection is required.');
                return;
            }
            if (form.ipAddressingMode === 'internal' && dnsValidation.hasError) {
                showNotification('error', dnsValidation.primary || dnsValidation.secondary || 'DNS server values are invalid.');
                return;
            }
        } else if (isNetworkAssignment) {
            if (!form.isAvailableOn24GHzRadioBand && !form.isAvailableOn5GHzRadioBand && !form.isAvailableOn6GHzRadioBand) {
                showNotification('error', 'At least one radio frequency must remain enabled.');
                return;
            }
        } else if (isAccessControl) {
            if (accessControlState.isSpecificIpAddressEnabled && accessControlState.allowedDestinationIpAddresses.length === 0) {
                showNotification('error', 'Add at least one allowed IP address or disable Specific IP Address.');
                return;
            }
            if (accessControlState.isSpecificClientsEnabled && accessControlState.allowedClients.length === 0) {
                showNotification('error', 'Add at least one allowed client or disable Specific Clients.');
                return;
            }
        } else if (isWiredAccessControl) {
            if (form.isNetworkDestinationsRestricted && form.allowedDestinationIpAddresses.length === 0) {
                showNotification('error', 'Add at least one allowed IP address or disable Network Destinations.');
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
                        accessPoints: normalizeAccessPoints(form.accessPoints).map((accessPoint) => ({
                            deviceId: accessPoint.deviceId || accessPoint.id,
                            deviceName: accessPoint.deviceName || accessPoint.name,
                            deviceModel: accessPoint.deviceModel || '',
                            radioBandMapping: accessPoint.radioBandMapping || '',
                            enabledRadioBands: Array.isArray(accessPoint.enabledRadioBands) ? accessPoint.enabledRadioBands : [],
                            isBoundToNetwork: Boolean(accessPoint.isBoundToNetwork),
                        })),
                    }
                : isAccessControl
                    ? {
                        isAccessRestricted: accessControlState.isNetworkDestinationsEnabled || accessControlState.isSpecificClientsEnabled,
                        isInternetAllowed: true,
                        isSpecificDestinationsAllowed: accessControlState.isNetworkDestinationsEnabled && accessControlState.isSpecificIpAddressEnabled,
                        allowList: {
                            id: accessControlState.allowListId,
                            isAllowListEnabled: accessControlState.isSpecificClientsEnabled,
                            isExtendAllowListEnabled: false,
                            allowedClients: normalizeAllowListClients(accessControlState.allowedClients).map((client) => ({
                                macAddress: client.macAddress,
                            })),
                        },
                        allowedDestinations: accessControlState.isNetworkDestinationsEnabled && accessControlState.isSpecificIpAddressEnabled
                            ? accessControlState.allowedDestinationIpAddresses
                            : [],
                    }
                : isWiredAccessControl
                    ? {
                        isAccessRestricted: form.isNetworkDestinationsRestricted,
                        allowedDestinations: form.isNetworkDestinationsRestricted
                            ? form.allowedDestinationIpAddresses
                            : [],
                    }
                : {
                    ...(selectedNetwork.networkKind === 'wired'
                        ? {
                            wiredNetworkName: form.networkName.trim(),
                            isEnabled: form.isEnabled,
                            vlanId: Number(String(form.vlanId).trim()),
                            isIgmpSnoopingEnabled: form.isIgmpSnoopingEnabled,
                            shouldApplyNetworkSecurityProtections: form.isDhcpArpProtectionEnabled,
                        }
                        : {
                            networkName: form.networkName.trim(),
                            isEnabled: form.isEnabled,
                            isSsidHidden: form.isSsidHidden,
                            authentication: form.authentication,
                            security: form.security,
                            preSharedKey: form.preSharedKey,
                        }),
                };
            const response = await apiClient.put(
                isIpAssignment
                    ? `/config/sites/${siteId}/individual/networks/${selectedNetwork.id}/ip-assignment`
                    : activeSection === 'network_assignment'
                        ? `/config/sites/${siteId}/individual/networks/${selectedNetwork.id}/network-assignment`
                    : activeSection === 'access_control'
                        ? `/config/sites/${siteId}/individual/networks/${selectedNetwork.id}/access-control`
                    : `/config/sites/${siteId}/individual/networks/${selectedNetwork.id}/overview`,
                payload,
            );
            const updatedNetwork = response.data?.network;
            if (!updatedNetwork) {
                throw new Error('Missing updated network payload.');
            }

            setNetworks((current) =>
                current.map((network) => (
                    getNetworkKey(network) === getNetworkKey(selectedNetwork) ? updatedNetwork : network
                ))
            );
            setSelectedNetworkKey(getNetworkKey(updatedNetwork));
            syncSelectionToQuery(updatedNetwork);
            setForm(buildFormForNetwork(updatedNetwork));
            if (updatedNetwork.networkKind === 'wireless') {
                setAccessControlState(buildWirelessAccessControlState(updatedNetwork));
            }
            setShowAddAllowedIpModal(false);
            setNewAllowedIpAddress('');
            setAllowedIpInputTouched(false);
            showNotification('success', response.data?.message || 'Update successfully');
            dirty.setIsDirty(false);
            setShowPassword(false);
            scrollToTop();
        } catch (saveError) {
            console.error(saveError);
            if (!isAccessControl && selectedNetwork) {
                setForm(buildFormForNetwork(selectedNetwork));
                if (selectedNetwork.networkKind === 'wireless') {
                    setAccessControlState(buildWirelessAccessControlState(selectedNetwork));
                }
            }
            setShowAddAllowedIpModal(false);
            setNewAllowedIpAddress('');
            setAllowedIpInputTouched(false);
            dirty.setIsDirty(isAccessControl);
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
            const deletedNetwork = response.data?.deletedNetwork || {};
            const deletedKey = deletedNetwork.networkKind && deletedNetwork.id
                ? `${deletedNetwork.networkKind}:${deletedNetwork.id}`
                : getNetworkKey(selectedNetwork);

            setNetworks((current) => {
                const nextNetworks = current.filter((network) => getNetworkKey(network) !== deletedKey);
                const currentIndex = current.findIndex((network) => getNetworkKey(network) === deletedKey);
                const nextSelected = nextNetworks[currentIndex] || nextNetworks[currentIndex - 1] || nextNetworks[0] || null;

                setSelectedNetworkKey(nextSelected ? getNetworkKey(nextSelected) : '');
                syncSelectionToQuery(nextSelected);
                if (!nextSelected) {
                    setForm(null);
                }

                return nextNetworks;
            });
            dirty.setIsDirty(false);
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

    const renderWirelessOverview = () => (
        <WirelessOverview
            form={form}
            isDirty={dirty.isDirty}
            saving={saving}
            deleting={deleting}
            showPassword={showPassword}
            isUpdateDisabled={isUpdateDisabled}
            setField={setField}
            handleSecurityChange={handleSecurityChange}
            setShowPassword={setShowPassword}
            handleSave={handleSave}
            handleCancel={handleCancel}
            handleDelete={handleDelete}
        />
    );

    const renderWiredOverview = () => (
        <WiredOverview
            form={form}
            saving={saving}
            deleting={deleting}
            setField={setField}
            handleDelete={handleDelete}
        />
    );

    const renderWiredNetworkAssignment = () => (
        <WiredNetworkAssignment form={form} setField={setField} />
    );

    const renderWiredAccessControl = () => (
        <WiredAccessControl
            form={form}
            setField={setField}
            showAddAllowedIpModal={showAddAllowedIpModal}
            newAllowedIpAddress={newAllowedIpAddress}
            setNewAllowedIpAddress={setNewAllowedIpAddress}
            allowedIpInputTouched={allowedIpInputTouched}
            setAllowedIpInputTouched={setAllowedIpInputTouched}
            handleOpenAddAllowedIpModal={handleOpenAddAllowedIpModal}
            handleCloseAddAllowedIpModal={handleCloseAddAllowedIpModal}
            handleAddAllowedIpAddress={handleAddAllowedIpAddress}
            handleRemoveAllowedIpAddress={handleRemoveAllowedIpAddress}
        />
    );

    const renderPlaceholder = () => (
        <div className="rounded-[2rem] border border-white/10 bg-slate-900/90 p-10 shadow-2xl">
            <h2 className="text-3xl font-black text-white">{SECTION_LABEL_MAP[activeSection] || 'Configuration'}</h2>
            <p className="mt-4 max-w-2xl text-sm text-slate-400">
                This section is reserved for the next implementation step.
            </p>
        </div>
    );

    const renderWirelessAccessControl = () => (
        <WirelessAccessControl
            selectedNetwork={selectedNetwork}
            accessControlState={accessControlState}
            isDirty={isAccessControlDirty}
            saving={saving}
            showAddAllowedIpModal={showAddAllowedIpModal}
            newAllowedIpAddress={newAllowedIpAddress}
            setNewAllowedIpAddress={setNewAllowedIpAddress}
            allowedIpInputTouched={allowedIpInputTouched}
            setAllowedIpInputTouched={setAllowedIpInputTouched}
            showSpecificClientsSelector={showSpecificClientsSelector}
            specificClientsDiscoveryActive={specificClientsDiscoveryActive}
            specificClientsSearchQuery={specificClientsSearchQuery}
            setSpecificClientsSearchQuery={setSpecificClientsSearchQuery}
            selectedSpecificClientKeys={selectedSpecificClientKeys}
            specificClientsLoading={specificClientsLoading}
            specificClientsSubmitting={specificClientsSubmitting}
            availableSpecificClients={availableSpecificClients}
            filteredAvailableClients={filteredAvailableClients}
            handleAccessRestrictionToggle={handleAccessRestrictionToggle}
            handleOpenAddAllowedIpModal={handleOpenAddAllowedIpModal}
            handleCloseAddAllowedIpModal={handleCloseAddAllowedIpModal}
            handleAddAllowedIpAddress={handleAddAllowedIpAddress}
            handleRemoveAllowedIpAddress={handleRemoveAllowedIpAddress}
            handleOpenSpecificClientsSelector={handleOpenSpecificClientsSelector}
            handleCloseSpecificClientsSelector={handleCloseSpecificClientsSelector}
            handleSearchSpecificClients={handleSearchSpecificClients}
            handleFilterSpecificClients={handleFilterSpecificClients}
            handleSpecificClientSelectionToggle={handleSpecificClientSelectionToggle}
            handleAddSelectedSpecificClients={handleAddSelectedSpecificClients}
            handleRemoveAllowedClient={handleRemoveAllowedClient}
            handleSave={handleSave}
            handleCancel={handleCancel}
        />
    );

    const renderWirelessIpAssignment = () => (
        <WirelessIpAssignment
            form={form}
            isDirty={dirty.isDirty}
            saving={saving}
            isUpdateDisabled={isUpdateDisabled}
            dnsValidation={dnsValidation}
            wiredOptions={networks.filter((n) => n.networkKind === 'wired')}
            setField={setField}
            handleSpecificNetworkMode={handleSpecificNetworkMode}
            handleSave={handleSave}
            handleCancel={handleCancel}
        />
    );

    const renderWirelessNetworkAssignment = () => (
        <WirelessNetworkAssignment
            form={form}
            isDirty={dirty.isDirty}
            saving={saving}
            isUpdateDisabled={isUpdateDisabled}
            selectedNetwork={selectedNetwork}
            selectedAccessPoints={selectedAccessPoints}
            siteId={siteId}
            setField={setField}
            handle24GHzToggle={handle24GHzToggle}
            handleAccessPointBindingToggle={handleAccessPointBindingToggle}
            handleSave={handleSave}
            handleCancel={handleCancel}
        />
    );

    const renderWiredContent = () => {
        if (activeSection === 'network_assignment' && hasSwitchDevices === false) return renderWiredOverview();
        if (activeSection === 'network_assignment') return renderWiredNetworkAssignment();
        if (activeSection === 'access_control') return renderWiredAccessControl();
        return renderWiredOverview();
    };

    const renderWiredSectionLayout = () => (
        <div className="space-y-6">
            {renderWiredContent()}
            {dirty.isDirty && <ActionButtons onUpdate={handleSave} onCancel={handleCancel} saving={saving} disabled={isUpdateDisabled} />}
        </div>
    );

    return (
        <div className="min-h-screen bg-slate-950 p-6 md:p-8 text-slate-100">
            <div className="mx-auto max-w-7xl space-y-6">
                <div ref={pageTopRef} />
                <Dialog open={dirty.showLeaveModal} onOpenChange={(open) => { if (!open) dirty.handleStayOnPage(); }}>
                    <DialogContent className="sm:max-w-[520px] border-white/10 bg-slate-800 p-0 text-slate-100" showCloseButton={false}>
                        <DialogHeader className="px-8 pt-8">
                            <DialogTitle className="text-5xl font-black tracking-tight text-slate-100">Leave Page?</DialogTitle>
                            <DialogDescription className="pt-2 text-lg font-semibold text-slate-300">
                                All changes will be lost.
                            </DialogDescription>
                        </DialogHeader>
                        <DialogFooter className="mt-6 border-white/10 bg-slate-800/95 px-8 pb-8 pt-4 sm:justify-end">
                            <Button variant="ghost" size="lg" onClick={dirty.handleStayOnPage} className="text-base font-black text-slate-100 hover:bg-slate-700 hover:text-white">
                                Stay on Page
                            </Button>
                            <Button size="lg" onClick={dirty.handleLeavePage} className="bg-emerald-500 px-6 text-base font-black text-white hover:bg-emerald-400">
                                Leave Page
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
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
                            <div className="flex items-end gap-3">
                                <div className="min-w-[320px]">
                                    <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Network</div>
                                    <select
                                        value={selectedNetworkKey}
                                        onChange={(event) => handleSelectedNetworkChange(event.target.value)}
                                        disabled={networks.length === 0}
                                        className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-900 px-4 py-3 text-white focus:outline-none focus:border-cyan-400 disabled:opacity-50"
                                    >
                                        {networks.length === 0 && <option value="">No networks</option>}
                                        {networks.map((network) => (
                                            <option key={getNetworkKey(network)} value={getNetworkKey(network)}>
                                                {network.label}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                {userRole !== 'viewer' && (
                                    <button
                                        type="button"
                                        onClick={() => navigate(`/site/${siteId}/configuration/create-network`)}
                                        className="inline-flex h-[50px] items-center gap-2 rounded-2xl bg-emerald-500 px-5 text-sm font-black uppercase tracking-wider text-slate-950 shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_8px_24px_rgba(16,185,129,0.35)] transition-all hover:bg-emerald-400 hover:shadow-[0_0_0_1px_rgba(255,255,255,0.12),0_12px_32px_rgba(16,185,129,0.45)] active:scale-[0.97]"
                                    >
                                        <Plus size={16} strokeWidth={3} />
                                        Create
                                    </button>
                                )}
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
                    ) : selectedNetwork?.networkKind === 'wired' ? (
                        renderWiredSectionLayout()
                    ) : activeSection === 'ip_assignment' && selectedNetwork?.networkKind === 'wireless' ? (
                        renderWirelessIpAssignment()
                    ) : activeSection === 'access_control' && selectedNetwork?.networkKind === 'wireless' ? (
                        renderWirelessAccessControl()
                    ) : activeSection === 'network_assignment' && selectedNetwork?.networkKind === 'wireless' ? (
                    renderWirelessNetworkAssignment()
                    ) : activeSection === 'overview' ? (
                        renderWirelessOverview()
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

export default SiteConfig;
