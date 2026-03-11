import { Outlet } from 'react-router-dom';
import GlobalSidebar from '../components/Sidebar/GlobalSidebar';

const GlobalLayout = ({ onLogout, userRole, isZoneAdmin, rolePermissions }) => (
    <div className="flex h-screen w-full overflow-hidden th-bg-base th-text-primary transition-colors duration-200">
        <GlobalSidebar onLogout={onLogout} userRole={userRole} isZoneAdmin={isZoneAdmin} rolePermissions={rolePermissions} />
        <div className="relative flex flex-col flex-1 overflow-y-auto overflow-x-hidden">
            <main className="w-full flex-1">
                <div className="w-full py-2">
                    <Outlet />
                </div>
            </main>
        </div>
    </div>
);

export default GlobalLayout;
