import React, { useState } from 'react';
import { UserMinus, ChevronDown } from 'lucide-react';
import ZoneRoleBadge from './ZoneRoleBadge';
import apiClient from '../../api/apiClient';

const ZoneMemberList = ({ zoneId, members = [], onUpdated, isGlobalAdmin }) => {
  const [loading, setLoading] = useState(null);

  const handleRemove = async (email) => {
    if (!confirm(`Xóa ${email} khỏi zone?`)) return;
    setLoading(`remove-${email}`);
    try {
      await apiClient.delete(`/zones/${zoneId}/members/${encodeURIComponent(email)}`);
      onUpdated?.();
    } catch (err) {
      console.error('Remove failed:', err);
    } finally {
      setLoading(null);
    }
  };

  if (!members.length) {
    return <p className="text-xs text-slate-500 py-2 px-1">Chưa có thành viên nào.</p>;
  }

  return (
    <div className="space-y-1">
      {members.map((m) => (
        <div
          key={m.email}
          className="flex items-center justify-between py-1.5 px-2 rounded bg-slate-800/50 group"
        >
          <span className="text-xs text-slate-300 truncate flex-1 mr-2">{m.email}</span>
          <div className="flex items-center gap-2 shrink-0">
            <ZoneRoleBadge role={m.zone_role} />
            {isGlobalAdmin && (
              <>
                <button
                  onClick={() => handleRemove(m.email)}
                  disabled={loading === `remove-${m.email}`}
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-slate-500 hover:text-rose-400"
                  title={`Xóa ${m.email}`}
                >
                  <UserMinus className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

export default ZoneMemberList;
