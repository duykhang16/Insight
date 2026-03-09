import { Outlet } from 'react-router-dom';
import GlobalSidebar from '../components/Sidebar/GlobalSidebar';

const GlobalLayout = ({ onLogout, userRole, isZoneAdmin }) => (
    <div className="flex h-screen w-full overflow-hidden bg-[#020617] text-white">
        <GlobalSidebar onLogout={onLogout} userRole={userRole} isZoneAdmin={isZoneAdmin} />
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
