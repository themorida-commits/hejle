
import React, { useState, useMemo } from 'react';
import type { Department, Personnel, ArchivedSchedule, ShiftType } from '../types';
import { MONTHS } from '../constants';

interface DepartmentManagerProps {
    departments: Department[];
    setDepartments: React.Dispatch<React.SetStateAction<Department[]>>;
    personnel: Personnel[];
    archives: ArchivedSchedule[];
    shiftTypes: ShiftType[];
}

export function DepartmentManager({ departments, setDepartments, personnel, archives, shiftTypes }: DepartmentManagerProps) {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingDepartment, setEditingDepartment] = useState<Department | null>(null);
    const [previewColor, setPreviewColor] = useState('#3b82f6');
    const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
    const [departmentToDeleteId, setDepartmentToDeleteId] = useState<string | null>(null);
    
    // Detailed Views State
    const [activePersonnelDeptId, setActivePersonnelDeptId] = useState<string | null>(null);
    const [isArchiveViewOpen, setIsArchiveViewOpen] = useState(false);
    const [selectedArchiveDeptId, setSelectedArchiveDeptId] = useState<string | null>(null);
    const [viewedArchive, setViewedArchive] = useState<ArchivedSchedule | null>(null);

    // Search query for the personnel list modal
    const [personnelSearchQuery, setPersonnelSearchQuery] = useState('');

    const personnelByDept = useMemo(() => {
        const groups: Record<string, Personnel[]> = {};
        departments.forEach(d => groups[d.id] = []);
        personnel.forEach(p => {
            if (groups[p.departmentId]) {
                groups[p.departmentId].push(p);
            }
        });
        return groups;
    }, [personnel, departments]);

    const openModal = (dept: Department | null = null) => {
        setEditingDepartment(dept);
        setPreviewColor(dept?.themeColor || '#3b82f6');
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setEditingDepartment(null);
    };

    const handleSave = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        
        const newDepartment: Department = {
            id: editingDepartment?.id || `dep${Date.now()}`,
            name: formData.get('name') as string,
            themeColor: formData.get('themeColor') as string,
        };

        if (editingDepartment) {
            setDepartments(prev => prev.map(d => d.id === newDepartment.id ? newDepartment : d));
        } else {
            setDepartments(prev => [...prev, newDepartment]);
        }
        closeModal();
    };

    const openConfirmModal = (id: string) => {
        setDepartmentToDeleteId(id);
        setIsConfirmModalOpen(true);
    };

    const closeConfirmModal = () => {
        setDepartmentToDeleteId(null);
        setIsConfirmModalOpen(false);
    };

    const confirmDelete = () => {
        if (departmentToDeleteId) {
            setDepartments(prev => prev.filter(d => d.id !== departmentToDeleteId));
            closeModal(); // Also close edit modal if it was open
        }
        closeConfirmModal();
    };

    const openArchiveView = (deptId: string) => {
        setSelectedArchiveDeptId(deptId);
        setIsArchiveViewOpen(true);
        setViewedArchive(null);
    };

    const filteredArchives = useMemo(() => {
        return archives.filter(a => a.departmentId === selectedArchiveDeptId);
    }, [archives, selectedArchiveDeptId]);

    const activeDeptForPersonnel = departments.find(d => d.id === activePersonnelDeptId);
    const filteredPersonnel = useMemo(() => {
        if (!activePersonnelDeptId) return [];
        const deptPersonnel = personnelByDept[activePersonnelDeptId] || [];
        if (!personnelSearchQuery) return deptPersonnel;
        return deptPersonnel.filter(p => 
            p.name.toLowerCase().includes(personnelSearchQuery.toLowerCase()) || 
            p.personnelCode.toLowerCase().includes(personnelSearchQuery.toLowerCase())
        );
    }, [activePersonnelDeptId, personnelByDept, personnelSearchQuery]);

    const renderArchiveData = () => {
        if (!viewedArchive) return null;
        const shiftMap = new Map(shiftTypes.map(s => [s.id, s]));
        return (
            <div className="mt-6 space-y-4 animate-in slide-in-from-bottom duration-300">
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-400">
                    <h4 className="text-sm font-black text-slate-800 mb-2">یادداشت‌های پیوست:</h4>
                    <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">{viewedArchive.notes || "یادداشتی ثبت نشده است."}</p>
                </div>
                <div className="overflow-x-auto rounded-2xl border border-slate-400 bg-white">
                    <table className="w-full text-right">
                        <thead className="bg-slate-100 border-b border-slate-400">
                            <tr>
                                <th className="p-3 text-xs font-black border-l border-slate-300">نام پرسنل</th>
                                <th className="p-3 text-xs font-black text-center border-l border-slate-300">تعداد شیفت ثبت شده</th>
                                <th className="p-3 text-xs font-black text-center">جزئیات</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-300">
                            {viewedArchive.personnelSnapshot.map(p => {
                                const pEntries = viewedArchive.entries.filter(e => e.personnelId === p.id);
                                return (
                                    <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="p-3 border-l border-slate-200">
                                            <p className="text-xs font-black text-slate-800">{p.name}</p>
                                            <p className="text-[10px] text-slate-500 font-bold">{p.role}</p>
                                        </td>
                                        <td className="p-3 text-center text-xs font-mono font-black text-blue-700 border-l border-slate-200">{pEntries.length}</td>
                                        <td className="p-3">
                                            <div className="flex flex-wrap gap-1 justify-center">
                                                {pEntries.slice(0, 10).map((e, idx) => {
                                                    const s = shiftMap.get(e.shiftTypeId);
                                                    return (
                                                        <span key={idx} className="w-4 h-4 rounded-md text-[8px] flex items-center justify-center text-white font-black" style={{ backgroundColor: s?.displayColor || '#ccc' }}>
                                                            {s?.symbol || '?'}
                                                        </span>
                                                    );
                                                })}
                                                {pEntries.length > 10 && <span className="text-[8px] font-black text-slate-400">+{pEntries.length - 10}</span>}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    return (
        <div className="p-6 bg-slate-50 flex-grow h-full overflow-auto custom-scrollbar">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-black text-slate-800 tracking-tight">مدیریت بخش‌ها</h1>
                    <p className="text-slate-500 mt-1 font-medium text-sm">پیکربندی ساختار بیمارستانی و مشاهده بایگانی برنامه پرسنل</p>
                </div>
                <button 
                    onClick={() => openModal()} 
                    className="bg-blue-600 text-white px-6 py-2.5 rounded-xl font-black text-xs hover:bg-blue-700 shadow-lg shadow-blue-100 transition-all flex items-center gap-2 active:scale-95"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>
                    افزودن بخش جدید
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {departments.map(dept => {
                    const deptPersonnelCount = personnelByDept[dept.id]?.length || 0;
                    const deptArchivesCount = archives.filter(a => a.departmentId === dept.id).length;

                    return (
                        <div key={dept.id} className="bg-white rounded-2xl shadow-sm border border-slate-300 overflow-hidden flex flex-col transition-all hover:shadow-xl hover:-translate-y-0.5">
                            {/* Smaller Header Section */}
                            <div className="p-4 relative" style={{ background: `linear-gradient(135deg, ${dept.themeColor} 0%, ${dept.themeColor}dd 100%)` }}>
                                <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
                                    <svg viewBox="0 0 100 100" className="w-full h-full fill-white"><circle cx="10" cy="10" r="40" /></svg>
                                </div>
                                <div className="relative z-10">
                                    <div className="flex justify-between items-start mb-2">
                                        <h2 className="text-lg font-black text-white drop-shadow-sm truncate pr-2">{dept.name}</h2>
                                        <div className="flex gap-1">
                                            <button onClick={() => openModal(dept)} className="p-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-white transition-colors" title="ویرایش و تنظیمات">
                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                                            </button>
                                        </div>
                                    </div>
                                    <div className="flex gap-1.5">
                                        <div className="bg-white/20 backdrop-blur-md px-2 py-1 rounded-lg border border-white/20 flex items-center gap-1">
                                            <span className="text-white text-[9px] font-black">{deptPersonnelCount} نفر</span>
                                        </div>
                                        <div className="bg-slate-900/20 backdrop-blur-md px-2 py-1 rounded-lg border border-white/10 flex items-center gap-1">
                                            <span className="text-white text-[9px] font-black">{deptArchivesCount} بایگانی</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            {/* Optimized Action Tray */}
                            <div className="p-3 bg-slate-50/50 flex flex-col gap-2 border-t border-slate-300">
                                <button 
                                    onClick={() => { setActivePersonnelDeptId(dept.id); setPersonnelSearchQuery(''); }}
                                    className="flex items-center justify-center gap-2 py-2 bg-white border border-slate-300 rounded-xl text-slate-700 font-bold text-xs hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 transition-all shadow-sm active:scale-95"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                                    مدیریت پرسنل
                                </button>
                                <button 
                                    onClick={() => openArchiveView(dept.id)}
                                    className="flex items-center justify-center gap-1 py-2 bg-slate-100 text-slate-600 rounded-lg font-bold text-[10px] hover:bg-amber-50 hover:text-amber-700 transition-all border border-slate-200"
                                >
                                    بایگانی برنامه
                                </button>
                            </div>
                        </div>
                    );
                })}

                {/* Empty State / Add Suggestion */}
                <button 
                    onClick={() => openModal()}
                    className="border-2 border-dashed border-slate-400 rounded-2xl flex flex-col items-center justify-center p-6 text-slate-500 hover:border-blue-500 hover:text-blue-600 hover:bg-blue-50/50 transition-all group"
                >
                    <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center mb-2 group-hover:bg-blue-100 transition-colors border border-slate-300">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>
                    </div>
                    <span className="text-xs font-black">افزودن بخش جدید</span>
                </button>
            </div>

            {/* Personnel List Modal (The "Inside" View) */}
            {activePersonnelDeptId && (
                <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-md flex items-center justify-center z-[120] p-4">
                    <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in slide-in-from-bottom-8 duration-300 border border-slate-300">
                        <div className="p-6 border-b border-slate-300 relative" style={{ borderRight: `8px solid ${activeDeptForPersonnel?.themeColor}` }}>
                            <div className="flex justify-between items-start">
                                <div>
                                    <h2 className="text-2xl font-black text-slate-800">پرسنل {activeDeptForPersonnel?.name}</h2>
                                    <p className="text-slate-500 text-xs font-bold mt-1">لیست تمامی کادر درمانی فعال در این بخش</p>
                                </div>
                                <button 
                                    onClick={() => setActivePersonnelDeptId(null)}
                                    className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors"
                                >
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12"/></svg>
                                </button>
                            </div>

                            <div className="mt-4 relative">
                                <input 
                                    type="text" 
                                    placeholder="جستجوی نام یا کد پرسنلی در این بخش..." 
                                    value={personnelSearchQuery}
                                    onChange={(e) => setPersonnelSearchQuery(e.target.value)}
                                    className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all"
                                />
                                <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                            </div>
                        </div>

                        <div className="flex-grow overflow-y-auto p-6 custom-scrollbar space-y-3">
                            {filteredPersonnel.length > 0 ? (
                                filteredPersonnel.map(p => (
                                    <div key={p.id} className="flex items-center justify-between p-3 bg-white border border-slate-300 rounded-xl hover:border-blue-400 hover:shadow-lg hover:shadow-blue-500/5 transition-all group">
                                        <div className="flex items-center gap-3">
                                            <div 
                                                className="w-10 h-10 rounded-xl flex items-center justify-center text-base font-black text-white shadow-sm border border-black/5"
                                                style={{ backgroundColor: activeDeptForPersonnel?.themeColor }}
                                            >
                                                {p.name.charAt(0)}
                                            </div>
                                            <div>
                                                <p className="text-sm font-black text-slate-800">{p.name}</p>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded-md border border-blue-100">{p.role}</span>
                                                    <span className="text-[9px] font-mono font-black text-slate-400">#{p.personnelCode}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="text-left flex flex-col items-end">
                                            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md border ${p.employmentStatus === 'رسمی' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                                                {p.employmentStatus}
                                            </span>
                                            <p className="text-[9px] font-bold text-slate-500 mt-1">سنوات: {p.seniorityLevel} سال</p>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full opacity-40 py-10 text-center">
                                    <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-3 border border-slate-200">
                                        <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M15 21a6 6 0 00-9-5.197m0 0A5.995 5.995 0 0112 13a5.995 5.995 0 013 1.003m-3-1.003A4.002 4.002 0 0112 4.354M7 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                                    </div>
                                    <h3 className="text-base font-black text-slate-500">نتیجه‌ای یافت نشد</h3>
                                </div>
                            )}
                        </div>

                        <div className="p-6 bg-slate-100 border-t border-slate-300 flex justify-center">
                            <button 
                                onClick={() => setActivePersonnelDeptId(null)}
                                className="px-10 py-3 bg-white border border-slate-300 text-slate-700 rounded-xl font-black text-xs hover:bg-slate-50 transition-all shadow-sm active:scale-95"
                            >
                                بازگشت به نمای اصلی
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Archive View Modal */}
            {isArchiveViewOpen && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[130] p-4">
                    <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col animate-in fade-in zoom-in duration-300 border border-slate-300">
                        <div className="p-6 border-b border-slate-300 flex justify-between items-center">
                            <div>
                                <h2 className="text-xl font-black text-slate-800">بایگانی برنامه بخش {departments.find(d => d.id === selectedArchiveDeptId)?.name}</h2>
                                <p className="text-slate-500 text-[10px] font-bold mt-1">مشاهده لیست برنامه‌های قطعی و ثبت شده در تاریخچه برنامه بخش</p>
                            </div>
                            <button onClick={() => setIsArchiveViewOpen(false)} className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
                            </button>
                        </div>
                        
                        <div className="flex-grow overflow-y-auto p-6 custom-scrollbar">
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                                {filteredArchives.length > 0 ? (
                                    filteredArchives.map(arc => (
                                        <button 
                                            key={arc.id}
                                            onClick={() => setViewedArchive(arc)}
                                            className={`p-3 rounded-xl border transition-all text-right ${viewedArchive?.id === arc.id ? 'bg-blue-600 border-blue-800 shadow-lg shadow-blue-200' : 'bg-white border-slate-300 hover:border-blue-500'}`}
                                        >
                                            <p className={`text-[10px] font-black ${viewedArchive?.id === arc.id ? 'text-blue-100' : 'text-slate-500'}`}>{arc.year}</p>
                                            <p className={`text-base font-black ${viewedArchive?.id === arc.id ? 'text-white' : 'text-slate-800'}`}>{MONTHS.find(m => m.value === arc.month)?.name}</p>
                                            <p className={`text-[8px] mt-1 font-bold ${viewedArchive?.id === arc.id ? 'text-blue-200' : 'text-slate-400'}`}>
                                                {new Date(arc.archivedAt).toLocaleDateString('fa-IR')}
                                            </p>
                                        </button>
                                    ))
                                ) : (
                                    <div className="col-span-4 py-16 text-center bg-slate-50 rounded-2xl border-2 border-dashed border-slate-300">
                                        <svg className="w-12 h-12 text-slate-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg>
                                        <p className="text-slate-500 text-sm font-black">هنوز هیچ برنامه‌ای بایگانی نشده است.</p>
                                    </div>
                                )}
                            </div>
                            {renderArchiveData()}
                        </div>
                        
                        <div className="p-6 bg-slate-100 border-t border-slate-300 flex justify-end">
                            <button 
                                onClick={() => setIsArchiveViewOpen(false)}
                                className="px-8 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-xl font-black text-xs hover:bg-slate-50 transition-all active:scale-95"
                            >
                                بازگشت به مدیریت بخش
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {isModalOpen && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[140] p-4">
                    <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-300 border border-slate-300">
                        <div className="p-8">
                            <div className="flex justify-between items-center mb-6">
                                <h2 className="text-xl font-black text-slate-800">{editingDepartment ? 'ویرایش بخش' : 'افزودن بخش جدید'}</h2>
                                <button onClick={closeModal} className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors">
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
                                </button>
                            </div>
                            
                            <form onSubmit={handleSave} className="space-y-6">
                                <div>
                                    <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">نام بخش</label>
                                    <input 
                                        name="name" 
                                        defaultValue={editingDepartment?.name} 
                                        className="w-full p-4 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all" 
                                        placeholder="مثلاً: بخش CCU"
                                        required 
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-black text-slate-500 uppercase tracking-widest mb-2">رنگ تم بخش</label>
                                    <div className="flex items-center gap-4">
                                        <input 
                                            type="color" 
                                            name="themeColor" 
                                            value={previewColor} 
                                            onChange={(e) => setPreviewColor(e.target.value)} 
                                            className="w-14 h-12 p-1 bg-white border border-slate-300 rounded-xl cursor-pointer" 
                                        />
                                        <div 
                                            className="flex-grow h-12 rounded-xl flex items-center justify-center text-white font-black text-xs shadow-inner border border-black/5" 
                                            style={{ backgroundColor: previewColor }}
                                        >
                                            پیش‌نمایش رنگ
                                        </div>
                                    </div>
                                </div>
                                <div className="flex flex-col gap-3 pt-4">
                                    <div className="flex gap-3">
                                        <button type="button" onClick={closeModal} className="flex-1 py-3 bg-slate-200 text-slate-700 rounded-xl font-black text-xs hover:bg-slate-300 transition-all border border-slate-300">انصراف</button>
                                        <button type="submit" className="flex-[2] py-3 bg-blue-600 text-white rounded-xl font-black text-xs hover:bg-blue-700 shadow-lg shadow-blue-100 transition-all">ذخیره اطلاعات</button>
                                    </div>
                                    
                                    {editingDepartment && (
                                        <button 
                                            type="button" 
                                            onClick={() => openConfirmModal(editingDepartment.id)}
                                            className="w-full py-2.5 text-rose-600 hover:bg-rose-50 rounded-xl font-bold text-[11px] transition-all flex items-center justify-center gap-2 mt-2 border border-rose-300"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                                            حذف کامل این بخش
                                        </button>
                                    )}
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}
            
            {isConfirmModalOpen && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-[150] p-4">
                    <div className="bg-white p-6 rounded-2xl shadow-2xl w-full max-w-sm text-center border border-slate-300">
                        <div className="w-14 h-14 bg-rose-50 text-rose-700 rounded-full flex items-center justify-center mx-auto mb-4 border border-rose-200">
                            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                        </div>
                        <h2 className="text-lg font-black text-slate-800 mb-2">حذف این بخش؟</h2>
                        <p className="text-slate-600 text-xs mb-6 leading-relaxed">با حذف بخش، پرسنل این بخش بدون بخش خواهند ماند.</p>
                        <div className="flex gap-3">
                            <button onClick={closeConfirmModal} className="flex-1 py-2.5 bg-slate-200 text-slate-700 rounded-lg font-bold text-xs hover:bg-slate-300 border border-slate-300">انصراف</button>
                            <button onClick={confirmDelete} className="flex-1 py-2.5 bg-rose-600 text-white rounded-lg font-bold text-xs hover:bg-rose-700 transition-all shadow-lg shadow-rose-100">بله، حذف کن</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
