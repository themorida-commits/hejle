
import React, { useState, useRef, useEffect } from 'react';
import type { Department, Personnel, GlobalDutySettings } from '../types';

interface PersonnelManagerProps {
    departments: Department[];
    personnel: Personnel[];
    setPersonnel: React.Dispatch<React.SetStateAction<Personnel[]>>;
    globalSettings: GlobalDutySettings;
}

interface EditableCellProps {
    value: string | number | undefined;
    onSave: (newValue: string | number) => void;
    type?: 'text' | 'number' | 'select';
    options?: { value: string; label: string }[];
    dir?: 'rtl' | 'ltr';
    placeholder?: string;
    className?: string;
}

const EditableCell = ({ value, onSave, type = 'text', options = [], dir = 'rtl', placeholder, className = "" }: EditableCellProps) => {
    const [isEditing, setIsEditing] = useState(false);
    const [currentValue, setCurrentValue] = useState<string | number | undefined>(value);
    const inputRef = useRef<HTMLInputElement | HTMLSelectElement>(null);

    useEffect(() => { setCurrentValue(value); }, [value]);
    useEffect(() => { if (isEditing && inputRef.current) inputRef.current.focus(); }, [isEditing]);

    const handleSave = () => {
        setIsEditing(false);
        if (currentValue !== value) {
            let finalVal = currentValue;
            if (type === 'number') finalVal = currentValue === '' ? undefined : Number(currentValue);
            onSave(finalVal as string | number);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') handleSave();
        if (e.key === 'Escape') { setIsEditing(false); setCurrentValue(value); }
    };

    if (isEditing) {
        if (type === 'select') {
            return (
                <select 
                    ref={inputRef as React.RefObject<HTMLSelectElement>} 
                    value={currentValue} 
                    onChange={(e) => setCurrentValue(e.target.value)} 
                    onBlur={handleSave} 
                    className="w-full p-0 bg-white border-none rounded-full text-[10px] font-black text-center outline-none ring-1 ring-blue-500"
                >
                    {options.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
            );
        }
        return (
            <input 
                ref={inputRef as React.RefObject<HTMLInputElement>} 
                type={type} 
                value={currentValue ?? ''} 
                onChange={(e) => setCurrentValue(e.target.value)} 
                onBlur={handleSave} 
                onKeyDown={handleKeyDown} 
                dir={dir} 
                className="w-full p-0 bg-white border-none rounded-full text-[10px] font-black text-center outline-none ring-1 ring-blue-500" 
            />
        );
    }

    const displayValue = type === 'select' ? options.find(o => o.value == value)?.label : value;

    return (
        <div 
            onClick={() => setIsEditing(true)} 
            className={`cursor-pointer w-full flex items-center justify-center ${className}`}
        >
            <span className={`whitespace-nowrap ${value !== undefined && value !== '' ? '' : 'text-slate-400 italic font-medium'}`}>
                {displayValue || placeholder || '---'}
            </span>
        </div>
    );
};

export function PersonnelManager({ departments, personnel, setPersonnel, globalSettings }: PersonnelManagerProps) {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingPersonnel, setEditingPersonnel] = useState<Personnel | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
    const [personnelToDeleteId, setPersonnelToDeleteId] = useState<string | null>(null);
    const [previewImage, setPreviewImage] = useState<string | undefined>(undefined);
    
    const photoInputRef = useRef<HTMLInputElement>(null);

    const updatePersonnelField = (id: string, field: keyof Personnel, value: any) => {
        setPersonnel(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));
    };

    const getStatusStyle = (status: string) => {
        switch (status) {
            case 'رسمی': return 'bg-emerald-50 text-emerald-800 border-emerald-200';
            case 'قراردادی': return 'bg-blue-50 text-blue-800 border-blue-200';
            case 'طرحی': return 'bg-amber-50 text-amber-800 border-amber-200';
            case 'شرکتی': return 'bg-purple-50 text-purple-800 border-purple-200';
            default: return 'bg-slate-50 text-slate-800 border-slate-200';
        }
    };

    const filteredPersonnel = personnel.filter(p =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.personnelCode.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const employmentStatusOptions = globalSettings.employmentStatuses.map(s => ({ value: s.status, label: s.status }));
    const roleOptions = globalSettings.roleDeductions.map(r => ({ value: r.role, label: r.role }));

    return (
        <div className="p-3 bg-slate-100 flex-grow h-full overflow-auto custom-scrollbar">
            {/* Header Area */}
            <div className="flex flex-col md:flex-row justify-between items-center mb-4 gap-2">
                <div className="text-right w-full md:w-auto">
                    <h1 className="text-xl font-black text-slate-900 tracking-tighter">مدیریت سرمایه انسانی</h1>
                    <p className="text-slate-500 text-[9px] font-bold">نمای فشرده اطلاعات پرسنلی</p>
                </div>
                
                <div className="flex items-center gap-2 w-full md:w-auto">
                    <div className="relative flex-grow md:w-64">
                         <input 
                            type="text" 
                            placeholder="جستجوی هوشمند..." 
                            value={searchQuery} 
                            onChange={(e) => setSearchQuery(e.target.value)} 
                            className="w-full p-2 pr-9 bg-white border border-slate-300 rounded-full shadow-sm text-[10px] font-black outline-none transition-all focus:border-blue-500" 
                        />
                         <svg className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                    </div>
                    <button 
                        onClick={() => { setEditingPersonnel(null); setPreviewImage(undefined); setIsModalOpen(true); }} 
                        className="bg-slate-900 text-white px-4 py-2 rounded-full font-black text-[10px] hover:bg-blue-700 transition-all flex items-center gap-2 shrink-0 active:scale-95"
                    >
                        + افزودن جدید
                    </button>
                </div>
            </div>

            {/* Main Table Content */}
            <div className="bg-white rounded-[2rem] shadow-xl border-2 border-slate-300 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full border-separate border-spacing-0">
                        <thead>
                            <tr className="bg-slate-900 text-white">
                                <th className="p-2 text-center text-[9px] font-black uppercase tracking-widest border-l border-slate-800 w-12">ردیف</th>
                                <th className="p-2 text-center text-[9px] font-black uppercase tracking-widest border-l border-slate-800 w-16">عکس</th>
                                <th className="p-2 text-center text-[9px] font-black uppercase tracking-widest border-l border-slate-800">نام کامل</th>
                                <th className="p-2 text-center text-[9px] font-black uppercase tracking-widest border-l border-slate-800">کد پرسنلی</th>
                                <th className="p-2 text-center text-[9px] font-black uppercase tracking-widest border-l border-slate-800">سمت</th>
                                <th className="p-2 text-center text-[9px] font-black uppercase tracking-widest border-l border-slate-800">واحد خدمتی</th>
                                <th className="p-2 text-center text-[9px] font-black uppercase tracking-widest border-l border-slate-800">تاریخ استخدام</th>
                                <th className="p-2 text-center text-[9px] font-black uppercase tracking-widest border-l border-slate-800">وضعیت</th>
                                <th className="p-2 text-center text-[9px] font-black uppercase tracking-widest">مدیریت</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-300">
                            {filteredPersonnel.map((p, idx) => (
                                <tr key={p.id} className="hover:bg-slate-50 transition-all duration-200 group">
                                    {/* Index */}
                                    <td className="p-1 text-center border-l border-slate-200 text-[10px] font-black text-slate-400 bg-slate-50/50">{idx + 1}</td>
                                    
                                    {/* Photo */}
                                    <td className="p-1 text-center border-l border-slate-200">
                                        <div className="w-9 h-9 rounded-full bg-white border border-slate-200 shadow-sm flex items-center justify-center overflow-hidden mx-auto group-hover:scale-105 transition-transform">
                                            {p.profileImage ? (
                                                <img src={p.profileImage} alt={p.name} className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full bg-slate-100 flex items-center justify-center text-slate-400 font-black text-xs">{p.name.charAt(0)}</div>
                                            )}
                                        </div>
                                    </td>

                                    {/* Name Column - Slate (Constant) */}
                                    <td className="p-1 text-center border-l border-slate-200">
                                        <div className="inline-flex min-w-[120px] bg-slate-100 border border-slate-300 text-slate-900 px-3 py-0.5 rounded-full shadow-sm">
                                            <EditableCell value={p.name} onSave={(val) => updatePersonnelField(p.id, 'name', val)} className="font-black text-[10px]" />
                                        </div>
                                    </td>

                                    {/* Code Column - Indigo (Constant) */}
                                    <td className="p-1 text-center border-l border-slate-200">
                                        <div className="inline-flex min-w-[100px] bg-indigo-50 border border-indigo-200 text-indigo-900 px-3 py-0.5 rounded-full font-mono font-black text-[10px] shadow-sm">
                                            <EditableCell value={p.personnelCode} onSave={(val) => updatePersonnelField(p.id, 'personnelCode', val)} dir="ltr" />
                                        </div>
                                    </td>

                                    {/* Role Column - Blue (Constant) */}
                                    <td className="p-1 text-center border-l border-slate-200">
                                        <div className="inline-flex min-w-[110px] bg-blue-50 border border-blue-200 text-blue-900 px-3 py-0.5 rounded-full font-black text-[10px] shadow-sm">
                                            <EditableCell type="select" options={roleOptions} value={p.role} onSave={(val) => updatePersonnelField(p.id, 'role', val)} />
                                        </div>
                                    </td>

                                    {/* Dept Column - Amber (Constant) */}
                                    <td className="p-1 text-center border-l border-slate-200">
                                        <div className="inline-flex min-w-[110px] bg-amber-50 border border-amber-200 text-amber-900 px-3 py-0.5 rounded-full font-black text-[10px] shadow-sm">
                                            <EditableCell type="select" value={p.departmentId} options={departments.map(d => ({ value: d.id, label: d.name }))} onSave={(val) => updatePersonnelField(p.id, 'departmentId', val)} />
                                        </div>
                                    </td>

                                    {/* Date Column - Teal (Constant) */}
                                    <td className="p-1 text-center border-l border-slate-200">
                                        <div className="inline-flex min-w-[100px] bg-teal-50 border border-teal-200 text-teal-900 px-3 py-0.5 rounded-full font-mono font-black text-[10px] shadow-sm">
                                            <EditableCell value={p.employmentDate} onSave={(val) => updatePersonnelField(p.id, 'employmentDate', val)} dir="ltr" placeholder="----/--/--" />
                                        </div>
                                    </td>

                                    {/* Status Column - Purple (Constant for all) */}
                                    <td className="p-1 text-center border-l border-slate-200">
                                        <div className="inline-flex min-w-[110px] bg-purple-50 border border-purple-200 text-purple-900 px-3 py-0.5 rounded-full font-black text-[10px] shadow-sm">
                                            <EditableCell type="select" value={p.employmentStatus} options={employmentStatusOptions} onSave={(val) => updatePersonnelField(p.id, 'employmentStatus', val)} />
                                        </div>
                                    </td>

                                    {/* Actions */}
                                    <td className="p-1 text-center">
                                        <div className="flex items-center justify-center gap-1">
                                            <button 
                                                onClick={() => { setEditingPersonnel(p); setPreviewImage(p.profileImage); setIsModalOpen(true); }} 
                                                className="w-7 h-7 flex items-center justify-center bg-blue-50 text-blue-600 rounded-full border border-blue-200 hover:bg-blue-600 hover:text-white transition-all shadow-sm"
                                            >
                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                                            </button>
                                            <button 
                                                onClick={() => { setPersonnelToDeleteId(p.id); setIsConfirmModalOpen(true); }} 
                                                className="w-7 h-7 flex items-center justify-center bg-rose-50 text-rose-600 rounded-full border border-rose-200 hover:bg-rose-600 hover:text-white transition-all shadow-sm"
                                            >
                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* MODALS SECTION */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md flex items-center justify-center z-[150] p-4">
                    <div className="bg-white rounded-[3rem] w-full max-w-5xl shadow-2xl overflow-hidden animate-in zoom-in duration-300 border-4 border-slate-300">
                        <div className="p-8 border-b-2 border-slate-100 flex justify-between items-center bg-slate-50">
                             <button onClick={() => setIsModalOpen(false)} className="w-10 h-10 flex items-center justify-center hover:bg-white rounded-full text-slate-400 transition-all border border-slate-200">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12"/></svg>
                            </button>
                            <div className="text-right">
                                <h2 className="text-2xl font-black text-slate-900">{editingPersonnel ? 'ویرایش پرونده کادر درمان' : 'ثبت نام در سامانه پرسنلی'}</h2>
                            </div>
                        </div>
                        
                        <form onSubmit={(e) => {
                            e.preventDefault();
                            const formData = new FormData(e.currentTarget);
                            const data: Personnel = {
                                id: editingPersonnel?.id || `p${Date.now()}`,
                                name: formData.get('name') as string,
                                personnelCode: formData.get('personnelCode') as string,
                                role: formData.get('role') as string,
                                departmentId: formData.get('departmentId') as string,
                                seniorityLevel: Number(formData.get('seniorityLevel')),
                                nationalCode: formData.get('nationalCode') as string,
                                contactNumber: formData.get('contactNumber') as string,
                                address: formData.get('address') as string,
                                employmentStatus: formData.get('employmentStatus') as string,
                                employmentDate: formData.get('employmentDate') as string,
                                profileImage: previewImage
                            };
                            if (editingPersonnel) setPersonnel(prev => prev.map(p => p.id === data.id ? data : p));
                            else setPersonnel(prev => [...prev, data]);
                            setIsModalOpen(false);
                        }} className="flex flex-col lg:flex-row-reverse">
                            
                            {/* Photo Side */}
                            <div className="w-full lg:w-[320px] bg-slate-100 p-10 flex flex-col items-center border-r-2 border-slate-200">
                                <div className="w-40 h-40 rounded-[2.5rem] bg-white border-8 border-white shadow-xl overflow-hidden mb-6 relative group ring-4 ring-slate-300/30">
                                    {previewImage ? (
                                        <img src={previewImage} alt="Preview" className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-slate-300 bg-slate-50">
                                            <svg className="w-20 h-20" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" /></svg>
                                        </div>
                                    )}
                                    <button type="button" onClick={() => photoInputRef.current?.click()} className="absolute inset-0 bg-slate-900/60 text-white opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
                                        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                                        <span className="text-[10px] font-black uppercase">انتخاب عکس</span>
                                    </button>
                                </div>
                                <input type="file" ref={photoInputRef} className="hidden" accept="image/*" onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                        const reader = new FileReader();
                                        reader.onloadend = () => setPreviewImage(reader.result as string);
                                        reader.readAsDataURL(file);
                                    }
                                }} />
                                <p className="text-[10px] text-slate-400 font-bold text-center mt-2 px-4 leading-relaxed">فیلدهای دارای <span className="text-rose-500">*</span> باید حتماً تکمیل گردند.</p>
                            </div>

                            {/* Inputs Area */}
                            <div className="flex-grow p-8">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-right">
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black text-slate-400 mr-2 uppercase tracking-widest">نام و نام خانوادگی <span className="text-rose-500 font-black">*</span></label>
                                        <input name="name" defaultValue={editingPersonnel?.name} required className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-black focus:border-blue-500 outline-none transition-all" />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black text-slate-400 mr-2 uppercase tracking-widest">کد پرسنلی اختصاصی <span className="text-rose-500 font-black">*</span></label>
                                        <input name="personnelCode" defaultValue={editingPersonnel?.personnelCode} required dir="ltr" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-black focus:border-blue-500 outline-none transition-all" />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black text-slate-400 mr-2 uppercase tracking-widest">کد ملی <span className="text-rose-500 font-black">*</span></label>
                                        <input name="nationalCode" defaultValue={editingPersonnel?.nationalCode} required dir="ltr" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-black focus:border-blue-500 outline-none transition-all" />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black text-slate-400 mr-2 uppercase tracking-widest">سمت شغلی <span className="text-rose-500 font-black">*</span></label>
                                        <select name="role" defaultValue={editingPersonnel?.role} required className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-black outline-none focus:border-blue-500 transition-all">
                                            {globalSettings.roleDeductions.map(r => <option key={r.role} value={r.role}>{r.role}</option>)}
                                        </select>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black text-slate-400 mr-2 uppercase tracking-widest">وضعیت استخدام <span className="text-rose-500 font-black">*</span></label>
                                        <select name="employmentStatus" defaultValue={editingPersonnel?.employmentStatus} required className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-black outline-none focus:border-blue-500 transition-all">
                                            {globalSettings.employmentStatuses.map(s => <option key={s.status} value={s.status}>{s.status}</option>)}
                                        </select>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black text-slate-400 mr-2 uppercase tracking-widest">بخش سرویس‌دهی <span className="text-rose-500 font-black">*</span></label>
                                        <select name="departmentId" defaultValue={editingPersonnel?.departmentId || departments[0]?.id} required className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-black outline-none focus:border-blue-500 transition-all">
                                            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                        </select>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black text-slate-400 mr-2 uppercase tracking-widest">تاریخ دقیق استخدام <span className="text-rose-500 font-black">*</span></label>
                                        <input name="employmentDate" defaultValue={editingPersonnel?.employmentDate} required dir="ltr" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-black outline-none focus:border-blue-500 transition-all" placeholder="1402/01/01" />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black text-slate-400 mr-2 uppercase tracking-widest">سطح ارشدیت (سابقه سال) <span className="text-rose-500 font-black">*</span></label>
                                        <input type="number" name="seniorityLevel" defaultValue={editingPersonnel?.seniorityLevel || 0} required className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-black focus:border-blue-500 outline-none transition-all" />
                                    </div>

                                    {/* Optional Fields */}
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black text-slate-400 mr-2 uppercase tracking-widest">شماره تماس (اختیاری)</label>
                                        <input name="contactNumber" defaultValue={editingPersonnel?.contactNumber} dir="ltr" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-black outline-none focus:border-blue-500 transition-all" />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black text-slate-400 mr-2 uppercase tracking-widest">آدرس محل سکونت (اختیاری)</label>
                                        <input name="address" defaultValue={editingPersonnel?.address} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-black outline-none focus:border-blue-500 transition-all" />
                                    </div>
                                </div>

                                <div className="mt-8 flex gap-4">
                                    <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-3 bg-slate-100 text-slate-700 rounded-2xl font-black text-xs hover:bg-slate-200 border border-slate-200">انصراف</button>
                                    <button type="submit" className="flex-[2] py-3 bg-blue-600 text-white rounded-2xl font-black text-xs hover:bg-blue-700 shadow-xl transition-all">ذخیره پرونده</button>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {isConfirmModalOpen && (
                <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md flex items-center justify-center z-[200] p-4 text-right">
                    <div className="bg-white p-8 rounded-[2rem] shadow-2xl w-full max-w-sm border-2 border-slate-300">
                        <h2 className="text-xl font-black text-slate-900 mb-4 text-center">حذف قطعی کادر درمان؟</h2>
                        <div className="flex gap-4">
                            <button onClick={() => setIsConfirmModalOpen(false)} className="flex-1 py-3 bg-slate-100 text-slate-700 rounded-xl font-black text-xs hover:bg-slate-200 border border-slate-200">لغو</button>
                            <button onClick={() => { setPersonnel(prev => prev.filter(p => p.id !== personnelToDeleteId)); setIsConfirmModalOpen(false); }} className="flex-1 py-3 bg-rose-600 text-white rounded-xl font-black text-xs hover:bg-rose-700 shadow-xl">حذف</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
