import React, { useState, useEffect, useCallback } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  useDroppable,
} from '@dnd-kit/core';
import { useDraggable } from '@dnd-kit/core';
import { GripVertical, Plus, RefreshCw, Layers } from 'lucide-react';
import apiClient from '../../api/apiClient';
import ZoneCard from '../../components/Zones/ZoneCard';

// ── Draggable unassigned site item ──────────────────────────────────────────
const DraggableSite = ({ site }) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `site::${site.siteId}`,
    data: { type: 'site', siteId: site.siteId, siteName: site.siteName },
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`flex items-center gap-2 px-3 py-2 rounded bg-slate-800 border border-slate-700 cursor-grab active:cursor-grabbing text-sm text-slate-300 transition-opacity ${isDragging ? 'opacity-40' : 'hover:border-slate-500 hover:text-white'
        }`}
    >
      <GripVertical className="w-4 h-4 text-slate-500 shrink-0" />
      <span className="truncate">{site.siteName || site.siteId}</span>
    </div>
  );
};

// ── Create Zone Modal ────────────────────────────────────────────────────────
const CreateZoneModal = ({ onCreated, onClose }) => {
  const [form, setForm] = useState({ name: '', description: '', color: '#3B82F6' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const PRESET_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4'];

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setError('Tên zone không được để trống.'); return; }
    setSaving(true);
    setError('');
    try {
      await apiClient.post('/zones', { name: form.name.trim(), description: form.description || null, color: form.color });
      onCreated();
    } catch (err) {
      setError(err.response?.data?.detail || 'Tạo zone thất bại.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-[#0F172A] border border-slate-700 rounded-xl w-full max-w-md mx-4 p-6">
        <h2 className="text-base font-semibold text-white mb-4">Tạo Zone mới</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Tên Zone <span className="text-rose-400">*</span></label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Chi nhánh Miền Nam"
              className="w-full bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Mô tả</label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Tuỳ chọn"
              className="w-full bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-2">Màu</label>
            <div className="flex gap-2 flex-wrap">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm({ ...form, color: c })}
                  className={`w-7 h-7 rounded-full transition-transform ${form.color === c ? 'scale-125 ring-2 ring-white ring-offset-1 ring-offset-slate-900' : 'hover:scale-110'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          {error && <p className="text-xs text-rose-400">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              {saving ? 'Đang tạo...' : 'Tạo Zone'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm py-2 rounded-lg transition-colors"
            >
              Hủy
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ── Main Page ────────────────────────────────────────────────────────────────
const ZoneManagement = () => {
  const [zones, setZones] = useState([]);
  const [allSites, setAllSites] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [activeDrag, setActiveDrag] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [zonesRes, sitesRes, usersRes] = await Promise.all([
        apiClient.get('/zones'),
        apiClient.get('/cloner/live-sites'),
        apiClient.get('/admin/users').catch(() => ({ data: [] })),
      ]);
      const fetchedZones = zonesRes.data || [];
      const fetchedSites = sitesRes.data || [];

      // Create a lookup for site names
      const siteMapping = {};
      fetchedSites.forEach(s => {
        siteMapping[s.siteId] = s.siteName;
      });

      // Fetch full zone details (with members and site_ids)
      const zoneDetails = await Promise.all(
        fetchedZones.map((z) => apiClient.get(`/zones/${z.id}`).then((r) => {
          const data = r.data;
          // Attach lookup to each zone so ZoneCard can resolve names without extra state
          data._siteNames = siteMapping;
          return data;
        }))
      );

      // Identify unassigned sites
      const assignedIds = new Set(zoneDetails.flatMap((z) => z.site_ids || []));
      const unassigned = fetchedSites.filter((s) => !assignedIds.has(s.siteId));

      setZones(zoneDetails);
      setAllSites(unassigned);
      setAllUsers(usersRes.data || []);
    } catch (err) {
      console.error('Failed to load zones/sites:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleDragStart = ({ active }) => {
    setActiveDrag(active.data.current);
  };

  const handleDragEnd = async ({ active, over }) => {
    setActiveDrag(null);
    if (!over) return;

    const siteId = active.data.current?.siteId;
    const targetZoneId = over.id; // zone.id used as droppable id

    if (!siteId || !targetZoneId) return;

    // Find which zone currently has this site
    const currentZone = zones.find((z) => (z.site_ids || []).includes(siteId));

    if (targetZoneId === 'unassigned') {
      // Remove from current zone
      if (!currentZone) return;
      const newSiteIds = (currentZone.site_ids || []).filter((id) => id !== siteId);
      try {
        await apiClient.put(`/zones/${currentZone.id}/sites`, { site_ids: newSiteIds });
        fetchData();
      } catch (err) {
        console.error('Failed to unassign site:', err);
      }
      return;
    }

    // Moving to a zone
    const targetZone = zones.find((z) => z.id === targetZoneId);
    if (!targetZone) return;
    if (currentZone?.id === targetZoneId) return; // already in this zone

    try {
      // Remove from old zone
      if (currentZone) {
        const oldSiteIds = (currentZone.site_ids || []).filter((id) => id !== siteId);
        await apiClient.put(`/zones/${currentZone.id}/sites`, { site_ids: oldSiteIds });
      }
      // Add to new zone
      const newSiteIds = [...(targetZone.site_ids || []), siteId];
      await apiClient.put(`/zones/${targetZoneId}/sites`, { site_ids: newSiteIds });
      fetchData();
    } catch (err) {
      console.error('Failed to move site:', err);
    }
  };

  const handleDeleteZone = async (zoneId) => {
    if (!confirm('Xóa zone này? Các site sẽ trở thành chưa phân vùng.')) return;
    try {
      await apiClient.delete(`/zones/${zoneId}`);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.detail || 'Xóa thất bại.');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="p-6 h-full overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Layers className="w-5 h-5 text-blue-400" />
          <h1 className="text-lg font-semibold text-white">Zone Management</h1>
          <span className="text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full">
            {zones.length} zones · {allSites.length} unassigned
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchData}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 rounded-lg transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium"
          >
            <Plus className="w-3.5 h-3.5" /> New Zone
          </button>
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="grid grid-cols-12 gap-4 h-full">
          {/* Left: Unassigned Sites */}
          <div className="col-span-3">
            <UnassignedSitesArea sites={allSites} />
          </div>

          {/* Right: Zone Cards */}
          <div className="col-span-9 space-y-4">
            {zones.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-slate-500">
                <Layers className="w-10 h-10 mb-3 opacity-30" />
                <p className="text-sm">Chưa có Zone nào. Tạo Zone đầu tiên!</p>
              </div>
            ) : (
              zones.map((zone) => (
                <ZoneCard
                  key={zone.id}
                  zone={zone}
                  isGlobalAdmin={true}
                  onUpdated={fetchData}
                  onDelete={handleDeleteZone}
                  allUsers={allUsers}
                />
              ))
            )}
          </div>
        </div>

        <DragOverlay>
          {activeDrag && (
            <div className="flex items-center gap-2 px-3 py-2 rounded bg-blue-700 border border-blue-500 text-sm text-white shadow-xl opacity-90 cursor-grabbing">
              <GripVertical className="w-4 h-4 shrink-0" />
              <span>{activeDrag.siteName || activeDrag.siteId}</span>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {showCreateModal && (
        <CreateZoneModal
          onCreated={() => { setShowCreateModal(false); fetchData(); }}
          onClose={() => setShowCreateModal(false)}
        />
      )}
    </div>
  );
};

// ── Unassigned Sites Droppable ───────────────────────────────────────────────
const UnassignedSitesArea = ({ sites }) => {
  const { setNodeRef, isOver } = useDroppable({
    id: 'unassigned',
  });

  return (
    <div className="sticky top-0">
      <h2 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3 px-1">
        Unassigned Sites ({sites.length})
      </h2>
      <div
        ref={setNodeRef}
        className={`space-y-1.5 min-h-[150px] p-2 rounded-lg border border-dashed transition-colors ${isOver ? 'border-blue-500 bg-blue-900/10' : 'border-slate-700 bg-slate-900/30'
          }`}
      >
        {sites.length === 0 ? (
          <p className="text-xs text-slate-600 text-center py-4">
            Tất cả site đã được phân vùng
          </p>
        ) : (
          sites.map((site) => (
            <DraggableSite key={site.siteId} site={site} />
          ))
        )}
      </div>
    </div>
  );
};

export default ZoneManagement;
