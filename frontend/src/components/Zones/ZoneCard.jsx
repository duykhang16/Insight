import React, { useState, useRef, useEffect } from 'react';
import { useDroppable, useDraggable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { GripVertical, Users, Server, ChevronDown, ChevronUp, Plus, Trash2, Edit2, Search } from 'lucide-react';
import ZoneMemberList from './ZoneMemberList';
import apiClient from '../../api/apiClient';

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
      className={`flex items-center gap-2 px-2 py-1.5 rounded bg-slate-700/40 text-xs text-slate-300 group cursor-grab active:cursor-grabbing transition-opacity ${isDragging ? 'opacity-40' : 'hover:bg-slate-700 hover:text-white'
        }`}
    >
      <GripVertical className="w-3 h-3 text-slate-600 shrink-0" />
      <span className="truncate flex-1">{site.siteName || site.siteId}</span>
    </div>
  );
};

const ZoneCard = ({ zone, isGlobalAdmin, onUpdated, onDelete, allUsers = [] }) => {
  const { setNodeRef, isOver } = useDroppable({ id: zone.id });
  const [showMembers, setShowMembers] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [adding, setAdding] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [siteSearch, setSiteSearch] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

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
      alert(err.response?.data?.detail || 'Thêm member thất bại');
    } finally {
      setAdding(false);
    }
  };

  const filteredSites = (zone.site_ids || []).filter(siteId => {
    if (!siteSearch) return true;
    const siteName = zone._siteNames?.[siteId] || siteId;
    return siteName.toLowerCase().includes(siteSearch.toLowerCase());
  });

  const borderColor = isOver ? 'border-blue-500' : 'border-slate-700';

  return (
    <div
      ref={setNodeRef}
      className={`bg-[#0F172A] border ${borderColor} rounded-lg overflow-hidden transition-colors`}
    >
      {/* Zone header bar with color accent */}
      <div
        className="flex items-center justify-between px-3 py-2.5 border-b border-slate-800"
        style={{ borderLeftWidth: 3, borderLeftColor: zone.color || '#3B82F6' }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-semibold text-sm text-white truncate">{zone.name}</span>
          {zone.description && (
            <span className="hidden sm:block text-xs text-slate-500 truncate">— {zone.description}</span>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0 ml-2">
          <span className="text-xs text-slate-500 flex items-center gap-1">
            <Server className="w-3 h-3" />{zone.site_count ?? zone.site_ids?.length ?? 0}
          </span>
          <span className="text-xs text-slate-500 flex items-center gap-1">
            <Users className="w-3 h-3" />{zone.member_count ?? zone.members?.length ?? 0}
          </span>
          {isGlobalAdmin && (
            <button
              onClick={() => onDelete?.(zone.id)}
              className="p-1 text-slate-600 hover:text-rose-400 transition-colors"
              title="Xóa zone"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Sites drop target */}
      <div className={`p-2 space-y-2 border-b border-slate-800 ${isOver ? 'bg-blue-900/10' : ''}`}>
        {(zone.site_ids || []).length > 0 && (
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2 top-[7px]" />
            <input
              type="text"
              placeholder="Filter sites..."
              value={siteSearch}
              onChange={e => setSiteSearch(e.target.value)}
              className="w-full bg-slate-800/50 border border-slate-700 rounded text-xs text-slate-200 pl-7 pr-2 py-1 focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>
        )}
        <div className="space-y-1 max-h-48 overflow-y-auto custom-scrollbar pr-1 min-h-[32px]">
          {(zone.site_ids || []).length === 0 ? (
            <p className="text-xs text-slate-600 text-center py-2">Kéo site vào đây</p>
          ) : filteredSites.length === 0 ? (
            <p className="text-xs text-slate-600 text-center py-2">Không tìm thấy site</p>
          ) : (
            filteredSites.map((siteId) => (
              <ZoneSiteItem key={siteId} site={{ siteId, siteName: zone._siteNames?.[siteId] || siteId }} />
            ))
          )}
        </div>
      </div>

      {/* Members section */}
      <div className="border-t border-slate-800">
        <button
          onClick={() => setShowMembers(!showMembers)}
          className="w-full flex items-center justify-between px-3 py-2 text-xs text-slate-400 hover:text-slate-200 transition-colors"
        >
          <span className="flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" />
            Thành viên ({zone.members?.length || 0})
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
            />
            {isGlobalAdmin && (
              <>
                {!showAddMember ? (
                  <button
                    onClick={() => setShowAddMember(true)}
                    className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" /> Thêm thành viên
                  </button>
                ) : (
                  <div className="mt-2 space-y-2">
                    {/* User picker */}
                    <div ref={dropdownRef} className="relative">
                      <div className="flex items-center gap-1.5 bg-slate-800 border border-slate-600 rounded px-2 py-1.5 focus-within:border-blue-500 transition-colors">
                        <Search className="w-3 h-3 text-slate-500 shrink-0" />
                        <input
                          type="text"
                          value={newMemberEmail || userSearch}
                          onChange={(e) => {
                            setUserSearch(e.target.value);
                            setNewMemberEmail('');
                            setDropdownOpen(true);
                          }}
                          onFocus={() => setDropdownOpen(true)}
                          placeholder={allUsers.length > 0 ? 'Tìm hoặc nhập email...' : 'Nhập email...'}
                          className="flex-1 text-xs bg-transparent text-slate-200 placeholder-slate-500 focus:outline-none min-w-0"
                        />
                        {newMemberEmail && (
                          <span className="text-[10px] text-emerald-400 shrink-0">✓</span>
                        )}
                      </div>

                      {/* Dropdown list */}
                      {dropdownOpen && (userSearch || !newMemberEmail) && filteredUsers.length > 0 && (
                        <ul className="absolute top-full left-0 right-0 mt-0.5 bg-slate-800 border border-slate-700 rounded shadow-xl z-50 max-h-36 overflow-y-auto">
                          {filteredUsers.map(u => (
                            <li
                              key={u.id || u.email}
                              onMouseDown={() => {
                                setNewMemberEmail(u.email);
                                setUserSearch('');
                                setDropdownOpen(false);
                              }}
                              className="px-2.5 py-1.5 text-xs text-slate-300 hover:bg-slate-700 cursor-pointer flex items-center justify-between gap-2"
                            >
                              <span className="font-mono truncate">{u.email}</span>
                              <span className="text-[10px] text-slate-500 shrink-0">{u.role}</span>
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
                        className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded transition-colors disabled:opacity-50 flex-1"
                      >
                        {adding ? 'Đang thêm...' : 'Thêm'}
                      </button>
                      <button
                        onClick={() => { setShowAddMember(false); setNewMemberEmail(''); setUserSearch(''); }}
                        className="text-xs text-slate-500 hover:text-slate-300 px-1"
                      >
                        Hủy
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
