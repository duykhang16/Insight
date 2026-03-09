import Sidebar from '../components/Sidebar';

const MainLayout = ({ children, onLogout, userRole }) => {
    return (
        <div className="flex h-screen w-full overflow-hidden bg-[#020617] dark:bg-[#020617] text-white transition-colors duration-200">
            <Sidebar onLogout={onLogout} userRole={userRole} />
            <div className="relative flex flex-col flex-1 overflow-y-auto overflow-x-hidden w-full">
                <main className="w-full flex-1">
                    <div className="w-full py-2">
                        {children}
                    </div>
                </main>
            </div>
        </div>
    );
};

export default MainLayout;
