import React, { useState, useRef, useEffect } from 'react';
import { useDroppable, useDraggable } from '@dnd-kit/core';
import { GripVertical, Users, Server, ChevronDown, ChevronUp, Plus, Trash2, Edit2, Search, Check, X } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import ZoneMemberList from './ZoneMemberList';
import apiClient from '../../api/apiClient';
import { useLanguage } from '../../context/LanguageContext';

const PRESET_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4'];

// Draggable site item inside a zone
const ZoneSiteItem = ({ site }) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `site::${site.siteId}`,
    data: { type: 'site', siteId: site.siteId, siteName: site.siteName },
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs th-text-secondary group cursor-grab active:cursor-grabbing transition-opacity ${isDragging ? 'opacity-40' : 'hover:th-bg-surface-alt hover:th-text-primary'
        }`}
      style={{ backgroundColor: isDragging ? undefined : 'var(--color-bg-surface-alt)', opacity: isDragging ? 0.4 : undefined }}
    >
      <GripVertical className="w-3 h-3 th-text-muted shrink-0" />
      <span className="truncate flex-1">{site.siteName || site.siteId}</span>
    </div>
  );
};

const ZoneCard = ({ zone, isGlobalAdmin, onUpdated, onDelete, onEditZone, allUsers = [] }) => {
  const { t } = useLanguage();
  const { setNodeRef, isOver } = useDroppable({ id: zone.id });
  const [showMembers, setShowMembers] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [adding, setAdding] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [siteSearch, setSiteSearch] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Inline edit state
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(zone.name || '');
  const [editDesc, setEditDesc] = useState(zone.description || '');
  const [editColor, setEditColor] = useState(zone.color || '#3B82F6');

  // Reset inline edit when zone changes from outside
  useEffect(() => {
    if (!editing) {
      setEditName(zone.name || '');
      setEditDesc(zone.description || '');
      setEditColor(zone.color || '#3B82F6');
    }
  }, [zone.name, zone.description, zone.color, editing]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => { if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setDropdownOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Filter users: exclude already-members, filter by search
  const existingEmails = new Set((zone.members || []).map(m => m.email));
  const filteredUsers = allUsers.filter(u =>
    !existingEmails.has(u.email) &&
    (userSearch === '' || u.email.toLowerCase().includes(userSearch.toLowerCase()))
  );

  const handleAddMember = async () => {
    if (!newMemberEmail.trim()) return;
    setAdding(true);
    try {
      await apiClient.post(`/zones/${zone.id}/members`, {
        email: newMemberEmail.trim(),
      });
      setNewMemberEmail('');
      setUserSearch('');
      setShowAddMember(false);
      onUpdated?.();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to add member');
    } finally {
      setAdding(false);
    }
  };

  const handleStartEdit = () => {
    setEditName(zone.name || '');
    setEditDesc(zone.description || '');
    setEditColor(zone.color || '#3B82F6');
    setEditing(true);
  };

  const handleConfirmEdit = () => {
    if (!editName.trim()) return;
    // Call parent callback to update workingState (no API call)
    onEditZone?.(zone.id, {
      name: editName.trim(),
      description: editDesc.trim() || null,
      color: editColor,
    });
    setEditing(false);
  };

  const handleCancelEdit = () => {
    setEditName(zone.name || '');
    setEditDesc(zone.description || '');
    setEditColor(zone.color || '#3B82F6');
    setEditing(false);
  };

  const filteredSites = (zone.site_ids || []).filter(siteId => {
    if (!siteSearch) return true;
    const siteName = zone._siteNames?.[siteId] || siteId;
    return siteName.toLowerCase().includes(siteSearch.toLowerCase());
  });

  const borderColor = isOver ? 'border-blue-500' : '';

  return (
    <div
      ref={setNodeRef}
      className={`th-bg-surface border th-border ${borderColor} rounded-lg overflow-hidden transition-colors`}
      style={{ backgroundColor: 'var(--color-bg-surface)', borderColor: isOver ? undefined : 'var(--color-border)' }}
    >
      {/* Zone header bar with color accent */}
      <div
        className="px-3 py-2.5 border-b th-border"
        style={{ borderLeftWidth: 3, borderLeftColor: editing ? editColor : (zone.color || '#3B82F6'), borderBottomColor: 'var(--color-border)' }}
      >
        {editing ? (
          /* ── Inline Edit Mode ── */
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder={t('admin.zones.edit_name_placeholder')}
                className="flex-1 th-bg-elevated border border-slate-600 th-text-primary rounded px-2 py-1 text-sm focus:outline-none focus:border-blue-500 transition-colors"
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter') handleConfirmEdit(); if (e.key === 'Escape') handleCancelEdit(); }}
              />
              <button
                onClick={handleConfirmEdit}
                disabled={!editName.trim()}
                className="p-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white transition-colors disabled:opacity-40"
                title={t('admin.zones.confirm_edit') || 'Confirm'}
              >
                <Check className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleCancelEdit}
                className="p-1.5 rounded bg-slate-600 hover:bg-slate-500 text-white transition-colors"
                title={t('admin.zones.cancel_edit') || 'Cancel'}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <input
              type="text"
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
              placeholder={t('admin.zones.edit_desc_placeholder')}
              className="w-full th-bg-elevated border border-slate-600 th-text-secondary rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-500 transition-colors"
            />
            <div className="flex items-center gap-1.5">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setEditColor(c)}
                  className={`w-5 h-5 rounded-full transition-transform ${editColor === c ? 'scale-125 ring-2 ring-white ring-offset-1 ring-offset-slate-900' : 'hover:scale-110'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
        ) : (
          /* ── Display Mode ── */
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-semibold text-sm th-text-primary truncate">{zone.name}</span>
              {zone.description && (
                <span className="hidden sm:block text-xs th-text-muted truncate">— {zone.description}</span>
              )}
            </div>
            <div className="flex items-center gap-3 shrink-0 ml-2">
              <span className="text-xs th-text-muted flex items-center gap-1">
                <Server className="w-3 h-3" />{zone.site_count ?? zone.site_ids?.length ?? 0}
              </span>
              <span className="text-xs th-text-muted flex items-center gap-1">
                <Users className="w-3 h-3" />{zone.member_count ?? zone.members?.length ?? 0}
              </span>
              {isGlobalAdmin && (
                <TooltipProvider>
                  <div className="flex items-center gap-1">
                    <Tooltip>
                      <TooltipTrigger
                        onClick={handleStartEdit}
                        className="p-1 th-text-muted hover:text-blue-400 transition-colors"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </TooltipTrigger>
                      <TooltipContent>{t('admin.zones.edit_zone')}</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger
                        onClick={() => onDelete?.(zone)}
                        className="p-1 th-text-muted hover:text-rose-400 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </TooltipTrigger>
                      <TooltipContent>{t('admin.zones.delete_zone_tooltip')}</TooltipContent>
                    </Tooltip>
                  </div>
                </TooltipProvider>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Sites drop target */}
      <div className={`p-2 space-y-2 border-b th-border ${isOver ? 'bg-blue-900/10' : ''}`} style={{ borderBottomColor: 'var(--color-border)' }}>
        {(zone.site_ids || []).length > 0 && (
          <div className="relative">
            <Search className="w-3.5 h-3.5 th-text-muted absolute left-2 top-[7px]" />
            <input
              type="text"
              placeholder={t('admin.zones.filter_sites')}
              value={siteSearch}
              onChange={e => setSiteSearch(e.target.value)}
              className="w-full th-bg-surface-alt border th-border rounded text-xs th-text-primary pl-7 pr-2 py-1 focus:outline-none focus:border-blue-500 transition-colors"
              style={{ backgroundColor: 'var(--color-bg-surface-alt)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
            />
          </div>
        )}
        <div className="space-y-1 max-h-48 overflow-y-auto custom-scrollbar pr-1 min-h-[32px]">
          {(zone.site_ids || []).length === 0 ? (
            <p className="text-xs th-text-muted text-center py-2">{t('admin.zones.drop_site_here')}</p>
          ) : filteredSites.length === 0 ? (
            <p className="text-xs th-text-muted text-center py-2">{t('admin.zones.no_site_found')}</p>
          ) : (
            filteredSites.map((siteId) => (
              <ZoneSiteItem key={siteId} site={{ siteId, siteName: zone._siteNames?.[siteId] || siteId }} />
            ))
          )}
        </div>
      </div>

      {/* Members section */}
      <div className="border-t th-border" style={{ borderTopColor: 'var(--color-border)' }}>
        <button
          onClick={() => setShowMembers(!showMembers)}
          className="w-full flex items-center justify-between px-3 py-2 text-xs th-text-muted hover:th-text-secondary transition-colors"
        >
          <span className="flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" />
            {t('admin.zones.members_label')} ({zone.members?.length || 0})
          </span>
          {showMembers ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>

        {showMembers && (
          <div className="px-3 pb-3 space-y-2">
            <ZoneMemberList
              zoneId={zone.id}
              members={zone.members || []}
              onUpdated={onUpdated}
              isGlobalAdmin={isGlobalAdmin}
              zoneSiteIds={zone.site_ids || []}
              zoneSiteNames={zone._siteNames || {}}
            />
            {isGlobalAdmin && (
              <>
                {!showAddMember ? (
                  <button
                    onClick={() => setShowAddMember(true)}
                    className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" /> {t('admin.zones.add_member')}
                  </button>
                ) : (
                  <div className="mt-2 space-y-2">
                    {/* User picker */}
                    <div ref={dropdownRef} className="relative">
                      <div className="flex items-center gap-1.5 th-bg-elevated border th-border rounded px-2 py-1.5 focus-within:border-blue-500 transition-colors" style={{ backgroundColor: 'var(--color-bg-elevated)', borderColor: 'var(--color-border)' }}>
                        <Search className="w-3 h-3 th-text-muted shrink-0" />
                        <input
                          type="text"
                          value={newMemberEmail || userSearch}
                          onChange={(e) => {
                            setUserSearch(e.target.value);
                            setNewMemberEmail('');
                            setDropdownOpen(true);
                          }}
                          onFocus={() => setDropdownOpen(true)}
                          placeholder={allUsers.length > 0 ? 'Search or enter email...' : 'Enter email...'}
                          className="flex-1 text-xs bg-transparent th-text-primary placeholder:th-text-muted focus:outline-none min-w-0"
                          style={{ color: 'var(--color-text-primary)' }}
                        />
                        {newMemberEmail && (
                          <span className="text-[10px] text-emerald-400 shrink-0">✓</span>
                        )}
                      </div>

                      {/* Dropdown list */}
                      {dropdownOpen && (userSearch || !newMemberEmail) && filteredUsers.length > 0 && (
                        <ul className="absolute top-full left-0 right-0 mt-0.5 th-bg-elevated border th-border rounded shadow-xl z-50 max-h-36 overflow-y-auto" style={{ backgroundColor: 'var(--color-bg-elevated)', borderColor: 'var(--color-border)' }}>
                          {filteredUsers.map(u => (
                            <li
                              key={u.id || u.email}
                              onMouseDown={() => {
                                setNewMemberEmail(u.email);
                                setUserSearch('');
                                setDropdownOpen(false);
                              }}
                              className="px-2.5 py-1.5 text-xs th-text-secondary hover:th-bg-surface-alt cursor-pointer flex items-center justify-between gap-2"
                            >
                              <span className="font-mono truncate">{u.email}</span>
                              <span className="text-[10px] th-text-muted shrink-0">{u.role}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div className="flex gap-2">
                      <button
                        onClick={handleAddMember}
                        disabled={adding || !newMemberEmail.trim()}
                        className="text-xs bg-blue-600 hover:bg-blue-700 th-text-primary px-2 py-1 rounded transition-colors disabled:opacity-50 flex-1"
                      >
                        {adding ? 'Adding...' : 'Add'}
                      </button>
                      <button
                        onClick={() => { setShowAddMember(false); setNewMemberEmail(''); setUserSearch(''); }}
                        className="text-xs th-text-muted hover:th-text-secondary px-1"
                      >
                        {t('admin.zones.cancel')}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ZoneCard;
