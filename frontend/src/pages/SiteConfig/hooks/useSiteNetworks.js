import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import apiClient from '../../../api/apiClient';
import { useSite } from '../../../context/SiteContext';
import {
    buildWirelessForm,
    buildWiredForm,
    buildFormForNetwork,
    buildWirelessAccessControlState,
    normalizeAccessPoints,
    normalizeInitialConfigurationNetwork,
    getNetworkKey,
    findInitialNetwork,
    isValidIpv4Address,
} from '../normalizers';
import { ROUTE_SECTION_MAP } from '../constants';

/**
 * Manages network loading, selection, form state, and derived values
 * for the SiteConfig orchestrator.
 */
const useSiteNetworks = ({ siteId, section }) => {
    const location = useLocation();
    const [searchParams, setSearchParams] = useSearchParams();
    const { sites, fetchSites } = useSite();

    const initialRouteNetworkRef = useRef(normalizeInitialConfigurationNetwork(location.state?.initialNetwork));
    const initialRouteNetwork = initialRouteNetworkRef.current;
    const lastSelectedNetworkKeyRef = useRef('');
    const requestedNetworkKey = searchParams.get('networkKey') || '';
    const requestedNetworkId = searchParams.get('networkId') || '';

    // ── Core state ──
    const [networks, setNetworks] = useState(() => (initialRouteNetwork ? [initialRouteNetwork] : []));
    const [selectedNetworkKey, setSelectedNetworkKey] = useState(() => (initialRouteNetwork ? getNetworkKey(initialRouteNetwork) : ''));
    const [form, setForm] = useState(() => (
        initialRouteNetwork ? buildFormForNetwork(initialRouteNetwork) : null
    ));
    const [loading, setLoading] = useState(() => !initialRouteNetwork);
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [accessControlState, setAccessControlState] = useState(() => buildWirelessAccessControlState(initialRouteNetwork));
    const [hasSwitchDevices, setHasSwitchDevices] = useState(null);

    // ── Derived ──
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
        return { primary, secondary, hasError: Boolean(primary || secondary) };
    }, [activeSection, form]);

    const isUpdateDisabled = useMemo(() => {
        if (!form) return true;
        if (saving) return true;
        if (activeSection === 'ip_assignment' && selectedNetwork?.networkKind === 'wireless') {
            if (form.ipAddressingMode !== 'internal' && !form.wiredNetworkId) return true;
            if (form.ipAddressingMode === 'internal' && dnsValidation.hasError) return true;
        }
        return false;
    }, [activeSection, dnsValidation.hasError, form, saving, selectedNetwork]);

    // ── URL sync ──
    const syncSelectionToQuery = useCallback((network) => {
        if (!location.pathname.startsWith(`/site/${siteId}/configuration`)) return;
        const nextSearchParams = new URLSearchParams(location.search);
        if (network) {
            nextSearchParams.set('networkKey', getNetworkKey(network));
            nextSearchParams.set('networkId', String(network.id));
        } else {
            nextSearchParams.delete('networkKey');
            nextSearchParams.delete('networkId');
        }
        setSearchParams(nextSearchParams, { replace: true });
    }, [location.pathname, location.search, setSearchParams, siteId]);

    // ── Effects ──
    useEffect(() => {
        if (sites.length === 0) fetchSites();
    }, [fetchSites, sites.length]);

    // Load inventory capabilities (switch detection)
    useEffect(() => {
        let isActive = true;
        const loadInventoryCapabilities = async () => {
            if (!siteId) { setHasSwitchDevices(null); return; }
            try {
                const response = await apiClient.get(`/overview/sites/${siteId}/inventory`);
                if (!isActive) return;
                const devices = Array.isArray(response.data) ? response.data : [];
                const hasSwitchLikeDevice = devices.some((device) => {
                    const deviceType = String(device?.deviceType || '').toLowerCase();
                    return deviceType === 'switch' || deviceType === 'stack';
                });
                setHasSwitchDevices(hasSwitchLikeDevice);
            } catch {
                if (isActive) setHasSwitchDevices(null);
            }
        };
        loadInventoryCapabilities();
        return () => { isActive = false; };
    }, [siteId]);

    // Load networks
    useEffect(() => {
        if (!siteId) return;
        let isActive = true;
        const loadNetworks = async () => {
            try {
                if (!initialRouteNetwork) setLoading(true);
                const response = await apiClient.get(`/config/sites/${siteId}/individual/networks`);
                if (!isActive) return;
                const combinedNetworks = Array.isArray(response.data?.networks) ? response.data.networks : [];
                const initialNetwork = findInitialNetwork(combinedNetworks, requestedNetworkKey, requestedNetworkId);
                setNetworks(combinedNetworks);
                setSelectedNetworkKey(initialNetwork ? getNetworkKey(initialNetwork) : '');
                setForm(initialNetwork ? buildFormForNetwork(initialNetwork) : null);
                if (initialNetwork?.networkKind === 'wireless') {
                    setAccessControlState(buildWirelessAccessControlState(initialNetwork));
                }
                syncSelectionToQuery(initialNetwork);
                setShowPassword(false);
            } catch (loadError) {
                if (!isActive) return;
                console.error(loadError);
                if (!initialRouteNetwork) {
                    setNetworks([]);
                    setSelectedNetworkKey('');
                    setForm(null);
                    syncSelectionToQuery(null);
                }
            } finally {
                if (isActive) setLoading(false);
            }
        };
        loadNetworks();
        return () => { isActive = false; };
    }, [requestedNetworkId, requestedNetworkKey, siteId]);

    // Sync form when network selection changes
    useEffect(() => {
        if (!selectedNetworkKey) {
            setForm(null);
            lastSelectedNetworkKeyRef.current = '';
            return;
        }
        if (selectedNetwork) {
            const didSelectionChange = lastSelectedNetworkKeyRef.current !== selectedNetworkKey;
            if (!didSelectionChange) return;
            setForm(buildFormForNetwork(selectedNetwork));
            if (selectedNetwork.networkKind === 'wireless') {
                setAccessControlState(buildWirelessAccessControlState(selectedNetwork));
            }
            setShowPassword(false);
            if (lastSelectedNetworkKeyRef.current && lastSelectedNetworkKeyRef.current !== selectedNetworkKey) {
                // Selection changed — clear will happen in the orchestrator
            }
            lastSelectedNetworkKeyRef.current = selectedNetworkKey;
        }
    }, [selectedNetwork, selectedNetworkKey]);

    return {
        // State
        networks, setNetworks,
        selectedNetworkKey, setSelectedNetworkKey,
        form, setForm,
        loading,
        saving, setSaving,
        deleting, setDeleting,
        showPassword, setShowPassword,
        accessControlState, setAccessControlState,
        hasSwitchDevices,
        // Derived
        selectedSite,
        selectedNetwork,
        activeSection,
        wiredOptions,
        selectedAccessPoints,
        dnsValidation,
        isUpdateDisabled,
        initialRouteNetwork,
        // Functions
        syncSelectionToQuery,
    };
};

export default useSiteNetworks;
