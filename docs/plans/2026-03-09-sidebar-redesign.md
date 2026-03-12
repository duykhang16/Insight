# Sidebar Redesign + In-page Help Tooltips Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign GlobalSidebar với accordion submenu cho Configuration, gộp Full Clone + Smart Sync thành 1 tab "Clone & Sync", thêm tooltip ⓘ trong sidebar và help popover ⓘ trong trang.

**Architecture:**
- `GlobalSidebar.jsx` thêm accordion state + submenu items cho Configuration, dùng `useNavigate` + `URLSearchParams` để navigate đến tab cụ thể
- `Configuration/index.jsx` đọc `useSearchParams()` để set activeTab khi mount, gộp Full Clone + Smart Sync thành tab "clone_sync" với sub-tabs bên trong
- Tạo `HelpTooltip.jsx` component tái sử dụng cho cả sidebar tooltip và in-page help popover

**Tech Stack:** React, React Router v6 (`useNavigate`, `useSearchParams`, `useLocation`), Lucide React, Tailwind CSS

---

## Task 1: Tạo HelpTooltip component

**Files:**
- Create: `frontend/src/components/HelpTooltip.jsx`

**Step 1: Tạo file component**

```jsx
// frontend/src/components/HelpTooltip.jsx
import React, { useState, useRef, useEffect } from 'react';
import { Info } from 'lucide-react';

/**
 * HelpTooltip — reusable tooltip/popover for help content.
 *
 * Props:
 *   content: string  — short one-liner (used for sidebar variant)
 *   steps: string[]  — numbered steps (used for in-page variant)
 *   title: string    — optional title for popover
 *   variant: 'sidebar' | 'page'  — sidebar = hover tooltip, page = click popover
 *   position: 'right' | 'bottom-left'  — popover direction
 */
const HelpTooltip = ({
    content,
    steps,
    title,
    variant = 'sidebar',
    position = 'right',
}) => {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    // Close on outside click (page variant only)
    useEffect(() => {
        if (variant !== 'page') return;
        const handler = (e) => {
            if (ref.current && !ref.current.contains(e.target)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [variant]);

    const positionClass = position === 'right'
        ? 'left-full ml-2 top-0'
        : 'right-0 top-full mt-2';

    if (variant === 'sidebar') {
        return (
            <div className="relative group flex-shrink-0">
                <Info size={12} className="text-slate-600 group-hover:text-slate-400 transition-colors cursor-help" />
                <div className={`absolute ${positionClass} z-50 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150`}>
                    <div className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-[10px] text-slate-300 whitespace-nowrap shadow-xl max-w-[200px] leading-relaxed">
                        {content}
                    </div>
                </div>
            </div>
        );
    }

    // page variant — click to toggle
    return (
        <div className="relative" ref={ref}>
            <button
                onClick={() => setOpen(v => !v)}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-slate-500 hover:text-blue-400 hover:bg-slate-800 transition-colors text-[10px] font-bold uppercase tracking-widest"
                title="Hướng dẫn sử dụng"
            >
                <Info size={13} />
                <span>Hướng dẫn</span>
            </button>
            {open && (
                <div className={`absolute ${positionClass} z-50 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-4 min-w-[220px] max-w-[280px]`}>
                    {title && (
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">{title}</p>
                    )}
                    {steps && (
                        <ol className="space-y-2">
                            {steps.map((step, i) => (
                                <li key={i} className="flex items-start gap-2 text-[11px] text-slate-300">
                                    <span className="flex-shrink-0 w-4 h-4 rounded-full bg-blue-600/30 text-blue-400 text-[9px] font-black flex items-center justify-center mt-0.5">
                                        {i + 1}
                                    </span>
                                    {step}
                                </li>
                            ))}
                        </ol>
                    )}
                    {content && !steps && (
                        <p className="text-[11px] text-slate-300 leading-relaxed">{content}</p>
                    )}
                </div>
            )}
        </div>
    );
};

export default HelpTooltip;
```

**Step 2: Commit**

```bash
git add frontend/src/components/HelpTooltip.jsx
git commit -m "feat: add reusable HelpTooltip component (sidebar hover + page click variants)"
```

---

## Task 2: Refactor GlobalSidebar — Accordion + submenu

**Files:**
- Modify: `frontend/src/components/Sidebar/GlobalSidebar.jsx`

**Step 1: Đọc file hiện tại, sau đó thay thế toàn bộ nội dung**

Thay `frontend/src/components/Sidebar/GlobalSidebar.jsx` bằng:

```jsx
import React, { useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
    Home, Sliders, Shield, Layers, Link2, Users,
    Building2, ScrollText, ChevronDown, Copy, Wifi,
    Trash2
} from 'lucide-react';
import UserWidget from './UserWidget';
import ThemeLanguageToggle from '../ThemeLanguageToggle';
import HelpTooltip from '../HelpTooltip';
import { useLanguage } from '../../context/LanguageContext';

const GlobalSidebar = ({ onLogout, userRole = 'guest', isZoneAdmin = false, rolePermissions = {} }) => {
    const { t } = useLanguage();
    const navigate = useNavigate();
    const location = useLocation();

    // Accordion: auto-expand if currently on /config
    const isOnConfig = location.pathname === '/config';
    const [configOpen, setConfigOpen] = useState(isOnConfig);

    const getNavLinkClass = ({ isActive }) =>
        `flex items-center px-4 py-3 text-sm font-medium transition-colors ${isActive
            ? 'bg-blue-600 text-white'
            : 'text-gray-300 hover:bg-slate-800 hover:text-white'
        }`;

    // Navigate to /config and set tab via search param
    const goToConfigTab = (tab) => {
        navigate(`/config?tab=${tab}`);
    };

    // Permission flags
    const canSeeCloneSync = rolePermissions.full_clone === true || rolePermissions.smart_sync === true;
    const canSeeBatchProvision = rolePermissions.batch_provision === true;
    const canSeeBatchAccess = rolePermissions.batch_access === true;
    const canSeeBatchDelete = rolePermissions.batch_delete === true;
    const canSeeConfig = (userRole !== 'viewer' || isZoneAdmin) &&
        (canSeeCloneSync || canSeeBatchProvision || canSeeBatchAccess || canSeeBatchDelete);

    // Sub-items for Configuration accordion
    const configSubItems = [
        canSeeCloneSync && {
            key: 'clone',
            label: t('config.tabs.clone_sync'),
            icon: <Copy size={14} />,
            help: t('config.help.clone_sync'),
        },
        canSeeBatchProvision && {
            key: 'batch_provision',
            label: t('config.tabs.batch_provision'),
            icon: <Layers size={14} />,
            help: t('config.help.batch_provision'),
        },
        canSeeBatchAccess && {
            key: 'batch_access',
            label: t('config.tabs.batch_access'),
            icon: <Users size={14} />,
            help: t('config.help.batch_access'),
        },
        canSeeBatchDelete && {
            key: 'batch_delete',
            label: t('config.tabs.batch_delete'),
            icon: <Trash2 size={14} />,
            help: t('config.help.batch_delete'),
        },
    ].filter(Boolean);

    // Check if a config sub-tab is active
    const currentTab = new URLSearchParams(location.search).get('tab');
    const isConfigSubActive = (key) => isOnConfig && currentTab === key;

    return (
        <div className="flex flex-col w-64 bg-[#0F172A] border-r border-slate-800 h-full">
            {/* Brand header */}
            <div className="flex items-center justify-between px-4 h-16 border-b border-slate-800 gap-3">
                <div className="flex items-center gap-3">
                    <span className="text-xl font-black italic text-white tracking-widest uppercase">INSIGHT</span>
                    <div className="relative flex items-center justify-center h-2 w-2" title="Live Sync">
                        <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-50 animate-ping"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </div>
                </div>
                <ThemeLanguageToggle />
            </div>

            {/* Navigation */}
            <nav className="flex-1 overflow-y-auto pt-4 space-y-1">
                <NavLink to="/zones" end className={getNavLinkClass}>
                    <Home className="w-5 h-5 mr-3" />
                    {t('sidebar.dashboard')}
                </NavLink>

                {/* Configuration accordion */}
                {canSeeConfig && (
                    <div>
                        {/* Accordion trigger */}
                        <button
                            onClick={() => setConfigOpen(v => !v)}
                            className={`w-full flex items-center justify-between px-4 py-3 text-sm font-medium transition-colors ${
                                isOnConfig
                                    ? 'text-blue-400 bg-blue-600/10'
                                    : 'text-gray-300 hover:bg-slate-800 hover:text-white'
                            }`}
                        >
                            <span className="flex items-center gap-3">
                                <Sliders className="w-5 h-5" />
                                {t('sidebar.configuration')}
                            </span>
                            <ChevronDown
                                size={14}
                                className={`transition-transform duration-200 ${configOpen ? 'rotate-180' : ''}`}
                            />
                        </button>

                        {/* Sub-items */}
                        {configOpen && (
                            <div className="pl-4 pb-1 space-y-0.5">
                                {configSubItems.map(item => (
                                    <button
                                        key={item.key}
                                        onClick={() => goToConfigTab(item.key)}
                                        className={`w-full flex items-center justify-between pl-5 pr-3 py-2.5 text-xs font-medium rounded-lg transition-colors group ${
                                            isConfigSubActive(item.key)
                                                ? 'bg-blue-600 text-white'
                                                : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                                        }`}
                                    >
                                        <span className="flex items-center gap-2">
                                            <span className={`w-1 h-1 rounded-full ${isConfigSubActive(item.key) ? 'bg-white' : 'bg-slate-600'}`} />
                                            {item.icon}
                                            {item.label}
                                        </span>
                                        {item.help && (
                                            <HelpTooltip
                                                content={item.help}
                                                variant="sidebar"
                                                position="right"
                                            />
                                        )}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Tenant Admin section */}
                {userRole === 'tenant_admin' && (
                    <>
                        <div className="px-4 pt-4 pb-1">
                            <span className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest">Admin</span>
                        </div>
                        <NavLink to="/admin/logs" className={getNavLinkClass}>
                            <Shield className="w-5 h-5 mr-3" />
                            {t('admin.logs.title')}
                        </NavLink>
                        <NavLink to="/admin/zones" className={getNavLinkClass}>
                            <Layers className="w-5 h-5 mr-3" />
                            {t('admin.zones.title')}
                        </NavLink>
                        <NavLink to="/admin/users" className={getNavLinkClass}>
                            <Users className="w-5 h-5 mr-3" />
                            {t('admin.users.title')}
                        </NavLink>
                        <NavLink to="/admin/master" className={getNavLinkClass}>
                            <Link2 className="w-5 h-5 mr-3" />
                            {t('admin.master.title')}
                        </NavLink>
                    </>
                )}

                {/* Super Admin section */}
                {userRole === 'super_admin' && (
                    <>
                        <div className="px-4 pt-4 pb-1">
                            <span className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest">Super Admin</span>
                        </div>
                        <NavLink to="/super/tenants" className={getNavLinkClass}>
                            <Building2 className="w-5 h-5 mr-3" />
                            {t('super.tenants.title')}
                        </NavLink>
                        <NavLink to="/super/users" className={getNavLinkClass}>
                            <Users className="w-5 h-5 mr-3" />
                            {t('super.users.title')}
                        </NavLink>
                        <NavLink to="/super/permissions" className={getNavLinkClass}>
                            <Shield className="w-5 h-5 mr-3" />
                            {t('super.permissions.title')}
                        </NavLink>
                        <NavLink to="/super/logs" className={getNavLinkClass}>
                            <ScrollText className="w-5 h-5 mr-3" />
                            {t('super.logs.title')}
                        </NavLink>
                    </>
                )}
            </nav>

            <UserWidget onLogout={onLogout} />
        </div>
    );
};

export default GlobalSidebar;
```

**Step 2: Commit**

```bash
git add frontend/src/components/Sidebar/GlobalSidebar.jsx
git commit -m "feat: sidebar accordion for Configuration submenu with per-item help tooltips"
```

---

## Task 3: Thêm i18n keys cho config help + clone_sync tab

**Files:**
- Modify: `frontend/src/locales/en.js`
- Modify: `frontend/src/locales/vi.js`

**Step 1: Thêm vào `en.js` trong section `config`**

Tìm `config:` object trong en.js, thêm vào:

```js
// Trong config.tabs — thêm key mới:
clone_sync: "Clone & Sync",

// Thêm section config.help:
help: {
    clone_sync: "Copy configuration from a template site to new sites",
    batch_provision: "Automatically create multiple sites in bulk",
    batch_access: "Grant or revoke access for multiple accounts at once",
    batch_delete: "Remove multiple sites from a zone at once",
},
```

**Step 2: Thêm vào `vi.js` tương ứng**

```js
// Trong config.tabs:
clone_sync: "Clone & Sync",

// Thêm section config.help:
help: {
    clone_sync: "Sao chép cấu hình từ site mẫu sang các site mới",
    batch_provision: "Tự động tạo hàng loạt site mới",
    batch_access: "Cấp hoặc thu hồi quyền truy cập cho nhiều tài khoản",
    batch_delete: "Xóa nhiều site khỏi zone cùng lúc",
},
```

**Step 3: Commit**

```bash
git add frontend/src/locales/en.js frontend/src/locales/vi.js
git commit -m "feat: add i18n keys for clone_sync tab and config help tooltips"
```

---

## Task 4: Refactor Configuration/index.jsx — gộp Clone & Sync + đọc URL params

**Files:**
- Modify: `frontend/src/pages/Configuration/index.jsx`

**Step 1: Thay toàn bộ nội dung**

```jsx
import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Copy, Wifi, Layers, Users, Trash2 } from 'lucide-react';
import FullClone from './FullClone';
import SmartSync from './SmartSync';
import BatchProvision from './BatchProvision';
import BatchAccountAccess from './BatchAccountAccess';
import BatchDelete from './BatchDelete';
import ErrorBoundary from '../../components/ErrorBoundary';
import HelpTooltip from '../../components/HelpTooltip';
import { ShieldAlert } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

// Help steps per tab — defined outside component (static data)
const HELP_STEPS = {
    clone: {
        en: [
            'Select clone mode: Full Clone or Smart Sync',
            'Choose a template site',
            'Set target site name / prefix',
            'Click Start',
        ],
        vi: [
            'Chọn chế độ: Full Clone hoặc Smart Sync',
            'Chọn site mẫu (template)',
            'Đặt tên / prefix cho site đích',
            'Nhấn Bắt đầu',
        ],
    },
    batch_provision: {
        en: [
            'Select a template site',
            'Set site name prefix',
            'Choose number of sites',
            'Select target zones (optional)',
            'Click Start',
        ],
        vi: [
            'Chọn site mẫu (template)',
            'Đặt prefix tên site',
            'Chọn số lượng site cần tạo',
            'Chọn zone đích (tuỳ chọn)',
            'Nhấn Bắt đầu',
        ],
    },
    batch_access: {
        en: [
            'Select zone and site targets',
            'Choose accounts to grant/revoke',
            'Select permission role',
            'Confirm and apply',
        ],
        vi: [
            'Chọn zone và site đích',
            'Chọn tài khoản cần cấp/thu hồi quyền',
            'Chọn vai trò quyền hạn',
            'Xác nhận và áp dụng',
        ],
    },
    batch_delete: {
        en: [
            'Select zone',
            'Choose sites to delete',
            'Confirm deletion',
        ],
        vi: [
            'Chọn zone',
            'Chọn các site cần xóa',
            'Xác nhận xóa',
        ],
    },
};

const Configuration = ({ rolePermissions: propRolePermissions }) => {
    const { t, language } = useLanguage();
    const [searchParams] = useSearchParams();

    // fallback to sessionStorage if props not passed
    let rolePermissions = propRolePermissions;
    if (!rolePermissions) {
        try {
            rolePermissions = JSON.parse(sessionStorage.getItem('rolePermissions')) || {};
        } catch (e) {
            rolePermissions = {};
        }
    }

    // Permissions
    const canSeeFullClone = rolePermissions.full_clone === true;
    const canSeeSmartSync = rolePermissions.smart_sync === true;
    const canSeeCloneSync = canSeeFullClone || canSeeSmartSync;
    const canSeeBatchProvision = rolePermissions.batch_provision === true;
    const canSeeBatchAccess = rolePermissions.batch_access === true;
    const canSeeBatchDelete = rolePermissions.batch_delete === true;

    const canSeeAnyTab = canSeeCloneSync || canSeeBatchProvision || canSeeBatchAccess || canSeeBatchDelete;

    // Determine initial tab from URL param or first available
    const getInitialTab = () => {
        const urlTab = searchParams.get('tab');
        if (urlTab === 'clone' && canSeeCloneSync) return 'clone';
        if (urlTab === 'batch_provision' && canSeeBatchProvision) return 'batch_provision';
        if (urlTab === 'batch_access' && canSeeBatchAccess) return 'batch_access';
        if (urlTab === 'batch_delete' && canSeeBatchDelete) return 'batch_delete';
        // fallback to first available
        if (canSeeCloneSync) return 'clone';
        if (canSeeBatchProvision) return 'batch_provision';
        if (canSeeBatchAccess) return 'batch_access';
        if (canSeeBatchDelete) return 'batch_delete';
        return 'clone';
    };

    const [activeTab, setActiveTab] = useState(getInitialTab);

    // Sync tab when URL param changes (e.g. sidebar navigation)
    useEffect(() => {
        const urlTab = searchParams.get('tab');
        if (urlTab) {
            const map = {
                clone: canSeeCloneSync,
                batch_provision: canSeeBatchProvision,
                batch_access: canSeeBatchAccess,
                batch_delete: canSeeBatchDelete,
            };
            if (map[urlTab]) setActiveTab(urlTab);
        }
    }, [searchParams]);

    // Clone & Sync sub-tab state
    const [cloneSubTab, setCloneSubTab] = useState(() =>
        canSeeFullClone ? 'full_clone' : 'smart_sync'
    );

    if (!canSeeAnyTab) {
        return (
            <div className="w-full h-full flex items-center justify-center pt-32">
                <div className="text-center bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-white/5 p-12 rounded-3xl shadow-xl max-w-md">
                    <ShieldAlert size={64} className="mx-auto mb-6 text-rose-500 opacity-80" />
                    <h2 className="text-2xl font-black uppercase tracking-widest text-slate-800 dark:text-white mb-3">{t('config.access_denied_title')}</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">
                        {t('config.access_denied_message')}
                    </p>
                </div>
            </div>
        );
    }

    const tabs = [
        canSeeCloneSync && { key: 'clone', label: t('config.tabs.clone_sync'), icon: <Copy size={16} />, color: 'blue' },
        canSeeBatchProvision && { key: 'batch_provision', label: t('config.tabs.batch_provision'), icon: <Layers size={16} />, color: 'violet' },
        canSeeBatchAccess && { key: 'batch_access', label: t('config.tabs.batch_access'), icon: <Users size={16} />, color: 'amber' },
        canSeeBatchDelete && { key: 'batch_delete', label: t('config.tabs.batch_delete'), icon: <Trash2 size={16} />, color: 'rose' },
    ].filter(Boolean);

    const colorMap = {
        blue: 'border-blue-500 text-blue-600 dark:text-blue-400',
        violet: 'border-violet-500 text-violet-600 dark:text-violet-400',
        amber: 'border-amber-500 text-amber-600 dark:text-amber-400',
        rose: 'border-rose-500 text-rose-600 dark:text-rose-400',
    };

    const helpSteps = HELP_STEPS[activeTab]?.[language] || HELP_STEPS[activeTab]?.en || [];

    return (
        <div className="w-full h-full flex flex-col pt-4">
            {/* Main tab bar */}
            <div className="px-6 mb-4 flex items-center justify-between border-b border-gray-200 dark:border-gray-800">
                <div className="flex space-x-4">
                    {tabs.map(tab => (
                        <button
                            key={tab.key}
                            className={`flex items-center gap-2 pb-3 px-2 border-b-2 transition-colors ${
                                activeTab === tab.key
                                    ? `${colorMap[tab.color]} font-semibold`
                                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                            }`}
                            onClick={() => setActiveTab(tab.key)}
                        >
                            {tab.icon}
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* In-page help button */}
                {helpSteps.length > 0 && (
                    <div className="pb-3">
                        <HelpTooltip
                            title={t('config.help.guide_title')}
                            steps={helpSteps}
                            variant="page"
                            position="bottom-left"
                        />
                    </div>
                )}
            </div>

            {/* Tab content */}
            <div className="flex-1 w-full relative">
                <ErrorBoundary>
                    {/* Clone & Sync tab — with sub-tabs */}
                    {activeTab === 'clone' && canSeeCloneSync && (
                        <div className="w-full h-full flex flex-col">
                            {/* Sub-tab bar (only show if user has both permissions) */}
                            {canSeeFullClone && canSeeSmartSync && (
                                <div className="px-6 mb-2 flex gap-3">
                                    <button
                                        onClick={() => setCloneSubTab('full_clone')}
                                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                                            cloneSubTab === 'full_clone'
                                                ? 'bg-blue-600 text-white'
                                                : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
                                        }`}
                                    >
                                        <Copy size={13} />
                                        {t('config.tabs.full_clone')}
                                    </button>
                                    <button
                                        onClick={() => setCloneSubTab('smart_sync')}
                                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                                            cloneSubTab === 'smart_sync'
                                                ? 'bg-blue-600 text-white'
                                                : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
                                        }`}
                                    >
                                        <Wifi size={13} />
                                        {t('config.tabs.smart_sync')}
                                    </button>
                                </div>
                            )}
                            <div className="flex-1">
                                {cloneSubTab === 'full_clone' && canSeeFullClone && <FullClone />}
                                {cloneSubTab === 'smart_sync' && canSeeSmartSync && <SmartSync />}
                            </div>
                        </div>
                    )}

                    {activeTab === 'batch_provision' && canSeeBatchProvision && <BatchProvision />}
                    {activeTab === 'batch_access' && canSeeBatchAccess && <BatchAccountAccess />}
                    {activeTab === 'batch_delete' && canSeeBatchDelete && <BatchDelete />}
                </ErrorBoundary>
            </div>
        </div>
    );
};

export default Configuration;
```

**Step 2: Commit**

```bash
git add frontend/src/pages/Configuration/index.jsx
git commit -m "feat: merge Full Clone + Smart Sync into Clone & Sync tab, read tab from URL params, add in-page help popover"
```

---

## Task 5: Thêm i18n keys còn thiếu (guide_title, Wifi icon)

**Files:**
- Modify: `frontend/src/locales/en.js`
- Modify: `frontend/src/locales/vi.js`

**Step 1: Thêm vào `en.js`**

Trong `config.help`:
```js
guide_title: "How to use",
```

**Step 2: Thêm vào `vi.js`**

Trong `config.help`:
```js
guide_title: "Hướng dẫn sử dụng",
```

**Step 3: Commit**

```bash
git add frontend/src/locales/en.js frontend/src/locales/vi.js
git commit -m "feat: add guide_title i18n key for in-page help popover"
```

---

## Task 6: Truyền rolePermissions vào GlobalSidebar từ GlobalLayout

**Files:**
- Modify: `frontend/src/layouts/GlobalLayout.jsx`

**Step 1: Đọc GlobalLayout để biết cách truyền props**

Tìm chỗ render `<GlobalSidebar .../>` trong GlobalLayout. Thêm `rolePermissions={rolePermissions}` vào props — prop này đã có sẵn từ App.jsx truyền xuống GlobalLayout.

**Step 2: Commit**

```bash
git add frontend/src/layouts/GlobalLayout.jsx
git commit -m "fix: pass rolePermissions to GlobalSidebar for accordion permission checks"
```

---

## Task 7: Manual verification

**Step 1: Chạy frontend**
```bash
cd frontend && npm run dev
```

**Step 2: Kiểm tra các scenario**

| Scenario | Expected |
|----------|----------|
| Login với `tenant_admin` | Sidebar có "Cấu hình" với chevron ▼ |
| Click "Cấu hình" | Accordion mở, thấy sub-items |
| Click "Clone & Sync" | Navigate `/config?tab=clone`, trang hiển thị Full Clone với sub-tabs |
| Hover icon ⓘ trên sub-item | Tooltip hiện mô tả ngắn |
| Vào trang Configuration | Nút "Hướng dẫn" xuất hiện ở header |
| Click "Hướng dẫn" | Popover hiện danh sách bước |
| Click ra ngoài popover | Popover đóng |
| Navigate sidebar → batch_provision | Tab đúng được chọn |
| Reload `/config?tab=batch_delete` | Tab batch_delete active ngay |

**Step 3: Toggle ngôn ngữ EN/VI — kiểm tra help steps đổi ngôn ngữ**

**Step 4: Final commit nếu có fix nhỏ**

```bash
git add -p
git commit -m "fix: sidebar redesign minor adjustments"
```
