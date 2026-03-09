import React, { useState, useEffect, useCallback } from 'react';
import {
  Link2, LinkIcon, Unlink, RefreshCw, AlertTriangle,
  CheckCircle, Clock, ShieldCheck, ShieldOff, ChevronRight,
} from 'lucide-react';
import apiClient from '../../api/apiClient';

const fmtExpires = (isoStr) => {
  if (!isoStr) return '--';
  try {
    const diffMin = Math.round((new Date(isoStr) - new Date()) / 60000);
    if (diffMin <= 0) return 'Da het han';
    if (diffMin < 60) return `${diffMin} phut nua`;
    return `${Math.round(diffMin / 60)} gio nua`;
  } catch { return isoStr; }
};

const fmtLinkedAt = (isoStr) => {
  if (!isoStr) return '--';
  try { return new Date(isoStr).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }); }
  catch { return isoStr; }
};

const DiscoveryModal = ({ scanData, onConfirm, onCancel, confirming }) => {
  const adminSites = scanData.admin_sites || [];
  const restrictedSites = scanData.restricted_sites || [];
  const total = adminSites.length + restrictedSites.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-[#0F172A] border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl">
        <div className="px-6 py-5 border-b border-slate-800">
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="w-5 h-5 text-amber-400" />
            <h2 className="text-base font-semibold text-white">Site Discovery Results</h2>
          </div>
          <p className="text-xs text-slate-400">
            Discovered a total of <strong className="text-white">{total}</strong> sites.
          </p>
        </div>

        <div className="px-6 py-4 space-y-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">
                Administrator &mdash; {adminSites.length} sites
              </span>
            </div>
            <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
              {adminSites.map(s => (
                <div key={s.site_id} className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/5 border border-emerald-500/15 rounded-lg text-xs text-emerald-300">
                  <span className="font-mono text-emerald-600 text-[10px] shrink-0">{s.site_id.slice(-6)}</span>
                  <span className="truncate">{s.site_name}</span>
                </div>
              ))}
              {adminSites.length === 0 && (
                <p className="text-xs text-slate-600 px-3 py-2">No administrator sites found.</p>
              )}
            </div>
          </div>

          {restrictedSites.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <ShieldOff className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">
                  Viewer / Restricted &mdash; {restrictedSites.length} sites (will be skipped)
                </span>
              </div>
              <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                {restrictedSites.map(s => (
                  <div key={s.site_id} className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/5 border border-amber-500/15 rounded-lg text-xs text-amber-300/70">
                    <span className="font-mono text-amber-600/50 text-[10px] shrink-0">{s.site_id.slice(-6)}</span>
                    <span className="truncate">{s.site_name}</span>
                    <span className="ml-auto text-[10px] text-amber-600/60 uppercase shrink-0">{s.role || 'viewer'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-slate-800/60 border border-slate-700 rounded-lg px-4 py-3 text-xs text-slate-300 leading-relaxed">
            {restrictedSites.length > 0 ? (
              <>
                Found {total} sites: {adminSites.length} Admin sites and {restrictedSites.length} Viewer sites.
                <br />
                Skip {restrictedSites.length} Viewer sites and link the remaining {adminSites.length}?
                <br />
                <span className="text-slate-500 text-[11px] mt-1 block">
                  Batch Tools are only available on Administrator sites.
                </span>
              </>
            ) : (
              <span className="text-emerald-400 font-medium">
                You have Administrator access to all {total} sites. Ready to link.
              </span>
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-800 flex items-center gap-3 justify-end">
          <button
            onClick={onCancel}
            disabled={confirming}
            className="px-4 py-2 text-sm text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          {adminSites.length > 0 && (
            <button
              onClick={() => onConfirm(adminSites.map(s => s.site_id))}
              disabled={confirming}
              className="flex items-center gap-2 px-5 py-2 text-sm bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {confirming
                ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                : <ChevronRight className="w-3.5 h-3.5" />
              }
              {confirming ? 'Linking...' : `Continue (${adminSites.length} Admin sites)`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const MasterAccount = () => {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ aruba_username: '', aruba_password: '' });
  const [scanning, setScanning] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [scanData, setScanData] = useState(null);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/master/status');
      setStatus(res.data);
    } catch (err) {
      console.error('Failed to fetch master status:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  const handleScan = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setScanning(true);
    try {
      const res = await apiClient.post('/master/scan', form);
      setScanData(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Quet site that bai. Kiem tra lai thong tin dang nhap.');
    } finally {
      setScanning(false);
    }
  };

  const handleConfirm = async (adminSiteIds) => {
    setConfirming(true);
    setError('');
    try {
      const res = await apiClient.post('/master/link-confirm', {
        aruba_username: form.aruba_username,
        aruba_password: form.aruba_password,
        confirmed_admin_site_ids: adminSiteIds,
      });
      setSuccess(res.data.message || 'Lien ket thanh cong.');
      setForm({ aruba_username: '', aruba_password: '' });
      setScanData(null);
      fetchStatus();
    } catch (err) {
      setError(err.response?.data?.detail || 'Lien ket that bai.');
      setScanData(null);
    } finally {
      setConfirming(false);
    }
  };

  const handleUnlink = async () => {
    if (!confirm('Ban chac chan muon ngat ket noi Master Account?')) return;
    setUnlinking(true);
    setError('');
    setSuccess('');
    try {
      await apiClient.delete('/master/unlink');
      setSuccess('Da ngat ket noi thanh cong.');
      fetchStatus();
    } catch (err) {
      setError(err.response?.data?.detail || 'Ngat ket noi that bai.');
    } finally {
      setUnlinking(false);
    }
  };

  const handleForceRefresh = async () => {
    setRefreshing(true);
    setError('');
    setSuccess('');
    try {
      const res = await apiClient.post('/master/refresh-now');
      setSuccess(res.data.message || 'Token da duoc refresh.');
      fetchStatus();
    } catch (err) {
      setError(err.response?.data?.detail || 'Refresh that bai.');
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  const isLinked = status?.is_linked;

  return (
    <>
      {scanData && (
        <DiscoveryModal
          scanData={scanData}
          onConfirm={handleConfirm}
          onCancel={() => setScanData(null)}
          confirming={confirming}
        />
      )}

      <div className="p-6 max-w-2xl">
        <div className="flex items-center gap-3 mb-6">
          <Link2 className="w-5 h-5 text-blue-400" />
          <h1 className="text-lg font-semibold text-white">Master Aruba Account</h1>
        </div>

        {error && (
          <div className="flex items-start gap-2 bg-rose-500/10 border border-rose-500/30 rounded-lg px-4 py-3 mb-4 text-sm text-rose-400">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="flex items-start gap-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg px-4 py-3 mb-4 text-sm text-emerald-400">
            <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        <div className="bg-[#0F172A] border border-slate-700 rounded-xl overflow-hidden mb-6">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
            <div className="flex items-center gap-3">
              <div className={`w-2.5 h-2.5 rounded-full ${isLinked ? 'bg-emerald-500 shadow-[0_0_6px_#10b981]' : 'bg-slate-600'}`} />
              <span className={`text-sm font-semibold ${isLinked ? 'text-emerald-400' : 'text-slate-500'}`}>
                {isLinked ? 'LINKED' : 'NOT LINKED'}
              </span>
            </div>
            {isLinked && (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleForceRefresh}
                  disabled={refreshing}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 rounded-lg transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                  Force Refresh
                </button>
                <button
                  onClick={handleUnlink}
                  disabled={unlinking}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-rose-600/20 hover:bg-rose-600/30 text-rose-400 border border-rose-600/30 rounded-lg transition-colors disabled:opacity-50"
                >
                  <Unlink className="w-3.5 h-3.5" />
                  {unlinking ? 'Dang ngat...' : 'Unlink Account'}
                </button>
              </div>
            )}
          </div>

          {isLinked ? (
            <div className="px-5 py-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs text-slate-500 mb-0.5">Linked by</p>
                  <p className="text-slate-200">{status.linked_by || '--'}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-0.5">Linked at</p>
                  <p className="text-slate-200">{fmtLinkedAt(status.linked_at)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-0.5 flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Token expires in
                  </p>
                  <p className={`font-medium ${status.token_expires_at && (new Date(status.token_expires_at) - new Date()) < 5 * 60000
                    ? 'text-rose-400' : 'text-emerald-400'
                    }`}>
                    {fmtExpires(status.token_expires_at)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-0.5">Auto-refresh</p>
                  <p className="text-slate-200">{status.refresh_interval_minutes} phut</p>
                </div>
                {status.admin_site_count != null && (
                  <div>
                    <p className="text-xs text-slate-500 mb-0.5 flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3 text-emerald-500" /> Admin Sites
                    </p>
                    <p className="text-emerald-400 font-medium">{status.admin_site_count} site</p>
                  </div>
                )}
                {status.restricted_site_count > 0 && (
                  <div>
                    <p className="text-xs text-slate-500 mb-0.5 flex items-center gap-1">
                      <ShieldOff className="w-3 h-3 text-amber-500" /> Bo qua (Viewer)
                    </p>
                    <p className="text-amber-400 font-medium">{status.restricted_site_count} site</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="px-5 py-4 text-sm text-slate-500">
              Chua co tai khoan Aruba nao duoc lien ket.
            </div>
          )}
        </div>

        {!isLinked && (
          <div className="bg-[#0F172A] border border-slate-700 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-white mb-1">Lien ket tai khoan Aruba</h2>
            <p className="text-xs text-slate-500 mb-4">
              He thong se quet va phan loai site theo quyen.
              Site <strong className="text-emerald-400">Administrator</strong> se duoc quan ly day du.
              Site <strong className="text-amber-400">Viewer</strong> se bi bo qua.
            </p>
            <form onSubmit={handleScan} className="space-y-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Aruba Username (Email)</label>
                <input
                  type="email"
                  required
                  value={form.aruba_username}
                  onChange={(e) => setForm({ ...form, aruba_username: e.target.value })}
                  placeholder="admin@company.com"
                  className="w-full bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Aruba Password</label>
                <input
                  type="password"
                  required
                  value={form.aruba_password}
                  onChange={(e) => setForm({ ...form, aruba_password: e.target.value })}
                  placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;"
                  className="w-full bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                />
              </div>
              <button
                type="submit"
                disabled={scanning}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm py-2.5 rounded-lg font-medium transition-colors disabled:opacity-50 mt-2"
              >
                {scanning
                  ? <RefreshCw className="w-4 h-4 animate-spin" />
                  : <LinkIcon className="w-4 h-4" />
                }
                {scanning ? 'Dang quet site...' : 'Quet & Lien ket'}
              </button>
            </form>
          </div>
        )}
      </div>
    </>
  );
};

export default MasterAccount;
