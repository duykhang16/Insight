import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Copy, Wifi, Layers, Users, Trash2, Layout } from 'lucide-react';
import FullClone from './FullClone';
import SmartSync from './SmartSync';
import Templates from './Templates';
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
    const canSeeTemplates = true; // Always allow for now if user has config access

    const canSeeAnyTab = canSeeCloneSync || canSeeBatchProvision || canSeeBatchAccess || canSeeBatchDelete || canSeeTemplates;

    // Determine initial tab from URL param or first available
    const getInitialTab = () => {
        const urlTab = searchParams.get('tab');
        if (urlTab === 'clone' && canSeeCloneSync) return 'clone';
        if (urlTab === 'batch_provision' && canSeeBatchProvision) return 'batch_provision';
        if (urlTab === 'batch_access' && canSeeBatchAccess) return 'batch_access';
        if (urlTab === 'batch_delete' && canSeeBatchDelete) return 'batch_delete';
        if (urlTab === 'templates' && canSeeTemplates) return 'templates';
        // fallback to first available
        if (canSeeCloneSync) return 'clone';
        if (canSeeBatchProvision) return 'batch_provision';
        if (canSeeBatchAccess) return 'batch_access';
        if (canSeeBatchDelete) return 'batch_delete';
        if (canSeeTemplates) return 'templates';
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
                templates: canSeeTemplates,
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
        canSeeTemplates && { key: 'templates', label: t('config.tabs.templates') || 'Template Library', icon: <Layout size={16} />, color: 'emerald' },
        canSeeCloneSync && { key: 'clone', label: t('config.tabs.clone_sync'), icon: <Copy size={16} />, color: 'blue' },
        canSeeBatchProvision && { key: 'batch_provision', label: t('config.tabs.batch_provision'), icon: <Layers size={16} />, color: 'violet' },
        canSeeBatchAccess && { key: 'batch_access', label: t('config.tabs.batch_access'), icon: <Users size={16} />, color: 'amber' },
        canSeeBatchDelete && { key: 'batch_delete', label: t('config.tabs.batch_delete'), icon: <Trash2 size={16} />, color: 'rose' },
    ].filter(Boolean);

    const colorMap = {
        emerald: 'border-emerald-500 text-emerald-600 dark:text-emerald-400',
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
                                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:th-text-secondary'
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
                                                ? 'bg-blue-600 th-text-primary'
                                                : 'text-slate-500 hover:th-text-secondary hover:th-bg-elevated'
                                        }`}
                                    >
                                        <Copy size={13} />
                                        {t('config.tabs.full_clone')}
                                    </button>
                                    <button
                                        onClick={() => setCloneSubTab('smart_sync')}
                                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                                            cloneSubTab === 'smart_sync'
                                                ? 'bg-blue-600 th-text-primary'
                                                : 'text-slate-500 hover:th-text-secondary hover:th-bg-elevated'
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
                    {activeTab === 'templates' && canSeeTemplates && <Templates />}

                </ErrorBoundary>
            </div>
        </div>
    );
};

export default Configuration;
