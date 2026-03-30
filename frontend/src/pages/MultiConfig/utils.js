/**
 * Shared utility used across MultiConfig modules (SmartSync, CloneConfig, Delete, etc).
 * Returns role-based badge info and whether the user has admin/clone rights.
 */
export const getRoleBadgeInfo = (roleStr) => {
    const role = (roleStr || 'UNKNOWN').toLowerCase();
    switch (role) {
        case 'administrator':
        case 'admin':
            return { text: 'ADMIN', classes: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-700/50', canClone: true };
        case 'operator':
        case 'op':
            return { text: 'OPERATOR', classes: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-700/50', canClone: false };
        case 'viewer':
        case 'view':
            return { text: 'VIEWER', classes: 'bg-slate-200 dark:bg-slate-700/40 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-600/50', canClone: false };
        case 'guest':
            return { text: 'GUEST', classes: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-700/50', canClone: false };
        default:
            return { text: role.toUpperCase(), classes: 'bg-slate-100 dark:bg-slate-800/40 text-slate-500 dark:text-slate-500 border-slate-200 dark:border-slate-700/50', canClone: false };
    }
};

/**
 * Generate a random password with configurable length.
 */
export const generateRandomPassword = (length = 12) => {
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+";
    let result = '';
    for (let i = 0; i < length; i++) {
        result += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    return result;
};

/**
 * Load sites from overview API.
 */
export const loadSitesFromApi = async (apiClient) => {
    const res = await apiClient.get('/overview/sites');
    const list = Array.isArray(res.data) ? res.data : (res.data?.sites || []);
    return list.sort((a, b) => a.siteName.localeCompare(b.siteName));
};

/**
 * Load zones from zone API (brand_admin gets all, others get own).
 */
export const loadZonesFromApi = async (apiClient) => {
    const res = await apiClient.get('/zones/my');
    return res.data || [];
};

/**
 * Load sites filtered to admin-only, with normalized IDs.
 * Used by Delete, AccountAccess + any module that needs admin-restricted site lists.
 */
export const loadAdminSitesFromApi = async (apiClient) => {
    const res = await apiClient.get('/overview/sites');
    const rawList = Array.isArray(res.data?.sites) ? res.data.sites : [];
    const list = rawList.map(s => ({ ...s, id: s.id || s.siteId || s.site_id }));
    return list
        .filter(s => {
            const r = (s.role || '').toLowerCase();
            const rawR = (s.aruba_role_raw || '').toLowerCase();
            return (r.startsWith('admin') || rawR.startsWith('admin')) && s.id;
        })
        .sort((a, b) => (a.siteName || '').localeCompare(b.siteName || ''));
};
