import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { AlertTriangle, Building2, Check, KeyRound, Search, Users, X, CornerDownRight } from 'lucide-react';
import apiClient from '../../api/apiClient';
import { useLanguage } from '../../context/LanguageContext';
import { Badge } from '@/components/ui/badge';

const MANAGED_ROLES = ['admin', 'viewer', 'delegator'];

const ROLE_BADGE_VARIANT = {
  brand_admin: 'bg-blue-900/40 text-blue-300 border-blue-500/30',
  admin: 'bg-emerald-900/40 text-emerald-300 border-emerald-500/30',
  viewer: 'bg-slate-700 th-text-secondary border-slate-600',
  delegator: 'bg-amber-900/40 text-amber-300 border-amber-500/30',
};
const ROLE_ORDER = {
  admin: 0,
  viewer: 1,
  delegator: 2,
};

function buildHierarchyList(users) {
  const childrenByParent = new Map();
  const admins = [];
  const leftovers = [];

  users.forEach((user) => {
    if (user.role === 'admin') {
      admins.push(user);
      return;
    }
    if (user.parent_admin_id) {
      const list = childrenByParent.get(user.parent_admin_id) || [];
      list.push(user);
      childrenByParent.set(user.parent_admin_id, list);
      return;
    }
    leftovers.push(user);
  });

  admins.sort((a, b) => a.email.localeCompare(b.email));
  leftovers.sort((a, b) => a.email.localeCompare(b.email));
  childrenByParent.forEach((children) => {
    children.sort((a, b) => {
      const roleDiff = (ROLE_ORDER[a.role] ?? 99) - (ROLE_ORDER[b.role] ?? 99);
      if (roleDiff !== 0) return roleDiff;
      return a.email.localeCompare(b.email);
    });
  });

  const ordered = [];
  const seen = new Set();

  admins.forEach((admin) => {
    ordered.push({ user: admin, level: 1 });
    seen.add(admin.id);
    (childrenByParent.get(admin.email) || []).forEach((child) => {
      ordered.push({ user: child, level: 2 });
      seen.add(child.id);
    });
  });

  leftovers.forEach((user) => {
    if (!seen.has(user.id)) {
      ordered.push({ user, level: 1 });
      seen.add(user.id);
    }
  });

  users.forEach((user) => {
    if (!seen.has(user.id)) {
      ordered.push({ user, level: 1 });
      seen.add(user.id);
    }
  });

  return ordered;
}

function RoleBadge({ role }) {
  const { t } = useLanguage();
  const ROLE_LABEL = {
    brand_admin: t('super.users.role_brand_admin') || 'Brand Admin',
    admin: t('super.users.role_sub_admin') || 'Admin',
    viewer: t('super.users.role_viewer'),
    delegator: t('super.users.role_delegator') || 'Delegator',
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold border ${ROLE_BADGE_VARIANT[role] || 'bg-slate-700 th-text-secondary'}`}>
      {ROLE_LABEL[role] || role}
    </span>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="th-bg-surface border th-border rounded-lg w-full max-w-md shadow-xl mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b th-border">
          <h2 className="text-sm font-semibold th-text-primary">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:th-text-primary"><X className="w-4 h-4" /></button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

function UserCard({ user, level = 1, onReset }) {
  const { t } = useLanguage();
  const indentClass = level === 2 ? 'ml-8' : level === 1 ? 'ml-3' : '';
  const showArrow = level >= 1;

  return (
    <div
      className={`rounded-xl border th-border th-bg-elevated p-3 hover:border-blue-500/40 transition-colors ${indentClass}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            {showArrow && <CornerDownRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />}
            <span className="th-text-primary font-mono text-xs break-all">{user.email}</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <RoleBadge role={user.role} />
            {user.must_set_password && (
              <span className="text-[10px] bg-yellow-900/40 text-yellow-400 px-1.5 py-0.5 rounded">{t('super.users.password_not_set_badge')}</span>
            )}
          </div>
        </div>
        {onReset && user.role === 'brand_admin' && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onReset?.(user)}
              className="p-1.5 rounded text-slate-400 hover:text-amber-400 hover:bg-slate-700 transition-colors"
              title={t('super.users.button_tooltip_reset_password')}
            >
              <KeyRound className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function BrandLane({ tenant, brandAdmin, users, onReset }) {
  const { t } = useLanguage();

  return (
    <div
      className="th-bg-surface border rounded-2xl p-4 min-h-[320px] th-border"
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-blue-400 shrink-0" />
            <h3 className="text-sm font-semibold th-text-primary truncate">{tenant.name}</h3>
          </div>
          <div className="text-xs text-slate-400 font-mono mt-1 break-all">{tenant.admin_email}</div>
          {tenant.note && <div className="text-xs text-slate-500 mt-2">{tenant.note}</div>}
        </div>
        <Badge variant="outline" className="bg-slate-800/60 text-slate-300 border-slate-600">
          {users.length}
        </Badge>
      </div>

      {brandAdmin && (
        <div className="rounded-xl border border-blue-500/20 bg-blue-900/10 px-3 py-2 mb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              <span className="text-xs text-blue-300 font-mono break-all">{brandAdmin.email}</span>
              <RoleBadge role="brand_admin" />
            </div>
            <button
              onClick={() => onReset?.(brandAdmin)}
              className="p-1.5 rounded text-slate-400 hover:text-amber-300 hover:bg-slate-700 transition-colors shrink-0"
              title={t('super.users.button_tooltip_reset_password')}
            >
              <KeyRound className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

        <div className="space-y-3">
          {users.length === 0 ? (
            <div className="rounded-xl border border-dashed th-border px-4 py-8 text-sm text-slate-500 text-center">
              {t('super.users.brand_lane_empty')}
            </div>
          ) : (
          users.map(({ user, level }) => <UserCard key={user.id} user={user} level={level} onReset={null} />)
          )}
        </div>
      </div>
  );
}

export default function SuperUserManagement() {
  const { t } = useLanguage();
  const [users, setUsers] = useState([]);
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);
  const [search, setSearch] = useState('');
  const [brandSearch, setBrandSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resetTarget, setResetTarget] = useState(null);

  const scrollToTopForToast = () => {
    const scrollContainer = document.querySelector('.relative.flex.flex-col.flex-1.overflow-y-auto.overflow-x-hidden');
    if (scrollContainer && typeof scrollContainer.scrollTo === 'function') {
      scrollContainer.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    if (type === 'error') {
      requestAnimationFrame(() => scrollToTopForToast());
    }
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
  }, [t]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const brandGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const brandQ = brandSearch.trim().toLowerCase();
    const assignableUsers = users.filter((u) => MANAGED_ROLES.includes(u.role));

    const matchesUser = (user) => (
      !q ||
      user.email.toLowerCase().includes(q) ||
      (user.role || '').toLowerCase().includes(q) ||
      (user.parent_admin_id || '').toLowerCase().includes(q) ||
      (user.brand_admin_email || '').toLowerCase().includes(q)
    );

    const groups = [...tenants]
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
      .map((tenant) => {
        const matchesBrandFilter = !brandQ || [
          tenant.name,
          tenant.admin_email,
          tenant.primary_contact_email,
          ...(tenant.notification_emails || []),
        ].some((value) => (value || '').toLowerCase().includes(brandQ));
        if (!matchesBrandFilter) {
          return null;
        }

        const brandAdmin = users.find((u) => u.email === tenant.admin_email && u.role === 'brand_admin') || null;
        const members = assignableUsers
          .filter((u) => u.brand_admin_email === tenant.admin_email)
          .sort((a, b) => a.email.localeCompare(b.email));

        const tenantMatches = !q || [
          tenant.name,
          tenant.admin_email,
          tenant.primary_contact_email,
          ...(tenant.notification_emails || []),
        ].some((value) => (value || '').toLowerCase().includes(q));

        const filteredMembers = q ? members.filter(matchesUser) : members;
        if (!tenantMatches && filteredMembers.length === 0) {
          return null;
        }

        return {
          tenant,
          brandAdmin,
          users: buildHierarchyList(tenantMatches ? members : filteredMembers),
        };
      })
      .filter(Boolean);

    return groups;
  }, [search, brandSearch, tenants, users]);

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
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold th-text-primary">{t('super.users.title')}</h1>
          <p className="text-xs text-slate-500 mt-0.5">{t('super.users.subtitle')}</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              className="w-full th-bg-elevated border th-border rounded-lg pl-9 pr-8 py-2 text-sm th-text-primary placeholder-slate-500 focus:outline-none focus:border-blue-500"
              placeholder={`${t('super.users.search_placeholder')}`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:th-text-primary">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {toast && (
        <div className={`fixed top-4 right-4 z-50 max-w-md px-4 py-3 rounded shadow-lg text-sm font-medium flex items-center gap-2 ${
          toast.type === 'error' ? 'bg-red-900 text-red-200' : 'bg-emerald-900 text-emerald-200'
        }`}>
          {toast.type === 'error' ? <AlertTriangle className="w-4 h-4" /> : <Check className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      {error && <div className="bg-red-900/20 border border-red-800 text-red-400 text-sm px-4 py-3 rounded">{error}</div>}

      {loading ? (
        <div className="th-bg-surface border th-border rounded-xl p-12 flex justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-blue-500" />
        </div>
      ) : (
        <div className="th-bg-surface border th-border rounded-2xl p-4 min-h-[420px]">
          <div className="space-y-3 mb-4">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-slate-400" />
              <h2 className="text-sm font-semibold th-text-primary">{t('super.users.brand_groups_title')}</h2>
            </div>
            <div className="relative max-w-md">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                className="w-full th-bg-elevated border th-border rounded-lg pl-9 pr-8 py-2 text-sm th-text-primary placeholder-slate-500 focus:outline-none focus:border-blue-500"
                placeholder={t('super.users.brand_filter_placeholder')}
                value={brandSearch}
                onChange={(e) => setBrandSearch(e.target.value)}
              />
              {brandSearch && (
                <button onClick={() => setBrandSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:th-text-primary">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <p className="text-xs text-slate-500">
              {t('super.users.reset_only_hint') || 'Super Admin chỉ xem danh sách user theo brand và reset mật khẩu khi cần.'}
            </p>
          </div>

          {brandGroups.length === 0 ? (
            <div className="rounded-xl border border-dashed th-border px-4 py-8 text-sm text-slate-500 text-center">
              {t('super.users.empty_brand_groups')}
            </div>
          ) : (
            <div className="space-y-4 max-h-[72vh] overflow-y-auto pr-1 custom-scrollbar">
              {brandGroups.map(({ tenant, brandAdmin, users: brandUsers }) => (
                <BrandLane
                  key={tenant.id}
                  tenant={tenant}
                  brandAdmin={brandAdmin}
                  users={brandUsers}
                  onReset={setResetTarget}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {resetTarget && (
        <Modal title={t('super.users.modal_reset_title')} onClose={() => setResetTarget(null)}>
          <div className="space-y-4">
            <p className="text-sm th-text-secondary">
              {t('super.users.modal_reset_confirm_text')} <span className="font-semibold th-text-primary">{resetTarget.email}</span>?
            </p>
            <p className="text-xs text-slate-500">{t('super.users.modal_reset_hint')}</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setResetTarget(null)} className="px-3 py-2 text-sm text-slate-400 hover:th-text-primary">
                {t('super.users.modal_reset_cancel')}
              </button>
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
