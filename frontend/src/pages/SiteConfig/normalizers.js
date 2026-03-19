/**
 * SiteConfig normalizers — pure functions for transforming network API data into UI state.
 * Reusable across SiteConfig sections and potentially other modules.
 */
import { SECURITY_OPTIONS } from './constants';

export const resolveSecurityOption = (network) =>
    SECURITY_OPTIONS.find(
        (option) => option.authentication === (network?.authentication || 'psk') && option.security === String(network?.security || 'wpa2').toLowerCase()
    )?.id || 'wpa23_personal';

export const normalizeAccessPoints = (accessPoints) => (
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

                    if (!id && !name) return null;

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

                if (accessPoint == null || accessPoint === '') return null;

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

export const formatAccessPointBands = (accessPoint) => {
    const bands = Array.isArray(accessPoint?.enabledRadioBands) ? accessPoint.enabledRadioBands : [];
    if (bands.length > 0) {
        const labelMap = {
            '2.4ghz': '2.4 GHz',
            '5ghz': '5 GHz',
            '6ghz': '6 GHz',
        };
        return bands.map((band) => labelMap[String(band).toLowerCase()] || String(band)).join(', ');
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

export const buildWirelessForm = (network) => ({
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

export const buildWiredForm = (network) => ({
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
                if (typeof destination === 'string') return destination;
                if (destination && typeof destination === 'object') {
                    return String(destination.address || destination.ipAddress || destination.value || '').trim();
                }
                return '';
            })
            .filter(Boolean)
        : [],
});

export const buildFormForNetwork = (network) => (
    network?.networkKind === 'wired' ? buildWiredForm(network) : buildWirelessForm(network)
);

export const getAllowListClientKey = (client) =>
    String(client?.macAddress || client?.clientId || '').trim().toLowerCase();

export const normalizeAllowListClient = (client) => {
    if (!client || typeof client !== 'object') return null;

    const macAddress = String(client.macAddress || '').trim();
    const clientId = String(client.clientId || macAddress).trim();
    const clientName = String(client.clientName || macAddress || clientId).trim();
    if (!macAddress || !clientId) return null;

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

export const normalizeAllowListClients = (clients) => (
    Array.isArray(clients)
        ? clients.map((client) => normalizeAllowListClient(client)).filter(Boolean)
        : []
);

export const buildWirelessAllowListState = (network) => {
    const allowList = network?.allowList && typeof network.allowList === 'object' ? network.allowList : {};
    const allowedClients = normalizeAllowListClients(allowList.allowedClients);
    const availableClients = normalizeAllowListClients(allowList.availableClients);
    const isAllowListEnabled = Boolean(
        allowList.isAllowListEnabled || allowList.isExtendAllowListEnabled
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

export const buildWirelessAccessControlState = (network) => {
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
                    if (typeof destination === 'string') return destination;
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

export const mergeAllowListIntoAccessControlState = (currentState, allowList) => ({
    ...currentState,
    ...buildWirelessAllowListState({ allowList }),
});

export const mergeSpecificClientSelectionIntoAccessControlState = (currentState, selectedClients, allowList = {}) => {
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

export const buildNetworkWithAllowList = (network, allowList, networkName) => {
    if (!network) return network;

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

export const buildAccessControlSignature = (state) => JSON.stringify({
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

export const isWirelessAccessControlDirty = (state, network) => (
    buildAccessControlSignature(state) !== buildAccessControlSignature(buildWirelessAccessControlState(network))
);

export const isValidIpv4Address = (value) => {
    if (!value) return false;
    const parts = value.trim().split('.');
    if (parts.length !== 4) return false;
    return parts.every((part) => {
        if (!/^\d+$/.test(part)) return false;
        const number = Number(part);
        return number >= 0 && number <= 255;
    });
};

export const getNetworkKey = (network) => {
    const networkKind = String(network?.networkKind || '');
    const networkId = String(network?.id || '');
    return networkKind && networkId ? `${networkKind}:${networkId}` : networkId;
};

export const findInitialNetwork = (networks, requestedNetworkKey, requestedNetworkId) => (
    networks.find((network) => getNetworkKey(network) === requestedNetworkKey) ||
    networks.find((network) => String(network.id) === String(requestedNetworkId)) ||
    networks[0] ||
    null
);

export const normalizeInitialConfigurationNetwork = (network) => {
    if (!network || !network.networkKind || !network.id) return null;

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
