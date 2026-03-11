import React, { useState, useEffect } from 'react';
import apiClient from '../../api/apiClient';
import {
    Layout, Plus, Edit, Trash2, CheckCircle, XCircle,
    Palette, Clock, Search, Activity, Save, Info, Wifi
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

const PRESET_COLORS = [
    '#10B981', '#3B82F6', '#8B5CF6', '#F59E0B', '#EF4444',
    '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'
];

const Templates = () => {
    const { t } = useLanguage();
    const [templates, setTemplates] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    // Modal state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState(null); // null = create mode

    // Form state
    const [formData, setFormData] = useState({ name: '', description: '', color: '#10B981' });
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState('');

    useEffect(() => { loadTemplates(); }, []);

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

    const handleDelete = async (tpl) => {
        if (!window.confirm(`Xóa template "${tpl.name}"? Tất cả site đang dùng nhãn này sẽ không còn được đánh dấu nữa.`)) return;
        try {
            await apiClient.delete(`/templates/${tpl.id}`);
            loadTemplates();
        } catch (err) {
            alert('Lỗi khi xóa: ' + (err.response?.data?.detail || err.message));
        }
    };

    const filtered = templates.filter(t => t.name.toLowerCase().includes(searchTerm.toLowerCase()));

    return (
        <div className="w-full h-full p-8 space-y-8 animate-fade-in overflow-y-auto custom-scrollbar bg-slate-50 dark:th-bg-base rounded-3xl">
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
                        Tạo nhãn để phân loại và đánh dấu các site được clone từ cùng một blueprint.
                    </p>
                </div>
                <button
                    onClick={openCreate}
                    className="flex items-center gap-2 px-8 py-3.5 bg-emerald-600 hover:bg-emerald-500 transition-all th-text-primary font-black uppercase tracking-widest text-xs rounded-2xl shadow-xl shadow-emerald-500/20 active:scale-95"
                >
                    <Plus size={18} /> Tạo Template
                </button>
            </div>

            {/* Info Banner */}
            <div className="flex items-start gap-4 p-5 bg-blue-500/5 border border-blue-500/10 rounded-3xl">
                <Info className="text-blue-500 mt-0.5 shrink-0" size={18} />
                <p className="text-[11px] text-blue-600 dark:text-blue-400/80 leading-relaxed font-bold">
                    Template là <strong>vỏ rỗng</strong> — chỉ có tên và màu sắc. Khi bạn dùng <strong>Full Clone</strong> và chọn một template làm nguồn, tất cả site đích sẽ tự động được đeo badge tên template đó.
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
                        <button onClick={openCreate} className="mt-8 px-8 py-3.5 bg-emerald-600 th-text-primary font-black uppercase tracking-widest text-xs rounded-2xl flex items-center gap-3 active:scale-95 transition-all shadow-xl shadow-emerald-500/20">
                            <Plus size={18} /> Tạo template đầu tiên
                        </button>
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
                                    className="w-12 h-12 rounded-2xl flex items-center justify-center th-text-primary shadow-lg transition-transform duration-300 group-hover:rotate-6"
                                    style={{ backgroundColor: tpl.color }}
                                >
                                    <Layout size={22} />
                                </div>
                                <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                    <button
                                        onClick={() => openEdit(tpl)}
                                        className="p-2.5 bg-slate-100 dark:bg-white/5 rounded-xl text-slate-500 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-all"
                                        title="Chỉnh sửa"
                                    >
                                        <Edit size={15} />
                                    </button>
                                    <button
                                        onClick={() => handleDelete(tpl)}
                                        className="p-2.5 bg-slate-100 dark:bg-white/5 rounded-xl text-slate-500 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-all"
                                        title="Xóa"
                                    >
                                        <Trash2 size={15} />
                                    </button>
                                </div>
                            </div>

                            {/* Name */}
                            <h4 className="text-lg font-black text-slate-800 dark:text-white truncate mb-1">{tpl.name}</h4>
                            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-2 h-8 mb-5">
                                {tpl.description || 'Chưa có mô tả.'}
                            </p>

                            {/* Footer */}
                            <div className="pt-4 border-t border-slate-100 dark:border-white/5 flex items-center justify-between">
                                <span className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-slate-400">
                                    <Clock size={11} />
                                    {tpl.created_at ? new Date(tpl.created_at).toLocaleDateString('vi-VN') : '—'}
                                </span>
                                <span
                                    className="px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest border"
                                    style={{ borderColor: `${tpl.color}40`, backgroundColor: `${tpl.color}10`, color: tpl.color }}
                                >
                                    BLUEPRINT
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Create / Edit Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md">
                    <div className="bg-white dark:th-bg-surface w-full max-w-md rounded-[2.5rem] shadow-2xl border border-white/10 overflow-hidden">
                        {/* Modal Header */}
                        <div className="px-8 py-6 border-b border-slate-100 dark:border-white/5 flex justify-between items-center">
                            <div>
                                <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight">
                                    {editingTemplate ? 'Chỉnh sửa Template' : 'Tạo Template mới'}
                                </h3>
                                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-emerald-500 mt-0.5">Label System</p>
                            </div>
                            <button onClick={() => setIsModalOpen(false)} className="p-2.5 hover:bg-slate-100 dark:hover:bg-white/10 rounded-xl transition-colors">
                                <XCircle size={20} className="text-slate-400" />
                            </button>
                        </div>

                        {/* Modal Body */}
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
                                {/* Badge Preview */}
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
                                className="w-full h-14 bg-gradient-to-r from-emerald-600 to-teal-600 th-text-primary font-black uppercase tracking-widest rounded-2xl shadow-xl shadow-emerald-500/20 flex items-center justify-center gap-3 hover:scale-[1.02] active:scale-98 transition-all disabled:opacity-50"
                            >
                                {saving ? <Activity size={18} className="animate-spin" /> : <Save size={18} />}
                                {saving ? 'Đang lưu...' : (editingTemplate ? 'Cập nhật' : 'Tạo Template')}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Templates;
