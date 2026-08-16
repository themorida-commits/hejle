
import React, { useState } from 'react';
import type { Department, ShiftType } from '../types';

interface ShiftTypeManagerProps {
    departments: Department[];
    shiftTypes: ShiftType[];
    setShiftTypes: React.Dispatch<React.SetStateAction<ShiftType[]>>;
}

export function ShiftTypeManager({ departments, shiftTypes, setShiftTypes }: ShiftTypeManagerProps) {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingShift, setEditingShift] = useState<ShiftType | null>(null);
    const [previewColor, setPreviewColor] = useState('#34d399');
    const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
    const [shiftToDeleteId, setShiftToDeleteId] = useState<string | null>(null);

    const openModal = (shift: ShiftType | null = null) => {
        setEditingShift(shift);
        setPreviewColor(shift?.displayColor || '#34d399');
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setEditingShift(null);
    };

    const handleSave = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        
        const newShift: ShiftType = {
            id: editingShift?.id || `s${Date.now()}`,
            name: formData.get('name') as string,
            symbol: formData.get('symbol') as string,
            displayColor: formData.get('displayColor') as string,
            realDuration: Number(formData.get('realDuration')),
            calculatedValue: Number(formData.get('calculatedValue')),
            fridayCalculatedValue: Number(formData.get('fridayCalculatedValue')),
            holidayCalculatedValue: Number(formData.get('holidayCalculatedValue')),
            departmentIds: departments.map(d => d.id).filter(id => formData.get(`department-${id}`) === 'on'),
            description: formData.get('description') as string,
        };

        if (editingShift) {
            setShiftTypes(prev => prev.map(s => s.id === newShift.id ? newShift : s));
        } else {
            setShiftTypes(prev => [...prev, newShift]);
        }
        closeModal();
    };

    return (
        <div className="p-2 bg-slate-200 flex-grow h-full overflow-auto custom-scrollbar">
            {/* Compact Header */}
            <div className="flex justify-between items-center mb-2 bg-white p-2 rounded-xl shadow-md border border-slate-300">
                <div className="text-right">
                    <h1 className="text-base font-black text-slate-900 tracking-tighter">تعاریف و نمادهای شیفت</h1>
                    <p className="text-slate-500 text-[8px] font-bold">ارزش محاسباتی و ساعت کاری هر نماد در سیستم Hejleh</p>
                </div>
                <button 
                    onClick={() => openModal()} 
                    className="bg-blue-600 text-white px-3 py-1.5 rounded-lg font-black text-[10px] hover:bg-blue-700 transition-all flex items-center gap-2 active:scale-95 shadow-md"
                >
                    + افزودن نماد جدید
                </button>
            </div>

            {/* Optimized Ultra-Compact Table with Slightly Bolder Horizontal Lines */}
            <div className="bg-white rounded-xl shadow-2xl border border-slate-300 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full border-separate border-spacing-0">
                        <thead>
                            <tr className="bg-slate-900 text-white">
                                <th className="p-2 text-center text-[9px] font-black uppercase tracking-tight border-l border-slate-700 w-10">ردیف</th>
                                <th className="p-2 text-center text-[9px] font-black uppercase tracking-tight border-l border-slate-700 w-28">نماد</th>
                                <th className="p-2 text-right text-[9px] font-black uppercase tracking-tight border-l border-slate-700 w-32">عنوان شیفت</th>
                                <th className="p-2 text-center text-[9px] font-black uppercase tracking-tight border-l border-slate-700 w-20 bg-slate-800">عادی</th>
                                <th className="p-2 text-center text-[9px] font-black uppercase tracking-tight border-l border-slate-700 w-20 bg-slate-800">جمعه</th>
                                <th className="p-2 text-center text-[9px] font-black uppercase tracking-tight border-l border-slate-700 w-20 bg-slate-800">تعطیل</th>
                                <th className="p-2 text-center text-[9px] font-black uppercase tracking-tight w-16">مدیریت</th>
                            </tr>
                        </thead>
                        {/* Slightly bolder horizontal lines using divide-y-2 and darker slate-400 color */}
                        <tbody className="divide-y-2 divide-slate-400">
                            {shiftTypes.map((shift, index) => (
                                <tr key={shift.id} className="hover:bg-blue-50/50 transition-all group h-12">
                                    <td className="p-1 text-center text-[10px] font-black text-slate-500 bg-slate-100/30 border-l border-slate-300">{index + 1}</td>
                                    <td className="p-1 text-center border-l border-slate-300">
                                        <span 
                                            className="font-mono font-black px-4 py-1.5 rounded-xl shadow-md inline-block min-w-[3.5rem] text-[16px] leading-none tracking-tighter border border-white/20" 
                                            style={{ backgroundColor: shift.displayColor, color: '#fff' }}
                                        >
                                            {shift.symbol}
                                        </span>
                                    </td>
                                    <td className="p-1 text-right font-black text-slate-900 text-[11px] border-l border-slate-300 px-3 truncate max-w-[128px]">{shift.name}</td>
                                    <td className="p-1 text-center text-slate-800 font-mono font-black text-[13px] border-l border-slate-300 bg-slate-50/10">
                                        {shift.calculatedValue.toFixed(1)}
                                    </td>
                                    <td className="p-1 text-center text-rose-700 font-mono font-black text-[13px] border-l border-slate-300 bg-rose-50/20">
                                        {shift.fridayCalculatedValue.toFixed(1)}
                                    </td>
                                    <td className="p-1 text-center text-orange-700 font-mono font-black text-[13px] border-l border-slate-300 bg-orange-50/20">
                                        {shift.holidayCalculatedValue.toFixed(1)}
                                    </td>
                                    <td className="p-1 text-center">
                                        <div className="flex items-center justify-center gap-1.5 opacity-60 group-hover:opacity-100 transition-opacity">
                                            <button onClick={() => openModal(shift)} className="text-blue-600 hover:bg-blue-100 p-1.5 rounded-lg transition-colors" title="ویرایش">
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                                            </button>
                                            <button onClick={() => { setShiftToDeleteId(shift.id); setIsConfirmModalOpen(true); }} className="text-rose-600 hover:bg-rose-100 p-1.5 rounded-lg transition-colors" title="حذف">
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal for Definition - Remains robust */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md flex items-center justify-center z-[150] p-4">
                    <div className="bg-white rounded-[2rem] w-full max-w-xl shadow-2xl overflow-hidden animate-in zoom-in duration-300 border-4 border-slate-300">
                        <div className="p-5 border-b-2 border-slate-100 flex justify-between items-center bg-slate-50">
                             <button onClick={closeModal} className="w-9 h-9 flex items-center justify-center hover:bg-white rounded-full text-slate-400 transition-all border border-slate-200 shadow-sm">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12"/></svg>
                            </button>
                            <div className="text-right">
                                <h2 className="text-lg font-black text-slate-900">{editingShift ? 'ویرایش نماد شیفت' : 'تعریف نماد جدید'}</h2>
                                <p className="text-[9px] font-bold text-slate-400">مشخصات و ارزش زمانی نماد را وارد کنید</p>
                            </div>
                        </div>
                        
                        <form onSubmit={handleSave} className="p-5 space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-right">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-slate-400 mr-2 uppercase tracking-widest">عنوان شیفت</label>
                                    <input name="name" defaultValue={editingShift?.name} required className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-black focus:border-blue-500 outline-none transition-all shadow-inner" placeholder="مثلاً: عصر و شب" />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-slate-400 mr-2 uppercase tracking-widest">نماد (حداکثر ۳ حرف)</label>
                                    <input name="symbol" defaultValue={editingShift?.symbol} required dir="ltr" maxLength={3} className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-black focus:border-blue-500 outline-none transition-all text-center shadow-inner" placeholder="EN" />
                                </div>
                                
                                <div className="md:col-span-2 space-y-1">
                                    <label className="text-[10px] font-black text-slate-400 mr-2 uppercase tracking-widest">رنگ نماد در جدول</label>
                                    <div className="flex items-center gap-3">
                                        <input type="color" name="displayColor" value={previewColor} onChange={(e) => setPreviewColor(e.target.value)} className="w-14 h-11 p-1 bg-white border border-slate-300 rounded-xl cursor-pointer" />
                                        <div className="flex-grow h-11 rounded-xl flex items-center justify-center text-white font-black text-[10px] shadow-md border border-black/5" style={{ backgroundColor: previewColor }}>{previewColor}</div>
                                    </div>
                                </div>

                                <div className="p-4 bg-slate-900/5 rounded-2xl border border-slate-300 md:col-span-2 grid grid-cols-3 gap-2">
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-black text-slate-600 block text-center">ارزش (عادی)</label>
                                        <input type="number" step="0.5" name="calculatedValue" defaultValue={editingShift?.calculatedValue} required className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-black text-center shadow-sm" />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-black text-rose-600 block text-center">ارزش (جمعه)</label>
                                        <input type="number" step="0.5" name="fridayCalculatedValue" defaultValue={editingShift?.fridayCalculatedValue} required className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-black text-center shadow-sm" />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-black text-orange-600 block text-center">ارزش (تعطیل)</label>
                                        <input type="number" step="0.5" name="holidayCalculatedValue" defaultValue={editingShift?.holidayCalculatedValue} required className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-black text-center shadow-sm" />
                                    </div>
                                </div>

                                <input type="hidden" name="realDuration" defaultValue={editingShift?.realDuration || 0} />
                                
                                <div className="md:col-span-2 space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 mr-2 uppercase tracking-widest">بخش‌های مجاز به استفاده</label>
                                    <div className="flex flex-wrap gap-1.5">
                                        {departments.map(d => (
                                            <label key={d.id} className="flex items-center gap-2 bg-slate-50 px-2 py-1.5 rounded-lg border border-slate-300 cursor-pointer hover:bg-white transition-all">
                                                <input type="checkbox" name={`department-${d.id}`} defaultChecked={editingShift?.departmentIds.includes(d.id) || !editingShift} className="w-3 h-3 rounded border-slate-400 text-blue-600 focus:ring-blue-500" />
                                                <span className="text-[9px] font-black text-slate-700">{d.name}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            
                            <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-slate-200">
                                <button type="button" onClick={closeModal} className="flex-1 py-2.5 bg-slate-100 text-slate-600 rounded-xl font-black text-xs hover:bg-slate-200 border border-slate-300">انصراف</button>
                                <button type="submit" className="flex-[2] py-2.5 bg-slate-900 text-white rounded-xl font-black text-xs hover:bg-blue-600 shadow-xl transition-all">ذخیره نماد</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            
            {isConfirmModalOpen && (
                <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md flex items-center justify-center z-[200] p-4 text-right">
                    <div className="bg-white p-6 rounded-[2rem] shadow-2xl w-full max-sm border border-slate-300">
                        <h2 className="text-lg font-black text-slate-900 mb-2 text-center">حذف نماد شیفت؟</h2>
                        <p className="text-slate-500 text-[9px] font-bold text-center mb-6 px-4">با حذف این نماد، تمامی شیفت‌های ثبت شده با این کد در تمام ماه‌ها پاک خواهند شد.</p>
                        <div className="flex gap-3">
                            <button onClick={() => setIsConfirmModalOpen(false)} className="flex-1 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-black text-xs hover:bg-slate-200 border border-slate-300">لغو</button>
                            <button onClick={() => { setShiftTypes(prev => prev.filter(s => s.id !== shiftToDeleteId)); setIsConfirmModalOpen(false); }} className="flex-1 py-2.5 bg-rose-600 text-white rounded-xl font-black text-xs hover:bg-rose-700 shadow-xl">حذف قطعی</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
