import { useEffect } from 'react';
import { Outlet, useParams } from 'react-router-dom';
import SiteSidebar from '../components/Sidebar/SiteSidebar';
import { useSite } from '../context/SiteContext';

const SiteLayout = ({ onLogout, userRole }) => {
    const { siteId } = useParams();
    const { setSelectedSiteId } = useSite();

    useEffect(() => {
        if (siteId) {
            setSelectedSiteId(siteId);
        }
    }, [siteId, setSelectedSiteId]);

    return (
        <div className="flex h-screen w-full overflow-hidden bg-[#020617] text-white">
            <SiteSidebar siteId={siteId} onLogout={onLogout} userRole={userRole} />
            <div className="relative flex flex-col flex-1 overflow-y-auto overflow-x-hidden">
                <main className="w-full flex-1">
                    <div className="w-full py-2">
                        <Outlet />
                    </div>
                </main>
            </div>
        </div>
    );
};

export default SiteLayout;
