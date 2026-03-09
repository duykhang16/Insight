import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil, Trash2, UserCheck, AlertTriangle, X, Check, ChevronDown } from 'lucide-react';
import apiClient from '../../api/apiClient';

// ── helpers ──────────────────────────────────────────────────────────────────

const badge = (text, color) => (
  <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${color}`}>
    {text}
  </span>
);

// ── sub-components ────────────────────────────────────────────────────────────

function TenantRow({ tenant, allUsers, onEdit, onDelete, onAssignAdmin, refreshing }) {
  const admin = allUsers.find(u => u.email === tenant.admin_email);

  return (
    <tr className="border-t border-slate-800 hover:bg-slate-800/40 transition-colors">
      <td className="px-4 py-3 font-medium text-white">{tenant.name}</td>
      <td className="px-4 py-3 text-slate-400 text-sm">{tenant.note || '—'}</td>
      <td className="px-4 py-3">
        {tenant.admin_email ? (
          <div>
            <div className="text-sm text-blue-400">{tenant.admin_email}</div>
            {admin && <div className="text-xs text-slate-500">{admin.isApproved ? 'Approved' : 'Pending'}</div>}
          </div>
        ) : (
          badge('Chưa có Admin', 'bg-yellow-900/40 text-yellow-400')
        )}
      </td>
      <td className="px-4 py-3 text-slate-400 text-sm">{tenant.user_count ?? 0}</td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => onAssignAdmin(tenant)}
            className="p-1.5 rounded text-slate-400 hover:text-blue-400 hover:bg-slate-700 transition-colors"
            title="Gán Tenant Admin"
          >
            <UserCheck className="w-4 h-4" />
          </button>
          <button
            onClick={() => onEdit(tenant)}
            className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
            title="Chỉnh sửa"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            onClick={() => onDelete(tenant)}
            className="p-1.5 rounded text-slate-400 hover:text-red-400 hover:bg-slate-700 transition-colors"
            title="Xóa"
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
      <div className="bg-[#0F172A] border border-slate-700 rounded-lg w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
          <h2 className="text-sm font-semibold text-white">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
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
      setError(e?.response?.data?.detail || 'Không thể tải dữ liệu.');
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
      showToast('Tạo tenant thành công.');
      setCreateModal(false);
      setFormName(''); setFormNote('');
      fetchData();
    } catch (e) {
      showToast(e?.response?.data?.detail || 'Lỗi tạo tenant.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // ── edit tenant
  const openEdit = (t) => { setEditTarget(t); setFormName(t.name); setFormNote(t.note || ''); };
  const handleEdit = async () => {
    setSubmitting(true);
    try {
      await apiClient.put(`/super/tenants/${editTarget.id}`, { name: formName, note: formNote });
      showToast('Cập nhật thành công.');
      setEditTarget(null);
      fetchData();
    } catch (e) {
      showToast(e?.response?.data?.detail || 'Lỗi cập nhật.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // ── delete tenant
  const handleDelete = async () => {
    setSubmitting(true);
    try {
      await apiClient.delete(`/super/tenants/${deleteTarget.id}`);
      showToast('Đã xóa tenant.');
      setDeleteTarget(null);
      fetchData();
    } catch (e) {
      showToast(e?.response?.data?.detail || 'Lỗi xóa tenant.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // ── assign admin
  const openAssign = (t) => { setAssignTarget(t); setAssignEmail(t.admin_email || ''); setAssignWarning(''); };
  const handleAssign = async () => {
    if (!assignEmail) return;
    setSubmitting(true);
    try {
      const res = await apiClient.post(`/super/tenants/${assignTarget.id}/assign-admin`, { admin_email: assignEmail });
      if (res.data.warning) setAssignWarning(res.data.warning);
      else {
        showToast('Đã gán Tenant Admin.');
        setAssignTarget(null);
        setAssignWarning('');
        fetchData();
      }
    } catch (e) {
      showToast(e?.response?.data?.detail || 'Lỗi gán admin.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const confirmAssignDespiteWarning = async () => {
    // user acknowledged the warning — force assign
    setSubmitting(true);
    try {
      await apiClient.post(`/super/tenants/${assignTarget.id}/assign-admin`, { admin_email: assignEmail });
      showToast('Đã gán Tenant Admin (override).');
      setAssignTarget(null);
      setAssignWarning('');
      fetchData();
    } catch (e) {
      showToast(e?.response?.data?.detail || 'Lỗi gán admin.', 'error');
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
          <h1 className="text-lg font-bold text-white">Tenant Management</h1>
          <p className="text-xs text-slate-500 mt-0.5">Quản lý danh sách khách hàng / công ty và Tenant Admin của từng tenant.</p>
        </div>
        <button
          onClick={() => { setCreateModal(true); setFormName(''); setFormNote(''); }}
          className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
        >
          <Plus className="w-4 h-4" /> Thêm Tenant
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
      <div className="bg-[#0F172A] border border-slate-800 rounded-lg overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-blue-500" />
          </div>
        ) : tenants.length === 0 ? (
          <div className="text-center py-12 text-slate-500 text-sm">Chưa có tenant nào.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-800/60">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Tên Tenant</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Ghi chú</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Tenant Admin</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Users</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Hành động</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map(t => (
                <TenantRow
                  key={t.id}
                  tenant={t}
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
        <Modal title="Thêm Tenant mới" onClose={() => setCreateModal(false)}>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Tên Tenant *</label>
              <input
                className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                placeholder="VD: Công ty ABC"
                value={formName}
                onChange={e => setFormName(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Ghi chú</label>
              <textarea
                className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                rows={2}
                placeholder="Tuỳ chọn"
                value={formNote}
                onChange={e => setFormNote(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setCreateModal(false)} className="px-3 py-2 text-sm text-slate-400 hover:text-white transition-colors">Hủy</button>
              <button
                onClick={handleCreate}
                disabled={!formName.trim() || submitting}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm rounded transition-colors"
              >
                {submitting ? 'Đang tạo...' : 'Tạo'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Edit modal */}
      {editTarget && (
        <Modal title={`Chỉnh sửa: ${editTarget.name}`} onClose={() => setEditTarget(null)}>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Tên Tenant *</label>
              <input
                className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                value={formName}
                onChange={e => setFormName(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Ghi chú</label>
              <textarea
                className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                rows={2}
                value={formNote}
                onChange={e => setFormNote(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setEditTarget(null)} className="px-3 py-2 text-sm text-slate-400 hover:text-white transition-colors">Hủy</button>
              <button
                onClick={handleEdit}
                disabled={!formName.trim() || submitting}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm rounded transition-colors"
              >
                {submitting ? 'Đang lưu...' : 'Lưu'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete confirm modal */}
      {deleteTarget && (
        <Modal title="Xác nhận xóa Tenant" onClose={() => setDeleteTarget(null)}>
          <div className="space-y-4">
            <p className="text-sm text-slate-300">
              Bạn có chắc muốn xóa tenant <span className="font-semibold text-white">"{deleteTarget.name}"</span>?
              {deleteTarget.admin_email && (
                <span className="block mt-1 text-yellow-400 text-xs">
                  Tenant này đang có Tenant Admin: {deleteTarget.admin_email}
                </span>
              )}
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteTarget(null)} className="px-3 py-2 text-sm text-slate-400 hover:text-white transition-colors">Hủy</button>
              <button
                onClick={handleDelete}
                disabled={submitting}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm rounded transition-colors"
              >
                {submitting ? 'Đang xóa...' : 'Xóa'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Assign admin modal */}
      {assignTarget && (
        <Modal title={`Gán Tenant Admin: ${assignTarget.name}`} onClose={() => { setAssignTarget(null); setAssignWarning(''); }}>
          <div className="space-y-4">
            {assignWarning && (
              <div className="bg-yellow-900/30 border border-yellow-700 text-yellow-300 text-xs px-3 py-2 rounded flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <div>
                  <div className="font-semibold mb-1">Cảnh báo</div>
                  <div>{assignWarning}</div>
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={confirmAssignDespiteWarning}
                      disabled={submitting}
                      className="px-3 py-1.5 bg-yellow-700 hover:bg-yellow-600 text-white text-xs rounded transition-colors"
                    >
                      Xác nhận chuyển
                    </button>
                    <button
                      onClick={() => setAssignWarning('')}
                      className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs rounded transition-colors"
                    >
                      Chọn lại
                    </button>
                  </div>
                </div>
              </div>
            )}

            {!assignWarning && (
              <>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Chọn Tenant Admin</label>
                  {adminCandidates.length === 0 ? (
                    <p className="text-xs text-slate-500">Không có user nào có role tenant_admin.</p>
                  ) : (
                    <select
                      className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                      value={assignEmail}
                      onChange={e => setAssignEmail(e.target.value)}
                    >
                      <option value="">-- Chọn email --</option>
                      {adminCandidates.map(u => (
                        <option key={u.email} value={u.email}>{u.email}</option>
                      ))}
                    </select>
                  )}
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => { setAssignTarget(null); setAssignWarning(''); }}
                    className="px-3 py-2 text-sm text-slate-400 hover:text-white transition-colors"
                  >
                    Hủy
                  </button>
                  <button
                    onClick={handleAssign}
                    disabled={!assignEmail || submitting}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm rounded transition-colors"
                  >
                    {submitting ? 'Đang gán...' : 'Gán Admin'}
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
