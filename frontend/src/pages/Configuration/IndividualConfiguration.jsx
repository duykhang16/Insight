import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, CheckCircle2, Eye, EyeOff, Info, LoaderCircle, Monitor, Router, Save, Search, ShieldAlert, Trash2, Wifi } from 'lucide-react';
import { useBeforeUnload, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import apiClient from '../../api/apiClient';
import { useSite } from '../../context/SiteContext';
import { Button } from '../../components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '../../components/ui/dialog';

const CONFIG_DIRTY_STATE_KEY = 'individualConfigurationDirty';
const CONFIG_DIRTY_EVENT = 'individualConfigurationDirtyChange';
const CONFIG_DISCARD_EVENT = 'individualConfigurationDiscardChanges';

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

const WIRED_CONFIGURATION_TASKS = [
    { key: 'overview', path: 'overview', label: 'Overview' },
    { key: 'network_assignment', path: 'network-assignment', label: 'Network Assignment' },
    { key: 'access_control', path: 'access-control', label: 'Access Control' },
];

const WIRED_CONFIGURATION_SECTIONS = new Set(
    WIRED_CONFIGURATION_TASKS.map((task) => task.key),
);

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
    accessPoints: normalizeAccessPoints(network?.accessPoints),
});

const getAllowListClientKey = (client) => String(client?.macAddress || client?.clientId || '').trim().toLowerCase();

const normalizeAllowListClient = (client) => {
    if (!client || typeof client !== 'object') {
        return null;
    }

    const macAddress = String(client.macAddress || '').trim();
    const clientId = String(client.clientId || macAddress).trim();
    const clientName = String(client.clientName || macAddress || clientId).trim();
    if (!macAddress || !clientId) {
        return null;
    }

    return {
        clientId,
        macAddress,
        ipAddress: String(client.ipAddress || '').trim(),
        clientName: clientName || macAddress,
        clientType: String(client.clientType || '').trim(),
        wiredNetworkIds: Array.isArray(client.wiredNetworkIds)
            ? client.wiredNetworkIds.map((value) => String(value || '').trim()).filter(Boolean)
            : [],
        connectionDurationInSeconds: Number(client.connectionDurationInSeconds || 0),
        isWatchlisted: Boolean(client.isWatchlisted),
    };
};

const normalizeAllowListClients = (clients) => (
    Array.isArray(clients)
        ? clients
            .map((client) => normalizeAllowListClient(client))
            .filter(Boolean)
        : []
);

const buildWirelessAllowListState = (network) => {
    const allowList = network?.allowList && typeof network.allowList === 'object' ? network.allowList : {};
    const allowedClients = normalizeAllowListClients(allowList.allowedClients);
    const availableClients = normalizeAllowListClients(allowList.availableClients);
    const isAllowListEnabled = Boolean(
        allowList.isAllowListEnabled
        || allowList.isExtendAllowListEnabled
    );

    return {
        allowListId: String(allowList.id || '').trim(),
        allowListState: allowList.allowListState || null,
        maxEntityAllowedAllowLists: allowList.maxEntityAllowedAllowLists ?? null,
        maxAllowedClients: allowList.maxAllowedClients ?? null,
        isAllowListEnabled,
        isExtendAllowListEnabled: Boolean(allowList.isExtendAllowListEnabled),
        allowedClients,
        availableClients,
    };
};

const buildWirelessAccessControlState = (network) => {
    const allowListState = buildWirelessAllowListState(network);
    return {
        isNetworkDestinationsEnabled: Boolean(
            network?.isAccessRestricted
            || network?.isSpecificDestinationsAllowed
            || (Array.isArray(network?.allowedDestinations) && network.allowedDestinations.length > 0)
        ),
        isSpecificClientsEnabled: allowListState.isAllowListEnabled,
        isInternetAllowed: true,
        isSpecificIpAddressEnabled: Boolean(
            network?.isSpecificDestinationsAllowed
            || (Array.isArray(network?.allowedDestinations) && network.allowedDestinations.length > 0)
        ),
        allowedDestinationIpAddresses: Array.isArray(network?.allowedDestinations)
            ? network.allowedDestinations
                .map((destination) => {
                    if (typeof destination === 'string') {
                        return destination;
                    }
                    if (destination && typeof destination === 'object') {
                        return String(destination.address || destination.ipAddress || destination.value || '').trim();
                    }
                    return '';
                })
                .filter(Boolean)
            : [],
        ...allowListState,
    };
};

const mergeAllowListIntoAccessControlState = (currentState, allowList) => ({
    ...currentState,
    ...buildWirelessAllowListState({ allowList }),
});

const mergeSpecificClientSelectionIntoAccessControlState = (currentState, selectedClients, allowList = {}) => {
    const normalizedSelectedClients = normalizeAllowListClients(selectedClients);
    const hasAllowListUpdate = allowList && typeof allowList === 'object' && Object.keys(allowList).length > 0;
    const normalizedAllowList = hasAllowListUpdate ? buildWirelessAllowListState({ allowList }) : {};
    const nextAllowedClientsByKey = new Map();

    normalizeAllowListClients([
        ...(hasAllowListUpdate ? normalizedAllowList.allowedClients : []),
        ...currentState?.allowedClients,
        ...normalizedSelectedClients,
    ]).forEach((client) => {
        nextAllowedClientsByKey.set(getAllowListClientKey(client), client);
    });

    const nextAllowedClients = Array.from(nextAllowedClientsByKey.values());
    const allowedClientKeys = new Set(nextAllowedClients.map((client) => getAllowListClientKey(client)));
    const nextAvailableClients = normalizeAllowListClients([
        ...(hasAllowListUpdate ? normalizedAllowList.availableClients : []),
        ...currentState?.availableClients,
    ]).filter((client) => !allowedClientKeys.has(getAllowListClientKey(client)));

    return {
        ...currentState,
        ...normalizedAllowList,
        isSpecificClientsEnabled: true,
        isAllowListEnabled: true,
        allowedClients: nextAllowedClients,
        availableClients: nextAvailableClients,
    };
};

const buildNetworkWithAllowList = (network, allowList, networkName) => {
    if (!network) {
        return network;
    }

    return {
        ...network,
        networkName: networkName || network.networkName,
        displayName: networkName || network.displayName,
        label: `${networkName || network.networkName || network.displayName || 'Unnamed SSID'} · Wireless`,
        allowList: {
            ...(network.allowList && typeof network.allowList === 'object' ? network.allowList : {}),
            ...(allowList && typeof allowList === 'object' ? allowList : {}),
            allowedClients: normalizeAllowListClients(allowList?.allowedClients),
            availableClients: normalizeAllowListClients(allowList?.availableClients),
        },
    };
};

const buildAccessControlSignature = (state) => JSON.stringify({
    isNetworkDestinationsEnabled: Boolean(state?.isNetworkDestinationsEnabled),
    isSpecificClientsEnabled: Boolean(state?.isSpecificClientsEnabled),
    isSpecificIpAddressEnabled: Boolean(state?.isSpecificIpAddressEnabled),
    allowedDestinationIpAddresses: Array.isArray(state?.allowedDestinationIpAddresses)
        ? [...state.allowedDestinationIpAddresses].sort()
        : [],
    allowedClients: normalizeAllowListClients(state?.allowedClients)
        .map((client) => ({
            clientId: client.clientId,
            macAddress: client.macAddress.toLowerCase(),
        }))
        .sort((left, right) => left.macAddress.localeCompare(right.macAddress)),
});

const isWirelessAccessControlDirty = (state, network) => (
    buildAccessControlSignature(state) !== buildAccessControlSignature(buildWirelessAccessControlState(network))
);

const buildWiredForm = (network) => ({
    mode: 'wired',
    networkName: network?.networkName || `VLAN ${network?.vlanId ?? ''}`.trim(),
    isEnabled: network?.isEnabled !== false,
    state: network?.state || 'Active',
    health: network?.health || 'good',
    type: network?.usage || 'employee',
    vlanId: network?.vlanId ?? '',
    isIgmpSnoopingEnabled: Boolean(network?.isIgmpSnoopingEnabled),
    isDhcpArpProtectionEnabled: Boolean(network?.isDhcpArpProtectionEnabled),
    isNetworkDestinationsRestricted: Boolean(
        network?.isAccessRestricted
        || network?.isNetworkDestinationsRestricted
        || (Array.isArray(network?.allowedDestinations) && network.allowedDestinations.length > 0)
    ),
    allowedDestinationIpAddresses: Array.isArray(network?.allowedDestinations)
        ? network.allowedDestinations
            .map((destination) => {
                if (typeof destination === 'string') {
                    return destination;
                }
                if (destination && typeof destination === 'object') {
                    return String(destination.address || destination.ipAddress || destination.value || '').trim();
                }
                return '';
            })
            .filter(Boolean)
        : [],
});

const SUBNET_MASK_OPTIONS = [
    '255.255.255.0 (/24)',
    '255.255.0.0 (/16)',
    '255.0.0.0 (/8)',
];
const DEFAULT_INTERNAL_NETWORK_ADDRESS = '172.16.0.0';
const DEFAULT_INTERNAL_SUBNET_MASK = '255.255.255.0';

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

const getNetworkKey = (network) => {
    const networkKind = String(network?.networkKind || '');
    const networkId = String(network?.id || '');
    return networkKind && networkId ? `${networkKind}:${networkId}` : networkId;
};

const findInitialNetwork = (networks, requestedNetworkKey, requestedNetworkId) => (
    networks.find((network) => getNetworkKey(network) === requestedNetworkKey) ||
    networks.find((network) => String(network.id) === String(requestedNetworkId)) ||
    networks[0] ||
    null
);

const normalizeAccessPoints = (accessPoints) => (
    Array.isArray(accessPoints)
        ? accessPoints
            .map((accessPoint) => {
                if (accessPoint && typeof accessPoint === 'object') {
                    const id = String(
                        accessPoint.id
                        || accessPoint.deviceId
                        || accessPoint.serialNumber
                        || accessPoint.macAddress
                        || accessPoint.name
                        || ''
                    );
                    const name = String(
                        accessPoint.name
                        || accessPoint.deviceName
                        || accessPoint.hostname
                        || id
                    );

                    if (!id && !name) {
                        return null;
                    }

                    return {
                        id: id || name,
                        name: name || id,
                        deviceId: String(accessPoint.deviceId || id || name),
                        deviceName: String(accessPoint.deviceName || name || id),
                        deviceModel: String(accessPoint.deviceModel || ''),
                        radioBandMapping: String(accessPoint.radioBandMapping || ''),
                        enabledRadioBands: Array.isArray(accessPoint.enabledRadioBands) ? accessPoint.enabledRadioBands : [],
                        isBoundToNetwork: Boolean(accessPoint.isBoundToNetwork),
                    };
                }

                if (accessPoint == null || accessPoint === '') {
                    return null;
                }

                const value = String(accessPoint);
                return {
                    id: value,
                    name: value,
                    deviceId: value,
                    deviceName: value,
                    deviceModel: '',
                    radioBandMapping: '',
                    enabledRadioBands: [],
                    isBoundToNetwork: true,
                };
            })
            .filter(Boolean)
        : []
);

const formatAccessPointBands = (accessPoint) => {
    const bands = Array.isArray(accessPoint?.enabledRadioBands) ? accessPoint.enabledRadioBands : [];
    if (bands.length > 0) {
        const labelMap = {
            '2.4ghz': '2.4 GHz',
            '5ghz': '5 GHz',
            '6ghz': '6 GHz',
        };

        return bands
            .map((band) => labelMap[String(band).toLowerCase()] || String(band))
            .join(', ');
    }

    const mappingMap = {
        '2.4ghz_and_5ghz': '2.4 GHz, 5 GHz',
        '2.4ghz_only': '2.4 GHz',
        '5ghz_only': '5 GHz',
        '6ghz_only': '6 GHz',
        '5ghz_and_6ghz': '5 GHz, 6 GHz',
        '2.4ghz_5ghz_and_6ghz': '2.4 GHz, 5 GHz, 6 GHz',
    };

    return mappingMap[String(accessPoint?.radioBandMapping || '').toLowerCase()] || '';
};

const normalizeInitialConfigurationNetwork = (network) => {
    if (!network || !network.networkKind || !network.id) {
        return null;
    }

    const displayName = network.displayName || network.networkName || `VLAN ${network.vlanId ?? '—'}`;
    const usage = network.usage || network.type || 'employee';
    const state = network.state || (network.isEnabled === false ? 'Disabled' : 'Active');

    if (network.networkKind === 'wired') {
        return {
            ...network,
            id: String(network.id),
            networkKind: 'wired',
            displayName,
            label: network.label || `${displayName} · Wired`,
            networkName: network.networkName || displayName,
            isEnabled: network.isEnabled !== false,
            health: network.health || 'good',
            state,
            usage,
            vlanId: network.vlanId ?? '',
            isIgmpSnoopingEnabled: Boolean(network.isIgmpSnoopingEnabled),
            isDhcpArpProtectionEnabled: Boolean(network.isDhcpArpProtectionEnabled),
            isNetworkDestinationsRestricted: Boolean(
                network.isAccessRestricted
                || network.isNetworkDestinationsRestricted
                || (Array.isArray(network.allowedDestinations) && network.allowedDestinations.length > 0)
            ),
            allowedDestinations: Array.isArray(network.allowedDestinations) ? network.allowedDestinations : [],
        };
    }

    return {
        ...network,
        id: String(network.id),
        networkKind: 'wireless',
        displayName,
        label: network.label || `${displayName} · Wireless`,
        networkName: network.networkName || displayName,
        isEnabled: network.isEnabled !== false,
        health: network.health || 'good',
        state,
        usage,
        authentication: network.authentication || 'psk',
        security: String(network.security || 'wpa3').toLowerCase(),
        wiredNetworkId: network.wiredNetworkId || '',
        ipAddressingMode: network.ipAddressingMode || 'internal',
        dhcpScope: typeof network.dhcpScope === 'object' && network.dhcpScope !== null ? network.dhcpScope : {},
        isAvailableOn24GHzRadioBand: Boolean(network.isAvailableOn24GHzRadioBand),
        isAvailableOn5GHzRadioBand: Boolean(network.isAvailableOn5GHzRadioBand),
        isAvailableOn6GHzRadioBand: Boolean(network.isAvailableOn6GHzRadioBand),
        isLegacy80211bRatesEnabled: Boolean(network.isLegacy80211bRatesEnabled),
        isSsidHidden: Boolean(network.isSsidHidden),
        preSharedKey: network.preSharedKey || '',
        accessPoints: normalizeAccessPoints(network.accessPoints),
    };
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

const ActionButtons = ({ onUpdate, onCancel, saving, disabled, updateDisabled = false }) => (
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
            disabled={disabled || saving || updateDisabled}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-emerald-400 px-5 text-sm font-black uppercase tracking-[0.16em] text-slate-950 shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_8px_24px_rgba(16,185,129,0.35)] transition-colors hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
        >
            {saving ? <LoaderCircle size={14} className="animate-spin" /> : <Save size={14} />}
            Update
        </button>
    </div>
);

const IndividualConfiguration = () => {
    const { siteId, section } = useParams();
    const location = useLocation();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const { sites, fetchSites } = useSite();
    const userRole = sessionStorage.getItem('userRole') || 'viewer';
    const initialRouteNetworkRef = useRef(normalizeInitialConfigurationNetwork(location.state?.initialNetwork));
    const initialRouteNetwork = initialRouteNetworkRef.current;
    const [networks, setNetworks] = useState(() => (initialRouteNetwork ? [initialRouteNetwork] : []));
    const [selectedNetworkKey, setSelectedNetworkKey] = useState(() => (initialRouteNetwork ? getNetworkKey(initialRouteNetwork) : ''));
    const [form, setForm] = useState(() => (
        initialRouteNetwork
            ? (initialRouteNetwork.networkKind === 'wired' ? buildWiredForm(initialRouteNetwork) : buildWirelessForm(initialRouteNetwork))
            : null
    ));
    const [isDirty, setIsDirty] = useState(false);
    const [loading, setLoading] = useState(() => !initialRouteNetwork);
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [notification, setNotification] = useState(null);
    const [notificationVisible, setNotificationVisible] = useState(false);
    const [showLeaveModal, setShowLeaveModal] = useState(false);
    const [accessControlState, setAccessControlState] = useState(() => buildWirelessAccessControlState(initialRouteNetwork));
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
    const [hasSwitchDevices, setHasSwitchDevices] = useState(null);
    const pageTopRef = useRef(null);
    const lastSelectedNetworkKeyRef = useRef('');
    const pendingNetworkKeyRef = useRef('');
    const specificClientsPollRef = useRef(null);
    const requestedNetworkKey = searchParams.get('networkKey') || '';
    const requestedNetworkId = searchParams.get('networkId') || '';

    const selectedSite = useMemo(
        () => sites.find((site) => String(site.siteId || site.id) === String(siteId)),
        [sites, siteId],
    );

    const selectedNetwork = useMemo(
        () => networks.find((network) => getNetworkKey(network) === selectedNetworkKey),
        [networks, selectedNetworkKey],
    );

    const activeSection = useMemo(() => {
        const routeKey = section || 'overview';
        return ROUTE_SECTION_MAP[routeKey] || 'overview';
    }, [section]);
    const wiredOptions = useMemo(
        () => networks.filter((network) => network.networkKind === 'wired'),
        [networks],
    );
    const selectedAccessPoints = useMemo(
        () => normalizeAccessPoints(form?.accessPoints),
        [form],
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
    const availableSpecificClients = useMemo(() => {
        const allowedClientKeys = new Set(
            normalizeAllowListClients(accessControlState?.allowedClients).map((client) => getAllowListClientKey(client))
        );

        return normalizeAllowListClients(accessControlState?.availableClients).filter((client) => {
            const clientKey = getAllowListClientKey(client);
            if (!clientKey || allowedClientKeys.has(clientKey)) {
                return false;
            }
            return true;
        });
    }, [accessControlState?.allowedClients, accessControlState?.availableClients]);
    const filteredAvailableClients = useMemo(() => {
        const searchTerm = specificClientsAppliedSearchTerm.trim().toLowerCase();
        if (!searchTerm) {
            return availableSpecificClients;
        }

        return availableSpecificClients.filter((client) => (
            [
                client.clientName,
                client.macAddress,
                client.ipAddress,
                client.clientType,
            ].some((value) => String(value || '').toLowerCase().includes(searchTerm))
        ));
    }, [availableSpecificClients, specificClientsAppliedSearchTerm]);
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
                setIsDirty(isWirelessAccessControlDirty(nextState, baselineNetwork));
            }
            return nextState;
        });
    };
    const syncNetworkAllowList = (allowList, networkName) => {
        if (!selectedNetwork) {
            return null;
        }

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
        setIsDirty(false);
    };
    const syncSelectionToQuery = (network) => {
        if (!location.pathname.startsWith(`/site/${siteId}/configuration`)) {
            return;
        }

        const nextSearchParams = new URLSearchParams(location.search);
        if (network) {
            nextSearchParams.set('networkKey', getNetworkKey(network));
            nextSearchParams.set('networkId', String(network.id));
        } else {
            nextSearchParams.delete('networkKey');
            nextSearchParams.delete('networkId');
        }
        setSearchParams(nextSearchParams, { replace: true });
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
        let isActive = true;

        const loadInventoryCapabilities = async () => {
            if (!siteId) {
                setHasSwitchDevices(null);
                return;
            }

            try {
                const response = await apiClient.get(`/overview/sites/${siteId}/inventory`);
                if (!isActive) return;

                const devices = Array.isArray(response.data) ? response.data : [];
                const hasSwitchLikeDevice = devices.some((device) => {
                    const deviceType = String(device?.deviceType || '').toLowerCase();
                    return deviceType === 'switch' || deviceType === 'stack';
                });
                setHasSwitchDevices(hasSwitchLikeDevice);
            } catch (inventoryError) {
                if (isActive) {
                    setHasSwitchDevices(null);
                }
            }
        };

        loadInventoryCapabilities();

        return () => {
            isActive = false;
        };
    }, [siteId]);

    useEffect(() => {
        if (!siteId) return;

        let isActive = true;

        const loadNetworks = async () => {
            try {
                if (!initialRouteNetwork) {
                    setLoading(true);
                }
                clearNotification();
                const response = await apiClient.get(`/config/sites/${siteId}/individual/networks`);
                if (!isActive) return;

                const combinedNetworks = Array.isArray(response.data?.networks) ? response.data.networks : [];
                const initialNetwork = findInitialNetwork(combinedNetworks, requestedNetworkKey, requestedNetworkId);
                setNetworks(combinedNetworks);
                setSelectedNetworkKey(initialNetwork ? getNetworkKey(initialNetwork) : '');
                setForm(
                    initialNetwork
                        ? (initialNetwork.networkKind === 'wired' ? buildWiredForm(initialNetwork) : buildWirelessForm(initialNetwork))
                        : null
                );
                if (initialNetwork?.networkKind === 'wireless') {
                    setAccessControlState(buildWirelessAccessControlState(initialNetwork));
                }
                resetSpecificClientsUi();
                syncSelectionToQuery(initialNetwork);
                setIsDirty(false);
                setShowPassword(false);
            } catch (loadError) {
                if (!isActive) return;

                console.error(loadError);
                showNotification('error', 'Failed to load the current site networks.');
                if (!initialRouteNetwork) {
                    setNetworks([]);
                    setSelectedNetworkKey('');
                    setForm(null);
                    syncSelectionToQuery(null);
                }
            } finally {
                if (isActive) {
                    setLoading(false);
                }
            }
        };

        loadNetworks();

        return () => {
            isActive = false;
        };
    }, [requestedNetworkId, requestedNetworkKey, siteId]);

    useEffect(() => {
        if (!selectedNetworkKey) {
            setForm(null);
            lastSelectedNetworkKeyRef.current = '';
            return;
        }
        if (selectedNetwork) {
            const didSelectionChange = lastSelectedNetworkKeyRef.current !== selectedNetworkKey;
            if (!didSelectionChange) {
                return;
            }
            setForm(selectedNetwork.networkKind === 'wired' ? buildWiredForm(selectedNetwork) : buildWirelessForm(selectedNetwork));
            if (selectedNetwork.networkKind === 'wireless') {
                setAccessControlState(buildWirelessAccessControlState(selectedNetwork));
            }
            resetSpecificClientsUi();
            setShowAddAllowedIpModal(false);
            setNewAllowedIpAddress('');
            setAllowedIpInputTouched(false);
            setIsDirty(false);
            setShowPassword(false);
            if (lastSelectedNetworkKeyRef.current && lastSelectedNetworkKeyRef.current !== selectedNetworkKey) {
                clearNotification();
            }
            lastSelectedNetworkKeyRef.current = selectedNetworkKey;
        }
    }, [selectedNetwork, selectedNetworkKey]);

    useEffect(() => {
        if (
            siteId
            && selectedNetwork?.networkKind === 'wired'
            && activeSection === 'network_assignment'
            && hasSwitchDevices === false
        ) {
            navigate(`/site/${siteId}/configuration/overview${location.search}`, { replace: true });
        }
    }, [activeSection, hasSwitchDevices, location.search, navigate, selectedNetwork, siteId]);

    useEffect(() => {
        clearNotification();
        resetSpecificClientsUi();
    }, [activeSection]);

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

    useEffect(() => {
        const isOnConfigurationPage = location.pathname.startsWith(`/site/${siteId}/configuration`);
        const nextDirtyState = Boolean(isDirty && isOnConfigurationPage);

        sessionStorage.setItem(CONFIG_DIRTY_STATE_KEY, nextDirtyState ? 'true' : 'false');
        window.dispatchEvent(new CustomEvent(CONFIG_DIRTY_EVENT, {
            detail: { isDirty: nextDirtyState },
        }));
    }, [isDirty, location.pathname, siteId]);

    useEffect(() => () => {
        sessionStorage.setItem(CONFIG_DIRTY_STATE_KEY, 'false');
        window.dispatchEvent(new CustomEvent(CONFIG_DIRTY_EVENT, {
            detail: { isDirty: false },
        }));
    }, []);

    useEffect(() => {
        const handleDiscardChanges = () => {
            resetUnsavedChanges();
        };

        window.addEventListener(CONFIG_DISCARD_EVENT, handleDiscardChanges);
        return () => window.removeEventListener(CONFIG_DISCARD_EVENT, handleDiscardChanges);
    }, [selectedNetwork]);

    useBeforeUnload((event) => {
        if (isDirty) {
            event.preventDefault();
            event.returnValue = '';
        }
    }, { capture: true });

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

    const handleSpecificNetworkMode = () => {
        setIsDirty(true);
        setForm((current) => ({
            ...current,
            ipAddressingMode: 'internal',
            networkAddress: current?.networkAddress || DEFAULT_INTERNAL_NETWORK_ADDRESS,
            subnetMask: current?.subnetMask || DEFAULT_INTERNAL_SUBNET_MASK,
        }));
    };

    const handleAccessPointBindingToggle = (accessPointId, checked) => {
        setIsDirty(true);
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
            setIsDirty(true);
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
            setIsDirty(false);
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
            setIsDirty(isAccessControl);
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
            <div className="space-y-6">
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
            </div>
        );
    };

    const renderWiredNetworkAssignment = () => {
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

    const renderWiredAccessControl = () => {
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

    const renderPlaceholder = () => (
        <div className="rounded-[2rem] border border-white/10 bg-slate-900/90 p-10 shadow-2xl">
            <h2 className="text-3xl font-black text-white">{SECTION_LABEL_MAP[activeSection] || 'Configuration'}</h2>
            <p className="mt-4 max-w-2xl text-sm text-slate-400">
                This section is reserved for the next implementation step. Use the left navigation to move between site configuration sections.
            </p>
        </div>
    );

    const renderAccessControlToggleRow = ({ label, checked, onChange, disabled = false, muted = false }) => (
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

    const renderWirelessAccessControl = () => {
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
                                    {renderAccessControlToggleRow({
                                        label: 'Network Destinations',
                                        checked: accessControlState.isNetworkDestinationsEnabled,
                                        onChange: (checked) => handleAccessRestrictionToggle('isNetworkDestinationsEnabled', checked),
                                    })}
                                    <div className="border-t border-white/10" />
                                    {renderAccessControlToggleRow({
                                        label: 'Specific Clients',
                                        checked: accessControlState.isSpecificClientsEnabled,
                                        onChange: (checked) => handleAccessRestrictionToggle('isSpecificClientsEnabled', checked),
                                    })}
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
                                            {renderAccessControlToggleRow({
                                                label: 'Internet',
                                                checked: true,
                                                onChange: () => {},
                                                disabled: true,
                                                muted: true,
                                            })}
                                            <div className="border-t border-white/10" />
                                            {renderAccessControlToggleRow({
                                                label: 'Specific IP Address',
                                                checked: accessControlState.isSpecificIpAddressEnabled,
                                                onChange: (checked) => handleAccessRestrictionToggle('isSpecificIpAddressEnabled', checked),
                                            })}
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
                                        onChange={handleSpecificNetworkMode}
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
                                        value={SUBNET_MASK_OPTIONS.includes(form.subnetMask) ? form.subnetMask : `${DEFAULT_INTERNAL_SUBNET_MASK} (/24)`}
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

    const applySelectedNetworkChange = (nextNetworkKey) => {
        const nextNetwork = networks.find((network) => getNetworkKey(network) === nextNetworkKey) || null;
        setSelectedNetworkKey(nextNetworkKey);
        syncSelectionToQuery(nextNetwork);
    };

    const handleSelectedNetworkChange = (nextNetworkKey) => {
        if (nextNetworkKey === selectedNetworkKey) {
            return;
        }

        if (isDirty) {
            pendingNetworkKeyRef.current = nextNetworkKey;
            setShowLeaveModal(true);
            return;
        }

        applySelectedNetworkChange(nextNetworkKey);
    };

    const handleStayOnPage = () => {
        pendingNetworkKeyRef.current = '';
        setShowLeaveModal(false);
    };

    const handleLeavePage = () => {
        const pendingNetworkKey = pendingNetworkKeyRef.current;

        pendingNetworkKeyRef.current = '';
        resetUnsavedChanges();
        setShowLeaveModal(false);

        if (pendingNetworkKey) {
            applySelectedNetworkChange(pendingNetworkKey);
            return;
        }
    };

    const handleAccessRestrictionToggle = (field, checked) => {
        if (field === 'isSpecificClientsEnabled' && !checked) {
            resetSpecificClientsUi();
        }

        updateAccessControlDraft((current) => {
            if (field === 'isNetworkDestinationsEnabled' && !checked) {
                return {
                    ...current,
                    isNetworkDestinationsEnabled: false,
                    isInternetAllowed: true,
                    isSpecificIpAddressEnabled: false,
                };
            }

            if (field === 'isSpecificIpAddressEnabled' && !checked) {
                return {
                    ...current,
                    isSpecificIpAddressEnabled: false,
                };
            }

            if (field === 'isSpecificClientsEnabled' && !checked) {
                return {
                    ...current,
                    isInternetAllowed: true,
                    isSpecificClientsEnabled: false,
                    isAllowListEnabled: false,
                    isExtendAllowListEnabled: false,
                };
            }

            return {
                ...current,
                isInternetAllowed: true,
                [field]: checked,
            };
        });
    };

    const handleOpenAddAllowedIpModal = () => {
        setShowAddAllowedIpModal(true);
        setNewAllowedIpAddress('');
        setAllowedIpInputTouched(false);
    };

    const handleCloseAddAllowedIpModal = () => {
        setShowAddAllowedIpModal(false);
        setNewAllowedIpAddress('');
        setAllowedIpInputTouched(false);
    };

    const handleAddAllowedIpAddress = () => {
        const candidate = newAllowedIpAddress.trim();
        setAllowedIpInputTouched(true);
        if (!isValidIpv4Address(candidate)) {
            return;
        }

        if (selectedNetwork?.networkKind === 'wired' && activeSection === 'access_control') {
            setIsDirty(true);
            setForm((current) => ({
                ...current,
                allowedDestinationIpAddresses: current.allowedDestinationIpAddresses.includes(candidate)
                    ? current.allowedDestinationIpAddresses
                    : [...current.allowedDestinationIpAddresses, candidate],
            }));
            handleCloseAddAllowedIpModal();
            return;
        }

        updateAccessControlDraft((current) => ({
            ...current,
            allowedDestinationIpAddresses: current.allowedDestinationIpAddresses.includes(candidate)
                ? current.allowedDestinationIpAddresses
                : [...current.allowedDestinationIpAddresses, candidate],
        }));
        handleCloseAddAllowedIpModal();
    };

    const handleRemoveAllowedIpAddress = (ipAddress) => {
        if (selectedNetwork?.networkKind === 'wired' && activeSection === 'access_control') {
            setIsDirty(true);
            setForm((current) => ({
                ...current,
                allowedDestinationIpAddresses: current.allowedDestinationIpAddresses.filter((existingIpAddress) => existingIpAddress !== ipAddress),
            }));
            return;
        }

        updateAccessControlDraft((current) => ({
            ...current,
            allowedDestinationIpAddresses: current.allowedDestinationIpAddresses.filter((existingIpAddress) => existingIpAddress !== ipAddress),
        }));
    };

    const handleRemoveAllowedClient = (clientToRemove) => {
        const clientKeyToRemove = getAllowListClientKey(clientToRemove);
        updateAccessControlDraft((current) => ({
            ...current,
            allowedClients: current.allowedClients.filter((client) => getAllowListClientKey(client) !== clientKeyToRemove),
        }));
    };

    const handleWiredTaskSelect = (taskPath) => {
        navigate(`/site/${siteId}/configuration/${taskPath}${location.search}`);
    };

    const renderWiredContent = () => {
        if (activeSection === 'network_assignment' && hasSwitchDevices === false) return renderWiredOverview();
        if (activeSection === 'network_assignment') return renderWiredNetworkAssignment();
        if (activeSection === 'access_control') return renderWiredAccessControl();
        return renderWiredOverview();
    };

    const renderWiredSectionLayout = () => (
        <div className="space-y-6">
            {renderWiredContent()}
            {isDirty && <ActionButtons onUpdate={handleSave} onCancel={handleCancel} saving={saving} disabled={isUpdateDisabled} />}
        </div>
    );

    return (
        <div className="min-h-screen bg-slate-950 p-6 md:p-8 text-slate-100">
            <div className="mx-auto max-w-7xl space-y-6">
                <div ref={pageTopRef} />
                <Dialog open={showLeaveModal} onOpenChange={(open) => { if (!open) handleStayOnPage(); }}>
                    <DialogContent className="sm:max-w-[520px] border-white/10 bg-slate-800 p-0 text-slate-100" showCloseButton={false}>
                        <DialogHeader className="px-8 pt-8">
                            <DialogTitle className="text-5xl font-black tracking-tight text-slate-100">Leave Page?</DialogTitle>
                            <DialogDescription className="pt-2 text-lg font-semibold text-slate-300">
                                All changes will be lost.
                            </DialogDescription>
                        </DialogHeader>
                        <DialogFooter className="mt-6 border-white/10 bg-slate-800/95 px-8 pb-8 pt-4 sm:justify-end">
                            <Button variant="ghost" size="lg" onClick={handleStayOnPage} className="text-base font-black text-slate-100 hover:bg-slate-700 hover:text-white">
                                Stay on Page
                            </Button>
                            <Button size="lg" onClick={handleLeavePage} className="bg-emerald-500 px-6 text-base font-black text-white hover:bg-emerald-400">
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

export default IndividualConfiguration;
