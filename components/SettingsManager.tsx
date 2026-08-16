
import React, { useState, useEffect } from 'react';
import type { GlobalDutySettings, RoleDutySetting, EmploymentStatusSetting, SeniorityDeduction } from '../types';

interface SettingsManagerProps {
    settings: GlobalDutySettings;
    setSettings: React.Dispatch<React.SetStateAction<GlobalDutySettings>>;
}

export function SettingsManager({ settings, setSettings }: SettingsManagerProps) {
    const [localSettings, setLocalSettings] = useState<GlobalDutySettings>(settings);
    const [isSaved, setIsSaved] = useState(false);

    useEffect(() => {
        setLocalSettings(settings);
    }, [settings]);

    const handleSaveAll = () => {
        setSettings(localSettings);
        setIsSaved(true);
        setTimeout(() => setIsSaved(false), 3000);
    };

    const updateRoles = (roles: RoleDutySetting[]) => setLocalSettings(prev => ({ ...prev, roleDeductions: roles }));
    const updateEmployment = (emp: EmploymentStatusSetting[]) => setLocalSettings(prev => ({ ...prev, employmentStatuses: emp }));
    const updateSeniority = (sen: SeniorityDeduction[]) => setLocalSettings(prev => ({ ...prev, seniorityDeductions: sen }));

    const addNewRole = () => {
        updateRoles([...localSettings.roleDeductions, { role: 'سمت جدید', deduction: 0 }]);
    };

    const addNewEmployment = () => {
        updateEmployment([...localSettings.employmentStatuses, { status: 'نوع استخدام جدید', baseHours: 176 }]);
    };

    const removeRole = (index: number) => {
        updateRoles(localSettings.roleDeductions.filter((_, i) => i !== index));
    };

    const removeEmployment = (index: number) => {
        updateEmployment(localSettings.employmentStatuses.filter((_, i) => i !== index));
    };

    return (
        <div className="p-4 bg-slate-50 flex-grow h-full overflow-auto custom-scrollbar text-right">
            <div className="mb-6 flex justify-between items-center">
                <div className="text-right">
                    <h1 className="text-2xl font-black text-slate-800 tracking-tight">تنظیمات پایه محاسبات</h1>
                    <p className="text-slate-400 text-[10px] font-bold mt-0.5">پیکربندی پارامترهای کسر ساعت و موظفی ماهانه پرسنل</p>
                </div>
                <button 
                    onClick={handleSaveAll}
                    className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-black text-xs transition-all shadow-md ${isSaved ? 'bg-emerald-500 text-white' : 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-200'}`}
                >
                    {isSaved ? 'تنظیمات ذخیره شد' : 'ثبت تمامی تغییرات'}
                </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Role Deduction */}
                <div className="bg-white rounded-[1.5rem] shadow-sm border border-slate-200 overflow-hidden flex flex-col h-fit">
                    <div className="p-4 bg-blue-600 text-white">
                        <div className="flex items-center gap-2 mb-0.5">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
                            <h2 className="text-sm font-black">سمت شغلی</h2>
                        </div>
                    </div>
                    <div className="p-3 space-y-2">
                        {localSettings.roleDeductions.map((r, i) => (
                            <div key={i} className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-xl border border-slate-100 transition-all group/item">
                                <input value={r.role} onChange={e => {
                                    const next = [...localSettings.roleDeductions];
                                    next[i].role = e.target.value;
                                    updateRoles(next);
                                }} className="flex-grow p-1.5 bg-white border border-slate-200 rounded-lg text-[10px] font-bold outline-none text-right" />
                                <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2">
                                    <input type="number" value={r.deduction} onChange={e => {
                                        const next = [...localSettings.roleDeductions];
                                        next[i].deduction = Number(e.target.value);
                                        updateRoles(next);
                                    }} className="w-12 p-1 text-center font-mono font-bold text-[11px] outline-none" />
                                    <span className="text-[8px] font-black text-slate-400">ساعت</span>
                                </div>
                                <button onClick={() => removeRole(i)} className="p-1 text-slate-300 hover:text-rose-500 transition-opacity">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6"/></svg>
                                </button>
                            </div>
                        ))}
                        <button 
                            onClick={addNewRole}
                            className="w-full py-2 border-2 border-dashed border-blue-200 text-blue-600 rounded-xl font-black text-[9px] hover:bg-blue-50 transition-colors"
                        >
                            + افزودن سمت جدید
                        </button>
                    </div>
                </div>

                {/* Employment Status */}
                <div className="bg-white rounded-[1.5rem] shadow-sm border border-slate-200 overflow-hidden flex flex-col h-fit">
                    <div className="p-4 bg-emerald-600 text-white">
                        <div className="flex items-center gap-2 mb-0.5">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1.001.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                            <h2 className="text-sm font-black">پایه استخدام</h2>
                        </div>
                    </div>
                    <div className="p-3 space-y-2">
                        {localSettings.employmentStatuses.map((s, i) => (
                            <div key={i} className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-xl border border-slate-100 transition-all group/item">
                                <input value={s.status} onChange={e => {
                                    const next = [...localSettings.employmentStatuses];
                                    next[i].status = e.target.value;
                                    updateEmployment(next);
                                }} className="flex-grow p-1.5 bg-white border border-slate-200 rounded-lg text-[10px] font-bold outline-none text-right" />
                                <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2">
                                    <input type="number" value={s.baseHours} onChange={e => {
                                        const next = [...localSettings.employmentStatuses];
                                        next[i].baseHours = Number(e.target.value);
                                        updateEmployment(next);
                                    }} className="w-14 p-1 text-center font-mono font-bold text-[11px] outline-none" />
                                    <span className="text-[8px] font-black text-slate-400">ساعت</span>
                                </div>
                                <button onClick={() => removeEmployment(i)} className="p-1 text-slate-300 hover:text-rose-500 transition-opacity">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6"/></svg>
                                </button>
                            </div>
                        ))}
                        <button 
                            onClick={addNewEmployment}
                            className="w-full py-2 border-2 border-dashed border-emerald-200 text-emerald-600 rounded-xl font-black text-[9px] hover:bg-emerald-50 transition-colors"
                        >
                            + افزودن پایه استخدام جدید
                        </button>
                    </div>
                </div>

                {/* Seniority Deduction */}
                <div className="bg-white rounded-[1.5rem] shadow-sm border border-slate-200 overflow-hidden flex flex-col h-fit">
                    <div className="p-4 bg-amber-500 text-white">
                        <div className="flex items-center gap-2 mb-0.5">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                            <h2 className="text-sm font-black">سنوات خدمت</h2>
                        </div>
                    </div>
                    <div className="p-2 space-y-1.5">
                        {localSettings.seniorityDeductions.map((s, i) => {
                            const minY = Math.floor(s.minMonths / 12);
                            const minM = s.minMonths % 12;
                            const maxY = Math.floor(s.maxMonths / 12);
                            const maxM = s.maxMonths % 12;

                            return (
                                <div key={i} className="flex flex-col gap-1 p-1.5 bg-slate-50 rounded-xl border border-slate-200 relative group/row">
                                    <div className="flex items-center justify-between gap-0.5">
                                        <div className="flex items-center gap-0.5 bg-white border border-slate-300 rounded-lg p-0.5 shrink-0">
                                            {/* Swap: Month first, then Year */}
                                            <input type="number" min="0" max="11" value={minM} onChange={e => {
                                                const next = [...localSettings.seniorityDeductions];
                                                next[i].minMonths = minY * 12 + Number(e.target.value);
                                                updateSeniority(next);
                                            }} className="w-6 text-center font-mono font-black text-[10px] outline-none text-blue-600" />
                                            <span className="text-[8px] text-slate-400 font-bold">M</span>
                                            <span className="text-slate-300 mx-0.5">/</span>
                                            <input type="number" value={minY} onChange={e => {
                                                const next = [...localSettings.seniorityDeductions];
                                                next[i].minMonths = Number(e.target.value) * 12 + minM;
                                                updateSeniority(next);
                                            }} className="w-8 text-center font-mono font-black text-[10px] outline-none" />
                                            <span className="text-[8px] text-slate-400 font-bold">Y</span>
                                        </div>
                                        <span className="text-[8px] font-black text-slate-300 italic px-0.5">تا</span>
                                        <div className="flex items-center gap-0.5 bg-white border border-slate-300 rounded-lg p-0.5 shrink-0">
                                            {/* Swap: Month first, then Year */}
                                            <input type="number" min="0" max="11" value={maxM} onChange={e => {
                                                const next = [...localSettings.seniorityDeductions];
                                                next[i].maxMonths = maxY * 12 + Number(e.target.value);
                                                updateSeniority(next);
                                            }} className="w-6 text-center font-mono font-bold text-[10px] outline-none text-blue-600" />
                                            <span className="text-[8px] text-slate-400 font-bold">M</span>
                                            <span className="text-slate-300 mx-0.5">/</span>
                                            <input type="number" value={maxY} onChange={e => {
                                                const next = [...localSettings.seniorityDeductions];
                                                next[i].maxMonths = Number(e.target.value) * 12 + maxM;
                                                updateSeniority(next);
                                            }} className="w-8 text-center font-mono font-black text-[10px] outline-none" />
                                            <span className="text-[8px] text-slate-400 font-bold">Y</span>
                                        </div>
                                        <div className="flex items-center gap-0.5 bg-amber-50 border border-amber-200 rounded-lg px-1 shrink-0 h-7">
                                            <input type="number" value={s.deduction} onChange={e => {
                                                const next = [...localSettings.seniorityDeductions];
                                                next[i].deduction = Number(e.target.value);
                                                updateSeniority(next);
                                            }} className="w-8 p-0 text-center font-mono font-black text-[10px] bg-transparent text-amber-700 outline-none" />
                                            <span className="text-[7px] font-black text-amber-400">h</span>
                                        </div>
                                        <button 
                                            onClick={() => updateSeniority(localSettings.seniorityDeductions.filter((_, idx) => idx !== i))}
                                            className="p-0.5 text-slate-300 hover:text-rose-500 transition-opacity"
                                        >
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6"/></svg>
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                        <button 
                            onClick={() => updateSeniority([...localSettings.seniorityDeductions, { minMonths: 240, maxMonths: 300, deduction: 0 }])}
                            className="w-full py-1.5 border-2 border-dashed border-amber-200 text-amber-600 rounded-xl font-black text-[8px] hover:bg-amber-50 transition-colors"
                        >
                            + پله سابقه جدید
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
