import React, { useState, useEffect } from 'react';
import apiClient from '../../api/apiClient';
import {
    Layout, Plus, Edit, Trash2, CheckCircle, XCircle,
    Palette, Clock, Search, Activity, Save, Info, Tag, ArrowRight
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useSite } from '../../context/SiteContext';

const PRESET_COLORS = [
    '#10B981', '#3B82F6', '#8B5CF6', '#F59E0B', '#EF4444',
    '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'
];

const Templates = () => {
    const { t } = useLanguage();
    const { sites, fetchSites } = useSite();
    const [templates, setTemplates] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    // Modal state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState(null);

    // Form state
    const [formData, setFormData] = useState({ name: '', description: '', color: '#10B981' });
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState('');

    // Site assignment state
    const [siteMapping, setSiteMapping] = useState({});
    const [assignTarget, setAssignTarget] = useState('');
    const [selectedSites, setSelectedSites] = useState([]);
    const [assigning, setAssigning] = useState(false);

    useEffect(() => { loadTemplates(); loadSiteMapping(); }, []);

    const loadTemplates = async () => {
        try {
            setLoading(true);
            const res = await apiClient.get('/templates');
            setTemplates(res.data || []);
        } catch (err) {
            console.error('Failed to load templates', err);
        } finally {
            setLoading(false);
        }
    };

    const loadSiteMapping = async () => {
        try {
            const res = await apiClient.get('/templates/mapping/sites');
            setSiteMapping(res.data || {});
        } catch (err) {
            console.error('Failed to load site mapping', err);
        }
    };

    const openCreate = () => {
        setEditingTemplate(null);
        setFormData({ name: '', description: '', color: '#10B981' });
        setFormError('');
        setIsModalOpen(true);
    };

    const openEdit = (tpl) => {
        setEditingTemplate(tpl);
        setFormData({ name: tpl.name, description: tpl.description || '', color: tpl.color });
        setFormError('');
        setIsModalOpen(true);
    };

    const handleSave = async (e) => {
        e.preventDefault();
        if (!formData.name.trim()) { setFormError('Template name is required.'); return; }
        setSaving(true);
        setFormError('');
        try {
            if (editingTemplate) {
                await apiClient.put(`/templates/${editingTemplate.id}`, formData);
            } else {
                await apiClient.post('/templates', formData);
            }
            setIsModalOpen(false);
            loadTemplates();
        } catch (err) {
            setFormError(err.response?.data?.detail || 'An error occurred.');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (tpl) => {
        if (!window.confirm(`Delete template "${tpl.name}"? All sites using this label will become untagged.`)) return;
        try {
            await apiClient.delete(`/templates/${tpl.id}`);
            loadTemplates();
            loadSiteMapping();
        } catch (err) {
            alert('Delete failed: ' + (err.response?.data?.detail || err.message));
        }
    };

    const handleAssignSites = async () => {
        if (selectedSites.length === 0 || !assignTarget) return;
        setAssigning(true);
        try {
            for (const siteId of selectedSites) {
                if (assignTarget === 'general') {
                    await apiClient.post('/templates/unassign', { site_id: siteId });
                } else {
                    await apiClient.post('/templates/assign', { site_id: siteId, template_id: assignTarget });
                }
            }
            setSelectedSites([]);
            loadSiteMapping();
            fetchSites();
        } catch (err) {
            alert('Error: ' + (err.response?.data?.detail || err.message));
        } finally {
            setAssigning(false);
        }
    };

    const toggleSiteSelection = (siteId) => {
        setSelectedSites(prev =>
            prev.includes(siteId) ? prev.filter(id => id !== siteId) : [...prev, siteId]
        );
    };

    const getTemplateBadge = (siteId) => siteMapping[siteId] || null;

    const filtered = templates.filter(t => t.name.toLowerCase().includes(searchTerm.toLowerCase()));

    return (
        <div className="w-full h-full p-8 space-y-8 animate-fade-in overflow-y-auto custom-scrollbar bg-slate-50 dark:bg-[#020617] rounded-3xl">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div>
                    <h2 className="text-3xl font-black text-slate-900 dark:text-white uppercase tracking-tight flex items-center gap-4">
                        <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center text-emerald-500">
                            <Layout size={28} />
                        </div>
                        Template Library
                    </h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400 font-medium ml-16 -mt-2">
                        Create labels to categorize and tag your sites.
                    </p>
                </div>
                <button
                    onClick={openCreate}
                    className="flex items-center gap-2 px-8 py-3.5 bg-emerald-600 hover:bg-emerald-500 transition-all th-text-primary font-black uppercase tracking-widest text-xs rounded-2xl shadow-xl shadow-emerald-500/20 active:scale-95"
                >
                    <Plus size={18} /> Create Template
                </button>
            </div>

            {/* Info Banner */}
            <div className="flex items-start gap-4 p-5 bg-blue-500/5 border border-blue-500/10 rounded-3xl">
                <Info className="text-blue-500 mt-0.5 shrink-0" size={18} />
                <p className="text-[11px] text-blue-600 dark:text-blue-400/80 leading-relaxed font-bold">
                    A template is an <strong>empty label</strong> — just a name and color. All sites default to <strong>General</strong>.
                    When using <strong>Full Clone</strong>, sites are automatically tagged. You can also manually assign templates in the <strong>Site Assignment</strong> section below.
                </p>
            </div>

            {/* Search */}
            <div className="relative group max-w-xl">
                <Search size={18} className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
                <input
                    type="text"
                    placeholder="Search templates by name..."
                    className="w-full h-14 bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/5 rounded-2xl pl-14 pr-5 text-sm font-bold focus:outline-none focus:border-emerald-500/50 transition-all"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            {/* Template Grid */}
            {loading ? (
                <div className="flex flex-col items-center justify-center py-32 space-y-4 opacity-40">
                    <Activity className="animate-spin text-emerald-500" size={48} />
                    <p className="text-xs font-black uppercase tracking-[0.3em]">Loading...</p>
                </div>
            ) : filtered.length === 0 ? (
                <div className="w-full py-20 flex flex-col items-center justify-center text-center">
                    <div className="w-28 h-28 bg-slate-100 dark:bg-white/5 rounded-[3rem] flex items-center justify-center th-text-secondary dark:text-slate-700 mb-6 border border-slate-200 dark:border-white/5">
                        <Layout size={56} />
                    </div>
                    <p className="text-xl font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-600">
                        {searchTerm ? 'No results found' : 'No templates yet'}
                    </p>
                    {!searchTerm && (
                        <button onClick={openCreate} className="mt-8 px-8 py-3.5 bg-emerald-600 th-text-primary font-black uppercase tracking-widest text-xs rounded-2xl flex items-center gap-3 active:scale-95 transition-all shadow-xl shadow-emerald-500/20">
                            <Plus size={18} /> Create your first template
                        </button>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {filtered.map(tpl => (
                        <div
                            key={tpl.id}
                            className="group relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-[2rem] p-6 shadow-sm hover:shadow-xl hover:border-opacity-50 transition-all duration-300 hover:-translate-y-1 overflow-hidden"
                        >
                            <div className="absolute top-0 left-0 w-full h-1.5 rounded-t-[2rem]" style={{ backgroundColor: tpl.color }} />
                            <div className="flex justify-between items-start mt-2 mb-5">
                                <div className="w-12 h-12 rounded-2xl flex items-center justify-center th-text-primary shadow-lg transition-transform duration-300 group-hover:rotate-6" style={{ backgroundColor: tpl.color }}>
                                    <Layout size={22} />
                                </div>
                                <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                    <button onClick={() => openEdit(tpl)} className="p-2.5 bg-slate-100 dark:bg-white/5 rounded-xl text-slate-500 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-all" title="Edit">
                                        <Edit size={15} />
                                    </button>
                                    <button onClick={() => handleDelete(tpl)} className="p-2.5 bg-slate-100 dark:bg-white/5 rounded-xl text-slate-500 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-all" title="Delete">
                                        <Trash2 size={15} />
                                    </button>
                                </div>
                            </div>
                            <h4 className="text-lg font-black text-slate-800 dark:text-white truncate mb-1">{tpl.name}</h4>
                            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-2 h-8 mb-5">{tpl.description || 'No description.'}</p>
                            <div className="pt-4 border-t border-slate-100 dark:border-white/5 flex items-center justify-between">
                                <span className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-slate-400">
                                    <Clock size={11} />
                                    {tpl.created_at ? new Date(tpl.created_at).toLocaleDateString('en-US') : '—'}
                                </span>
                                <span className="px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest border" style={{ borderColor: `${tpl.color}40`, backgroundColor: `${tpl.color}10`, color: tpl.color }}>
                                    BLUEPRINT
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* ═══ Site Template Assignment ═══ */}
            {sites.length > 0 && (
                <div className="bg-white dark:bg-slate-900/50 border border-slate-200 dark:border-white/5 rounded-[2rem] p-8">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center text-blue-500">
                            <Tag size={20} />
                        </div>
                        <div>
                            <h3 className="text-lg font-black text-slate-800 dark:text-white uppercase tracking-tight">Site Assignment</h3>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Assign templates to existing sites</p>
                        </div>
                    </div>

                    {/* Target template selector */}
                    <div className="flex flex-col sm:flex-row gap-4 mb-6">
                        <div className="flex-1">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 block">Assign to Template</label>
                            <select
                                value={assignTarget}
                                onChange={e => { setAssignTarget(e.target.value); setSelectedSites([]); }}
                                className="w-full h-12 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl px-4 text-sm font-bold focus:border-blue-500/50 transition-all outline-none appearance-none cursor-pointer"
                            >
                                <option value="">— Select template —</option>
                                <option value="general">🏷️ General (remove template)</option>
                                {templates.map(tpl => (
                                    <option key={tpl.id} value={tpl.id}>● {tpl.name}</option>
                                ))}
                            </select>
                        </div>
                        <div className="flex items-end">
                            <button
                                onClick={handleAssignSites}
                                disabled={assigning || selectedSites.length === 0 || !assignTarget}
                                className="h-12 px-6 bg-blue-600 hover:bg-blue-500 text-white font-black uppercase tracking-widest text-xs rounded-xl flex items-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-95"
                            >
                                {assigning ? <Activity size={14} className="animate-spin" /> : <ArrowRight size={14} />}
                                Assign ({selectedSites.length})
                            </button>
                        </div>
                    </div>

                    {/* Site list */}
                    {assignTarget && (
                        <div className="space-y-2 max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{sites.length} sites — select to assign</span>
                                <button
                                    onClick={() => setSelectedSites(selectedSites.length === sites.length ? [] : sites.map(s => s.siteId || s.id))}
                                    className="text-[10px] font-bold text-blue-500 hover:text-blue-400 transition-colors"
                                >
                                    {selectedSites.length === sites.length ? 'Deselect all' : 'Select all'}
                                </button>
                            </div>
                            {sites.map(site => {
                                const siteId = site.siteId || site.id;
                                const isSelected = selectedSites.includes(siteId);
                                const badge = getTemplateBadge(siteId);
                                return (
                                    <div
                                        key={siteId}
                                        onClick={() => toggleSiteSelection(siteId)}
                                        className={`flex items-center justify-between p-3.5 rounded-xl cursor-pointer border transition-all ${
                                            isSelected
                                                ? 'bg-blue-500/10 border-blue-500/30'
                                                : 'bg-slate-50 dark:bg-black/10 border-slate-200 dark:border-white/5 hover:border-blue-500/20'
                                        }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${isSelected ? 'bg-blue-500 border-blue-500' : 'border-slate-300 dark:border-white/20'}`}>
                                                {isSelected && <CheckCircle size={12} className="text-white" />}
                                            </div>
                                            <p className="text-sm font-bold text-slate-800 dark:text-white">{site.siteName || site.name || siteId}</p>
                                        </div>
                                        {badge ? (
                                            <span className="px-2.5 py-1 rounded-full text-[8px] font-black uppercase tracking-widest border" style={{ borderColor: `${badge.color}40`, backgroundColor: `${badge.color}10`, color: badge.color }}>
                                                {badge.name}
                                            </span>
                                        ) : (
                                            <span className="px-2.5 py-1 rounded-full text-[8px] font-black uppercase tracking-widest border border-slate-300/40 bg-slate-100/50 text-slate-400 dark:border-white/10 dark:bg-white/5 dark:text-slate-500">
                                                GENERAL
                                            </span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* Create / Edit Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md">
                    <div className="bg-white dark:bg-[#0F172A] w-full max-w-md rounded-[2.5rem] shadow-2xl border border-white/10 overflow-hidden">
                        <div className="px-8 py-6 border-b border-slate-100 dark:border-white/5 flex justify-between items-center">
                            <div>
                                <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight">
                                    {editingTemplate ? 'Edit Template' : 'Create New Template'}
                                </h3>
                                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-emerald-500 mt-0.5">Label System</p>
                            </div>
                            <button onClick={() => setIsModalOpen(false)} className="p-2.5 hover:bg-slate-100 dark:hover:bg-white/10 rounded-xl transition-colors">
                                <XCircle size={20} className="text-slate-400" />
                            </button>
                        </div>
                        <form onSubmit={handleSave} className="p-8 space-y-6">
                            {formError && (
                                <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-xs text-rose-500 font-bold">{formError}</div>
                            )}
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Template Name *</label>
                                <input autoFocus required type="text" maxLength={80}
                                    className="w-full h-12 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl px-5 text-sm font-bold focus:border-emerald-500/50 transition-all outline-none"
                                    placeholder="e.g. Resort Standard, Office V1..."
                                    value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Description (optional)</label>
                                <textarea rows={2}
                                    className="w-full p-4 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl text-sm font-bold focus:border-emerald-500/50 transition-all outline-none resize-none"
                                    placeholder="Brief description of this template..."
                                    value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })}
                                />
                            </div>
                            <div className="space-y-3">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-2"><Palette size={13} /> Badge Color</label>
                                <div className="flex flex-wrap gap-2">
                                    {PRESET_COLORS.map(c => (
                                        <button key={c} type="button" onClick={() => setFormData({ ...formData, color: c })}
                                            className={`w-9 h-9 rounded-xl transition-all border-2 ${formData.color === c ? 'border-white scale-110 shadow-lg' : 'border-transparent'}`}
                                            style={{ backgroundColor: c }}
                                        />
                                    ))}
                                    <input type="color" className="w-9 h-9 rounded-xl border-none cursor-pointer overflow-hidden bg-transparent"
                                        value={formData.color} onChange={e => setFormData({ ...formData, color: e.target.value })} title="Pick custom color"
                                    />
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Preview:</span>
                                    <span className="px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border"
                                        style={{ borderColor: `${formData.color}50`, backgroundColor: `${formData.color}15`, color: formData.color }}>
                                        {formData.name || 'TEMPLATE NAME'}
                                    </span>
                                </div>
                            </div>
                            <button type="submit" disabled={saving}
                                className="w-full h-14 bg-gradient-to-r from-emerald-600 to-teal-600 th-text-primary font-black uppercase tracking-widest rounded-2xl shadow-xl shadow-emerald-500/20 flex items-center justify-center gap-3 hover:scale-[1.02] active:scale-98 transition-all disabled:opacity-50">
                                {saving ? <Activity size={18} className="animate-spin" /> : <Save size={18} />}
                                {saving ? 'Saving...' : (editingTemplate ? 'Update' : 'Create Template')}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Templates;
