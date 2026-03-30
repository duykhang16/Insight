import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
import { GripVertical, Plus, RefreshCw, Layers, Save, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import apiClient from '../../api/apiClient';
import ZoneCard from '../../components/Zones/ZoneCard';
import DeleteZoneModal from '../../components/Zones/DeleteZoneModal';
import UnsavedChangesModal from '../../components/Zones/UnsavedChangesModal';
import PartialSaveModal from '../../components/Zones/PartialSaveModal';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { useLanguage } from '../../context/LanguageContext';

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
      className={`flex items-center gap-2 px-3 py-2 rounded th-bg-elevated border th-border cursor-grab active:cursor-grabbing text-sm th-text-secondary transition-opacity ${isDragging ? 'opacity-40' : 'hover:border-slate-500 hover:th-text-primary'
        }`}
    >
      <GripVertical className="w-4 h-4 text-slate-500 shrink-0" />
      <span className="truncate">{site.siteName || site.siteId}</span>
    </div>
  );
};

// ── Create Zone Modal ────────────────────────────────────────────────────────
const CreateZoneModal = ({ onCreated, onClose }) => {
  const { t } = useLanguage();
  const [form, setForm] = useState({ name: '', description: '', color: '#3B82F6' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const PRESET_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4'];

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setError(t('admin.zones.zone_name_empty')); return; }
    setSaving(true);
    setError('');
    try {
      await apiClient.post('/zones', { name: form.name.trim(), description: form.description || null, color: form.color });
      onCreated();
    } catch (err) {
      setError(err.response?.data?.detail || t('admin.zones.create_failed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="th-bg-surface border th-border rounded-xl w-full max-w-md mx-4 p-6">
        <h2 className="text-base font-semibold th-text-primary mb-4">{t('admin.zones.create_zone_title')}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">{t('admin.zones.zone_name_label')} <span className="text-rose-400">*</span></label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder={t('admin.zones.zone_name_placeholder')}
              className="w-full th-bg-elevated border border-slate-600 th-text-primary rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">{t('admin.zones.description_label')}</label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder={t('admin.zones.description_placeholder')}
              className="w-full th-bg-elevated border border-slate-600 th-text-primary rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-2">{t('admin.zones.color_label')}</label>
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
              className="flex-1 bg-blue-600 hover:bg-blue-700 th-text-primary text-sm py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
            >
              {saving ? t('admin.zones.creating_button') : t('admin.zones.create_button')}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-slate-700 hover:bg-slate-600 th-text-primary text-sm py-2 rounded-lg transition-colors"
            >
              {t('admin.zones.cancel')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ── Deep clone helper ────────────────────────────────────────────────────────
const deepClone = (obj) => JSON.parse(JSON.stringify(obj));

// ── Main Page ────────────────────────────────────────────────────────────────
const ZoneManagement = () => {
  const { t } = useLanguage();

  // ── State architecture: original (snapshot) vs working (mutable) ──
  const [originalState, setOriginalState] = useState(null);
  const [workingState, setWorkingState] = useState(null);
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [activeDrag, setActiveDrag] = useState(null);

  // Modal states
  const [deleteTarget, setDeleteTarget] = useState(null); // zone object to delete
  const [showUnsavedModal, setShowUnsavedModal] = useState(false);
  const [unsavedAction, setUnsavedAction] = useState(null); // callback if user discards
  const [partialResults, setPartialResults] = useState(null); // for PartialSaveModal

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  // ── Dirty detection (order-insensitive) ──
  const isDirty = useMemo(() => {
    if (!originalState || !workingState) return false;

    // Compare zones count
    if (originalState.zones.length !== workingState.zones.length) return true;

    for (const oz of originalState.zones) {
      const wz = workingState.zones.find(z => z.id === oz.id);
      if (!wz) return true;

      // Check metadata
      if (oz.name !== wz.name) return true;
      if ((oz.description || '') !== (wz.description || '')) return true;
      if (oz.color !== wz.color) return true;

      // Check site_ids (order-insensitive via Set)
      const ozSites = new Set(oz.site_ids || []);
      const wzSites = new Set(wz.site_ids || []);
      if (ozSites.size !== wzSites.size) return true;
      for (const id of ozSites) {
        if (!wzSites.has(id)) return true;
      }
    }

    // Compare unassigned (order-insensitive)
    const ozUnassigned = new Set(originalState.unassignedSites.map(s => s.siteId));
    const wzUnassigned = new Set(workingState.unassignedSites.map(s => s.siteId));
    if (ozUnassigned.size !== wzUnassigned.size) return true;
    for (const id of ozUnassigned) {
      if (!wzUnassigned.has(id)) return true;
    }

    return false;
  }, [originalState, workingState]);

  // ── Compute change summary for unsaved guard ──
  const getChangeSummary = useCallback(() => {
    if (!originalState || !workingState) return [];
    const changes = [];

    // Site movements
    let totalMoved = 0;
    workingState.zones.forEach(wz => {
      const oz = originalState.zones.find(z => z.id === wz.id);
      if (!oz) return;
      const added = wz.site_ids.filter(id => !oz.site_ids.includes(id));
      const removed = oz.site_ids.filter(id => !wz.site_ids.includes(id));
      totalMoved += added.length + removed.length;
    });
    // Also count sites moved to/from unassigned
    const origUnassignedIds = new Set(originalState.unassignedSites.map(s => s.siteId));
    const workUnassignedIds = new Set(workingState.unassignedSites.map(s => s.siteId));
    origUnassignedIds.forEach(id => { if (!workUnassignedIds.has(id)) totalMoved++; });
    workUnassignedIds.forEach(id => { if (!origUnassignedIds.has(id)) totalMoved++; });
    // Deduplicate: each site move counts once
    if (totalMoved > 0) {
      const uniqueMoved = new Set();
      workingState.zones.forEach(wz => {
        const oz = originalState.zones.find(z => z.id === wz.id);
        if (!oz) return;
        wz.site_ids.filter(id => !oz.site_ids.includes(id)).forEach(id => uniqueMoved.add(id));
        oz.site_ids.filter(id => !wz.site_ids.includes(id)).forEach(id => uniqueMoved.add(id));
      });
      origUnassignedIds.forEach(id => { if (!workUnassignedIds.has(id)) uniqueMoved.add(id); });
      workUnassignedIds.forEach(id => { if (!origUnassignedIds.has(id)) uniqueMoved.add(id); });
      if (uniqueMoved.size > 0) {
        changes.push(t('admin.zones.unsaved_change_sites_moved').replace('{count}', uniqueMoved.size));
      }
    }

    // Metadata changes
    workingState.zones.forEach(wz => {
      const oz = originalState.zones.find(z => z.id === wz.id);
      if (!oz) return;
      if (oz.name !== wz.name) {
        changes.push(t('admin.zones.unsaved_change_renamed').replace('{from}', oz.name).replace('{to}', wz.name));
      }
      if (oz.color !== wz.color) {
        changes.push(t('admin.zones.unsaved_change_color').replace('{zone}', wz.name));
      }
      if ((oz.description || '') !== (wz.description || '')) {
        changes.push(t('admin.zones.unsaved_change_desc').replace('{zone}', wz.name));
      }
    });

    return changes;
  }, [originalState, workingState, t]);

  // ── Fetch data ──
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [zonesResult, sitesResult, usersResult] = await Promise.allSettled([
        apiClient.get('/zones'),
        apiClient.get('/cloner/live-sites'),
        apiClient.get('/admin/users'),
      ]);

      if (zonesResult.status !== 'fulfilled') {
        throw zonesResult.reason;
      }

      const fetchedZones = zonesResult.value.data || [];
      const fetchedSites = sitesResult.status === 'fulfilled'
        ? (sitesResult.value.data || [])
        : [];
      const fetchedUsers = usersResult.status === 'fulfilled'
        ? (usersResult.value.data || [])
        : [];

      if (sitesResult.status !== 'fulfilled') {
        console.warn('ZoneManagement: live sites unavailable, continuing with empty site list.', sitesResult.reason);
      }
      if (usersResult.status !== 'fulfilled') {
        console.warn('ZoneManagement: admin users unavailable, continuing with empty user list.', usersResult.reason);
      }

      // Create a lookup for site names
      const siteMapping = {};
      fetchedSites.forEach(s => {
        siteMapping[s.siteId] = s.siteName;
      });

      // Fetch full zone details (with members and site_ids)
      const zoneDetails = await Promise.all(
        fetchedZones.map((z) =>
          apiClient.get(`/zones/${z.id}`)
            .then((r) => {
              const data = r.data;
              data._siteNames = siteMapping;
              return data;
            })
            .catch((err) => {
              console.warn(`ZoneManagement: failed to load detail for zone ${z.id}, using summary response.`, err);
              return {
                ...z,
                members: z.members || [],
                member_count: z.member_count || 0,
                site_ids: z.site_ids || [],
                _siteNames: siteMapping,
              };
            })
        )
      );

      // Identify unassigned sites
      const assignedIds = new Set(zoneDetails.flatMap((z) => z.site_ids || []));
      const unassigned = fetchedSites.filter((s) => !assignedIds.has(s.siteId));

      const stateData = {
        zones: zoneDetails,
        unassignedSites: unassigned,
      };

      setOriginalState(deepClone(stateData));
      setWorkingState(deepClone(stateData));
      setAllUsers(fetchedUsers);
    } catch (err) {
      console.error('Failed to load zones/sites:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Browser beforeunload guard ──
  useEffect(() => {
    const handler = (e) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  // ── Navigation guard: pushState (sidebar) + popstate (browser back) ──
  const isDirtyRef = useRef(false);
  const originalPushStateRef = useRef(null);

  // Sync isDirtyRef via useEffect (deferred, not during render body)
  // so manual isDirtyRef.current = false in discard isn't overwritten
  // by a re-render before history.go() completes.
  useEffect(() => {
    isDirtyRef.current = isDirty;
  }, [isDirty]);

  useEffect(() => {
    // Save original pushState once
    if (!originalPushStateRef.current) {
      originalPushStateRef.current = window.history.pushState.bind(window.history);
    }
    const originalPushState = originalPushStateRef.current;

    // 1. Intercept pushState (react-router sidebar navigation)
    window.history.pushState = function (...args) {
      if (isDirtyRef.current) {
        setUnsavedAction(() => () => {
          isDirtyRef.current = false;
          window.history.pushState = originalPushState;
          originalPushState(...args);
          window.dispatchEvent(new PopStateEvent('popstate', { state: args[0] }));
        });
        setShowUnsavedModal(true);
        return;
      }
      originalPushState(...args);
    };

    // 2. Browser back button guard:
    //    Push a dummy entry so pressing back stays on the same URL
    //    (react-router won't unmount because URL hasn't changed).
    originalPushState(null, '', window.location.href);

    const handlePopState = () => {
      if (isDirtyRef.current) {
        // Re-push dummy to keep user on this page
        originalPushState(null, '', window.location.href);
        setUnsavedAction(() => () => {
          // go(-2): skip the dummy we just pushed + the mount dummy
          isDirtyRef.current = false;
          window.history.go(-2);
        });
        setShowUnsavedModal(true);
      }
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.history.pushState = originalPushState;
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  // ── Handle Refresh with dirty check ──
  const handleRefresh = () => {
    if (isDirty) {
      setUnsavedAction(() => () => { fetchData(); });
      setShowUnsavedModal(true);
    } else {
      fetchData();
    }
  };

  // ── Drag & Drop (local only!) ──
  const handleDragStart = ({ active }) => {
    setActiveDrag(active.data.current);
  };

  const handleDragEnd = ({ active, over }) => {
    setActiveDrag(null);
    if (!over) return;

    const siteId = active.data.current?.siteId;
    const siteName = active.data.current?.siteName;
    const targetZoneId = over.id;

    if (!siteId || !targetZoneId) return;

    setWorkingState(prev => {
      const next = deepClone(prev);

      // Check if already in target
      if (targetZoneId === 'unassigned') {
        const alreadyUnassigned = next.unassignedSites.some(s => s.siteId === siteId);
        if (alreadyUnassigned) return prev;
      } else {
        const targetZone = next.zones.find(z => z.id === targetZoneId);
        if (targetZone?.site_ids?.includes(siteId)) return prev;
      }

      // Remove from all zones
      next.zones.forEach(z => {
        z.site_ids = (z.site_ids || []).filter(id => id !== siteId);
      });
      // Remove from unassigned
      next.unassignedSites = next.unassignedSites.filter(s => s.siteId !== siteId);

      // Add to target
      if (targetZoneId === 'unassigned') {
        next.unassignedSites.push({ siteId, siteName: siteName || siteId });
      } else {
        const targetZone = next.zones.find(z => z.id === targetZoneId);
        if (targetZone) {
          targetZone.site_ids = [...(targetZone.site_ids || []), siteId];
        }
      }

      return next;
    });
  };

  // ── Inline edit zone (local only!) ──
  const handleEditZone = (zoneId, updates) => {
    setWorkingState(prev => {
      const next = deepClone(prev);
      const zone = next.zones.find(z => z.id === zoneId);
      if (zone) {
        zone.name = updates.name;
        zone.description = updates.description;
        zone.color = updates.color;
      }
      return next;
    });
  };

  // ── Delete zone (immediate, with custom modal) ──
  const handleDeleteZone = async (zoneId) => {
    try {
      await apiClient.delete(`/zones/${zoneId}`);
      setDeleteTarget(null);
      toast.success('Zone deleted successfully');
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || t('admin.zones.delete_failed'));
    }
  };

  // ── Save flow ──
  const handleSave = async () => {
    if (!isDirty || !originalState || !workingState) return;
    setSaving(true);

    const results = [];

    try {
      // 1. Compute changes
      const siteChanges = [];
      const metaChanges = [];

      workingState.zones.forEach(wz => {
        const oz = originalState.zones.find(z => z.id === wz.id);
        if (!oz) return;

        // Site assignment changes
        const ozSorted = [...(oz.site_ids || [])].sort();
        const wzSorted = [...(wz.site_ids || [])].sort();
        if (JSON.stringify(ozSorted) !== JSON.stringify(wzSorted)) {
          siteChanges.push({ zoneId: wz.id, zoneName: wz.name, site_ids: wz.site_ids });
        }

        // Metadata changes
        if (oz.name !== wz.name || (oz.description || '') !== (wz.description || '') || oz.color !== wz.color) {
          metaChanges.push({
            zoneId: wz.id,
            zoneName: wz.name,
            name: wz.name,
            description: wz.description,
            color: wz.color,
          });
        }
      });

      // 2. Fire all API calls
      const promises = [];

      siteChanges.forEach(change => {
        promises.push(
          apiClient.put(`/zones/${change.zoneId}/sites`, { site_ids: change.site_ids })
            .then(() => ({ ok: true, type: 'sites', zoneId: change.zoneId, label: `Sites → ${change.zoneName}` }))
            .catch(err => ({ ok: false, type: 'sites', zoneId: change.zoneId, label: `Sites → ${change.zoneName}`, error: err.response?.data?.detail || 'Failed' }))
        );
      });

      metaChanges.forEach(change => {
        promises.push(
          apiClient.put(`/zones/${change.zoneId}`, { name: change.name, description: change.description, color: change.color })
            .then(() => ({ ok: true, type: 'meta', zoneId: change.zoneId, label: `Zone "${change.zoneName}"` }))
            .catch(err => ({ ok: false, type: 'meta', zoneId: change.zoneId, label: `Zone "${change.zoneName}"`, error: err.response?.data?.detail || 'Failed' }))
        );
      });

      const allResults = await Promise.all(promises);
      const successCount = allResults.filter(r => r.ok).length;
      const failCount = allResults.filter(r => !r.ok).length;

      if (failCount === 0) {
        // All success!
        toast.success(t('admin.zones.save_success'));
        await fetchData();
      } else if (successCount === 0) {
        // All failed
        setPartialResults(allResults);
      } else {
        // Partial: show modal
        setPartialResults(allResults);
      }
    } catch (err) {
      console.error('Save failed:', err);
      toast.error('Save failed unexpectedly');
    } finally {
      setSaving(false);
    }
  };

  // ── Partial save handlers ──
  const handleSavePartial = async () => {
    // User chose to keep the successful changes, discard failed
    setPartialResults(null);
    await fetchData(); // Re-fetch to get the committed state
  };

  const handleCancelAll = async () => {
    // User chose to rollback everything
    // We need to revert the successful changes too
    // For simplicity, re-fetch the original state
    setPartialResults(null);

    // Revert successful site changes
    if (partialResults && originalState) {
      const successSiteChanges = partialResults.filter(r => r.ok && r.type === 'sites');
      const successMetaChanges = partialResults.filter(r => r.ok && r.type === 'meta');

      try {
        // Revert site assignments
        for (const change of successSiteChanges) {
          const origZone = originalState.zones.find(z => z.id === change.zoneId);
          if (origZone) {
            await apiClient.put(`/zones/${change.zoneId}/sites`, { site_ids: origZone.site_ids });
          }
        }
        // Revert metadata
        for (const change of successMetaChanges) {
          const origZone = originalState.zones.find(z => z.id === change.zoneId);
          if (origZone) {
            await apiClient.put(`/zones/${change.zoneId}`, {
              name: origZone.name,
              description: origZone.description,
              color: origZone.color,
            });
          }
        }
      } catch (err) {
        console.error('Revert failed:', err);
      }
    }
    // Keep workingState as-is so user can retry
    await fetchData();
  };

  // ── Unsaved modal handlers ──
  const handleUnsavedDiscard = () => {
    setShowUnsavedModal(false);
    // Disable guard BEFORE executing action to prevent popstate re-block
    isDirtyRef.current = false;
    if (unsavedAction) {
      unsavedAction();
      setUnsavedAction(null);
    }
  };

  const handleUnsavedStay = () => {
    setShowUnsavedModal(false);
    setUnsavedAction(null);
  };

  // ── Rendering ──
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  const zones = workingState?.zones || [];
  const unassignedSites = workingState?.unassignedSites || [];

  return (
    <div className="p-6 h-full overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-3">
            <Layers className="w-5 h-5 text-blue-400" />
            <h1 className="text-lg font-semibold th-text-primary">{t('admin.zones.title')}</h1>
            <span className="text-xs text-slate-500 th-bg-elevated px-2 py-0.5 rounded-full">
              {zones.length} {t('admin.zones.zones_count')} · {unassignedSites.length} {t('admin.zones.unassigned_count')}
            </span>
            {isDirty && (
              <span className="text-xs text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full animate-pulse">
                ● Unsaved
              </span>
            )}
          </div>
        </div>
        <TooltipProvider>
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger
                onClick={handleRefresh}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-400 hover:th-text-primary border th-border hover:border-slate-500 rounded-lg transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" /> {t('admin.zones.refresh')}
              </TooltipTrigger>
              <TooltipContent>Reload data from server</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                onClick={() => setShowCreateModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 th-text-primary rounded-lg transition-colors font-medium"
              >
                <Plus className="w-3.5 h-3.5" /> {t('admin.zones.new_zone')}
              </TooltipTrigger>
              <TooltipContent>Create a new zone</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                onClick={handleSave}
                disabled={!isDirty || saving}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-all font-medium ${
                  isDirty
                    ? 'bg-emerald-600 hover:bg-emerald-700 th-text-primary shadow-lg shadow-emerald-600/20'
                    : 'bg-slate-700 text-slate-500 cursor-not-allowed opacity-50'
                }`}
              >
                {saving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                {saving ? t('admin.zones.saving') : t('admin.zones.save_changes')}
              </TooltipTrigger>
              <TooltipContent>
                {isDirty ? 'Save all pending changes' : t('admin.zones.no_changes')}
              </TooltipContent>
            </Tooltip>
          </div>
        </TooltipProvider>
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
            <UnassignedSitesArea sites={unassignedSites} />
          </div>

          {/* Right: Zone Cards */}
          <div className="col-span-9 space-y-4">
            {zones.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-slate-500">
                <Layers className="w-10 h-10 mb-3 opacity-30" />
                <p className="text-sm">{t('admin.zones.no_zones')}</p>
              </div>
            ) : (
              zones.map((zone) => (
                <ZoneCard
                  key={zone.id}
                  zone={zone}
                  isGlobalAdmin={true}
                  onUpdated={fetchData}
                  onDelete={(z) => setDeleteTarget(z)}
                  onEditZone={handleEditZone}
                  allUsers={allUsers}
                />
              ))
            )}
          </div>
        </div>

        <DragOverlay>
          {activeDrag && (
            <div className="flex items-center gap-2 px-3 py-2 rounded bg-blue-700 border border-blue-500 text-sm th-text-primary shadow-xl opacity-90 cursor-grabbing">
              <GripVertical className="w-4 h-4 shrink-0" />
              <span>{activeDrag.siteName || activeDrag.siteId}</span>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {/* ── Modals ── */}
      {showCreateModal && (
        <CreateZoneModal
          onCreated={() => { setShowCreateModal(false); fetchData(); }}
          onClose={() => setShowCreateModal(false)}
        />
      )}

      <DeleteZoneModal
        zone={deleteTarget}
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteZone}
      />

      <UnsavedChangesModal
        open={showUnsavedModal}
        onClose={handleUnsavedStay}
        onDiscard={handleUnsavedDiscard}
        changeSummary={getChangeSummary()}
      />

      {partialResults && (
        <PartialSaveModal
          open={!!partialResults}
          onClose={() => setPartialResults(null)}
          onSavePartial={handleSavePartial}
          onCancelAll={handleCancelAll}
          results={partialResults}
          saving={saving}
        />
      )}
    </div>
  );
};

// ── Unassigned Sites Droppable ───────────────────────────────────────────────
const UnassignedSitesArea = ({ sites }) => {
  const { t } = useLanguage();
  const { setNodeRef, isOver } = useDroppable({
    id: 'unassigned',
  });

  return (
    <div className="sticky top-0">
      <h2 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-3 px-1">
        {t('admin.zones.unassigned_sites')} ({sites.length})
      </h2>
      <div
        ref={setNodeRef}
        className={`space-y-1.5 min-h-[150px] p-2 rounded-lg border border-dashed transition-colors ${isOver ? 'border-blue-500 bg-blue-900/10' : 'th-border bg-slate-900/30'
          }`}
      >
        {sites.length === 0 ? (
          <p className="text-xs text-slate-600 text-center py-4">
            {t('admin.zones.all_sites_assigned')}
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
