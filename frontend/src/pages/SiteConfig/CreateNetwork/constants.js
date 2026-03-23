/**
 * Create Network Wizard — Constants
 * Matches HPE Instant On Create Network 3-step wizard exactly.
 */

// ── Security options by usage (matches HPE portal) ──

export const EMPLOYEE_SECURITY_OPTIONS = [
    { value: 'wpa2', label: 'WPA2 Personal' },
    { value: 'wpa2_wpa3', label: 'WPA2 + WPA3 Personal' },
    { value: 'wpa2_enterprise', label: 'WPA2 Enterprise', disabled: true, hint: 'Configure after creation' },
    { value: 'wpa2_wpa3_enterprise', label: 'WPA2 + WPA3 Enterprise', disabled: true, hint: 'Configure after creation' },
];

export const GUEST_SECURITY_OPTIONS = [
    { value: 'none', label: 'None' },
    { value: 'wifi_enhanced_open', label: 'Wi-Fi Enhanced Open' },
    { value: 'wpa2', label: 'WPA2 Personal' },
    { value: 'wpa2_wpa3', label: 'WPA2 + WPA3 Personal' },
];

// ── Security classification ──

export const SECURITY_NEEDS_PSK = new Set(['wpa2', 'wpa2_wpa3']);
export const SECURITY_IS_OPEN = new Set(['none', 'wifi_enhanced_open']);

// ── Security → API payload mapping ──

export const SECURITY_API_MAP = {
    wpa2:                  { authentication: 'psk',  security: 'wpa2' },
    wpa2_wpa3:             { authentication: 'psk',  security: 'wpa3' },
    wpa2_enterprise:       { authentication: 'eap',  security: 'wpa2' },
    wpa2_wpa3_enterprise:  { authentication: 'eap',  security: 'wpa3' },
    none:                  { authentication: 'open', security: 'open' },
    wifi_enhanced_open:    { authentication: 'open', security: 'owe' },
};

// ── Defaults per usage ──

export const DEFAULT_SECURITY_BY_USAGE = {
    employee: 'wpa2_wpa3',
    guest: 'wifi_enhanced_open',
};

// ── Subnet mask options (matches HPE portal dropdown) ──

export const SUBNET_MASK_OPTIONS = [
    { value: '255.255.248.0',   label: '255.255.248.0 (/21)' },
    { value: '255.255.252.0',   label: '255.255.252.0 (/22)' },
    { value: '255.255.254.0',   label: '255.255.254.0 (/23)' },
    { value: '255.255.255.0',   label: '255.255.255.0 (/24)' },
    { value: '255.255.255.128', label: '255.255.255.128 (/25)' },
];

// ── Default form values ──

export const DEFAULT_WIRELESS_FORM = {
    networkKind: 'wireless',
    networkName: '',
    usage: 'employee',
    securityOption: 'wpa2_wpa3',
    preSharedKey: '',
    isSsidHidden: false,
    isGuestPortalEnabled: false,
    ipAssignment: 'local',
    vlanId: '',
    networkAddress: '',
    subnetMask: '255.255.255.0',
};

export const DEFAULT_WIRED_FORM = {
    networkKind: 'wired',
    networkName: '',
    usage: 'employee',
    vlanId: '',
    isIgmpSnoopingEnabled: true,
    isDhcpArpProtectionEnabled: false,
};

// ── Wizard step definitions ──

export const WIRELESS_STEPS = [
    { key: 'name',          label: 'Identification', number: 1 },
    { key: 'properties',    label: 'Properties',     number: 2 },
    { key: 'ip_assignment', label: 'IP Assignment',  number: 3 },
];

export const WIRED_STEPS = [
    { key: 'name',             label: 'Identification', number: 1 },
    { key: 'wired_properties', label: 'Properties',     number: 2 },
    { key: 'wired_review',     label: 'Review',         number: 3 },
];

// ── IP helper ──

export function calculateDhcpRange(networkAddress, subnetMask) {
    if (!networkAddress || !subnetMask) return null;
    const ip = networkAddress.split('.').map(Number);
    const mask = subnetMask.split('.').map(Number);
    if (ip.length !== 4 || mask.length !== 4) return null;
    if (ip.some((p) => isNaN(p) || p < 0 || p > 255)) return null;

    const network = ip.map((p, i) => p & mask[i]);
    const broadcast = network.map((p, i) => p | (~mask[i] & 0xff));
    const start = [...network];
    start[3] += 1;
    const end = [...broadcast];
    end[3] -= 1;

    let total = 1;
    for (let i = 0; i < 4; i++) total *= (broadcast[i] - network[i] + 1);
    const available = Math.max(total - 2, 0);

    return { startIp: start.join('.'), endIp: end.join('.'), available };
}
