
import React, { useState, useMemo } from 'react';
import type { Personnel, ShiftType, ScheduleEntry, GlobalDutySettings } from '../types';
import { MONTHS, NATIONAL_HOLIDAYS, DEFAULT_GLOBAL_SETTINGS } from '../constants';
import { calculateShiftHoursDetailed, jalaliToGregorian, getPersianDayOfWeek, getDaysInJalaliMonth, calculateDutyHours } from '../utils';

interface ArchiveViewerProps {
    personnel: Personnel[];
    shiftTypes: ShiftType[];
    schedule: ScheduleEntry[];
    globalSettings?: GlobalDutySettings;
}

const years = [1403, 1404, 1405];

interface ReportData {
    personnelId: string;
    personnelName: string;
    totalHours: number;
    dutyHours: number;
    overtime: number;
    morningCount: number;
    eveningCount: number;
    nightCount: number;
}

export function ArchiveViewer({ personnel, shiftTypes, schedule, globalSettings = DEFAULT_GLOBAL_SETTINGS }: ArchiveViewerProps) {
    const todayJalali = new Date().toLocaleDateString('fa-IR-u-nu-latn').split('/').map(Number);
    const [selectedMonth, setSelectedMonth] = useState(todayJalali[1] || 1);
    const [selectedYear, setSelectedYear] = useState(todayJalali[0] || 1404);
    const [reportData, setReportData] = useState<ReportData[] | null>(null);

    const shiftTypeMap = useMemo(() => new Map(shiftTypes.map(st => [st.id, st])), [shiftTypes]);

    const generateReport = () => {
        const morningShiftId = shiftTypes.find(st => st.name === 'صبح' || st.symbol === 'M')?.id;
        const eveningShiftId = shiftTypes.find(st => st.name === 'عصر' || st.symbol === 'E')?.id;
        const nightShiftId = shiftTypes.find(st => st.name === 'شب' || st.symbol === 'N')?.id;

        const daysInMonth = getDaysInJalaliMonth(selectedYear, selectedMonth);
        const holidaysInMonth = new Set(NATIONAL_HOLIDAYS
            .filter(h => h.month === selectedMonth)
            .map(h => h.day));

        // Calculate holiday deduction for the month (standard 6 hours per non-Friday holiday)
        let holidayCount = 0;
        for (let d = 1; d <= daysInMonth; d++) {
            const [gy, gm, gd] = jalaliToGregorian(selectedYear, selectedMonth, d);
            if (getPersianDayOfWeek(gy, gm, gd) !== 'ج' && holidaysInMonth.has(d)) {
                holidayCount++;
            }
        }
        const holidayDeduction = holidayCount * 6;

        const data = personnel.map(p => {
            let totalHours = 0;
            let morningCount = 0;
            let eveningCount = 0;
            let nightCount = 0;

            for (let d = 1; d <= daysInMonth; d++) {
                const [gy, gm, gd] = jalaliToGregorian(selectedYear, selectedMonth, d);
                const dateKey = `${gy}-${String(gm).padStart(2, '0')}-${String(gd).padStart(2, '0')}`;
                
                const entry = schedule.find(s => s.personnelId === p.id && s.date === dateKey);
                if (entry) {
                    const shift = shiftTypeMap.get(entry.shiftTypeId);
                    if (shift) {
                        const isFriday = getPersianDayOfWeek(gy, gm, gd) === 'ج';
                        const isHoliday = holidaysInMonth.has(d);
                        totalHours += calculateShiftHoursDetailed(shift, isFriday, isHoliday);
                        
                        if (shift.id === morningShiftId) morningCount++;
                        else if (shift.id === eveningShiftId) eveningCount++;
                        else if (shift.id === nightShiftId) nightCount++;
                    }
                }
            }

            const dutyHours = calculateDutyHours(p, globalSettings, holidayDeduction, selectedYear, selectedMonth);

            return {
                personnelId: p.id,
                personnelName: p.name,
                totalHours,
                dutyHours,
                overtime: totalHours - dutyHours,
                morningCount,
                eveningCount,
                nightCount,
            };
        });

        setReportData(data);
    };

    return (
        <div className="p-6 bg-slate-50 flex-grow h-full overflow-auto custom-scrollbar">
            <div className="mb-8">
                <h1 className="text-3xl font-black text-slate-800 tracking-tight">بایگانی برنامه و گزارشات</h1>
                <p className="text-slate-500 mt-1 font-medium">مشاهده عملکرد ماهانه پرسنل بر اساس محاسبات حقوقی دقیق</p>
            </div>
            
            <div className="bg-white rounded-[2rem] shadow-xl border border-slate-300 p-8 mb-8">
                <h2 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2">
                    <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                    فیلتر گزارش ماهانه
                </h2>
                <div className="flex flex-wrap items-end gap-6">
                    <div className="flex-grow max-w-[200px]">
                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">انتخاب سال</label>
                        <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))} className="w-full p-3 bg-slate-50 border border-slate-300 rounded-2xl font-bold text-sm focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all">
                             {years.map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                    </div>
                    <div className="flex-grow max-w-[200px]">
                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">انتخاب ماه</label>
                        <select value={selectedMonth} onChange={e => setSelectedMonth(Number(e.target.value))} className="w-full p-3 bg-slate-50 border border-slate-300 rounded-2xl font-bold text-sm focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition-all">
                             {MONTHS.map(m => <option key={m.value} value={m.value}>{m.name}</option>)}
                        </select>
                    </div>
                    <button 
                        onClick={generateReport} 
                        className="bg-blue-600 text-white px-10 py-3.5 rounded-2xl font-black text-sm hover:bg-blue-700 shadow-xl shadow-blue-100 transition-all active:scale-95 flex items-center gap-2"
                    >
                        تولید گزارش محاسباتی
                    </button>
                </div>
            </div>

            {reportData ? (
                 <div className="bg-white rounded-[2.5rem] shadow-2xl border border-slate-300 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="p-8 bg-slate-900 text-white flex justify-between items-center">
                        <div>
                            <h2 className="text-2xl font-black">خلاصه عملکرد ماه {MONTHS.find(m => m.value === selectedMonth)?.name} {selectedYear}</h2>
                            <p className="text-slate-400 text-xs font-bold mt-1">تمامی مقادیر بر اساس ارزش محاسباتی هر شیفت (حقوقی) استخراج شده‌اند.</p>
                        </div>
                        <div className="bg-white/10 px-4 py-2 rounded-xl border border-white/20">
                            <span className="text-[10px] font-black text-slate-300 block mb-0.5">تعداد کل پرسنل</span>
                            <span className="text-xl font-black">{reportData.length} نفر</span>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-right">
                            <thead className="bg-slate-100 border-b border-slate-300">
                                <tr>
                                    <th className="p-5 text-xs font-black text-slate-600 uppercase tracking-wider border-l border-slate-200">نام پرسنل</th>
                                    <th className="p-5 text-center text-xs font-black text-slate-600 uppercase tracking-wider border-l border-slate-200">موظفی (ساعت)</th>
                                    <th className="p-5 text-center text-xs font-black text-slate-600 uppercase tracking-wider border-l border-slate-200">کارکرد (ساعت)</th>
                                    <th className="p-5 text-center text-xs font-black text-slate-600 uppercase tracking-wider border-l border-slate-200">تراز نهایی</th>
                                    <th className="p-5 text-center text-xs font-black text-slate-600 uppercase tracking-wider border-l border-slate-200">صبح</th>
                                    <th className="p-5 text-center text-xs font-black text-slate-600 uppercase tracking-wider border-l border-slate-200">عصر</th>
                                    <th className="p-5 text-center text-xs font-black text-slate-600 uppercase tracking-wider">شب</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-300">
                                {reportData.map(row => (
                                    <tr key={row.personnelId} className="hover:bg-blue-50/30 transition-colors group">
                                        <td className="p-5 border-l border-slate-200">
                                            <span className="font-black text-slate-800 group-hover:text-blue-700 transition-colors">{row.personnelName}</span>
                                        </td>
                                        <td className="p-5 text-center font-mono font-black text-slate-500 border-l border-slate-200">{row.dutyHours.toFixed(0)}</td>
                                        <td className="p-5 text-center font-mono font-black text-slate-800 border-l border-slate-200">{row.totalHours.toFixed(1)}</td>
                                        <td className="p-5 text-center border-l border-slate-200">
                                            <span className={`inline-block px-3 py-1 rounded-full font-mono font-black text-xs ${row.overtime < 0 ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'}`}>
                                                {row.overtime > 0 ? `+${row.overtime.toFixed(1)}` : row.overtime.toFixed(1)}
                                            </span>
                                        </td>
                                        <td className="p-5 text-center font-mono font-bold text-slate-600 border-l border-slate-200">{row.morningCount}</td>
                                        <td className="p-5 text-center font-mono font-bold text-slate-600 border-l border-slate-200">{row.eveningCount}</td>
                                        <td className="p-5 text-center font-mono font-bold text-slate-600">{row.nightCount}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                 </div>
            ) : (
                <div className="flex flex-col items-center justify-center py-32 bg-white rounded-[3rem] border-2 border-dashed border-slate-300">
                    <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-6 border border-slate-200">
                        <svg className="w-10 h-10 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                    </div>
                    <h3 className="text-xl font-black text-slate-500">گزارشی آماده نمایش نیست</h3>
                    <p className="text-slate-400 font-bold mt-1">سال و ماه مورد نظر را انتخاب کرده و دکمه تولید گزارش را بزنید.</p>
                </div>
            )}
        </div>
    );
}
