import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Pencil, Trash2, KeyRound, Check, AlertTriangle, X, ChevronDown, ChevronRight } from 'lucide-react';
import apiClient from '../../api/apiClient';
import { useLanguage } from '../../context/LanguageContext';

// ── constants ─────────────────────────────────────────────────────────────────

const VALID_ROLES = ['super_admin', 'tenant_admin', 'manager', 'viewer'];
const ROLE_BADGE_COLOR = {
  super_admin: 'bg-purple-900/40 text-purple-300',
  tenant_admin: 'bg-blue-900/40 text-blue-300',
  manager: 'bg-emerald-900/40 text-emerald-300',
  viewer: 'bg-slate-700 th-text-secondary',
};

// ── helpers ───────────────────────────────────────────────────────────────────

const getDomain = (email) => {
  const at = email.indexOf('@');
  return at >= 0 ? email.slice(at) : '';
};

function RoleBadge({ role }) {
  const { t } = useLanguage();
  const ROLE_LABEL = {
    super_admin: t('super.users.role_super_admin'),
    tenant_admin: t('super.users.role_tenant_admin'),
    manager: t('super.users.role_manager'),
    viewer: t('super.users.role_viewer'),
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${ROLE_BADGE_COLOR[role] || 'bg-slate-700 th-text-secondary'}`}>
      {ROLE_LABEL[role] || role}
    </span>
  );
}

// ── Email input with same-domain autocomplete ─────────────────────────────────

function EmailInput({ value, onChange, existingEmails, placeholder }) {
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handleClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleChange = (e) => {
    const v = e.target.value;
    onChange(v);
    if (v.includes('@')) {
      const domain = getDomain(v);
      const matches = existingEmails.filter(
        (em) => em !== v && getDomain(em) === domain && em.toLowerCase().startsWith(v.toLowerCase().split('@')[0])
      );
      setSuggestions(matches.slice(0, 6));
      setOpen(matches.length > 0);
    } else {
      setSuggestions([]);
      setOpen(false);
    }
  };

  return (
    <div ref={ref} className="relative">
      <input
        type="email"
        className="w-full th-bg-elevated border th-border rounded px-3 py-2 text-sm th-text-primary placeholder-slate-500 focus:outline-none focus:border-blue-500"
        placeholder={placeholder || 'user@domain.com'}
        value={value}
        onChange={handleChange}
        onFocus={() => { if (suggestions.length) setOpen(true); }}
        autoComplete="off"
      />
      {open && (
        <ul className="absolute top-full left-0 right-0 mt-1 th-bg-elevated border th-border rounded shadow-xl z-50 max-h-40 overflow-y-auto">
          {suggestions.map((s) => (
            <li
              key={s}
              className="px-3 py-2 text-sm th-text-secondary hover:bg-slate-700 cursor-pointer"
              onMouseDown={() => { onChange(s); setOpen(false); }}
            >
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Modal wrapper ─────────────────────────────────────────────────────────────

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="th-bg-surface border th-border rounded-lg w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b th-border">
          <h2 className="text-sm font-semibold th-text-primary">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:th-text-primary"><X className="w-4 h-4" /></button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SuperUserManagement() {
  const { t } = useLanguage();
  const [users, setUsers] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);

  const [createModal, setCreateModal] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [resetTarget, setResetTarget] = useState(null);

  // form state
  const [formEmail, setFormEmail] = useState('');
  const [formRole, setFormRole] = useState('viewer');
  const [formParent, setFormParent] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const ROLE_LABEL = {
    super_admin: t('super.users.role_super_admin'),
    tenant_admin: t('super.users.role_tenant_admin'),
    manager: t('super.users.role_manager'),
    viewer: t('super.users.role_viewer'),
  };

  const currentEmail = sessionStorage.getItem('insight_user_email') || '';

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [uRes, tRes] = await Promise.all([
        apiClient.get('/super/users'),
        apiClient.get('/super/tenants'),
      ]);
      setUsers(uRes.data);
      setTenants(tRes.data);
    } catch (e) {
      setError(e?.response?.data?.detail || t('super.users.error_load_data'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const allEmails = users.map(u => u.email);
  const tenantAdmins = users.filter(u => u.role === 'tenant_admin');
  const tenantMap = Object.fromEntries(tenants.map(tenant => [tenant.admin_email, tenant.name]));

  // Count sub-accounts per tenant_admin
  const subCountMap = {};
  users.forEach(u => {
    if (u.parent_admin_id) {
      subCountMap[u.parent_admin_id] = (subCountMap[u.parent_admin_id] || 0) + 1;
    }
  });

  // Collapsed state for tenant_admin rows (email → bool)
  const [collapsed, setCollapsed] = useState({});
  const toggleCollapse = (email) => setCollapsed(prev => ({ ...prev, [email]: !prev[email] }));

  // ── create
  const openCreate = () => { setFormEmail(''); setFormRole('viewer'); setFormParent(''); setCreateModal(true); };
  const handleCreate = async () => {
    setSubmitting(true);
    try {
      await apiClient.post('/super/users', {
        email: formEmail.trim().toLowerCase(),
        role: formRole,
        parent_admin_id: formParent || undefined,
      });
      showToast(t('super.users.toast_create_success'));
      setCreateModal(false);
      fetchData();
    } catch (e) {
      showToast(e?.response?.data?.detail || t('super.users.toast_create_error'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // ── edit
  const openEdit = (u) => {
    setEditTarget(u);
    setFormRole(u.role);
    setFormParent(u.parent_admin_id || '');
  };
  const handleEdit = async () => {
    setSubmitting(true);
    try {
      await apiClient.put(`/super/users/${editTarget.id}`, {
        role: formRole,
        isApproved: editTarget.isApproved,
        parent_admin_id: formParent || undefined,
      });
      showToast(t('super.users.toast_update_success'));
      setEditTarget(null);
      fetchData();
    } catch (e) {
      showToast(e?.response?.data?.detail || t('super.users.toast_update_error'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // ── delete
  const handleDelete = async () => {
    setSubmitting(true);
    try {
      await apiClient.delete(`/super/users/${deleteTarget.id}`);
      showToast(t('super.users.toast_delete_success'));
      setDeleteTarget(null);
      fetchData();
    } catch (e) {
      showToast(e?.response?.data?.detail || t('super.users.toast_delete_error'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // ── reset password
  const handleReset = async () => {
    setSubmitting(true);
    try {
      await apiClient.post(`/super/users/${resetTarget.id}/reset-password`, {});
      showToast(t('super.users.toast_reset_success'));
      setResetTarget(null);
      fetchData();
    } catch (e) {
      showToast(e?.response?.data?.detail || t('super.users.toast_reset_error'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold th-text-primary">{t('super.users.title')}</h1>
          <p className="text-xs text-slate-500 mt-0.5">{t('super.users.subtitle')}</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 th-text-primary text-sm rounded transition-colors"
        >
          <Plus className="w-4 h-4" /> {t('super.users.add_button')}
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded shadow-lg text-sm font-medium flex items-center gap-2 ${
          toast.type === 'error' ? 'bg-red-900 text-red-200' : 'bg-emerald-900 text-emerald-200'
        }`}>
          {toast.type === 'error' ? <AlertTriangle className="w-4 h-4" /> : <Check className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      {error && <div className="bg-red-900/20 border border-red-800 text-red-400 text-sm px-4 py-3 rounded">{error}</div>}

      {/* Table */}
      <div className="th-bg-surface border th-border rounded-lg overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-blue-500" />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="th-bg-surface-alt">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">{t('super.users.table_header_email')}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">{t('super.users.table_header_role')}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">{t('super.users.table_header_tenant')}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">{t('super.users.table_header_status')}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">{t('super.users.table_header_actions')}</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                // Build tree: top-level users (no parent or parent not in list), then sub-accounts grouped under tenant_admin
                const emailSet = new Set(users.map(u => u.email));
                const topLevel = users.filter(u => !u.parent_admin_id || !emailSet.has(u.parent_admin_id));
                const childrenOf = {};
                users.forEach(u => {
                  if (u.parent_admin_id && emailSet.has(u.parent_admin_id)) {
                    if (!childrenOf[u.parent_admin_id]) childrenOf[u.parent_admin_id] = [];
                    childrenOf[u.parent_admin_id].push(u);
                  }
                });

                const ActionButtons = ({ u }) => {
                  const isSelf = u.email === currentEmail;
                  if (isSelf) return null;
                  return (
                    <div className="flex items-center gap-2">
                      <button onClick={() => openEdit(u)} className="p-1.5 rounded text-slate-400 hover:th-text-primary hover:bg-slate-700 transition-colors" title={t('super.users.button_tooltip_edit')}>
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setResetTarget(u)} className="p-1.5 rounded text-slate-400 hover:text-amber-400 hover:bg-slate-700 transition-colors" title={t('super.users.button_tooltip_reset_password')}>
                        <KeyRound className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setDeleteTarget(u)} className="p-1.5 rounded text-slate-400 hover:text-red-400 hover:bg-slate-700 transition-colors" title={t('super.users.button_tooltip_delete')}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                };

                const rows = [];
                topLevel.forEach(u => {
                  const isSelf = u.email === currentEmail;
                  const children = childrenOf[u.email] || [];
                  const isCollapsed = collapsed[u.email];
                  const tenantName = u.role === 'tenant_admin' ? tenantMap[u.email] : null;

                  // Parent row
                  rows.push(
                    <tr key={u.id} className={`border-t th-border transition-colors ${isSelf ? 'opacity-40' : 'hover:th-bg-surface-alt'}`}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          {children.length > 0 ? (
                            <button
                              onClick={() => toggleCollapse(u.email)}
                              className="text-slate-500 hover:th-text-secondary transition-colors flex-shrink-0"
                            >
                              {isCollapsed
                                ? <ChevronRight className="w-3.5 h-3.5" />
                                : <ChevronDown className="w-3.5 h-3.5" />
                              }
                            </button>
                          ) : <span className="w-5 inline-block" />}
                          <span className="th-text-primary font-mono text-xs">{u.email}</span>
                          {u.must_set_password && (
                            <span className="text-[10px] bg-yellow-900/40 text-yellow-400 px-1.5 py-0.5 rounded">{t('super.users.password_not_set_badge')}</span>
                          )}
                          {children.length > 0 && (
                            <span className="text-[10px] bg-blue-900/30 text-blue-400 px-1.5 py-0.5 rounded">
                              {children.length} {t('super.users.sub_accounts_badge')}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3"><RoleBadge role={u.role} /></td>
                      <td className="px-4 py-3 text-slate-400 text-xs">{tenantName || '—'}</td>
                      <td className="px-4 py-3">
                        {u.isApproved
                          ? <span className="text-xs text-emerald-400">{t('super.users.status_active')}</span>
                          : <span className="text-xs text-yellow-400">{t('super.users.status_pending')}</span>}
                      </td>
                      <td className="px-4 py-3"><ActionButtons u={u} /></td>
                    </tr>
                  );

                  // Child rows
                  if (!isCollapsed && children.length > 0) {
                    children.forEach(c => {
                      const cSelf = c.email === currentEmail;
                      rows.push(
                        <tr key={c.id} className={`border-t border-slate-800/50 transition-colors ${cSelf ? 'opacity-40' : 'hover:bg-slate-800/30'} bg-slate-900/30`}>
                          <td className="py-2.5 pr-4" style={{ paddingLeft: '2.5rem' }}>
                            <div className="flex items-center gap-1.5">
                              <span className="text-slate-600 mr-1">└</span>
                              <span className="th-text-secondary font-mono text-xs">{c.email}</span>
                              {c.must_set_password && (
                                <span className="text-[10px] bg-yellow-900/40 text-yellow-400 px-1.5 py-0.5 rounded">{t('super.users.password_not_set_badge')}</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-2.5"><RoleBadge role={c.role} /></td>
                          <td className="px-4 py-2.5 text-slate-500 text-xs">{tenantName || u.email}</td>
                          <td className="px-4 py-2.5">
                            {c.isApproved
                              ? <span className="text-xs text-emerald-400">{t('super.users.status_active')}</span>
                              : <span className="text-xs text-yellow-400">{t('super.users.status_pending')}</span>}
                          </td>
                          <td className="px-4 py-2.5"><ActionButtons u={c} /></td>
                        </tr>
                      );
                    });
                  }
                });
                return rows;
              })()}
            </tbody>
          </table>
        )}
      </div>

      {/* Create modal */}
      {createModal && (
        <Modal title={t('super.users.modal_create_title')} onClose={() => setCreateModal(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">{t('super.users.modal_create_email_label')}</label>
              <EmailInput
                value={formEmail}
                onChange={setFormEmail}
                existingEmails={allEmails}
                placeholder={t('super.users.modal_create_email_placeholder')}
              />
              <p className="text-[10px] text-slate-500 mt-1">{t('super.users.modal_create_email_hint')}</p>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">{t('super.users.modal_create_role_label')}</label>
              <select
                className="w-full th-bg-elevated border th-border rounded px-3 py-2 text-sm th-text-primary focus:outline-none focus:border-blue-500"
                value={formRole}
                onChange={e => setFormRole(e.target.value)}
              >
                {VALID_ROLES.map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </select>
            </div>
            {['manager', 'viewer'].includes(formRole) && (
              <div>
                <label className="block text-xs text-slate-400 mb-1">{t('super.users.modal_create_parent_label')}</label>
                <select
                  className="w-full th-bg-elevated border th-border rounded px-3 py-2 text-sm th-text-primary focus:outline-none focus:border-blue-500"
                  value={formParent}
                  onChange={e => setFormParent(e.target.value)}
                >
                  <option value="">{t('super.users.modal_create_parent_option')}</option>
                  {tenantAdmins.map(u => (
                    <option key={u.email} value={u.email}>
                      {u.email}{tenantMap[u.email] ? ` (${tenantMap[u.email]})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setCreateModal(false)} className="px-3 py-2 text-sm text-slate-400 hover:th-text-primary">{t('super.users.modal_create_cancel')}</button>
              <button
                onClick={handleCreate}
                disabled={!formEmail.trim() || submitting}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 th-text-primary text-sm rounded"
              >
                {submitting ? t('super.users.modal_create_submitting') : t('super.users.modal_create_submit')}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Edit modal */}
      {editTarget && (
        <Modal title={`${t('super.users.modal_edit_title')}: ${editTarget.email}`} onClose={() => setEditTarget(null)}>
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">{t('super.users.modal_edit_role_label')}</label>
              <select
                className="w-full th-bg-elevated border th-border rounded px-3 py-2 text-sm th-text-primary focus:outline-none focus:border-blue-500"
                value={formRole}
                onChange={e => setFormRole(e.target.value)}
              >
                {VALID_ROLES.map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </select>
            </div>
            {['manager', 'viewer'].includes(formRole) && (
              <div>
                <label className="block text-xs text-slate-400 mb-1">{t('super.users.modal_edit_parent_label')}</label>
                <select
                  className="w-full th-bg-elevated border th-border rounded px-3 py-2 text-sm th-text-primary focus:outline-none focus:border-blue-500"
                  value={formParent}
                  onChange={e => setFormParent(e.target.value)}
                >
                  <option value="">{t('super.users.modal_edit_parent_option')}</option>
                  {tenantAdmins.map(u => (
                    <option key={u.email} value={u.email}>
                      {u.email}{tenantMap[u.email] ? ` (${tenantMap[u.email]})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setEditTarget(null)} className="px-3 py-2 text-sm text-slate-400 hover:th-text-primary">{t('super.users.modal_edit_cancel')}</button>
              <button
                onClick={handleEdit}
                disabled={submitting}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 th-text-primary text-sm rounded"
              >
                {submitting ? t('super.users.modal_edit_submitting') : t('super.users.modal_edit_submit')}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <Modal title={t('super.users.modal_delete_title')} onClose={() => setDeleteTarget(null)}>
          <div className="space-y-4">
            <p className="text-sm th-text-secondary">
              {t('super.users.modal_delete_confirm_text')} <span className="font-semibold th-text-primary">{deleteTarget.email}</span>?
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteTarget(null)} className="px-3 py-2 text-sm text-slate-400 hover:th-text-primary">{t('super.users.modal_delete_cancel')}</button>
              <button
                onClick={handleDelete}
                disabled={submitting}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 th-text-primary text-sm rounded"
              >
                {submitting ? t('super.users.modal_delete_submitting') : t('super.users.modal_delete_submit')}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Reset password confirm */}
      {resetTarget && (
        <Modal title={t('super.users.modal_reset_title')} onClose={() => setResetTarget(null)}>
          <div className="space-y-4">
            <p className="text-sm th-text-secondary">
              {t('super.users.modal_reset_confirm_text')} <span className="font-semibold th-text-primary">{resetTarget.email}</span>?
            </p>
            <p className="text-xs text-slate-500">
              {t('super.users.modal_reset_hint')}
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setResetTarget(null)} className="px-3 py-2 text-sm text-slate-400 hover:th-text-primary">{t('super.users.modal_reset_cancel')}</button>
              <button
                onClick={handleReset}
                disabled={submitting}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 th-text-primary text-sm rounded"
              >
                {submitting ? t('super.users.modal_reset_submitting') : t('super.users.modal_reset_submit')}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
