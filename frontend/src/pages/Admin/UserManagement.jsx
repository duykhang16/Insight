import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Users, Plus, KeyRound, ShieldCheck, AlertTriangle, CheckCircle, Lock, Trash2, CornerDownRight, ArrowRightLeft } from 'lucide-react';
import apiClient from '../../api/apiClient';
import { useLanguage } from '../../context/LanguageContext';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import CreateUserModal from './CreateUserModal';
import UserAssignmentsModal from './UserAssignmentsModal';

const ROLE_LABEL = {
    admin: 'Admin',
    viewer: 'Viewer',
    delegator: 'Delegator',
    brand_admin: 'Brand Admin',
    super_admin: 'Super Admin',
};

const ROLE_BADGE_VARIANT = {
    admin: 'default',
    viewer: 'secondary',
    delegator: 'outline',
    brand_admin: 'outline',
    super_admin: 'outline',
};
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── Alert banner ──────────────────────────────────────────────────────────────

const Alert = ({ type, message, onClose }) => {
    const base = type === 'error'
        ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
        : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400';
    const Icon = type === 'error' ? AlertTriangle : CheckCircle;
    return (
        <div className={`flex items-start gap-2 border rounded-lg px-4 py-3 mb-4 text-sm ${base}`}>
            <Icon className="w-4 h-4 mt-0.5 shrink-0" />
            <span className="flex-1">{message}</span>
            {onClose && <button onClick={onClose} className="text-current opacity-60 hover:opacity-100 ml-2">&times;</button>}
        </div>
    );
};

// ── Main component ────────────────────────────────────────────────────────────

const UserManagement = () => {
    const { t } = useLanguage();
    const currentUserEmail = sessionStorage.getItem('insight_user_email') || '';
    const currentUserRole = sessionStorage.getItem('userRole') || 'viewer';

    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [alert, setAlert] = useState(null);

    const [showCreate, setShowCreate] = useState(false);

    // Reset-password confirm modal
    const [resetTarget, setResetTarget] = useState(null);
    const [resetting, setResetting] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [deleting, setDeleting] = useState(false);
    const [replacementAdminEmail, setReplacementAdminEmail] = useState('');
    const [moveTarget, setMoveTarget] = useState(null);
    const [moveAdminEmail, setMoveAdminEmail] = useState('');
    const [moving, setMoving] = useState(false);
    const [roleTransferTarget, setRoleTransferTarget] = useState(null);
    const [roleTransferNextRole, setRoleTransferNextRole] = useState('');
    const [roleTransferMode, setRoleTransferMode] = useState('existing');
    const [roleTransferExistingEmail, setRoleTransferExistingEmail] = useState('');
    const [roleTransferNewEmail, setRoleTransferNewEmail] = useState('');
    const [roleTransferSaving, setRoleTransferSaving] = useState(false);
    const [scopeTarget, setScopeTarget] = useState(null);

    const showAlert = (type, message) => {
        setAlert({ type, message });
        setTimeout(() => setAlert(null), 5000);
    };

    const fetchUsers = useCallback(async () => {
        setLoading(true);
        try {
            const res = await apiClient.get('/admin/users');
            setUsers(res.data);
        } catch (err) {
            showAlert('error', err.response?.data?.detail || t('admin.users.error_load_failed'));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchUsers(); }, [fetchUsers]);

    const creatableRoles = currentUserRole === 'admin'
        ? ['viewer', 'delegator']
        : ['admin', 'viewer', 'delegator'];

    const getAssignableRolesForRow = useCallback((user) => {
        if (currentUserRole === 'admin') {
            return ['viewer', 'delegator'];
        }
        if (user.role === 'admin') {
            return ['admin', 'viewer', 'delegator'];
        }
        return ['viewer', 'delegator'];
    }, [currentUserRole]);

    const handleRoleChange = async (userId, role, isApproved) => {
        try {
            await apiClient.put(`/admin/users/${userId}`, { role, isApproved });
            setUsers(prev => prev.map(u => u.id === userId ? { ...u, role, isApproved } : u));
        } catch (err) {
            showAlert('error', err.response?.data?.detail || t('admin.users.error_update_failed'));
        }
    };

    const openRoleTransferModal = (user, nextRole) => {
        setRoleTransferTarget(user);
        setRoleTransferNextRole(nextRole);
        setRoleTransferMode('existing');
        setRoleTransferExistingEmail('');
        setRoleTransferNewEmail('');
    };

    const closeRoleTransferModal = () => {
        setRoleTransferTarget(null);
        setRoleTransferNextRole('');
        setRoleTransferMode('existing');
        setRoleTransferExistingEmail('');
        setRoleTransferNewEmail('');
    };

    const handleRoleTransferConfirm = async () => {
        if (!roleTransferTarget || !roleTransferNextRole) return;
        const replacementEmail = roleTransferMode === 'existing'
            ? roleTransferExistingEmail.trim().toLowerCase()
            : roleTransferNewEmail.trim().toLowerCase();
        setRoleTransferSaving(true);
        try {
            const res = await apiClient.put(`/admin/users/${roleTransferTarget.id}`, {
                role: roleTransferNextRole,
                isApproved: roleTransferTarget.isApproved,
                replacement_admin_email: replacementEmail,
            });
            showAlert('success', res.data?.message || t('admin.users.role_transfer_success'));
            closeRoleTransferModal();
            fetchUsers();
        } catch (err) {
            showAlert('error', err.response?.data?.detail || t('admin.users.error_update_failed'));
        } finally {
            setRoleTransferSaving(false);
        }
    };

    const handleApprovalToggle = (user) => {
        if (currentUserRole !== 'brand_admin') return;
        handleRoleChange(user.id, user.role, !user.isApproved);
    };

    const handleResetPassword = async () => {
        setResetting(true);
        try {
            await apiClient.post(`/admin/users/${resetTarget.id}/reset-password`, {});
            showAlert('success', `${t('admin.users.reset_password_confirm')} ${resetTarget.email}. ${t('admin.users.reset_password_note')}`);
            setResetTarget(null);
        } catch (err) {
            showAlert('error', err.response?.data?.detail || t('admin.users.error_reset_failed'));
        } finally {
            setResetting(false);
        }
    };

    const handleMoveUser = async () => {
        if (!moveTarget || !moveAdminEmail) return;
        setMoving(true);
        try {
            const res = await apiClient.put(`/admin/users/${moveTarget.id}`, {
                role: moveTarget.role,
                isApproved: moveTarget.isApproved,
                parent_admin_id: moveAdminEmail,
            });
            showAlert('success', res.data?.message || t('admin.users.move_success'));
            setMoveTarget(null);
            setMoveAdminEmail('');
            fetchUsers();
        } catch (err) {
            showAlert('error', err.response?.data?.detail || t('admin.users.error_move_failed'));
        } finally {
            setMoving(false);
        }
    };

    const handleDeleteUser = async () => {
        setDeleting(true);
        try {
            const res = await apiClient.delete(`/admin/users/${deleteTarget.id}`, {
                data: deleteTarget.role === 'admin'
                    ? (deleteTargetChildren.length > 0 ? { replacement_admin_email: replacementAdminEmail.trim().toLowerCase() } : undefined)
                    : undefined,
            });
            showAlert('success', res.data?.message || t('admin.users.delete_success'));
            setDeleteTarget(null);
            setReplacementAdminEmail('');
            fetchUsers();
        } catch (err) {
            showAlert('error', err.response?.data?.detail || t('admin.users.error_delete_failed'));
        } finally {
            setDeleting(false);
        }
    };

    const allEmails = users.map(u => u.email);
    const subUsers = users.filter(u => u.email !== currentUserEmail);
    const deleteTargetChildren = deleteTarget?.role === 'admin'
        ? subUsers.filter((u) => ['viewer', 'delegator'].includes(u.role) && u.parent_admin_id === deleteTarget.email)
        : [];
    const deleteAdminNeedsReplacement = deleteTarget?.role === 'admin' && deleteTargetChildren.length > 0;
    const normalizedReplacementAdminEmail = replacementAdminEmail.trim().toLowerCase();
    const replacementEmailExists = allEmails.some((email) => email.toLowerCase() === normalizedReplacementAdminEmail);
    const deleteBlockedByReplacement = deleteAdminNeedsReplacement && (
        !EMAIL_REGEX.test(normalizedReplacementAdminEmail) ||
        replacementEmailExists ||
        normalizedReplacementAdminEmail === deleteTarget.email
    );
    const roleTransferExistingCandidates = subUsers.filter((u) =>
        ['viewer', 'delegator'].includes(u.role) &&
        u.email !== roleTransferTarget?.email &&
        u.parent_admin_id === roleTransferTarget?.email
    );
    const moveAdminCandidates = subUsers.filter((u) =>
        u.role === 'admin' && u.email !== moveTarget?.parent_admin_id
    );
    const normalizedRoleTransferNewEmail = roleTransferNewEmail.trim().toLowerCase();
    const roleTransferReplacementEmail = roleTransferMode === 'existing'
        ? roleTransferExistingEmail.trim().toLowerCase()
        : normalizedRoleTransferNewEmail;
    const roleTransferReplacementExists = allEmails.some((email) => email.toLowerCase() === normalizedRoleTransferNewEmail);
    const roleTransferDisabled =
        !roleTransferTarget ||
        !roleTransferNextRole ||
        (
            roleTransferMode === 'existing'
                ? !roleTransferExistingEmail
                : !EMAIL_REGEX.test(normalizedRoleTransferNewEmail) || roleTransferReplacementExists || normalizedRoleTransferNewEmail === roleTransferTarget?.email
        );

    const hierarchySortedUsers = useMemo(() => {
        const byParent = new Map();
        const adminsInScope = [];
        const directLeaves = [];

        subUsers.forEach((user) => {
            if (user.role === 'admin') {
                adminsInScope.push(user);
                return;
            }
            if (user.parent_admin_id) {
                const list = byParent.get(user.parent_admin_id) || [];
                list.push(user);
                byParent.set(user.parent_admin_id, list);
                return;
            }
            directLeaves.push(user);
        });

        adminsInScope.sort((a, b) => a.email.localeCompare(b.email));
        directLeaves.sort((a, b) => a.email.localeCompare(b.email));
        byParent.forEach((children) => {
            children.sort((a, b) => {
                if (a.role !== b.role) return a.role.localeCompare(b.role);
                return a.email.localeCompare(b.email);
            });
        });

        const ordered = [];
        const seen = new Set();

        adminsInScope.forEach((admin) => {
            ordered.push(admin);
            seen.add(admin.id);
            (byParent.get(admin.email) || []).forEach((child) => {
                ordered.push(child);
                seen.add(child.id);
            });
        });

        directLeaves.forEach((user) => {
            if (!seen.has(user.id)) {
                ordered.push(user);
                seen.add(user.id);
            }
        });

        subUsers.forEach((user) => {
            if (!seen.has(user.id)) {
                ordered.push(user);
                seen.add(user.id);
            }
        });

        return ordered;
    }, [subUsers]);

    const getIndentClass = (user) => {
        if (user.role === 'admin') return currentUserRole === 'brand_admin' ? 'pl-4' : '';
        if (['viewer', 'delegator'].includes(user.role)) return 'pl-10';
        return '';
    };

    const getHierarchyArrow = (user) => {
        if (user.role === 'admin' && currentUserRole === 'brand_admin') {
            return <CornerDownRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />;
        }
        if (['viewer', 'delegator'].includes(user.role)) {
            return <CornerDownRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />;
        }
        return null;
    };

    // ── Column definitions ──
    const columns = [
        {
            key: 'email',
            label: t('admin.users.table_email'),
            sortable: true,
            className: 'font-mono text-xs',
            render: (user) => {
                const isLocked = !!user.is_locked;
                return (
                    <div className={`flex items-center gap-2 flex-wrap ${getIndentClass(user)}`}>
                        {getHierarchyArrow(user)}
                        <span className="th-text-primary">{user.email}</span>
                        {user.must_set_password && (
                            <span className="text-[10px] bg-yellow-900/40 text-yellow-400 px-1.5 py-0.5 rounded">
                                {t('admin.users.not_set_password')}
                            </span>
                        )}
                        {isLocked && <Lock className="w-3 h-3 text-amber-500 inline" title="Locked" />}
                    </div>
                );
            },
        },
        {
            key: 'role',
            label: t('admin.users.table_role'),
            sortable: true,
            render: (user) => {
                const isLocked = !!user.is_locked;
                const isOutOfScope = currentUserRole === 'admin'
                    ? ['super_admin', 'brand_admin', 'admin'].includes(user.role)
                    : ['super_admin', 'brand_admin'].includes(user.role);
                const isDisabled = isLocked || isOutOfScope;
                if (isOutOfScope) {
                    return (
                        <Badge variant={ROLE_BADGE_VARIANT[user.role] || 'outline'}>
                            {ROLE_LABEL[user.role] || user.role}
                        </Badge>
                    );
                }
                return (
                    <select
                        value={user.role}
                        onChange={e => {
                            const nextRole = e.target.value;
                            if (currentUserRole === 'brand_admin' && user.role === 'admin' && ['viewer', 'delegator'].includes(nextRole)) {
                                openRoleTransferModal(user, nextRole);
                                return;
                            }
                            handleRoleChange(user.id, nextRole, user.isApproved);
                        }}
                        disabled={isDisabled}
                        className={`text-xs border rounded px-2 py-1 bg-transparent focus:outline-none cursor-pointer disabled:cursor-not-allowed ${
                            user.role === 'admin'
                                ? 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                                : 'bg-slate-700/50 text-slate-500 th-border'
                        }`}
                    >
                        {getAssignableRolesForRow(user).map(r => (
                            <option key={r} value={r} className="th-bg-surface th-text-primary">{ROLE_LABEL[r]}</option>
                        ))}
                    </select>
                );
            },
        },
        {
            key: 'isApproved',
            label: t('admin.users.table_status'),
            render: (user) => {
                const isLocked = !!user.is_locked;
                const isOutOfScope = currentUserRole === 'admin'
                    ? ['super_admin', 'brand_admin', 'admin'].includes(user.role)
                    : ['super_admin', 'brand_admin'].includes(user.role);
                const isDisabled = currentUserRole !== 'brand_admin' || isLocked || isOutOfScope;
                return (
                    <button
                        onClick={(e) => { e.stopPropagation(); handleApprovalToggle(user); }}
                        disabled={isDisabled}
                        className={`flex items-center gap-1.5 text-xs border rounded px-2 py-1 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                            user.isApproved
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                                : 'bg-slate-700/50 text-slate-500 th-border hover:bg-slate-700'
                        }`}
                    >
                        <ShieldCheck className="w-3 h-3" />
                        {user.isApproved ? t('admin.users.approved') : t('admin.users.pending')}
                    </button>
                );
            },
        },
        {
            key: 'created_at',
            label: t('admin.users.table_joined'),
            sortable: true,
            className: 'text-slate-500 text-xs',
            render: (user) => user.created_at ? new Date(user.created_at).toLocaleDateString('vi-VN') : '—',
        },
    ];

    const renderActions = (user) => {
        const isOutOfScope = currentUserRole === 'admin'
            ? ['super_admin', 'brand_admin', 'admin'].includes(user.role)
            : ['super_admin', 'brand_admin'].includes(user.role);
        const isResetDisabled = !!user.is_locked || isOutOfScope;
        const canMove = currentUserRole === 'brand_admin' && ['viewer', 'delegator'].includes(user.role);
        const canDelete = currentUserRole === 'brand_admin'
            ? !isOutOfScope
            : currentUserRole === 'admin'
                ? ['viewer', 'delegator'].includes(user.role) && user.parent_admin_id === currentUserEmail
                : false;
        return (
            <>
                <button
                    onClick={() => setResetTarget(user)}
                    disabled={isResetDisabled}
                    title={t('admin.users.reset_password_title')}
                    className="p-1.5 text-slate-500 hover:text-amber-400 hover:bg-amber-500/10 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    <KeyRound className="w-3.5 h-3.5" />
                </button>
                {canMove && (
                    <button
                        onClick={() => {
                            setMoveTarget(user);
                            setMoveAdminEmail('');
                        }}
                        title={t('admin.users.move_title')}
                        className="p-1.5 text-slate-500 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors"
                    >
                        <ArrowRightLeft className="w-3.5 h-3.5" />
                    </button>
                )}
                {canDelete && (
                    <button
                        onClick={() => {
                            setDeleteTarget(user);
                            setReplacementAdminEmail('');
                        }}
                        title={t('admin.users.delete_title') || 'Delete user'}
                        className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                )}
            </>
        );
    };

    const canOpenScopeModal = useCallback((user) => {
        if (!user) return false;
        if (currentUserRole === 'brand_admin') {
            return ['admin', 'viewer', 'delegator'].includes(user.role);
        }
        if (currentUserRole === 'admin') {
            return ['viewer', 'delegator'].includes(user.role) && user.parent_admin_id === currentUserEmail;
        }
        return false;
    }, [currentUserRole, currentUserEmail]);

    return (
        <div className="p-6 max-w-4xl">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <Users className="w-5 h-5 text-blue-400" />
                    <h1 className="text-lg font-semibold th-text-primary">{t('admin.users.title')}</h1>
                    <Badge variant="secondary" className="text-xs">
                        {subUsers.length} {subUsers.length !== 1 ? t('admin.users.sub_accounts') : t('admin.users.sub_account')}
                    </Badge>
                </div>
                <button
                    onClick={() => setShowCreate(true)}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm bg-blue-600 hover:bg-blue-700 th-text-primary rounded-lg transition-colors"
                >
                    <Plus className="w-4 h-4" />
                    {t('admin.users.create_user')}
                </button>
            </div>

            {alert && <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)} />}

            {/* Reset-password confirm modal */}
            {resetTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="th-bg-surface border th-border rounded-xl p-6 w-full max-w-sm mx-4">
                        <div className="flex items-center gap-2 mb-3">
                            <KeyRound className="w-4 h-4 text-amber-400" />
                            <h3 className="text-sm font-semibold th-text-primary">{t('admin.users.reset_password_title')}</h3>
                        </div>
                        <p className="text-sm th-text-secondary mb-1">
                            {t('admin.users.reset_password_confirm')} <span className="font-semibold th-text-primary">{resetTarget.email}</span>?
                        </p>
                        <p className="text-xs text-slate-500 mb-5">
                            {t('admin.users.reset_password_note')}
                        </p>
                        <div className="flex gap-2">
                            <button
                                onClick={handleResetPassword}
                                disabled={resetting}
                                className="flex-1 py-2 bg-amber-600 hover:bg-amber-700 th-text-primary text-sm rounded-lg transition-colors disabled:opacity-50"
                            >
                                {resetting ? t('admin.users.resetting_button') : t('admin.users.reset_confirm_button')}
                            </button>
                            <button
                                onClick={() => setResetTarget(null)}
                                className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 th-text-secondary text-sm rounded-lg transition-colors"
                            >
                                {t('admin.users.cancel')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {roleTransferTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 py-6">
                    <div className="th-bg-surface border th-border rounded-xl p-6 w-full max-w-lg shadow-2xl">
                        <div className="flex items-center gap-2 mb-3">
                            <ShieldCheck className="w-4 h-4 text-blue-400" />
                            <h3 className="text-sm font-semibold th-text-primary">
                                {t('admin.users.role_transfer_title') || 'Transfer Admin Authority'}
                            </h3>
                        </div>
                        <p className="text-sm th-text-secondary mb-1">
                            {t('admin.users.role_transfer_confirm_prefix') || 'Change role for'} <span className="font-semibold th-text-primary">{roleTransferTarget.email}</span>?
                        </p>
                        <p className="text-xs text-slate-500 mb-4">
                            {t('admin.users.role_transfer_hint') || 'Choose an account that will inherit this admin authority. The replacement can be an existing viewer/delegator or a newly created admin email.'}
                        </p>

                        <div className="space-y-4">
                            <div className="flex gap-4">
                                <label className="flex items-center gap-2 text-sm th-text-secondary">
                                    <input
                                        type="radio"
                                        checked={roleTransferMode === 'existing'}
                                        onChange={() => setRoleTransferMode('existing')}
                                    />
                                    {t('admin.users.role_transfer_existing_option') || 'Use existing account'}
                                </label>
                                <label className="flex items-center gap-2 text-sm th-text-secondary">
                                    <input
                                        type="radio"
                                        checked={roleTransferMode === 'new'}
                                        onChange={() => setRoleTransferMode('new')}
                                    />
                                    {t('admin.users.role_transfer_new_option') || 'Create new admin'}
                                </label>
                            </div>

                            {roleTransferMode === 'existing' ? (
                                <div>
                                    <label className="block text-xs text-slate-400 mb-1">
                                        {t('admin.users.role_transfer_existing_label') || 'Existing Viewer / Delegator'}
                                    </label>
                                    <select
                                        value={roleTransferExistingEmail}
                                        onChange={(e) => setRoleTransferExistingEmail(e.target.value)}
                                        className="w-full th-bg-elevated border border-slate-600 th-text-primary rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                                    >
                                        <option value="">{t('admin.users.role_transfer_existing_placeholder') || 'Select an account...'}</option>
                                        {roleTransferExistingCandidates.map((user) => (
                                            <option key={user.email} value={user.email}>{user.email}</option>
                                        ))}
                                    </select>
                                </div>
                            ) : (
                                <div>
                                    <label className="block text-xs text-slate-400 mb-1">
                                        {t('admin.users.role_transfer_new_label') || 'New Admin Email'}
                                    </label>
                                    <input
                                        type="email"
                                        value={roleTransferNewEmail}
                                        onChange={(e) => setRoleTransferNewEmail(e.target.value)}
                                        placeholder={t('admin.users.role_transfer_new_placeholder') || 'new-admin@brand.com'}
                                        className="w-full th-bg-elevated border border-slate-600 th-text-primary rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                                    />
                                    {roleTransferNewEmail && !EMAIL_REGEX.test(normalizedRoleTransferNewEmail) && (
                                        <p className="text-xs text-rose-400 mt-2">
                                            {t('admin.users.role_transfer_invalid_email') || 'Replacement admin email is not in a valid format.'}
                                        </p>
                                    )}
                                    {roleTransferReplacementExists && (
                                        <p className="text-xs text-rose-400 mt-2">
                                            {t('admin.users.role_transfer_email_exists') || 'Replacement admin email already exists in the system.'}
                                        </p>
                                    )}
                                </div>
                            )}

                            {roleTransferReplacementEmail && roleTransferReplacementEmail === roleTransferTarget.email && (
                                <p className="text-xs text-rose-400">
                                    {t('admin.users.role_transfer_same_email') || 'Replacement admin must be different from the current admin.'}
                                </p>
                            )}
                        </div>

                        <div className="flex gap-2 mt-6">
                            <button
                                onClick={handleRoleTransferConfirm}
                                disabled={roleTransferSaving || roleTransferDisabled}
                                className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 th-text-primary text-sm rounded-lg transition-colors disabled:opacity-50"
                            >
                                {roleTransferSaving
                                    ? (t('admin.users.role_transfer_processing') || 'Processing...')
                                    : (t('admin.users.role_transfer_confirm_button') || 'Confirm Transfer')}
                            </button>
                            <button
                                onClick={closeRoleTransferModal}
                                className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 th-text-secondary text-sm rounded-lg transition-colors"
                            >
                                {t('admin.users.cancel')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {moveTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="th-bg-surface border th-border rounded-xl p-6 w-full max-w-md mx-4">
                        <div className="flex items-center gap-2 mb-3">
                            <ArrowRightLeft className="w-4 h-4 text-blue-400" />
                            <h3 className="text-sm font-semibold th-text-primary">{t('admin.users.move_title')}</h3>
                        </div>
                        <p className="text-sm th-text-secondary mb-1">
                            {t('admin.users.move_confirm_prefix')} <span className="font-semibold th-text-primary">{moveTarget.email}</span>?
                        </p>
                        <p className="text-xs text-slate-500 mb-4">
                            {t('admin.users.move_hint')}
                        </p>
                        <div>
                            <label className="block text-xs text-slate-400 mb-1">
                                {t('admin.users.move_select_admin_label')}
                            </label>
                            <select
                                value={moveAdminEmail}
                                onChange={(e) => setMoveAdminEmail(e.target.value)}
                                className="w-full th-bg-elevated border border-slate-600 th-text-primary rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                            >
                                <option value="">{t('admin.users.move_select_admin_placeholder')}</option>
                                {moveAdminCandidates.map((adminUser) => (
                                    <option key={adminUser.id} value={adminUser.email}>{adminUser.email}</option>
                                ))}
                            </select>
                        </div>
                        <div className="flex gap-2 mt-6">
                            <button
                                onClick={handleMoveUser}
                                disabled={moving || !moveAdminEmail}
                                className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 th-text-primary text-sm rounded-lg transition-colors disabled:opacity-50"
                            >
                                {moving ? t('admin.users.moving_button') : t('admin.users.move_confirm_button')}
                            </button>
                            <button
                                onClick={() => {
                                    setMoveTarget(null);
                                    setMoveAdminEmail('');
                                }}
                                className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 th-text-secondary text-sm rounded-lg transition-colors"
                            >
                                {t('admin.users.cancel')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {deleteTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 py-6">
                    <div className="th-bg-surface border th-border rounded-xl p-6 w-full max-w-lg box-border overflow-hidden shadow-2xl">
                        <div className="flex items-center gap-2 mb-3">
                            <Trash2 className="w-4 h-4 text-rose-400" />
                            <h3 className="text-sm font-semibold th-text-primary">{t('admin.users.delete_title') || 'Delete user'}</h3>
                        </div>
                        <p className="text-sm th-text-secondary mb-1">
                            {t('admin.users.delete_confirm_prefix') || 'Delete user'} <span className="font-semibold th-text-primary">{deleteTarget.email}</span>?
                        </p>
                        {deleteTarget.role === 'admin' ? (
                            <div className="space-y-4 mb-5">
                                <p className="text-xs text-slate-500">
                                    {deleteAdminNeedsReplacement
                                        ? (t('admin.users.delete_admin_replacement_hint') || 'Enter a new admin email. The new admin will replace this admin with the same authority and the same linked viewer/delegator users.')
                                        : (t('admin.users.delete_admin_no_children_hint') || 'This admin has no linked viewer/delegator accounts and can be deleted directly.')}
                                </p>
                                {deleteAdminNeedsReplacement && (
                                    <div>
                                        <label className="block text-xs text-slate-400 mb-1">
                                            {t('admin.users.delete_admin_replacement_email_label') || 'Replacement Admin Email'}
                                        </label>
                                        <input
                                            type="email"
                                            value={replacementAdminEmail}
                                            onChange={(e) => setReplacementAdminEmail(e.target.value)}
                                            placeholder={t('admin.users.delete_admin_replacement_email_placeholder') || 'new-admin@brand.com'}
                                            className="w-full th-bg-elevated border border-slate-600 th-text-primary rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                                        />
                                    </div>
                                )}
                                {deleteAdminNeedsReplacement && (
                                    <div className="rounded-lg border th-border p-3 th-bg-elevated">
                                        <div className="flex items-center justify-between gap-2 mb-2">
                                            <h4 className="text-sm font-semibold th-text-primary">
                                                {t('admin.users.delete_admin_children_preview_title') || 'Linked Viewer / Delegator Users'}
                                            </h4>
                                            <Badge variant="secondary" className="text-xs">
                                                {deleteTargetChildren.length}
                                            </Badge>
                                        </div>
                                        <div className="space-y-2 max-h-40 overflow-y-auto pr-1 custom-scrollbar">
                                            {deleteTargetChildren.map((child) => (
                                                <div key={child.id} className="rounded-lg border th-border px-3 py-2 th-bg-surface-alt flex items-center justify-between gap-2">
                                                    <span className="font-mono text-xs th-text-primary break-all">{child.email}</span>
                                                    <Badge variant={ROLE_BADGE_VARIANT[child.role] || 'outline'}>
                                                        {ROLE_LABEL[child.role] || child.role}
                                                    </Badge>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {deleteAdminNeedsReplacement && replacementAdminEmail && !EMAIL_REGEX.test(normalizedReplacementAdminEmail) && (
                                    <p className="text-xs text-rose-400">
                                        {t('admin.users.delete_admin_replacement_invalid_email') || 'Replacement admin email is not in a valid format.'}
                                    </p>
                                )}
                                {deleteAdminNeedsReplacement && replacementEmailExists && (
                                    <p className="text-xs text-rose-400">
                                        {t('admin.users.delete_admin_replacement_exists') || 'Replacement admin email already exists in the system.'}
                                    </p>
                                )}
                                {deleteAdminNeedsReplacement && replacementAdminEmail && normalizedReplacementAdminEmail === deleteTarget.email && (
                                    <p className="text-xs text-rose-400">
                                        {t('admin.users.delete_admin_replacement_same_email') || 'Replacement admin email must be different from the admin being deleted.'}
                                    </p>
                                )}
                            </div>
                        ) : (
                            <p className="text-xs text-slate-500 mb-5">
                                {t('admin.users.delete_regular_hint') || 'This action will remove the user from the brand.'}
                            </p>
                        )}
                        <div className="flex gap-2 mt-6">
                            <button
                                onClick={handleDeleteUser}
                                disabled={deleting || deleteBlockedByReplacement}
                                className="flex-1 py-2 bg-rose-600 hover:bg-rose-700 th-text-primary text-sm rounded-lg transition-colors disabled:opacity-50"
                            >
                                {deleting ? (t('admin.users.deleting_button') || 'Deleting...') : (t('admin.users.delete_confirm_button') || 'Confirm Delete')}
                            </button>
                            <button
                                onClick={() => {
                                    setDeleteTarget(null);
                                    setReplacementAdminEmail('');
                                }}
                                className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 th-text-secondary text-sm rounded-lg transition-colors"
                            >
                                {t('admin.users.cancel')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showCreate && (
                <CreateUserModal
                    currentUserEmail={currentUserEmail}
                    currentUserRole={currentUserRole}
                    existingEmails={allEmails}
                    availableAdmins={subUsers.filter((user) => user.role === 'admin')}
                    t={t}
                    onClose={() => setShowCreate(false)}
                    onCreated={(createdEmail) => {
                        setShowCreate(false);
                        showAlert('success', `${t('admin.users.create_success')} ${createdEmail} ${t('admin.users.create_success_suffix')}`);
                        fetchUsers();
                    }}
                />
            )}

            {scopeTarget && (
                <UserAssignmentsModal
                    currentUserEmail={currentUserEmail}
                    currentUserRole={currentUserRole}
                    targetUser={scopeTarget}
                    t={t}
                    onClose={() => setScopeTarget(null)}
                    onSaved={() => {
                        setScopeTarget(null);
                        showAlert('success', t('admin.users.scope_save_success') || 'Đã cập nhật zone/site cho user.');
                        fetchUsers();
                    }}
                />
            )}

            {/* User table using shadcn DataTable */}
            <DataTable
                columns={columns}
                data={hierarchySortedUsers}
                keyExtractor={u => u.id}
                onRowClick={(user) => {
                    if (canOpenScopeModal(user)) {
                        setScopeTarget(user);
                    }
                }}
                emptyMessage={t('admin.users.no_subaccounts')}
                searchable
                searchKeys={['email', 'parent_admin_id', 'brand_admin_email']}
                searchPlaceholder={`${t('admin.users.table_email')}...`}
                actions={renderActions}
                loading={loading}
                rowClassName={(user) => {
                    const isLocked = !!user.is_locked;
                    const isOutOfScope = currentUserRole === 'admin'
                        ? ['super_admin', 'brand_admin', 'admin'].includes(user.role)
                        : ['super_admin', 'brand_admin'].includes(user.role);
                    return (isLocked || isOutOfScope) ? 'opacity-50' : '';
                }}
            />
        </div>
    );
};

export default UserManagement;
