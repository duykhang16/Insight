export const formatAction = (method, endpoint, defaultAction, payloadStr) => {
    if (!endpoint) {
        return (defaultAction && defaultAction !== 'API_CALL' && defaultAction !== '—') ? defaultAction : 'Unknown Action';
    }

    const lowerEndpoint = endpoint.toLowerCase();

    let payload = {};
    if (payloadStr) {
        try { payload = typeof payloadStr === 'string' ? JSON.parse(payloadStr) : payloadStr; } catch (e) { }
    }

    const getIdFromUrl = (url, prefix) => {
        const match = url.match(new RegExp(`${prefix}/([^/]+)`));
        return match ? match[1] : '';
    };

    // Auth
    if (lowerEndpoint.includes('/auth/login')) return 'Đăng nhập';
    if (lowerEndpoint.includes('/auth/logout')) return 'Đăng xuất';
    if (lowerEndpoint.includes('/auth/refresh')) return 'Làm mới phiên bản (Refresh Token)';
    if (lowerEndpoint.includes('/auth/session')) return 'Kiểm tra phiên (Session Check)';
    if (lowerEndpoint.includes('/auth/set-password')) return 'Đặt mật khẩu lần đầu';

    // Super Admin - Permissions
    if (lowerEndpoint.includes('/super/permissions') && method === 'PUT') {
        const role = getIdFromUrl(lowerEndpoint, 'permissions');
        return `Cập nhật cấu hình quyền ${role || 'Role'}`;
    }
    if (lowerEndpoint.includes('/super/permissions') && method === 'GET') return 'Xem cấu hình quyền Role';

    // Super Admin - Tenants
    if (lowerEndpoint.includes('/super/tenants') && method === 'POST') return `Tạo Tenant mới ${payload?.name ? `(${payload.name})` : ''}`;
    if (lowerEndpoint.includes('/super/tenants') && method === 'PUT') return `Cập nhật Tenant ${payload?.name ? `(${payload.name})` : ''}`;
    if (lowerEndpoint.includes('/super/tenants') && method === 'DELETE') return 'Xóa Tenant';
    if (lowerEndpoint.includes('/super/tenants') && lowerEndpoint.includes('assign-admin')) return `Gán Admin ${payload?.admin_email ? `(${payload.admin_email})` : ''} cho Tenant`;
    if (lowerEndpoint.includes('/super/tenants') && method === 'GET') return 'Xem danh sách Tenant';

    // Super/Admin - Users
    if (lowerEndpoint.includes('reset-password')) return 'Reset mật khẩu User';
    if (lowerEndpoint.includes('/users') && method === 'POST') return `Tạo User mới ${payload?.email ? `(${payload.email})` : ''}`;
    if (lowerEndpoint.includes('/users') && method === 'PUT') {
        if (payload?.isApproved !== undefined) return payload.isApproved ? 'Duyệt (Approve) User' : 'Bỏ duyệt User';
        return `Cập nhật thông tin User`;
    }
    if (lowerEndpoint.includes('/users') && method === 'DELETE') return 'Xóa User';
    if (lowerEndpoint.includes('/users') && method === 'GET') return 'Xem danh sách User';

    // Master Account
    if (lowerEndpoint.includes('/master') && method === 'POST') return `Thêm Master Account ${payload?.email ? `(${payload.email})` : ''}`;
    if (lowerEndpoint.includes('/master') && method === 'PUT') return 'Cập nhật Master Account';
    if (lowerEndpoint.includes('/master') && method === 'DELETE') return 'Xóa Master Account';

    // Zones
    if (lowerEndpoint.includes('/zones') && method === 'POST') return `Tạo Zone mới ${payload?.name ? `(${payload.name})` : ''}`;
    if (lowerEndpoint.includes('/zones') && method === 'PUT') return `Đổi tên/Cập nhật Zone ${payload?.name ? `thành (${payload.name})` : ''}`;
    if (lowerEndpoint.includes('/zones') && method === 'DELETE') return 'Xóa Zone';
    if (lowerEndpoint.includes('/zones') && method === 'GET') return 'Xem danh sách / chi tiết Zone';

    // Cloner / Provisioning
    if (lowerEndpoint.includes('/cloner') || lowerEndpoint.includes('/provision')) {
        if (lowerEndpoint.includes('batch')) return 'Thực thi Batch Provision';
        if (lowerEndpoint.includes('sync')) return 'Thực thi Smart Sync';
        if (method === 'POST') return 'Thực thi Clone/Provision';
    }

    // Sites
    if (lowerEndpoint.includes('/sites')) {
        if (method === 'DELETE') return 'Xóa Site';
        if (method === 'POST') return 'Tạo Site';
        if (method === 'PUT') return 'Cập nhật Site';
        if (method === 'GET') return 'Xem dữ liệu Site';
    }

    // Fallback to defaultAction before using generic fallbackMap
    if (defaultAction && defaultAction !== 'API_CALL' && defaultAction !== '—') {
        return defaultAction;
    }

    // Fallback map
    const fallbackMap = {
        GET: 'Xem dữ liệu',
        POST: 'Tạo mới dữ liệu',
        PUT: 'Cập nhật dữ liệu',
        PATCH: 'Cập nhật dữ liệu',
        DELETE: 'Xóa dữ liệu',
    };

    return fallbackMap[method] || 'Tương tác hệ thống';
};
