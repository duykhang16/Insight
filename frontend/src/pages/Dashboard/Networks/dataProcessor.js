/**
 * Flatten the wiredNetworks API response into a single unified array.
 *
 * Each row is either:
 *   - type: 'wired'    — from elements[] (parent)
 *   - type: 'wireless' — from elements[].wirelessNetworks[] (children)
 *
 * Band is built from boolean flags, never from a raw "all" string.
 * 24h usage is calculated from applicationCategoryUsage for wireless only.
 */

// --- Helpers (exported so NetworkTable can reuse) ---

export const formatBytes = (bytes) => {
    if (bytes == null || bytes === 0) return '—';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
};

export const calculateUsage = (appUsageArray) => {
    if (!Array.isArray(appUsageArray) || appUsageArray.length === 0) return null;
    return appUsageArray.reduce(
        (sum, entry) =>
            sum +
            (entry.downstreamDataTransferredInBytes || 0) +
            (entry.upstreamDataTransferredInBytes || 0),
        0
    );
};

export const buildBandLabel = (net) => {
    const bands = [];
    if (net.isAvailableOn24GHzRadioBand) bands.push('2.4 GHz');
    if (net.isAvailableOn5GHzRadioBand)  bands.push('5 GHz');
    if (net.isAvailableOn6GHzRadioBand)  bands.push('6 GHz');
    return bands.length > 0 ? bands.join(', ') : '—';
};

// Resolve real-time active state:
// 1. If networkActivationEffectivePolicy exists → use its isActive
// 2. Fallback to isEnabled
const resolveActive = (obj) => {
    const policy = obj?.networkActivationEffectivePolicy;
    if (policy != null) return policy.isActive === true;
    return obj?.isEnabled === true;
};

// --- Main processor ---

export const processNetworks = (rawData) => {
    const elements = rawData?.elements || [];
    const rows = [];

    elements.forEach(wired => {
        const ssids = wired.wirelessNetworks || [];

        // Wired row — keep ssids[] for NetworkRow SSID chips
        rows.push({
            id:        wired.id,
            rowType:   'wired',
            name:      wired.wiredNetworkName || `VLAN ${wired.vlanId}`,
            isEnabled: resolveActive(wired),
            health:    wired.health || null,
            usage:     wired.type || 'employee',
            vlanId:    wired.vlanId ?? '—',
            band:      '—',
            usage24h:  null,
            clients:   (wired.wiredClientsCount ?? 0) + ssids.reduce((s, ssid) => s + (ssid.wirelessClientsCount ?? 0), 0),
            ssids:     ssids.map(ssid => ({
                id:        ssid.id,
                name:      ssid.networkName || ssid.name,
                isEnabled: resolveActive(ssid),
                clients:   ssid.wirelessClientsCount ?? 0,
                band:      buildBandLabel(ssid),
                security:  ssid.security || null,
            })),
        });

        // Wireless rows (SSIDs)
        ssids.forEach(ssid => {
            rows.push({
                id:        ssid.id,
                rowType:   'wireless',
                name:      ssid.networkName || ssid.name || '—',
                isEnabled: resolveActive(ssid),
                health:    ssid.health || null,
                usage:     ssid.type || wired.type || 'employee',
                vlanId:    ssid.vlanId ?? wired.vlanId ?? '—',
                band:      buildBandLabel(ssid),
                security:  ssid.security || null,
                usage24h:  calculateUsage(ssid.applicationCategoryUsage),
                clients:   ssid.wirelessClientsCount ?? 0,
            });
        });
    });

    return rows;
};

// Legacy export — still used by existing wired-only flow
export const processWiredNetworks = (wiredData) => {
    const elements = wiredData?.elements || [];

    return elements.map(wired => {
        const ssids = wired.wirelessNetworks || [];

        const wirelessClientTotal = ssids.reduce(
            (sum, ssid) => sum + (ssid.wirelessClientsCount ?? 0),
            0
        );

        const totalClients = (wired.wiredClientsCount ?? 0) + wirelessClientTotal;

        return {
            id:           wired.id,
            name:         wired.wiredNetworkName || `VLAN ${wired.vlanId}`,
            vlanId:       wired.vlanId ?? '—',
            type:         wired.type || 'employee',
            isEnabled:    wired.isEnabled === true,
            health:       wired.health || 'unknown',
            wiredClients: wired.wiredClientsCount ?? 0,
            totalClients,
            ssids:        ssids.map(ssid => ({
                id:        ssid.id,
                name:      ssid.networkName,
                isEnabled: ssid.isEnabled === true,
                clients:   ssid.wirelessClientsCount ?? 0,
                band:      buildBandLabel(ssid),
                security:  ssid.security || null,
            })),
        };
    });
};
