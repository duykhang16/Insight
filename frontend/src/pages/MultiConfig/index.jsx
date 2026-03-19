import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Copy, RefreshCw, Layers, Users, Trash2, Layout, Settings, Wifi } from 'lucide-react';
import CloneConfig from './Clone/CloneConfig';
import CloneSite from './Clone/CloneSite';
import SmartSync from './Update/SmartSync';
import Templates from './Templates';
import AccountAccess from './BatchOperations/AccountAccess';
import Delete from './BatchOperations/Delete';
import DeleteSSID from './BatchOperations/DeleteSSID';
import ErrorBoundary from '../../components/ErrorBoundary';
import HelpTooltip from '../../components/HelpTooltip';
import { ShieldAlert } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

// Help steps per tab — defined outside component (static data)
const HELP_STEPS = {
    clone: {
        en: [
            'Select clone mode: Clone Config or Clone Site',
            'Choose a template site',
            'Set target site name / prefix',
            'Click Start',
        ],
        vi: [
            'Chọn chế độ: Clone Config hoặc Clone Site',
            'Chọn site mẫu (template)',
            'Đặt tên / prefix cho site đích',
            'Nhấn Bắt đầu',
        ],
    },
    update: {
        en: [
            'Select action type (Update PSK, Deep Config, Delete SSID)',
            'Choose target sites',
            'Analyze and configure',
            'Execute sync',
        ],
        vi: [
            'Chọn loại thao tác (Đổi PSK, Clone Config, Xóa SSID)',
            'Chọn các site đích',
            'Phân tích và cấu hình',
            'Thực thi đồng bộ',
        ],
    },
    batch_ops: {
        en: [
            'Select operation: Account Access or Delete',
            'Choose targets (zones / sites)',
            'Configure parameters',
            'Confirm and execute',
        ],
        vi: [
            'Chọn thao tác: Quản lý quyền hoặc Xóa',
            'Chọn đích (zone / site)',
            'Cấu hình tham số',
            'Xác nhận và thực thi',
        ],
    },
};

const MultiConfig = ({ rolePermissions: propRolePermissions }) => {
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
    const canSeeCloneConfig = rolePermissions.full_clone === true;
    const canSeeCloneSite = rolePermissions.batch_provision === true;
    const canSeeClone = canSeeCloneConfig || canSeeCloneSite;
    const canSeeSmartSync = rolePermissions.smart_sync === true;
    const canSeeUpdate = canSeeSmartSync; // future: || canSeeBulkUpdate || canSeeOneToMany
    const canSeeBatchAccess = rolePermissions.batch_access === true;
    const canSeeBatchDelete = rolePermissions.batch_delete === true;
    const canSeeBatchDeleteSSID = rolePermissions.delete_ssid === true;
    const canSeeBatchOps = canSeeBatchAccess || canSeeBatchDelete || canSeeBatchDeleteSSID;
    const canSeeTemplates = true; // Always allow for now if user has config access

    const canSeeAnyTab = canSeeClone || canSeeUpdate || canSeeBatchOps || canSeeTemplates;

    // Determine initial tab from URL param or first available
    const getInitialTab = () => {
        const urlTab = searchParams.get('tab');
        if (urlTab === 'templates' && canSeeTemplates) return 'templates';
        if (urlTab === 'clone' && canSeeClone) return 'clone';
        if (urlTab === 'update' && canSeeUpdate) return 'update';
        if (urlTab === 'batch_ops' && canSeeBatchOps) return 'batch_ops';
        // Legacy URL support
        if (urlTab === 'batch_provision' && canSeeCloneSite) return 'clone';
        if (urlTab === 'batch_access' && canSeeBatchAccess) return 'batch_ops';
        if (urlTab === 'batch_delete' && canSeeBatchDelete) return 'batch_ops';
        // fallback to first available
        if (canSeeTemplates) return 'templates';
        if (canSeeClone) return 'clone';
        if (canSeeUpdate) return 'update';
        if (canSeeBatchOps) return 'batch_ops';
        return 'templates';
    };

    const [activeTab, setActiveTab] = useState(getInitialTab);

    // Sync tab when URL param changes (e.g. sidebar navigation)
    useEffect(() => {
        const urlTab = searchParams.get('tab');
        if (urlTab) {
            const map = {
                templates: canSeeTemplates,
                clone: canSeeClone,
                update: canSeeUpdate,
                batch_ops: canSeeBatchOps,
                // Legacy support
                batch_provision: canSeeCloneSite,
                batch_access: canSeeBatchAccess,
                batch_delete: canSeeBatchDelete,
            };
            if (urlTab === 'batch_provision') { setActiveTab('clone'); setCloneSubTab('clone_site'); }
            else if (urlTab === 'batch_access') { setActiveTab('batch_ops'); setBatchSubTab('account_access'); }
            else if (urlTab === 'batch_delete') { setActiveTab('batch_ops'); setBatchSubTab('delete'); }
            else if (map[urlTab]) setActiveTab(urlTab);
        }
    }, [searchParams]);

    // Sub-tab states
    const [cloneSubTab, setCloneSubTab] = useState(() =>
        canSeeCloneConfig ? 'clone_config' : 'clone_site'
    );
    const [updateSubTab, setUpdateSubTab] = useState('smart_sync');
    const [batchSubTab, setBatchSubTab] = useState(() =>
        canSeeBatchAccess ? 'account_access' : 'delete'
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

    // Main tabs
    const tabs = [
        canSeeTemplates && { key: 'templates', label: t('config.tabs.templates') || 'Templates', icon: <Layout size={16} />, color: 'emerald' },
        canSeeClone && { key: 'clone', label: t('config.tabs.clone') || 'Clone', icon: <Copy size={16} />, color: 'blue' },
        canSeeUpdate && { key: 'update', label: t('config.tabs.update') || 'Update', icon: <RefreshCw size={16} />, color: 'teal' },
        canSeeBatchOps && { key: 'batch_ops', label: t('config.tabs.batch_ops') || 'Batch Operations', icon: <Settings size={16} />, color: 'amber' },
    ].filter(Boolean);

    const colorMap = {
        emerald: 'border-emerald-500 text-emerald-600 dark:text-emerald-400',
        blue: 'border-blue-500 text-blue-600 dark:text-blue-400',
        teal: 'border-teal-500 text-teal-600 dark:text-teal-400',
        amber: 'border-amber-500 text-amber-600 dark:text-amber-400',
    };

    // Sub-tab configs
    const cloneSubTabs = [
        canSeeCloneConfig && { key: 'clone_config', label: t('config.tabs.clone_config') || 'Clone Config', icon: <Copy size={13} /> },
        canSeeCloneSite && { key: 'clone_site', label: t('config.tabs.clone_site') || 'Clone Site', icon: <Layers size={13} /> },
    ].filter(Boolean);

    const updateSubTabs = [
        canSeeSmartSync && { key: 'smart_sync', label: t('config.tabs.smart_sync') || 'Smart Sync', icon: <RefreshCw size={13} /> },
        // Future: { key: 'bulk_update', label: 'Bulk Update', icon: <Layers size={13} /> },
        // Future: { key: 'one_to_many', label: '1-to-N Update', icon: <GitBranch size={13} /> },
    ].filter(Boolean);

    const batchSubTabs = [
        canSeeBatchAccess && { key: 'account_access', label: t('config.tabs.batch_access') || 'Account Access', icon: <Users size={13} /> },
        canSeeBatchDeleteSSID && { key: 'delete_ssid', label: 'Delete SSID', icon: <Wifi size={13} /> },
        canSeeBatchDelete && { key: 'delete', label: t('config.tabs.batch_delete') || 'Delete', icon: <Trash2 size={13} /> },
    ].filter(Boolean);

    const helpSteps = HELP_STEPS[activeTab]?.[language] || HELP_STEPS[activeTab]?.en || [];

    // Render sub-tab bar
    const renderSubTabs = (items, activeKey, setActive, accentColor) => {
        if (items.length <= 1) return null;
        const colorStyles = {
            blue: 'bg-blue-600 th-text-primary',
            teal: 'bg-teal-600 th-text-primary',
            amber: 'bg-amber-600 th-text-primary',
        };
        return (
            <div className="px-6 mb-2 flex gap-2">
                {items.map(item => (
                    <button
                        key={item.key}
                        onClick={() => setActive(item.key)}
                        className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
                            activeKey === item.key
                                ? `${colorStyles[accentColor] || colorStyles.blue} shadow-sm`
                                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5'
                        }`}
                    >
                        {item.icon}
                        {item.label}
                    </button>
                ))}
            </div>
        );
    };

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
                    {/* ─── Clone tab ─── */}
                    {activeTab === 'clone' && canSeeClone && (
                        <div className="w-full h-full flex flex-col">
                            {renderSubTabs(cloneSubTabs, cloneSubTab, setCloneSubTab, 'blue')}
                            <div className="flex-1">
                                {cloneSubTab === 'clone_config' && canSeeCloneConfig && <CloneConfig />}
                                {cloneSubTab === 'clone_site' && canSeeCloneSite && <CloneSite />}
                            </div>
                        </div>
                    )}

                    {/* ─── Update tab ─── */}
                    {activeTab === 'update' && canSeeUpdate && (
                        <div className="w-full h-full flex flex-col">
                            {renderSubTabs(updateSubTabs, updateSubTab, setUpdateSubTab, 'teal')}
                            <div className="flex-1">
                                {updateSubTab === 'smart_sync' && canSeeSmartSync && <SmartSync />}
                            </div>
                        </div>
                    )}

                    {/* ─── Batch Operations tab ─── */}
                    {activeTab === 'batch_ops' && canSeeBatchOps && (
                        <div className="w-full h-full flex flex-col">
                            {renderSubTabs(batchSubTabs, batchSubTab, setBatchSubTab, 'amber')}
                            <div className="flex-1">
                                {batchSubTab === 'account_access' && canSeeBatchAccess && <AccountAccess />}
                                {batchSubTab === 'delete_ssid' && canSeeBatchDeleteSSID && <DeleteSSID />}
                                {batchSubTab === 'delete' && canSeeBatchDelete && <Delete />}
                            </div>
                        </div>
                    )}

                    {/* ─── Templates tab ─── */}
                    {activeTab === 'templates' && canSeeTemplates && <Templates />}

                </ErrorBoundary>
            </div>
        </div>
    );
};

export default MultiConfig;
