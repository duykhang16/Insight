import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil, Trash2, UserCheck, AlertTriangle, X, Check, ChevronDown } from 'lucide-react';
import apiClient from '../../api/apiClient';
import { useLanguage } from '../../context/LanguageContext';

// ── helpers ──────────────────────────────────────────────────────────────────

const badge = (text, color) => (
  <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${color}`}>
    {text}
  </span>
);

// ── sub-components ────────────────────────────────────────────────────────────

function TenantRow({ tenant, allUsers, onEdit, onDelete, onAssignAdmin, refreshing }) {
  const { t } = useLanguage();
  const admin = allUsers.find(u => u.email === tenant.admin_email);

  return (
    <tr className="border-t th-border hover:th-bg-surface-alt transition-colors">
      <td className="px-4 py-3 font-medium th-text-primary">{tenant.name}</td>
      <td className="px-4 py-3 text-slate-400 text-sm">{tenant.note || '—'}</td>
      <td className="px-4 py-3">
        {tenant.admin_email ? (
          <div>
            <div className="text-sm text-blue-400">{tenant.admin_email}</div>
            {admin && <div className="text-xs text-slate-500">{admin.isApproved ? t('super.tenants.status_approved') : t('super.tenants.status_pending')}</div>}
          </div>
        ) : (
          badge(t('super.tenants.no_admin_badge'), 'bg-yellow-900/40 text-yellow-400')
        )}
      </td>
      <td className="px-4 py-3 text-slate-400 text-sm">{tenant.user_count ?? 0}</td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => onAssignAdmin(tenant)}
            className="p-1.5 rounded text-slate-400 hover:text-blue-400 hover:bg-slate-700 transition-colors"
            title={t('super.tenants.button_tooltip_assign')}
          >
            <UserCheck className="w-4 h-4" />
          </button>
          <button
            onClick={() => onEdit(tenant)}
            className="p-1.5 rounded text-slate-400 hover:th-text-primary hover:bg-slate-700 transition-colors"
            title={t('super.tenants.button_tooltip_edit')}
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            onClick={() => onDelete(tenant)}
            className="p-1.5 rounded text-slate-400 hover:text-red-400 hover:bg-slate-700 transition-colors"
            title={t('super.tenants.button_tooltip_delete')}
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="th-bg-surface border th-border rounded-lg w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b th-border">
          <h2 className="text-sm font-semibold th-text-primary">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:th-text-primary transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export default function TenantManagement() {
  const { t } = useLanguage();
  const [tenants, setTenants] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // modal state
  const [createModal, setCreateModal] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [assignTarget, setAssignTarget] = useState(null);

  // form fields
  const [formName, setFormName] = useState('');
  const [formNote, setFormNote] = useState('');
  const [assignEmail, setAssignEmail] = useState('');
  const [assignWarning, setAssignWarning] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [tenantsRes, usersRes] = await Promise.all([
        apiClient.get('/super/tenants'),
        apiClient.get('/super/users'),
      ]);
      setTenants(tenantsRes.data);
      setAllUsers(usersRes.data);
    } catch (e) {
      setError(e?.response?.data?.detail || t('super.tenants.error_load_data'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── tenant_admin candidates
  const adminCandidates = allUsers.filter(u => u.role === 'tenant_admin');

  // ── create tenant
  const handleCreate = async () => {
    if (!formName.trim()) return;
    setSubmitting(true);
    try {
      await apiClient.post('/super/tenants', { name: formName, note: formNote });
      showToast(t('super.tenants.toast_create_success'));
      setCreateModal(false);
      setFormName(''); setFormNote('');
      fetchData();
    } catch (e) {
      showToast(e?.response?.data?.detail || t('super.tenants.toast_create_error'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // ── edit tenant
  const openEdit = (tenant) => { setEditTarget(tenant); setFormName(tenant.name); setFormNote(tenant.note || ''); };
  const handleEdit = async () => {
    setSubmitting(true);
    try {
      await apiClient.put(`/super/tenants/${editTarget.id}`, { name: formName, note: formNote });
      showToast(t('super.tenants.toast_update_success'));
      setEditTarget(null);
      fetchData();
    } catch (e) {
      showToast(e?.response?.data?.detail || t('super.tenants.toast_update_error'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // ── delete tenant
  const handleDelete = async () => {
    setSubmitting(true);
    try {
      await apiClient.delete(`/super/tenants/${deleteTarget.id}`);
      showToast(t('super.tenants.toast_delete_success'));
      setDeleteTarget(null);
      fetchData();
    } catch (e) {
      showToast(e?.response?.data?.detail || t('super.tenants.toast_delete_error'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // ── assign admin
  const openAssign = (tenant) => { setAssignTarget(tenant); setAssignEmail(tenant.admin_email || ''); setAssignWarning(''); };
  const handleAssign = async () => {
    if (!assignEmail) return;
    setSubmitting(true);
    try {
      const res = await apiClient.post(`/super/tenants/${assignTarget.id}/assign-admin`, { admin_email: assignEmail });
      if (res.data.warning) setAssignWarning(res.data.warning);
      else {
        showToast(t('super.tenants.toast_assign_success'));
        setAssignTarget(null);
        setAssignWarning('');
        fetchData();
      }
    } catch (e) {
      showToast(e?.response?.data?.detail || t('super.tenants.toast_assign_error'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const confirmAssignDespiteWarning = async () => {
    // user acknowledged the warning — force assign
    setSubmitting(true);
    try {
      await apiClient.post(`/super/tenants/${assignTarget.id}/assign-admin`, { admin_email: assignEmail });
      showToast(t('super.tenants.toast_assign_override_success'));
      setAssignTarget(null);
      setAssignWarning('');
      fetchData();
    } catch (e) {
      showToast(e?.response?.data?.detail || t('super.tenants.toast_assign_error'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold th-text-primary">{t('super.tenants.title')}</h1>
          <p className="text-xs text-slate-500 mt-0.5">{t('super.tenants.subtitle')}</p>
        </div>
        <button
          onClick={() => { setCreateModal(true); setFormName(''); setFormNote(''); }}
          className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 th-text-primary text-sm rounded transition-colors"
        >
          <Plus className="w-4 h-4" /> {t('super.tenants.add_button')}
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

      {/* Error */}
      {error && (
        <div className="bg-red-900/20 border border-red-800 text-red-400 text-sm px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="th-bg-surface border th-border rounded-lg overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-blue-500" />
          </div>
        ) : tenants.length === 0 ? (
          <div className="text-center py-12 text-slate-500 text-sm">{t('super.tenants.empty_state')}</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="th-bg-surface-alt">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">{t('super.tenants.table_header_name')}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">{t('super.tenants.table_header_notes')}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">{t('super.tenants.table_header_admin')}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">{t('super.tenants.table_header_users')}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">{t('super.tenants.table_header_actions')}</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map(tenant => (
                <TenantRow
                  key={tenant.id}
                  tenant={tenant}
                  allUsers={allUsers}
                  onEdit={openEdit}
                  onDelete={setDeleteTarget}
                  onAssignAdmin={openAssign}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create modal */}
      {createModal && (
        <Modal title={t('super.tenants.modal_create_title')} onClose={() => setCreateModal(false)}>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">{t('super.tenants.modal_create_name_label')}</label>
              <input
                className="w-full th-bg-elevated border th-border rounded px-3 py-2 text-sm th-text-primary placeholder-slate-500 focus:outline-none focus:border-blue-500"
                placeholder={t('super.tenants.modal_create_name_placeholder')}
                value={formName}
                onChange={e => setFormName(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">{t('super.tenants.modal_create_notes_label')}</label>
              <textarea
                className="w-full th-bg-elevated border th-border rounded px-3 py-2 text-sm th-text-primary placeholder-slate-500 focus:outline-none focus:border-blue-500"
                rows={2}
                placeholder={t('super.tenants.modal_create_notes_placeholder')}
                value={formNote}
                onChange={e => setFormNote(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setCreateModal(false)} className="px-3 py-2 text-sm text-slate-400 hover:th-text-primary transition-colors">{t('super.tenants.modal_create_cancel')}</button>
              <button
                onClick={handleCreate}
                disabled={!formName.trim() || submitting}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 th-text-primary text-sm rounded transition-colors"
              >
                {submitting ? t('super.tenants.modal_create_submitting') : t('super.tenants.modal_create_submit')}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Edit modal */}
      {editTarget && (
        <Modal title={`${t('super.tenants.modal_edit_title')}: ${editTarget.name}`} onClose={() => setEditTarget(null)}>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">{t('super.tenants.modal_edit_name_label')}</label>
              <input
                className="w-full th-bg-elevated border th-border rounded px-3 py-2 text-sm th-text-primary focus:outline-none focus:border-blue-500"
                value={formName}
                onChange={e => setFormName(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">{t('super.tenants.modal_edit_notes_label')}</label>
              <textarea
                className="w-full th-bg-elevated border th-border rounded px-3 py-2 text-sm th-text-primary focus:outline-none focus:border-blue-500"
                rows={2}
                value={formNote}
                onChange={e => setFormNote(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setEditTarget(null)} className="px-3 py-2 text-sm text-slate-400 hover:th-text-primary transition-colors">{t('super.tenants.modal_edit_cancel')}</button>
              <button
                onClick={handleEdit}
                disabled={!formName.trim() || submitting}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 th-text-primary text-sm rounded transition-colors"
              >
                {submitting ? t('super.tenants.modal_edit_submitting') : t('super.tenants.modal_edit_submit')}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete confirm modal */}
      {deleteTarget && (
        <Modal title={t('super.tenants.modal_delete_title')} onClose={() => setDeleteTarget(null)}>
          <div className="space-y-4">
            <p className="text-sm th-text-secondary">
              {t('super.tenants.modal_delete_confirm_text')} <span className="font-semibold th-text-primary">"{deleteTarget.name}"</span>?
              {deleteTarget.admin_email && (
                <span className="block mt-1 text-yellow-400 text-xs">
                  {t('super.tenants.modal_delete_has_admin_text')} {deleteTarget.admin_email}
                </span>
              )}
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteTarget(null)} className="px-3 py-2 text-sm text-slate-400 hover:th-text-primary transition-colors">{t('super.tenants.modal_delete_cancel')}</button>
              <button
                onClick={handleDelete}
                disabled={submitting}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 th-text-primary text-sm rounded transition-colors"
              >
                {submitting ? t('super.tenants.modal_delete_submitting') : t('super.tenants.modal_delete_submit')}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Assign admin modal */}
      {assignTarget && (
        <Modal title={`${t('super.tenants.modal_assign_title')}: ${assignTarget.name}`} onClose={() => { setAssignTarget(null); setAssignWarning(''); }}>
          <div className="space-y-4">
            {assignWarning && (
              <div className="bg-yellow-900/30 border border-yellow-700 text-yellow-300 text-xs px-3 py-2 rounded flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <div>
                  <div className="font-semibold mb-1">{t('super.tenants.modal_assign_warning_title')}</div>
                  <div>{assignWarning}</div>
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={confirmAssignDespiteWarning}
                      disabled={submitting}
                      className="px-3 py-1.5 bg-yellow-700 hover:bg-yellow-600 th-text-primary text-xs rounded transition-colors"
                    >
                      {t('super.tenants.modal_assign_warning_confirm')}
                    </button>
                    <button
                      onClick={() => setAssignWarning('')}
                      className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 th-text-secondary text-xs rounded transition-colors"
                    >
                      {t('super.tenants.modal_assign_warning_cancel')}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {!assignWarning && (
              <>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">{t('super.tenants.modal_assign_label')}</label>
                  {adminCandidates.length === 0 ? (
                    <p className="text-xs text-slate-500">{t('super.tenants.modal_assign_no_candidates')}</p>
                  ) : (
                    <select
                      className="w-full th-bg-elevated border th-border rounded px-3 py-2 text-sm th-text-primary focus:outline-none focus:border-blue-500"
                      value={assignEmail}
                      onChange={e => setAssignEmail(e.target.value)}
                    >
                      <option value="">{t('super.tenants.modal_assign_select_placeholder')}</option>
                      {adminCandidates.map(u => (
                        <option key={u.email} value={u.email}>{u.email}</option>
                      ))}
                    </select>
                  )}
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => { setAssignTarget(null); setAssignWarning(''); }}
                    className="px-3 py-2 text-sm text-slate-400 hover:th-text-primary transition-colors"
                  >
                    {t('super.tenants.modal_assign_cancel')}
                  </button>
                  <button
                    onClick={handleAssign}
                    disabled={!assignEmail || submitting}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 th-text-primary text-sm rounded transition-colors"
                  >
                    {submitting ? t('super.tenants.modal_assign_submitting') : t('super.tenants.modal_assign_submit')}
                  </button>
                </div>
              </>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
