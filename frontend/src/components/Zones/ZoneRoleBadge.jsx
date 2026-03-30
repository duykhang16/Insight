import React from 'react';

const ROLE_STYLES = {
  admin: 'bg-rose-500/20 text-rose-400 border border-rose-500/30',
  viewer: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
  delegator: 'bg-amber-500/20 text-amber-400 border border-amber-500/30',
};

const ROLE_LABELS = {
  admin: 'Admin',
  viewer: 'Viewer',
  delegator: 'Delegator',
};

const ZoneRoleBadge = ({ role }) => {
  const styles = ROLE_STYLES[role] || 'bg-slate-500/20 text-slate-400 border border-slate-500/30';
  const label = ROLE_LABELS[role] || role;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${styles}`}>
      {label}
    </span>
  );
};

export default ZoneRoleBadge;
