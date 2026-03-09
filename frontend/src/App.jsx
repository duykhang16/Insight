import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import GlobalLayout from './layouts/GlobalLayout';
import SiteLayout from './layouts/SiteLayout';
import Login from './pages/Login';
import SiteDetail from './pages/Dashboard/SiteDetail';
import SiteHealth from './pages/Dashboard/Health';
import SiteAlerts from './pages/Dashboard/Alerts';
import SiteClients from './pages/Dashboard/Clients';
import SiteNetworks from './pages/Dashboard/Networks';
import SiteDevices from './pages/Dashboard/Devices';
import SiteApplications from './pages/Dashboard/Applications';
import Configuration from './pages/Configuration';
import AdminLogs from './pages/Admin/Logs';
import ZoneManagement from './pages/Admin/ZoneManagement';
import MasterAccount from './pages/Admin/MasterAccount';
import UserManagement from './pages/Admin/UserManagement';
import ZoneDashboard from './pages/Zones/ZoneDashboard';
import ZoneSites from './pages/Zones/ZoneSites';
import ZoneLogs from './pages/Zones/ZoneLogs';
import TenantManagement from './pages/Super/TenantManagement';
import SuperLogs from './pages/Super/SuperLogs';
import SuperUserManagement from './pages/Super/SuperUserManagement';
import { SiteProvider } from './context/SiteContext';
import { SettingsProvider } from './context/SettingsContext';
import './App.css';

// Guard for admin-only routes (super_admin or tenant_admin).
// - No session  → App.jsx never renders the Router at all (shows Login instead).
// - Has session, not admin-tier → redirect to /dashboard, session stays alive.
const AdminRoute = ({ userRole, children }) => {
  if (userRole === 'super_admin' || userRole === 'tenant_admin') return children;
  return <Navigate to="/zones" replace />;
};

// Guard for super_admin-only routes.
const SuperRoute = ({ userRole, children }) => {
  if (userRole === 'super_admin') return children;
  return <Navigate to="/zones" replace />;
};

// Guard for viewer-blocked routes (e.g. Configuration).
// viewer AND not a Zone Admin → redirect to /zones.
// Manager and Zone Admins can access Configuration for their assigned sites/zones.
const ViewerRoute = ({ userRole, isZoneAdmin, children }) => {
  if (userRole === 'viewer' && !isZoneAdmin) return <Navigate to="/zones" replace />;
  return children;
};

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [isReady, setIsReady] = useState(false);
  // userRole lives in React state so Sidebar and AdminRoute re-render reactively.
  // Initialized from sessionStorage so the very first render already has the correct
  // role — prevents the Admin tab from flashing hidden before verifySession completes.
  const [userRole, setUserRole] = useState(
    () => sessionStorage.getItem('userRole') || 'viewer'
  );
  // isZoneAdmin: true nếu user có zone_role="admin" trong bất kỳ zone nào.
  // Cho phép viewer là Zone Admin được vào Configuration (chỉ trong zone của họ).
  const [isZoneAdmin, setIsZoneAdmin] = useState(
    () => sessionStorage.getItem('isZoneAdmin') === 'true'
  );

  useEffect(() => {
    const verifySession = async () => {
      const storedToken = sessionStorage.getItem('token');
      if (!storedToken) {
        setCheckingAuth(false);
        setIsReady(true);
        return;
      }
      try {
        // Must use apiClient so /api prefix is applied
        const { default: apiClient } = await import('./api/apiClient');
        const res = await apiClient.get('/auth/session');
        if (res.data && res.data.status === 'active') {
          // JWT session verified — use role from server response (authoritative)
          const role = res.data.role || sessionStorage.getItem('userRole') || 'viewer';
          const zoneAdmin = res.data.is_zone_admin === true;
          sessionStorage.setItem('userRole', role);
          sessionStorage.setItem('isZoneAdmin', String(zoneAdmin));
          setIsLoggedIn(true);
          setUserRole(role);
          setIsZoneAdmin(zoneAdmin);
        } else {
          sessionStorage.removeItem('token');
          sessionStorage.removeItem('userRole');
        }
      } catch (error) {
        sessionStorage.removeItem('token');
        sessionStorage.removeItem('userRole');
      } finally {
        setCheckingAuth(false);
        setIsReady(true);
      }
    };

    verifySession();

    const handleUnauthorized = () => {
      setIsLoggedIn(false);
      sessionStorage.removeItem('token');
      sessionStorage.removeItem('selectedSiteId');
      window.location.href = '/'; // Hard reset
    };

    window.addEventListener('unauthorized', handleUnauthorized);
    return () => window.removeEventListener('unauthorized', handleUnauthorized);
  }, []);

  // Health Check Polling to keep browser tab active and check session
  useEffect(() => {
    let heartbeatInterval;
    if (isLoggedIn) {
      heartbeatInterval = setInterval(async () => {
        try {
          // Dynamic import to avoid breaking initial load
          const { default: apiClient } = await import('./api/apiClient');
          // Lightweight request to keep session and connection alive
          await apiClient.get('/auth/session');
          console.debug('Health Check Polling - isPaused: false, lastStatus: online');
        } catch (e) {
          console.warn('Health Check Polling - failed', e);
        }
      }, 30 * 1000); // 30 seconds
    }

    return () => {
      if (heartbeatInterval) clearInterval(heartbeatInterval);
    };
  }, [isLoggedIn]);

  const handleLoginSuccess = () => {
    // Login component already wrote userRole + isZoneAdmin to sessionStorage before calling this.
    // Read synchronously so React state is set in the same tick as isLoggedIn.
    const role = sessionStorage.getItem('userRole') || 'viewer';
    const zoneAdmin = sessionStorage.getItem('isZoneAdmin') === 'true';
    setTimeout(() => {
      setUserRole(role);
      setIsZoneAdmin(zoneAdmin);
      setIsLoggedIn(true);
    }, 500);
  };

  const handleLogout = async () => {
    try {
      const { default: apiClient } = await import('./api/apiClient');
      await apiClient.post('/auth/logout');
    } catch (e) {
      console.warn('Backend logout failed', e);
    }
    setIsLoggedIn(false);
    sessionStorage.clear();
    window.location.href = '/';
  };

  if (checkingAuth || !isReady) {
    return (
      <div className="min-h-screen bg-[#020617] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!isLoggedIn) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <Router>
      <SettingsProvider>
        <SiteProvider>
          <Routes>
            {/* Global routes — use GlobalLayout */}
            <Route element={<GlobalLayout onLogout={handleLogout} userRole={userRole} isZoneAdmin={isZoneAdmin} />}>
              <Route path="/" element={<Navigate to="/zones" replace />} />
              <Route path="/config" element={
                <ViewerRoute userRole={userRole} isZoneAdmin={isZoneAdmin}>
                  <Configuration />
                </ViewerRoute>
              } />

              {/* Zone routes — all logged-in users */}
              <Route path="/zones" element={<ZoneDashboard />} />
              <Route path="/zones/:zoneId/sites" element={<ZoneSites />} />
              <Route path="/zones/:zoneId/logs" element={<ZoneLogs />} />

              {/* Admin-only routes */}
              <Route path="/admin/logs" element={
                <AdminRoute userRole={userRole}>
                  <AdminLogs />
                </AdminRoute>
              } />
              <Route path="/admin/zones" element={
                <AdminRoute userRole={userRole}>
                  <ZoneManagement />
                </AdminRoute>
              } />
              <Route path="/admin/master" element={
                <AdminRoute userRole={userRole}>
                  <MasterAccount />
                </AdminRoute>
              } />
              <Route path="/admin/users" element={
                <AdminRoute userRole={userRole}>
                  <UserManagement />
                </AdminRoute>
              } />

              {/* Super-admin-only routes */}
              <Route path="/super/tenants" element={
                <SuperRoute userRole={userRole}>
                  <TenantManagement />
                </SuperRoute>
              } />
              <Route path="/super/users" element={
                <SuperRoute userRole={userRole}>
                  <SuperUserManagement />
                </SuperRoute>
              } />
              <Route path="/super/logs" element={
                <SuperRoute userRole={userRole}>
                  <SuperLogs />
                </SuperRoute>
              } />

              <Route path="*" element={<Navigate to="/zones" replace />} />
            </Route>

            {/* Site-specific routes — use SiteLayout */}
            <Route path="/site/:siteId" element={<SiteLayout onLogout={handleLogout} userRole={userRole} />}>
              <Route index element={<SiteDetail />} />
              <Route path="health" element={<SiteHealth />} />
              <Route path="alerts" element={<SiteAlerts />} />
              <Route path="clients" element={<SiteClients />} />
              <Route path="networks" element={<SiteNetworks />} />
              <Route path="devices" element={<SiteDevices />} />
              <Route path="applications" element={<SiteApplications />} />
              <Route path="cloner" element={<Configuration />} />
            </Route>
          </Routes>
        </SiteProvider>
      </SettingsProvider>
    </Router>
  );
}

export default App;

