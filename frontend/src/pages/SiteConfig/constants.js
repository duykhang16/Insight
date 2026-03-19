export const CONFIG_DIRTY_STATE_KEY = 'individualConfigurationDirty';
export const CONFIG_DIRTY_EVENT = 'individualConfigurationDirtyChange';
export const CONFIG_DISCARD_EVENT = 'individualConfigurationDiscardChanges';

export const ROUTE_SECTION_MAP = {
    overview: 'overview',
    'ip-assignment': 'ip_assignment',
    'network-assignment': 'network_assignment',
    'access-control': 'access_control',
    schedule: 'schedule',
    'wireless-options': 'wireless_options',
};

export const SECTION_LABEL_MAP = {
    overview: 'Overview',
    ip_assignment: 'IP Assignment',
    network_assignment: 'Network Assignment',
    access_control: 'Access Control',
    schedule: 'Schedule',
    wireless_options: 'Wireless Options',
};

export const WIRED_CONFIGURATION_TASKS = [
    { key: 'overview', path: 'overview', label: 'Overview' },
    { key: 'network_assignment', path: 'network-assignment', label: 'Network Assignment' },
    { key: 'access_control', path: 'access-control', label: 'Access Control' },
];

export const WIRED_CONFIGURATION_SECTIONS = new Set(
    WIRED_CONFIGURATION_TASKS.map((task) => task.key),
);

export const SECURITY_OPTIONS = [
    { id: 'wpa2_personal', label: 'WPA2 Personal', authentication: 'psk', security: 'wpa2', supported: true },
    { id: 'wpa23_personal', label: 'WPA2 + WPA3 Personal', authentication: 'psk', security: 'wpa3', supported: true },
    { id: 'wpa2_enterprise', label: 'WPA2 Enterprise', authentication: 'eap', security: 'wpa2', supported: false },
    { id: 'wpa23_enterprise', label: 'WPA2 + WPA3 Enterprise', authentication: 'eap', security: 'wpa3', supported: false },
];

export const SUBNET_MASK_OPTIONS = [
    '255.255.255.0 (/24)',
    '255.255.0.0 (/16)',
    '255.0.0.0 (/8)',
];

export const DEFAULT_INTERNAL_NETWORK_ADDRESS = '172.16.0.0';
export const DEFAULT_INTERNAL_SUBNET_MASK = '255.255.255.0';
