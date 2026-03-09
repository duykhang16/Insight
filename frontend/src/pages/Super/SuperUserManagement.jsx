import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Pencil, Trash2, KeyRound, Check, AlertTriangle, X, ChevronDown, ChevronRight } from 'lucide-react';
import apiClient from '../../api/apiClient';

// ── constants ─────────────────────────────────────────────────────────────────

const VALID_ROLES = ['super_admin', 'tenant_admin', 'manager', 'viewer'];
const ROLE_LABEL = {
  super_admin: 'Super Admin',
  tenant_admin: 'Tenant Admin',
  manager: 'Manager',
  viewer: 'Viewer',
};
const ROLE_BADGE_COLOR = {
  super_admin: 'bg-purple-900/40 text-purple-300',
  tenant_admin: 'bg-blue-900/40 text-blue-300',
  manager: 'bg-emerald-900/40 text-emerald-300',
  viewer: 'bg-slate-700 text-slate-300',
};

// ── helpers ───────────────────────────────────────────────────────────────────

const getDomain = (email) => {
  const at = email.indexOf('@');
  return at >= 0 ? email.slice(at) : '';
};

function RoleBadge({ role }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${ROLE_BADGE_COLOR[role] || 'bg-slate-700 text-slate-300'}`}>
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
        className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
        placeholder={placeholder || 'user@domain.com'}
        value={value}
        onChange={handleChange}
        onFocus={() => { if (suggestions.length) setOpen(true); }}
        autoComplete="off"
      />
      {open && (
        <ul className="absolute top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-700 rounded shadow-xl z-50 max-h-40 overflow-y-auto">
          {suggestions.map((s) => (
            <li
              key={s}
              className="px-3 py-2 text-sm text-slate-300 hover:bg-slate-700 cursor-pointer"
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
      <div className="bg-[#0F172A] border border-slate-700 rounded-lg w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
          <h2 className="text-sm font-semibold text-white">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-4 h-4" /></button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SuperUserManagement() {
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
      setError(e?.response?.data?.detail || 'Không thể tải dữ liệu.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const allEmails = users.map(u => u.email);
  const tenantAdmins = users.filter(u => u.role === 'tenant_admin');
  const tenantMap = Object.fromEntries(tenants.map(t => [t.admin_email, t.name]));

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
      showToast('Tạo user thành công. User sẽ đặt mật khẩu khi đăng nhập lần đầu.');
      setCreateModal(false);
      fetchData();
    } catch (e) {
      showToast(e?.response?.data?.detail || 'Lỗi tạo user.', 'error');
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
      showToast('Cập nhật thành công.');
      setEditTarget(null);
      fetchData();
    } catch (e) {
      showToast(e?.response?.data?.detail || 'Lỗi cập nhật.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // ── delete
  const handleDelete = async () => {
    setSubmitting(true);
    try {
      await apiClient.delete(`/super/users/${deleteTarget.id}`);
      showToast('Đã xóa user.');
      setDeleteTarget(null);
      fetchData();
    } catch (e) {
      showToast(e?.response?.data?.detail || 'Lỗi xóa.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // ── reset password
  const handleReset = async () => {
    setSubmitting(true);
    try {
      await apiClient.post(`/super/users/${resetTarget.id}/reset-password`, {});
      showToast('Đã reset. User sẽ đặt mật khẩu mới khi đăng nhập.');
      setResetTarget(null);
      fetchData();
    } catch (e) {
      showToast(e?.response?.data?.detail || 'Lỗi reset.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-white">User Management</h1>
          <p className="text-xs text-slate-500 mt-0.5">Toàn bộ tài khoản hệ thống — Super Admin.</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
        >
          <Plus className="w-4 h-4" /> Thêm User
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
      <div className="bg-[#0F172A] border border-slate-800 rounded-lg overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-blue-500" />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-800/60">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Email</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Role</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Tenant</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Hành động</th>
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
                      <button onClick={() => openEdit(u)} className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-700 transition-colors" title="Chỉnh sửa">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setResetTarget(u)} className="p-1.5 rounded text-slate-400 hover:text-amber-400 hover:bg-slate-700 transition-colors" title="Reset mật khẩu">
                        <KeyRound className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setDeleteTarget(u)} className="p-1.5 rounded text-slate-400 hover:text-red-400 hover:bg-slate-700 transition-colors" title="Xóa">
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
                    <tr key={u.id} className={`border-t border-slate-800 transition-colors ${isSelf ? 'opacity-40' : 'hover:bg-slate-800/40'}`}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          {children.length > 0 ? (
                            <button
                              onClick={() => toggleCollapse(u.email)}
                              className="text-slate-500 hover:text-slate-300 transition-colors flex-shrink-0"
                            >
                              {isCollapsed
                                ? <ChevronRight className="w-3.5 h-3.5" />
                                : <ChevronDown className="w-3.5 h-3.5" />
                              }
                            </button>
                          ) : <span className="w-5 inline-block" />}
                          <span className="text-white font-mono text-xs">{u.email}</span>
                          {u.must_set_password && (
                            <span className="text-[10px] bg-yellow-900/40 text-yellow-400 px-1.5 py-0.5 rounded">Chưa đặt pass</span>
                          )}
                          {children.length > 0 && (
                            <span className="text-[10px] bg-blue-900/30 text-blue-400 px-1.5 py-0.5 rounded">
                              {children.length} sub
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3"><RoleBadge role={u.role} /></td>
                      <td className="px-4 py-3 text-slate-400 text-xs">{tenantName || '—'}</td>
                      <td className="px-4 py-3">
                        {u.isApproved
                          ? <span className="text-xs text-emerald-400">Active</span>
                          : <span className="text-xs text-yellow-400">Pending</span>}
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
                              <span className="text-slate-300 font-mono text-xs">{c.email}</span>
                              {c.must_set_password && (
                                <span className="text-[10px] bg-yellow-900/40 text-yellow-400 px-1.5 py-0.5 rounded">Chưa đặt pass</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-2.5"><RoleBadge role={c.role} /></td>
                          <td className="px-4 py-2.5 text-slate-500 text-xs">{tenantName || u.email}</td>
                          <td className="px-4 py-2.5">
                            {c.isApproved
                              ? <span className="text-xs text-emerald-400">Active</span>
                              : <span className="text-xs text-yellow-400">Pending</span>}
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
        <Modal title="Thêm User mới" onClose={() => setCreateModal(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Email *</label>
              <EmailInput
                value={formEmail}
                onChange={setFormEmail}
                existingEmails={allEmails}
                placeholder="user@company.com"
              />
              <p className="text-[10px] text-slate-500 mt-1">User sẽ tự đặt mật khẩu khi đăng nhập lần đầu.</p>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Role *</label>
              <select
                className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                value={formRole}
                onChange={e => setFormRole(e.target.value)}
              >
                {VALID_ROLES.map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </select>
            </div>
            {['manager', 'viewer'].includes(formRole) && (
              <div>
                <label className="block text-xs text-slate-400 mb-1">Tenant Admin (parent)</label>
                <select
                  className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                  value={formParent}
                  onChange={e => setFormParent(e.target.value)}
                >
                  <option value="">— Không gán —</option>
                  {tenantAdmins.map(u => (
                    <option key={u.email} value={u.email}>
                      {u.email}{tenantMap[u.email] ? ` (${tenantMap[u.email]})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setCreateModal(false)} className="px-3 py-2 text-sm text-slate-400 hover:text-white">Hủy</button>
              <button
                onClick={handleCreate}
                disabled={!formEmail.trim() || submitting}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm rounded"
              >
                {submitting ? 'Đang tạo...' : 'Tạo User'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Edit modal */}
      {editTarget && (
        <Modal title={`Chỉnh sửa: ${editTarget.email}`} onClose={() => setEditTarget(null)}>
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Role</label>
              <select
                className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                value={formRole}
                onChange={e => setFormRole(e.target.value)}
              >
                {VALID_ROLES.map(r => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </select>
            </div>
            {['manager', 'viewer'].includes(formRole) && (
              <div>
                <label className="block text-xs text-slate-400 mb-1">Tenant Admin (parent)</label>
                <select
                  className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                  value={formParent}
                  onChange={e => setFormParent(e.target.value)}
                >
                  <option value="">— Không gán —</option>
                  {tenantAdmins.map(u => (
                    <option key={u.email} value={u.email}>
                      {u.email}{tenantMap[u.email] ? ` (${tenantMap[u.email]})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setEditTarget(null)} className="px-3 py-2 text-sm text-slate-400 hover:text-white">Hủy</button>
              <button
                onClick={handleEdit}
                disabled={submitting}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm rounded"
              >
                {submitting ? 'Đang lưu...' : 'Lưu'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <Modal title="Xác nhận xóa User" onClose={() => setDeleteTarget(null)}>
          <div className="space-y-4">
            <p className="text-sm text-slate-300">
              Bạn có chắc muốn xóa tài khoản <span className="font-semibold text-white">{deleteTarget.email}</span>?
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteTarget(null)} className="px-3 py-2 text-sm text-slate-400 hover:text-white">Hủy</button>
              <button
                onClick={handleDelete}
                disabled={submitting}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm rounded"
              >
                {submitting ? 'Đang xóa...' : 'Xóa'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Reset password confirm */}
      {resetTarget && (
        <Modal title="Reset mật khẩu" onClose={() => setResetTarget(null)}>
          <div className="space-y-4">
            <p className="text-sm text-slate-300">
              Reset mật khẩu của <span className="font-semibold text-white">{resetTarget.email}</span>?
            </p>
            <p className="text-xs text-slate-500">
              Sau khi reset, user sẽ được yêu cầu đặt mật khẩu mới khi đăng nhập lần tiếp theo.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setResetTarget(null)} className="px-3 py-2 text-sm text-slate-400 hover:text-white">Hủy</button>
              <button
                onClick={handleReset}
                disabled={submitting}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-sm rounded"
              >
                {submitting ? 'Đang reset...' : 'Reset mật khẩu'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
