/**
 * Format action label from log data.
 * Uses defaultAction from middleware when available, otherwise resolves from endpoint.
 */
export const formatAction = (method, endpoint, defaultAction, payloadStr) => {
    // If middleware already provided a good action label, use it directly
    if (defaultAction && defaultAction !== 'API_CALL' && defaultAction !== '—') {
        return defaultAction;
    }

    if (!endpoint) return defaultAction || 'Unknown Action';

    const lowerEndpoint = endpoint.toLowerCase();

    let payload = {};
    if (payloadStr) {
        try { payload = typeof payloadStr === 'string' ? JSON.parse(payloadStr) : payloadStr; } catch (e) { }
    }

    // Auth
    if (lowerEndpoint.includes('/auth/login')) return 'Login';
    if (lowerEndpoint.includes('/auth/logout')) return 'Logout';
    if (lowerEndpoint.includes('/auth/refresh')) return 'Token Refresh';
    if (lowerEndpoint.includes('/auth/session')) return 'Session Check';
    if (lowerEndpoint.includes('/auth/set-password')) return 'Set Password';

    // Super Admin - Permissions
    if (lowerEndpoint.includes('/super/permissions') && method === 'PUT') return 'Update Role Permissions';
    if (lowerEndpoint.includes('/super/permissions') && method === 'GET') return 'View Role Permissions';

    // Super Admin - Tenants
    if (lowerEndpoint.includes('/super/tenants') && lowerEndpoint.includes('assign-admin')) return 'Assign Tenant Admin';
    if (lowerEndpoint.includes('/super/tenants') && method === 'POST') return 'Create Tenant';
    if (lowerEndpoint.includes('/super/tenants') && method === 'PUT') return 'Update Tenant';
    if (lowerEndpoint.includes('/super/tenants') && method === 'DELETE') return 'Delete Tenant';

    // Super/Admin - Users
    if (lowerEndpoint.includes('reset-password')) return 'Reset Password';
    if (lowerEndpoint.includes('/users') && method === 'POST') return 'Create User';
    if (lowerEndpoint.includes('/users') && method === 'PUT') return 'Update User';
    if (lowerEndpoint.includes('/users') && method === 'DELETE') return 'Delete User';

    // Master Account
    if (lowerEndpoint.includes('/master/link')) return 'Link Master Account';
    if (lowerEndpoint.includes('/master/unlink')) return 'Unlink Master Account';
    if (lowerEndpoint.includes('/master/refresh')) return 'Refresh Master Token';

    // Zones
    if (lowerEndpoint.includes('/zones') && lowerEndpoint.includes('/members') && method === 'POST') return 'Add Zone Member';
    if (lowerEndpoint.includes('/zones') && lowerEndpoint.includes('/members') && method === 'DELETE') return 'Remove Zone Member';
    if (lowerEndpoint.includes('/zones') && lowerEndpoint.includes('/members') && method === 'PUT') return 'Update Zone Member';
    if (lowerEndpoint.includes('/zones') && lowerEndpoint.includes('/sites') && method === 'PUT') return 'Update Zone Sites';
    if (lowerEndpoint.includes('/zones') && method === 'POST') return 'Create Zone';
    if (lowerEndpoint.includes('/zones') && method === 'PUT') return 'Update Zone';
    if (lowerEndpoint.includes('/zones') && method === 'DELETE') return 'Delete Zone';

    // Cloner / Provisioning
    if (lowerEndpoint.includes('/cloner') || lowerEndpoint.includes('/provision')) {
        if (lowerEndpoint.includes('batch-site-provision')) return 'Batch Site Provision';
        if (lowerEndpoint.includes('batch-site-delete')) return 'Batch Site Delete';
        if (lowerEndpoint.includes('batch-account-access')) return 'Batch Account Access';
        if (lowerEndpoint.includes('sync-password')) return 'Sync Password';
        if (lowerEndpoint.includes('sync-config')) return 'Sync Config';
        if (lowerEndpoint.includes('sync-delete')) return 'Delete SSID';
        if (lowerEndpoint.includes('sync-create')) return 'Create SSID';
        if (lowerEndpoint.includes('apply')) return 'Clone Config';
        if (method === 'POST') return 'Clone/Provision';
    }

    // Fallback map
    const fallbackMap = {
        GET: 'View Data',
        POST: 'Create',
        PUT: 'Update',
        PATCH: 'Update',
        DELETE: 'Delete',
    };

    return fallbackMap[method] || 'System Interaction';
};

/**
 * Extract a human-readable "target" description from a log entry.
 * Shows what was affected: site name, zone, user, SSID, etc.
 * @param {object} log - The log entry
 * @param {object} siteMap - Map of siteId → siteName (optional)
 */
export const formatTarget = (log, siteMap = {}) => {
    const parts = [];
    const payload = log.payload || {};
    const endpoint = (log.endpoint || '').toLowerCase();

    // Helper: resolve site ID to name
    const resolveSite = (id) => siteMap[id] || id;

    // Collect all site IDs mentioned to avoid duplicates
    const targetSiteIds = (payload.target_site_ids && Array.isArray(payload.target_site_ids))
        ? payload.target_site_ids
        : [];

    // If both site_id and target_site_ids exist, only show target_site_ids (superset)
    if (targetSiteIds.length > 0) {
        const names = targetSiteIds.map(id => resolveSite(id)).filter(Boolean);
        if (names.length <= 3) {
            parts.push(names.join(', '));
        } else {
            parts.push(`${names.slice(0, 2).join(', ')} +${names.length - 2}`);
        }
    } else if (log.site_id) {
        parts.push(resolveSite(log.site_id));
    }

    // Zone: prefer name from payload, fallback to zone_id
    if (payload.name && endpoint.includes('/zones')) {
        parts.push(`Zone: ${payload.name}`);
    } else if (log.zone_id) {
        parts.push(`Zone: ${log.zone_id.substring(0, 8)}…`);
    }

    // Target email (for user management or batch account access)
    if (payload.email) {
        parts.push(payload.email);
    }

    // SSID name
    const ssidName = payload.source_network_name || payload.network_name;
    if (ssidName) {
        parts.push(`SSID: ${ssidName}`);
    }

    // Detail field (batch ops store extra info here)
    if (log.detail) {
        parts.push(log.detail);
    }

    // Master account
    if (payload.username && endpoint.includes('/master')) {
        parts.push(payload.username);
    }

    // Role changes
    if (payload.role && endpoint.includes('/users')) {
        parts.push(`→ ${payload.role}`);
    }

    return parts.length > 0 ? parts.join(' · ') : null;
};
