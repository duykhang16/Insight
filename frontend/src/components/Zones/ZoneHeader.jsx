import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Edit3, Check, X, RefreshCw } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import apiClient from '../../api/apiClient';

/**
 * Shared header for Zone sub-pages (Templates, Sites, Logs).
 *
 * Props:
 *  - zone          : zone object ({ id, name, description, color })
 *  - backTo        : path for the back button (default: '/zones')
 *  - badge         : React node shown next to zone name (e.g. site count)
 *  - actions       : React node(s) rendered on the right side
 *  - onZoneRenamed : optional callback(newName) after successful rename
 *  - editable      : allow inline name editing (default true)
 */
const ZoneHeader = ({ zone, backTo = '/zones', badge, actions, onZoneRenamed, editable = true }) => {
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(zone?.name || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!editValue.trim() || editValue === zone?.name) {
      setIsEditing(false);
      return;
    }
    setSaving(true);
    try {
      await apiClient.put(`/zones/${zone.id}`, { name: editValue.trim() });
      onZoneRenamed?.(editValue.trim());
      setIsEditing(false);
    } catch (err) {
      console.error('Failed to rename zone:', err);
      setEditValue(zone?.name || '');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(backTo)}
          className="p-1.5 rounded-lg th-text-muted hover:th-text-primary hover:th-bg-surface-alt transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <div
          className="w-3 h-3 rounded-full flex-shrink-0"
          style={{ backgroundColor: zone?.color || '#3B82F6' }}
        />

        <div>
          {editable && isEditing ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSave();
                  else if (e.key === 'Escape') setIsEditing(false);
                }}
                autoFocus
                disabled={saving}
                className="th-bg-surface border border-blue-500 rounded px-2 py-0.5 text-sm font-semibold th-text-primary focus:outline-none w-48"
                style={{ backgroundColor: 'var(--color-bg-surface)', color: 'var(--color-text-primary)' }}
              />
              <button onClick={handleSave} disabled={saving} className="p-1 text-emerald-500 hover:th-bg-surface-alt rounded transition-colors">
                <Check size={16} />
              </button>
              <button onClick={() => setIsEditing(false)} disabled={saving} className="p-1 text-rose-500 hover:th-bg-surface-alt rounded transition-colors">
                <X size={16} />
              </button>
            </div>
          ) : (
            <div
              className={`flex items-center gap-2 ${editable ? 'group cursor-pointer' : ''}`}
              onClick={() => {
                if (!editable) return;
                setEditValue(zone?.name || '');
                setIsEditing(true);
              }}
            >
              <h1 className="text-lg font-semibold th-text-primary">{zone?.name || 'Zone'}</h1>
              {editable && <Edit3 size={14} className="th-text-muted opacity-0 group-hover:opacity-100 transition-opacity" />}
            </div>
          )}
          {zone?.description && <p className="text-xs th-text-muted mt-0.5">{zone.description}</p>}
        </div>

        {badge}
      </div>

      <div className="flex items-center gap-2">
        {actions}
      </div>
    </div>
  );
};

export default ZoneHeader;
