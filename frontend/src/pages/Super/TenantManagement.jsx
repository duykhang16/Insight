import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Pencil, AlertTriangle, X, Check, PauseCircle, PlayCircle } from 'lucide-react';
import apiClient from '../../api/apiClient';
import { useLanguage } from '../../context/LanguageContext';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';

// ── sub-components ────────────────────────────────────────────────────────────

function Modal({ title, onClose, children }) {
  return createPortal(
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="th-bg-surface border th-border rounded-lg w-full max-w-xl shadow-xl max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b th-border">
          <h2 className="text-sm font-semibold th-text-primary pr-4">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:th-text-primary transition-colors shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 py-4 max-h-[calc(90vh-72px)] overflow-y-auto">{children}</div>
      </div>
    </div>,
    document.body
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

  // form fields
  const [formName, setFormName] = useState('');
  const [formNote, setFormNote] = useState('');
  const [formOwnerEmail, setFormOwnerEmail] = useState('');
  const [formPrimaryContactEmail, setFormPrimaryContactEmail] = useState('');
  const [formNotificationEmails, setFormNotificationEmails] = useState('');
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
      setTenants((tenantsRes.data || []).map((tenant) => ({
        ...tenant,
        notification_emails_text: Array.isArray(tenant.notification_emails)
          ? tenant.notification_emails.join(', ')
          : '',
      })));
      setAllUsers(usersRes.data);
    } catch (e) {
      setError(e?.response?.data?.detail || t('super.tenants.error_load_data'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const resetBrandForm = () => {
    setFormName('');
    setFormNote('');
    setFormOwnerEmail('');
    setFormPrimaryContactEmail('');
    setFormNotificationEmails('');
  };

  const buildNotificationEmailArray = () =>
    formNotificationEmails
      .split(/[\n,;]+/)
      .map((value) => value.trim())
      .filter(Boolean);

  // ── create tenant
  const handleCreate = async () => {
    if (!formName.trim() || !formOwnerEmail.trim()) return;
    setSubmitting(true);
    try {
      await apiClient.post('/super/tenants', {
        name: formName,
        note: formNote,
        owner_email: formOwnerEmail,
        primary_contact_email: formOwnerEmail,
        notification_emails: buildNotificationEmailArray(),
      });
      showToast(t('super.tenants.toast_create_success'));
      setCreateModal(false);
      resetBrandForm();
      fetchData();
    } catch (e) {
      showToast(e?.response?.data?.detail || t('super.tenants.toast_create_error'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // ── edit tenant
  const openEdit = (tenant) => {
    setEditTarget(tenant);
    setFormName(tenant.name);
    setFormNote(tenant.note || '');
    setFormPrimaryContactEmail(tenant.primary_contact_email || '');
    setFormNotificationEmails(
      Array.isArray(tenant.notification_emails) ? tenant.notification_emails.join(', ') : ''
    );
  };
  const handleEdit = async () => {
    setSubmitting(true);
    try {
      await apiClient.put(`/super/tenants/${editTarget.id}`, {
        name: formName,
        note: formNote,
        primary_contact_email: formPrimaryContactEmail,
        notification_emails: buildNotificationEmailArray(),
      });
      showToast(t('super.tenants.toast_update_success'));
      setEditTarget(null);
      resetBrandForm();
      fetchData();
    } catch (e) {
      showToast(e?.response?.data?.detail || t('super.tenants.toast_update_error'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (tenant) => {
    setSubmitting(true);
    try {
      const action = tenant.subscription_status === 'suspended' ? 'activate' : 'suspend';
      await apiClient.post(`/super/tenants/${tenant.id}/${action}`);
      showToast(action === 'activate' ? 'Brand reactivated.' : 'Brand suspended.');
      fetchData();
    } catch (e) {
      showToast(e?.response?.data?.detail || 'Error updating brand status.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // ── column definitions ──
  const columns = [
    {
      key: 'name',
      label: t('super.tenants.table_header_name'),
      sortable: true,
      className: 'font-medium th-text-primary',
    },
    {
      key: 'note',
      label: t('super.tenants.table_header_notes'),
      className: 'text-slate-400 text-sm',
      render: (tenant) => tenant.note || '—',
    },
    {
      key: 'primary_contact_email',
      label: t('super.tenants.table_header_contacts'),
      render: (tenant) => (
        <div className="min-w-0">
          <div className="text-sm th-text-primary truncate">
            {tenant.primary_contact_email || '—'}
          </div>
          <div className="text-xs text-slate-500 truncate">
            {tenant.notification_emails?.length > 1
              ? t('super.tenants.contacts_extra_count').replace('{count}', tenant.notification_emails.length - 1)
              : (tenant.notification_emails?.length === 1
                  ? t('super.tenants.contacts_primary_only')
                  : t('super.tenants.contacts_missing'))}
          </div>
        </div>
      ),
    },
    {
      key: 'admin_email',
      label: t('super.tenants.table_header_admin'),
      sortable: true,
      render: (tenant) => {
        const admin = allUsers.find(u => u.email === tenant.admin_email);
        if (tenant.admin_email) {
          return (
            <div>
              <div className="text-sm text-blue-400">{tenant.admin_email}</div>
              {admin && (
                <div className="text-xs text-slate-500">
                  {admin.isApproved ? t('super.tenants.status_approved') : t('super.tenants.status_pending')}
                </div>
              )}
            </div>
          );
        }
        return <Badge variant="outline" className="bg-yellow-900/40 text-yellow-400 border-yellow-500/30">{t('super.tenants.no_admin_badge')}</Badge>;
      },
    },
    {
      key: 'user_count',
      label: t('super.tenants.table_header_users'),
      sortable: true,
      className: 'text-slate-400 text-sm',
      render: (tenant) => tenant.user_count ?? 0,
    },
    {
      key: 'subscription_status',
      label: 'Status',
      sortable: true,
      className: 'text-slate-400 text-sm',
      render: (tenant) => tenant.subscription_status === 'suspended'
        ? <Badge variant="outline" className="bg-amber-900/40 text-amber-300 border-amber-700/30">Suspended</Badge>
        : <Badge variant="outline" className="bg-emerald-900/40 text-emerald-300 border-emerald-700/30">Active</Badge>,
    },
  ];

  const renderActions = (tenant) => (
    <div className="flex items-center gap-2">
      <button
        onClick={() => openEdit(tenant)}
        className="p-1.5 rounded text-slate-400 hover:th-text-primary hover:bg-slate-700 transition-colors"
        title={t('super.tenants.button_tooltip_edit')}
      >
        <Pencil className="w-4 h-4" />
      </button>
      <button
        onClick={() => handleToggleStatus(tenant)}
        className="p-1.5 rounded text-slate-400 hover:text-amber-400 hover:bg-slate-700 transition-colors"
        title={tenant.subscription_status === 'suspended' ? 'Reactivate brand' : 'Suspend brand'}
      >
        {tenant.subscription_status === 'suspended' ? <PlayCircle className="w-4 h-4" /> : <PauseCircle className="w-4 h-4" />}
      </button>
    </div>
  );

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
          onClick={() => { setCreateModal(true); resetBrandForm(); }}
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
      <DataTable
        columns={columns}
        data={tenants}
        keyExtractor={t => t.id}
        emptyMessage={t('super.tenants.empty_state')}
        loading={loading}
        searchable
        searchKeys={['name', 'admin_email', 'note', 'primary_contact_email', 'notification_emails_text']}
        searchPlaceholder={`${t('super.tenants.table_header_name')}, ${t('super.tenants.table_header_admin')}...`}
        actions={renderActions}
      />

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
            <div>
              <label className="block text-xs text-slate-400 mb-1">{t('super.tenants.modal_create_owner_email_label')}</label>
              <input
                type="email"
                className="w-full th-bg-elevated border th-border rounded px-3 py-2 text-sm th-text-primary placeholder-slate-500 focus:outline-none focus:border-blue-500"
                placeholder={t('super.tenants.modal_create_owner_email_placeholder')}
                value={formOwnerEmail}
                onChange={e => setFormOwnerEmail(e.target.value)}
              />
              <p className="text-[11px] text-slate-500 mt-1">{t('super.tenants.modal_create_owner_email_hint')}</p>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">{t('super.tenants.modal_create_notification_emails_label')}</label>
              <textarea
                className="w-full th-bg-elevated border th-border rounded px-3 py-2 text-sm th-text-primary placeholder-slate-500 focus:outline-none focus:border-blue-500"
                rows={3}
                placeholder={t('super.tenants.modal_create_notification_emails_placeholder')}
                value={formNotificationEmails}
                onChange={e => setFormNotificationEmails(e.target.value)}
              />
              <p className="text-[11px] text-slate-500 mt-1">{t('super.tenants.modal_create_notification_emails_hint')}</p>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setCreateModal(false)} className="px-3 py-2 text-sm text-slate-400 hover:th-text-primary transition-colors">{t('super.tenants.modal_create_cancel')}</button>
              <button
                onClick={handleCreate}
                disabled={!formName.trim() || !formOwnerEmail.trim() || submitting}
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
            <div>
              <label className="block text-xs text-slate-400 mb-1">{t('super.tenants.modal_edit_primary_contact_label')}</label>
              <input
                type="email"
                className="w-full th-bg-elevated border th-border rounded px-3 py-2 text-sm th-text-primary focus:outline-none focus:border-blue-500"
                value={formPrimaryContactEmail}
                onChange={e => setFormPrimaryContactEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">{t('super.tenants.modal_edit_notification_emails_label')}</label>
              <textarea
                className="w-full th-bg-elevated border th-border rounded px-3 py-2 text-sm th-text-primary focus:outline-none focus:border-blue-500"
                rows={3}
                value={formNotificationEmails}
                onChange={e => setFormNotificationEmails(e.target.value)}
              />
              <p className="text-[11px] text-slate-500 mt-1">{t('super.tenants.modal_edit_notification_emails_hint')}</p>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setEditTarget(null)} className="px-3 py-2 text-sm text-slate-400 hover:th-text-primary transition-colors">{t('super.tenants.modal_edit_cancel')}</button>
              <button
                onClick={handleEdit}
                disabled={!formName.trim() || !formPrimaryContactEmail.trim() || submitting}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 th-text-primary text-sm rounded transition-colors"
              >
                {submitting ? t('super.tenants.modal_edit_submitting') : t('super.tenants.modal_edit_submit')}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
