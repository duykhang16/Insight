import React, { useState, useEffect } from 'react';
import apiClient from '../../api/apiClient';
import {
    Layout, Plus, Edit, Trash2, CheckCircle, XCircle,
    Palette, Clock, Search, Activity, Save, Info, Wifi,
    Download, Database, Server, ChevronDown, FileCode, Layers,
    Upload, Zap, Check
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useSite } from '../../context/SiteContext';

const PRESET_COLORS = [
    '#10B981', '#3B82F6', '#8B5CF6', '#F59E0B', '#EF4444',
    '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'
];

const Templates = () => {
    const { t } = useLanguage();
    const { sites, fetchSites, loadingSites } = useSite();
    const [templates, setTemplates] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    // Create/Edit Modal state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState(null);
    const [formData, setFormData] = useState({ name: '', description: '', color: '#10B981' });
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState('');

    // Extract Modal state
    const [isExtractOpen, setIsExtractOpen] = useState(false);
    const [extractData, setExtractData] = useState({ source_site_id: '', name: '', description: '', color: '#10B981' });
    const [extracting, setExtracting] = useState(false);
    const [extractError, setExtractError] = useState('');
    const [extractSiteSearch, setExtractSiteSearch] = useState('');

    // Apply Modal state
    const [isApplyOpen, setIsApplyOpen] = useState(false);
    const [applyTemplate, setApplyTemplate] = useState(null);
    const [applyTargetIds, setApplyTargetIds] = useState([]);
    const [applying, setApplying] = useState(false);
    const [applyError, setApplyError] = useState('');
    const [applyResults, setApplyResults] = useState(null);
    const [applySiteSearch, setApplySiteSearch] = useState('');

    useEffect(() => { loadTemplates(); }, []);
    useEffect(() => { if (sites.length === 0) fetchSites(); }, []);

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

    // ── Create/Edit ────────────────────────────────────────────────────

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
        if (!formData.name.trim()) { setFormError('Tên template không được để trống.'); return; }
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
            setFormError(err.response?.data?.detail || 'Đã có lỗi xảy ra.');
        } finally {
            setSaving(false);
        }
    };

    // ── Extract ────────────────────────────────────────────────────────

    const openExtract = () => {
        setExtractData({ source_site_id: '', name: '', description: '', color: '#10B981' });
        setExtractError('');
        setExtractSiteSearch('');
        setIsExtractOpen(true);
    };

    const handleExtract = async (e) => {
        e.preventDefault();
        if (!extractData.source_site_id) { setExtractError('Vui lòng chọn site nguồn.'); return; }
        if (!extractData.name.trim()) { setExtractError('Tên template không được để trống.'); return; }
        setExtracting(true);
        setExtractError('');
        try {
            await apiClient.post('/templates/extract', extractData);
            setIsExtractOpen(false);
            loadTemplates();
        } catch (err) {
            setExtractError(err.response?.data?.detail || 'Không thể trích xuất config từ site.');
        } finally {
            setExtracting(false);
        }
    };

    const selectSiteForExtract = (site) => {
        const siteId = site.siteId || site.id || site._id;
        const siteName = site.siteName || site.name || 'Site';
        setExtractData(prev => ({
            ...prev,
            source_site_id: siteId,
            name: prev.name || `Template - ${siteName}`,
            description: prev.description || `Trích xuất từ ${siteName}`,
        }));
        setExtractSiteSearch('');
    };

    const filteredSites = sites.filter(s => {
        const name = (s.siteName || s.name || '').toLowerCase();
        return name.includes(extractSiteSearch.toLowerCase());
    });

    const selectedSite = sites.find(s =>
        (s.siteId || s.id || s._id) === extractData.source_site_id
    );

    // ── Apply Template ─────────────────────────────────────────────────

    const openApply = (tpl) => {
        setApplyTemplate(tpl);
        setApplyTargetIds([]);
        setApplyError('');
        setApplyResults(null);
        setApplySiteSearch('');
        setIsApplyOpen(true);
    };

    const toggleApplyTarget = (siteId) => {
        setApplyTargetIds(prev =>
            prev.includes(siteId)
                ? prev.filter(id => id !== siteId)
                : [...prev, siteId]
        );
    };

    const handleApply = async () => {
        if (!applyTargetIds.length) { setApplyError('Vui lòng chọn ít nhất 1 site.'); return; }
        setApplying(true);
        setApplyError('');
        setApplyResults(null);
        try {
            const res = await apiClient.post('/cloner/sync-template', {
                template_id: applyTemplate.id,
                target_site_ids: applyTargetIds,
            });
            setApplyResults(res.data);
            loadTemplates();
        } catch (err) {
            setApplyError(err.response?.data?.detail || 'Không thể áp template.');
        } finally {
            setApplying(false);
        }
    };

    const applyFilteredSites = sites.filter(s => {
        const name = (s.siteName || s.name || '').toLowerCase();
        return name.includes(applySiteSearch.toLowerCase());
    });

    // ── Template list ──────────────────────────────────────────────────

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
                        Tạo và quản lý config blueprint cho các site.
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={openExtract}
                        className="flex items-center gap-2 px-6 py-3.5 bg-blue-600 hover:bg-blue-500 transition-all text-white font-black uppercase tracking-widest text-xs rounded-2xl shadow-xl shadow-blue-500/20 active:scale-95"
                    >
                        <Download size={16} /> Trích xuất từ Site
                    </button>
                    <button
                        onClick={openCreate}
                        className="flex items-center gap-2 px-8 py-3.5 bg-emerald-600 hover:bg-emerald-500 transition-all text-white font-black uppercase tracking-widest text-xs rounded-2xl shadow-xl shadow-emerald-500/20 active:scale-95"
                    >
                        <Plus size={18} /> Tạo Template
                    </button>
                </div>
            </div>

            {/* Info Banner */}
            <div className="flex items-start gap-4 p-5 bg-blue-500/5 border border-blue-500/10 rounded-3xl">
                <Info className="text-blue-500 mt-0.5 shrink-0" size={18} />
                <p className="text-[11px] text-blue-600 dark:text-blue-400/80 leading-relaxed font-bold">
                    Template là <strong>config blueprint</strong> — lưu trữ cấu hình mạng (SSID, VLAN, security, policies). 
                    Dùng <strong>"Trích xuất từ Site"</strong> để lấy config từ site có sẵn, hoặc <strong>"Tạo Template"</strong> để tạo thủ công.
                    Mọi site đều thuộc 1 template — site chưa phân loại nằm trong <strong>General</strong>.
                </p>
            </div>

            {/* Search */}
            <div className="relative group max-w-xl">
                <Search size={18} className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
                <input
                    type="text"
                    placeholder="Tìm template theo tên..."
                    className="w-full h-14 bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/5 rounded-2xl pl-14 pr-5 text-sm font-bold focus:outline-none focus:border-emerald-500/50 transition-all"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            {/* Grid */}
            {loading ? (
                <div className="flex flex-col items-center justify-center py-32 space-y-4 opacity-40">
                    <Activity className="animate-spin text-emerald-500" size={48} />
                    <p className="text-xs font-black uppercase tracking-[0.3em]">Loading...</p>
                </div>
            ) : filtered.length === 0 ? (
                <div className="w-full py-32 flex flex-col items-center justify-center text-center">
                    <div className="w-28 h-28 bg-slate-100 dark:bg-white/5 rounded-[3rem] flex items-center justify-center th-text-secondary dark:text-slate-700 mb-6 border border-slate-200 dark:border-white/5">
                        <Layout size={56} />
                    </div>
                    <p className="text-xl font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-600">
                        {searchTerm ? 'Không tìm thấy' : 'Chưa có template'}
                    </p>
                    {!searchTerm && (
                        <div className="flex gap-3 mt-8">
                            <button onClick={openExtract} className="px-6 py-3.5 bg-blue-600 text-white font-black uppercase tracking-widest text-xs rounded-2xl flex items-center gap-3 active:scale-95 transition-all shadow-xl shadow-blue-500/20">
                                <Download size={16} /> Trích xuất từ Site
                            </button>
                            <button onClick={openCreate} className="px-8 py-3.5 bg-emerald-600 text-white font-black uppercase tracking-widest text-xs rounded-2xl flex items-center gap-3 active:scale-95 transition-all shadow-xl shadow-emerald-500/20">
                                <Plus size={18} /> Tạo template đầu tiên
                            </button>
                        </div>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {filtered.map(tpl => (
                        <div
                            key={tpl.id}
                            className="group relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-[2rem] p-6 shadow-sm hover:shadow-xl hover:border-opacity-50 transition-all duration-300 hover:-translate-y-1 overflow-hidden"
                            style={{ '--tpl-color': tpl.color }}
                        >
                            {/* Color strip top */}
                            <div className="absolute top-0 left-0 w-full h-1.5 rounded-t-[2rem]" style={{ backgroundColor: tpl.color }} />

                            {/* Header row */}
                            <div className="flex justify-between items-start mt-2 mb-5">
                                <div
                                    className="w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-lg transition-transform duration-300 group-hover:rotate-6"
                                    style={{ backgroundColor: tpl.color }}
                                >
                                    {tpl.is_default ? <Layers size={22} /> : <Layout size={22} />}
                                </div>
                                <div className="flex items-center gap-1.5">
                                    {/* Config badge */}
                                    {tpl.has_config ? (
                                        <span className="px-2 py-1 rounded-lg bg-emerald-500/10 text-emerald-500 text-[8px] font-black uppercase tracking-wider flex items-center gap-1">
                                            <Database size={10} /> v{tpl.config_version}
                                        </span>
                                    ) : tpl.is_default ? (
                                        <span className="px-2 py-1 rounded-lg bg-slate-500/10 text-slate-400 text-[8px] font-black uppercase tracking-wider">
                                            DEFAULT
                                        </span>
                                    ) : null}
                                    {/* Apply button (only for templates with config) */}
                                    {tpl.has_config && (
                                        <button
                                            onClick={() => openApply(tpl)}
                                            className="p-2.5 bg-amber-500/10 rounded-xl text-amber-500 hover:text-amber-400 hover:bg-amber-500/20 transition-all opacity-0 group-hover:opacity-100"
                                            title="Áp cho Site"
                                        >
                                            <Upload size={15} />
                                        </button>
                                    )}
                                    {/* Edit button (not for default) */}
                                    {!tpl.is_default && (
                                        <button
                                            onClick={() => openEdit(tpl)}
                                            className="p-2.5 bg-slate-100 dark:bg-white/5 rounded-xl text-slate-500 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-all opacity-0 group-hover:opacity-100"
                                            title="Chỉnh sửa"
                                        >
                                            <Edit size={15} />
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Name */}
                            <h4 className="text-lg font-black text-slate-800 dark:text-white truncate mb-1">{tpl.name}</h4>
                            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-2 h-8 mb-5">
                                {tpl.description || (tpl.is_default ? 'Site chưa được phân loại' : 'Chưa có mô tả.')}
                            </p>

                            {/* Footer */}
                            <div className="pt-4 border-t border-slate-100 dark:border-white/5 flex items-center justify-between">
                                <span className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-slate-400">
                                    <Server size={11} />
                                    {tpl.site_count} sites
                                </span>
                                <span
                                    className="px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest border"
                                    style={{ borderColor: `${tpl.color}40`, backgroundColor: `${tpl.color}10`, color: tpl.color }}
                                >
                                    {tpl.has_config ? 'CONFIG' : 'BLUEPRINT'}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* ── Create / Edit Modal ──────────────────────────────────── */}
            {isModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md">
                    <div className="bg-white dark:bg-[#0F172A] w-full max-w-md rounded-[2.5rem] shadow-2xl border border-white/10 overflow-hidden">
                        <div className="px-8 py-6 border-b border-slate-100 dark:border-white/5 flex justify-between items-center">
                            <div>
                                <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight">
                                    {editingTemplate ? 'Chỉnh sửa Template' : 'Tạo Template mới'}
                                </h3>
                                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-emerald-500 mt-0.5">Blueprint System</p>
                            </div>
                            <button onClick={() => setIsModalOpen(false)} className="p-2.5 hover:bg-slate-100 dark:hover:bg-white/10 rounded-xl transition-colors">
                                <XCircle size={20} className="text-slate-400" />
                            </button>
                        </div>

                        <form onSubmit={handleSave} className="p-8 space-y-6">
                            {formError && (
                                <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-xs text-rose-500 font-bold">
                                    {formError}
                                </div>
                            )}

                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Tên Template *</label>
                                <input
                                    autoFocus
                                    required
                                    type="text"
                                    maxLength={80}
                                    className="w-full h-12 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl px-5 text-sm font-bold focus:border-emerald-500/50 transition-all outline-none"
                                    placeholder="VD: Resort Standard, Office V1..."
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Mô tả (tùy chọn)</label>
                                <textarea
                                    rows={2}
                                    className="w-full p-4 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl text-sm font-bold focus:border-emerald-500/50 transition-all outline-none resize-none"
                                    placeholder="Mô tả ngắn về template này..."
                                    value={formData.description}
                                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                                />
                            </div>

                            <div className="space-y-3">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-2"><Palette size={13} /> Màu Badge</label>
                                <div className="flex flex-wrap gap-2">
                                    {PRESET_COLORS.map(c => (
                                        <button
                                            key={c}
                                            type="button"
                                            onClick={() => setFormData({ ...formData, color: c })}
                                            className={`w-9 h-9 rounded-xl transition-all border-2 ${formData.color === c ? 'border-white scale-110 shadow-lg' : 'border-transparent'}`}
                                            style={{ backgroundColor: c }}
                                        />
                                    ))}
                                    <input
                                        type="color"
                                        className="w-9 h-9 rounded-xl border-none cursor-pointer overflow-hidden bg-transparent"
                                        value={formData.color}
                                        onChange={e => setFormData({ ...formData, color: e.target.value })}
                                        title="Chọn màu khác"
                                    />
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Preview:</span>
                                    <span
                                        className="px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border"
                                        style={{ borderColor: `${formData.color}50`, backgroundColor: `${formData.color}15`, color: formData.color }}
                                    >
                                        {formData.name || 'TEN TEMPLATE'}
                                    </span>
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={saving}
                                className="w-full h-14 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-black uppercase tracking-widest rounded-2xl shadow-xl shadow-emerald-500/20 flex items-center justify-center gap-3 hover:scale-[1.02] active:scale-98 transition-all disabled:opacity-50"
                            >
                                {saving ? <Activity size={18} className="animate-spin" /> : <Save size={18} />}
                                {saving ? 'Đang lưu...' : (editingTemplate ? 'Cập nhật' : 'Tạo Template')}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* ── Extract Modal ────────────────────────────────────────── */}
            {isExtractOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md">
                    <div className="bg-white dark:bg-[#0F172A] w-full max-w-lg rounded-[2.5rem] shadow-2xl border border-white/10 overflow-hidden">
                        {/* Header */}
                        <div className="px-8 py-6 border-b border-slate-100 dark:border-white/5 flex justify-between items-center">
                            <div>
                                <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight flex items-center gap-3">
                                    <Download size={20} className="text-blue-500" />
                                    Trích xuất Config
                                </h3>
                                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-blue-500 mt-0.5 ml-8">
                                    Đọc config từ site → Lưu thành Template
                                </p>
                            </div>
                            <button onClick={() => setIsExtractOpen(false)} className="p-2.5 hover:bg-slate-100 dark:hover:bg-white/10 rounded-xl transition-colors">
                                <XCircle size={20} className="text-slate-400" />
                            </button>
                        </div>

                        <form onSubmit={handleExtract} className="p-8 space-y-6">
                            {extractError && (
                                <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-xs text-rose-500 font-bold">
                                    {extractError}
                                </div>
                            )}

                            {/* Step 1: Select source site */}
                            <div className="space-y-3">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                                    <span className="w-5 h-5 bg-blue-500 text-white rounded-md flex items-center justify-center text-[9px] font-black">1</span>
                                    Chọn Site nguồn *
                                </label>

                                {selectedSite ? (
                                    <div className="flex items-center gap-3 p-4 bg-blue-500/5 border border-blue-500/20 rounded-2xl">
                                        <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center text-blue-500">
                                            <Server size={18} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-bold text-slate-800 dark:text-white truncate">
                                                {selectedSite.siteName || selectedSite.name}
                                            </p>
                                            <p className="text-[10px] text-slate-400 font-mono">
                                                {extractData.source_site_id}
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setExtractData(prev => ({ ...prev, source_site_id: '' }))}
                                            className="p-1.5 text-slate-400 hover:text-rose-500 transition-colors"
                                        >
                                            <XCircle size={16} />
                                        </button>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        <div className="relative">
                                            <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                                            <input
                                                type="text"
                                                autoFocus
                                                className="w-full h-11 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl pl-10 pr-4 text-sm font-bold focus:border-blue-500/50 transition-all outline-none"
                                                placeholder="Tìm site..."
                                                value={extractSiteSearch}
                                                onChange={e => setExtractSiteSearch(e.target.value)}
                                            />
                                        </div>
                                        <div className="max-h-48 overflow-y-auto custom-scrollbar space-y-1 border border-slate-200 dark:border-white/5 rounded-xl p-2">
                                            {loadingSites ? (
                                                <div className="flex items-center justify-center py-6 text-slate-400">
                                                    <Activity size={16} className="animate-spin mr-2" /> Đang tải sites...
                                                </div>
                                            ) : filteredSites.length === 0 ? (
                                                <p className="text-center py-6 text-xs text-slate-400">Không tìm thấy site nào</p>
                                            ) : (
                                                filteredSites.map(site => {
                                                    const siteId = site.siteId || site.id || site._id;
                                                    const siteName = site.siteName || site.name || 'Unnamed';
                                                    return (
                                                        <button
                                                            key={siteId}
                                                            type="button"
                                                            onClick={() => selectSiteForExtract(site)}
                                                            className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-blue-500/5 transition-colors text-left group"
                                                        >
                                                            <Server size={14} className="text-slate-400 group-hover:text-blue-500 transition-colors flex-shrink-0" />
                                                            <span className="text-sm font-bold text-slate-700 dark:text-slate-200 truncate group-hover:text-blue-500 transition-colors">
                                                                {siteName}
                                                            </span>
                                                        </button>
                                                    );
                                                })
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Step 2: Template info */}
                            <div className="space-y-4">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-2">
                                    <span className="w-5 h-5 bg-blue-500 text-white rounded-md flex items-center justify-center text-[9px] font-black">2</span>
                                    Đặt tên Template
                                </label>

                                <input
                                    required
                                    type="text"
                                    maxLength={80}
                                    className="w-full h-12 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl px-5 text-sm font-bold focus:border-blue-500/50 transition-all outline-none"
                                    placeholder="VD: Resort Standard, Office V1..."
                                    value={extractData.name}
                                    onChange={e => setExtractData({ ...extractData, name: e.target.value })}
                                />

                                <textarea
                                    rows={2}
                                    className="w-full p-4 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl text-sm font-bold focus:border-blue-500/50 transition-all outline-none resize-none"
                                    placeholder="Mô tả (tùy chọn)..."
                                    value={extractData.description}
                                    onChange={e => setExtractData({ ...extractData, description: e.target.value })}
                                />

                                {/* Color picker */}
                                <div className="flex flex-wrap gap-2">
                                    {PRESET_COLORS.map(c => (
                                        <button
                                            key={c}
                                            type="button"
                                            onClick={() => setExtractData({ ...extractData, color: c })}
                                            className={`w-8 h-8 rounded-lg transition-all border-2 ${extractData.color === c ? 'border-white scale-110 shadow-lg' : 'border-transparent'}`}
                                            style={{ backgroundColor: c }}
                                        />
                                    ))}
                                </div>
                            </div>

                            {/* Info */}
                            <div className="flex items-start gap-3 p-4 bg-amber-500/5 border border-amber-500/10 rounded-2xl">
                                <FileCode size={16} className="text-amber-500 mt-0.5 shrink-0" />
                                <p className="text-[10px] text-amber-600 dark:text-amber-400/80 leading-relaxed font-bold">
                                    Hệ thống sẽ đọc <strong>networks</strong> (SSIDs, VLANs, security) và <strong>guest portal</strong> config từ site.
                                    Không lấy thông tin devices hay client data.
                                </p>
                            </div>

                            {/* Submit */}
                            <button
                                type="submit"
                                disabled={extracting || !extractData.source_site_id}
                                className="w-full h-14 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-black uppercase tracking-widest rounded-2xl shadow-xl shadow-blue-500/20 flex items-center justify-center gap-3 hover:scale-[1.02] active:scale-98 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {extracting ? <Activity size={18} className="animate-spin" /> : <Download size={18} />}
                                {extracting ? 'Đang trích xuất...' : 'Trích xuất & Tạo Template'}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* ── Apply Template Modal ──────────────────────────────────── */}
            {isApplyOpen && applyTemplate && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md">
                    <div className="bg-white dark:bg-[#0F172A] w-full max-w-lg rounded-[2.5rem] shadow-2xl border border-white/10 overflow-hidden">
                        {/* Header */}
                        <div className="px-8 py-6 border-b border-slate-100 dark:border-white/5 flex justify-between items-center">
                            <div>
                                <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight flex items-center gap-3">
                                    <Zap size={20} className="text-amber-500" />
                                    Áp Template
                                </h3>
                                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-amber-500 mt-0.5 ml-8">
                                    Push config "{applyTemplate.name}" → Sites
                                </p>
                            </div>
                            <button onClick={() => setIsApplyOpen(false)} className="p-2.5 hover:bg-slate-100 dark:hover:bg-white/10 rounded-xl transition-colors">
                                <XCircle size={20} className="text-slate-400" />
                            </button>
                        </div>

                        <div className="p-8 space-y-6">
                            {applyError && (
                                <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-xs text-rose-500 font-bold">
                                    {applyError}
                                </div>
                            )}

                            {/* Results */}
                            {applyResults ? (
                                <div className="space-y-4">
                                    <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl">
                                        <p className="text-sm font-bold text-emerald-500 flex items-center gap-2">
                                            <CheckCircle size={16} /> Hoàn tất!
                                        </p>
                                    </div>
                                    <div className="max-h-48 overflow-y-auto custom-scrollbar space-y-2">
                                        {applyResults.results?.map((r, i) => (
                                            <div key={i} className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-black/20 rounded-xl">
                                                <Server size={14} className="text-slate-400 flex-shrink-0" />
                                                <span className="text-xs font-mono text-slate-500 truncate flex-1">{r.site_id}</span>
                                                <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-500">
                                                    {r.results?.some(op => op.status?.includes('SUCCESS')) ? 'OK' : 'FAIL'}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                    <button
                                        onClick={() => setIsApplyOpen(false)}
                                        className="w-full h-12 bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300 font-bold rounded-2xl hover:bg-slate-200 dark:hover:bg-white/10 transition-all"
                                    >
                                        Đóng
                                    </button>
                                </div>
                            ) : (
                                <>
                                    {/* Template info */}
                                    <div className="flex items-center gap-3 p-4 rounded-2xl" style={{ backgroundColor: `${applyTemplate.color}10`, borderColor: `${applyTemplate.color}30`, border: '1px solid' }}>
                                        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white" style={{ backgroundColor: applyTemplate.color }}>
                                            <Layout size={18} />
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-slate-800 dark:text-white">{applyTemplate.name}</p>
                                            <p className="text-[10px] text-slate-400">Config v{applyTemplate.config_version} • {applyTemplate.site_count} sites hiện tại</p>
                                        </div>
                                    </div>

                                    {/* Site selector */}
                                    <div className="space-y-3">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center justify-between">
                                            <span className="flex items-center gap-2">
                                                <span className="w-5 h-5 bg-amber-500 text-white rounded-md flex items-center justify-center text-[9px] font-black">★</span>
                                                Chọn Sites đích
                                            </span>
                                            <span className="text-amber-500">{applyTargetIds.length} selected</span>
                                        </label>

                                        <div className="relative">
                                            <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                                            <input
                                                type="text"
                                                className="w-full h-11 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/10 rounded-xl pl-10 pr-4 text-sm font-bold focus:border-amber-500/50 transition-all outline-none"
                                                placeholder="Tìm site..."
                                                value={applySiteSearch}
                                                onChange={e => setApplySiteSearch(e.target.value)}
                                            />
                                        </div>

                                        <div className="max-h-48 overflow-y-auto custom-scrollbar space-y-1 border border-slate-200 dark:border-white/5 rounded-xl p-2">
                                            {loadingSites ? (
                                                <div className="flex items-center justify-center py-6 text-slate-400">
                                                    <Activity size={16} className="animate-spin mr-2" /> Đang tải sites...
                                                </div>
                                            ) : applyFilteredSites.length === 0 ? (
                                                <p className="text-center py-6 text-xs text-slate-400">Không tìm thấy</p>
                                            ) : (
                                                applyFilteredSites.map(site => {
                                                    const siteId = site.siteId || site.id || site._id;
                                                    const siteName = site.siteName || site.name || 'Unnamed';
                                                    const isSelected = applyTargetIds.includes(siteId);
                                                    return (
                                                        <button
                                                            key={siteId}
                                                            type="button"
                                                            onClick={() => toggleApplyTarget(siteId)}
                                                            className={`w-full flex items-center gap-3 p-3 rounded-xl transition-colors text-left ${
                                                                isSelected ? 'bg-amber-500/10 border border-amber-500/20' : 'hover:bg-slate-100 dark:hover:bg-white/5'
                                                            }`}
                                                        >
                                                            <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
                                                                isSelected ? 'bg-amber-500 border-amber-500 text-white' : 'border-slate-300 dark:border-white/20'
                                                            }`}>
                                                                {isSelected && <Check size={12} />}
                                                            </div>
                                                            <Server size={14} className={`flex-shrink-0 ${isSelected ? 'text-amber-500' : 'text-slate-400'}`} />
                                                            <span className={`text-sm font-bold truncate ${isSelected ? 'text-amber-600 dark:text-amber-400' : 'text-slate-700 dark:text-slate-200'}`}>
                                                                {siteName}
                                                            </span>
                                                        </button>
                                                    );
                                                })
                                            )}
                                        </div>
                                    </div>

                                    {/* Warning */}
                                    <div className="flex items-start gap-3 p-4 bg-amber-500/5 border border-amber-500/10 rounded-2xl">
                                        <Info size={16} className="text-amber-500 mt-0.5 shrink-0" />
                                        <p className="text-[10px] text-amber-600 dark:text-amber-400/80 leading-relaxed font-bold">
                                            Config sẽ được <strong>push vào sites đã chọn</strong>. 
                                            SSIDs trùng tên sẽ bị <strong>skip</strong>, SSIDs mới sẽ được tạo.
                                        </p>
                                    </div>

                                    {/* Submit */}
                                    <button
                                        onClick={handleApply}
                                        disabled={applying || !applyTargetIds.length}
                                        className="w-full h-14 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-black uppercase tracking-widest rounded-2xl shadow-xl shadow-amber-500/20 flex items-center justify-center gap-3 hover:scale-[1.02] active:scale-98 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {applying ? <Activity size={18} className="animate-spin" /> : <Zap size={18} />}
                                        {applying ? 'Đang áp template...' : `Áp cho ${applyTargetIds.length} site${applyTargetIds.length > 1 ? 's' : ''}`}
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Templates;
