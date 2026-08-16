
import React, { useState, useMemo, useEffect } from 'react';
import { MONTHS, NATIONAL_HOLIDAYS } from '../constants';
import { getDaysInJalaliMonth, jalaliToGregorian, getPersianDayOfWeek } from '../utils';
import type { CalendarEvent, GlobalDutySettings } from '../types';

interface CalendarManagerProps {
    settings: GlobalDutySettings;
    setSettings: React.Dispatch<React.SetStateAction<GlobalDutySettings>>;
    events: CalendarEvent[];
    setEvents: React.Dispatch<React.SetStateAction<CalendarEvent[]>>;
}

export function CalendarManager({ settings, setSettings, events, setEvents }: CalendarManagerProps) {
    const todayJ = new Date().toLocaleDateString('fa-IR-u-nu-latn').split('/').map(Number);
    const [year, setYear] = useState(todayJ[0] || 1404);
    const [month, setMonth] = useState(todayJ[1] || 1);
    const [isEventModalOpen, setIsEventModalOpen] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [selectedDay, setSelectedDay] = useState<number | null>(null);
    
    // Form State
    const [eventTitle, setEventTitle] = useState('');
    const [eventTime, setEventTime] = useState('');
    const [eventLeadMinutes, setEventLeadMinutes] = useState<number>(settings.defaultReminderMinutes || 60);
    const [eventType, setEventType] = useState<CalendarEvent['type']>('reminder');

    const daysInMonth = getDaysInJalaliMonth(year, month);
    const holidays = useMemo(() => new Set(NATIONAL_HOLIDAYS.filter(h => h.month === month).map(h => h.day)), [month]);

    // Calculate monthly summary of off-days
    const { fridayCount, officialHolidayCount } = useMemo(() => {
        let fCount = 0;
        let hCount = 0;
        for (let d = 1; d <= daysInMonth; d++) {
            const [gy, gm, gd] = jalaliToGregorian(year, month, d);
            const isFriday = getPersianDayOfWeek(gy, gm, gd) === 'ج';
            const isOfficial = holidays.has(d);
            
            if (isFriday) fCount++;
            if (isOfficial && !isFriday) hCount++; // Avoid double counting if holiday falls on Friday
        }
        return { fridayCount: fCount, officialHolidayCount: hCount };
    }, [year, month, daysInMonth, holidays]);

    const firstDayOfWeek = useMemo(() => {
        const [gy, gm, gd] = jalaliToGregorian(year, month, 1);
        const day = new Date(gy, gm - 1, gd).getDay();
        return (day + 1) % 7;
    }, [year, month]);

    const calendarGrid = useMemo(() => {
        const grid = [];
        for (let i = 0; i < firstDayOfWeek; i++) grid.push(null);
        for (let d = 1; d <= daysInMonth; d++) grid.push(d);
        return grid;
    }, [daysInMonth, firstDayOfWeek]);

    const getDayEvents = (day: number) => events.filter(e => e.year === year && e.month === month && e.day === day);

    const handleAddEvent = () => {
        if (!selectedDay || !eventTitle.trim()) return;
        const newEvent: CalendarEvent = {
            id: `ev-${Date.now()}`,
            year,
            month,
            day: selectedDay,
            time: eventTime || undefined,
            reminderLeadMinutes: eventLeadMinutes,
            title: eventTitle,
            type: eventType,
            createdAt: new Date().toISOString()
        };
        setEvents(prev => [...prev, newEvent]);
        setEventTitle('');
        setEventTime('');
        setIsEventModalOpen(false);
    };

    const handleDeleteEvent = (id: string) => {
        if (window.confirm('آیا از حذف این یادداشت اطمینان دارید؟')) {
            setEvents(prev => prev.filter(e => e.id !== id));
        }
    };

    const updateLeadDays = (val: number) => setSettings(p => ({ ...p, reminderLeadDays: val }));
    const updateDefaultMin = (val: number) => setSettings(p => ({ ...p, defaultReminderMinutes: val }));

    return (
        <div className="h-full flex flex-col bg-slate-50 overflow-hidden font-['Vazirmatn'] relative">
            {/* Ultra Compact Header */}
            <div className="p-3 flex justify-between items-center bg-white border-b border-slate-300 shrink-0 shadow-sm">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white shadow-lg">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    </div>
                    <div className="flex items-baseline gap-2">
                        <h1 className="text-lg font-black text-slate-800">تقویم رویدادها</h1>
                    </div>
                </div>

                {/* Summary Stats */}
                <div className="hidden sm:flex items-center gap-4 px-4 py-1.5 bg-slate-50 rounded-2xl border border-slate-200 shadow-inner">
                    <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-black text-slate-400">جمعه‌ها:</span>
                        <span className="text-xs font-black text-rose-600 bg-rose-50 px-2 rounded-lg">{fridayCount}</span>
                    </div>
                    <div className="w-[1px] h-4 bg-slate-300"></div>
                    <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-black text-slate-400">تعطیلات غیرجمعه:</span>
                        <span className="text-xs font-black text-orange-600 bg-orange-50 px-2 rounded-lg">{officialHolidayCount}</span>
                    </div>
                </div>
                
                <div className="flex gap-2 items-center">
                    <button 
                        onClick={() => setShowSettings(!showSettings)}
                        className={`p-2 rounded-lg transition-all ${showSettings ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                        title="تنظیمات اعلان‌ها"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    </button>
                    <div className="h-6 w-px bg-slate-300 mx-1"></div>
                    <select value={month} onChange={e => setMonth(Number(e.target.value))} className="p-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-black outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer">
                        {MONTHS.map(m => <option key={m.value} value={m.value}>{m.name}</option>)}
                    </select>
                    <input type="number" value={year} onChange={e => setYear(Number(e.target.value))} className="w-16 p-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-black text-center outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
            </div>

            {/* Smart Notification Settings Popover */}
            {showSettings && (
                <div className="absolute top-16 left-3 z-[100] bg-white rounded-2xl shadow-2xl border border-slate-300 p-5 w-64 animate-in fade-in slide-in-from-top-2 duration-200 text-right">
                    <div className="flex items-center justify-end gap-2 mb-4 border-b pb-2">
                        <h3 className="font-black text-xs text-slate-800">تنظیمات اعلان هوشمند</h3>
                        <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg>
                    </div>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-[10px] font-black text-slate-400 mb-1">بازه زمانی بررسی (روز):</label>
                            <select 
                                value={settings.reminderLeadDays} 
                                onChange={e => updateLeadDays(Number(e.target.value))}
                                className="w-full p-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold"
                            >
                                <option value={0}>فقط امروز</option>
                                <option value={1}>امروز و فردا</option>
                                <option value={2}>۲ روز آینده</option>
                                <option value={7}>۱ هفته آینده</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-[10px] font-black text-slate-400 mb-1">زمان پیش‌فرض (دقیقه قبل):</label>
                            <input 
                                type="number" 
                                value={settings.defaultReminderMinutes} 
                                onChange={e => updateDefaultMin(Number(e.target.value))}
                                className="w-full p-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-center"
                            />
                            <p className="text-[8px] text-slate-400 mt-1">مدت زمان اطلاع‌رسانی پیش از شروع رویداد.</p>
                        </div>
                        <button 
                            onClick={() => setShowSettings(false)}
                            className="w-full py-2 bg-slate-800 text-white rounded-xl text-[10px] font-black"
                        >
                            بستن و تایید
                        </button>
                    </div>
                </div>
            )}

            {/* Calendar Main View */}
            <div className="flex-grow p-4 flex flex-col overflow-hidden">
                <div className="grid grid-cols-7 gap-1 mb-2 shrink-0">
                    {['شنبه', '۱شنبه', '۲شنبه', '۳شنبه', '۴شنبه', '۵شنبه', 'جمعه'].map((d, i) => (
                        <div key={d} className={`text-center py-2 text-[10px] font-black uppercase tracking-tight ${i === 6 ? 'text-rose-600' : 'text-slate-500'}`}>{d}</div>
                    ))}
                </div>

                <div className="grid grid-cols-7 gap-2 flex-grow auto-rows-fr">
                    {calendarGrid.map((day, idx) => {
                        if (day === null) return <div key={`empty-${idx}`} className="bg-transparent opacity-0"></div>;
                        const isFriday = idx % 7 === 6;
                        const isHoliday = holidays.has(day);
                        const dayEvents = getDayEvents(day);
                        const isToday = todayJ[0] === year && todayJ[1] === month && todayJ[2] === day;
                        
                        return (
                            <div 
                                key={day} 
                                onClick={() => { setSelectedDay(day); setIsEventModalOpen(true); }}
                                className={`
                                    relative group p-2 rounded-[1rem] border-2 transition-all cursor-pointer flex flex-col items-center justify-center overflow-hidden
                                    ${isFriday ? 'bg-rose-50/50 border-rose-300 text-rose-600' : 'bg-white border-slate-300 text-slate-700'}
                                    ${isHoliday && !isFriday ? 'bg-orange-50/50 border-orange-300 text-orange-600' : ''}
                                    ${isToday ? 'ring-2 ring-indigo-600 ring-offset-2' : ''}
                                    hover:border-indigo-500 hover:shadow-xl hover:-translate-y-1 active:scale-95 z-10
                                `}
                            >
                                <span className={`text-xl font-black leading-none ${isHoliday || isFriday ? '' : 'text-slate-900'}`}>
                                    {day}
                                </span>
                                
                                {/* Event Bar (Replaces Dots) */}
                                {dayEvents.length > 0 && (
                                    <div className="absolute top-0 right-0 left-0 h-1 bg-rose-500 shadow-[0_1px_3px_rgba(244,63,94,0.4)]"></div>
                                )}

                                <div className="hidden group-hover:block absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-[140px] bg-slate-800 text-white text-[8px] p-2 rounded-lg pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-50 shadow-2xl text-right">
                                    {dayEvents.length > 0 ? (
                                        dayEvents.map(e => <p key={e.id} className="truncate">• {e.time ? `${e.time} - ` : ''}{e.title}</p>)
                                    ) : (
                                        <p>کلیک برای ثبت رویداد</p>
                                    )}
                                </div>

                                {isHoliday && !isFriday && (
                                    <div className="absolute bottom-1.5 text-[8px] font-black text-orange-600 uppercase truncate w-full text-center px-1 opacity-70">
                                        تعطیل
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Bottom Legend */}
            <div className="px-6 py-3 bg-white border-t border-slate-300 flex justify-center gap-8 text-[10px] font-black text-slate-500 shrink-0 shadow-[0_-1px_5px_rgba(0,0,0,0.05)]">
                <div className="flex items-center gap-1.5"><div className="w-5 h-1 bg-rose-500 rounded-full"></div> دارای رویداد</div>
                <div className="h-3 w-px bg-slate-300 mx-2"></div>
                <div className="flex items-center gap-1.5 text-rose-600"><div className="w-3 h-3 bg-rose-100 border border-rose-300 rounded-md"></div> جمعه</div>
                <div className="flex items-center gap-1.5 text-orange-600"><div className="w-3 h-3 bg-orange-100 border border-orange-300 rounded-md"></div> تعطیل رسمی</div>
            </div>

            {/* Event Management Modal */}
            {isEventModalOpen && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[200] p-4">
                    <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in duration-300 border border-slate-300 text-right">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                             <button onClick={() => setIsEventModalOpen(false)} className="p-2 hover:bg-slate-200 rounded-full text-slate-400">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
                            </button>
                            <div>
                                <h2 className="text-xl font-black text-slate-800">رویدادهای {selectedDay} {MONTHS.find(m => m.value === month)?.name}</h2>
                            </div>
                        </div>
                        
                        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
                            <div className="space-y-2">
                                {getDayEvents(selectedDay!).map(e => (
                                    <div key={e.id} className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-2xl shadow-sm hover:border-indigo-300 transition-all">
                                        <button onClick={() => handleDeleteEvent(e.id)} className="p-2 text-slate-300 hover:text-rose-500 transition-colors">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                                        </button>
                                        <div className="flex items-center gap-3">
                                            <div className="text-right">
                                                <p className="text-xs font-black text-slate-700">{e.title}</p>
                                                {e.time && <p className="text-[10px] font-bold text-slate-400">ساعت: {e.time}</p>}
                                            </div>
                                            <div className={`w-1.5 h-6 rounded-full ${e.type === 'meeting' ? 'bg-blue-500' : e.type === 'deadline' ? 'bg-rose-500' : 'bg-emerald-500'}`}></div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="pt-4 border-t border-slate-100 space-y-4">
                                <h3 className="text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">افزودن یادداشت جدید</h3>
                                <input type="text" placeholder="عنوان رویداد..." value={eventTitle} onChange={e => setEventTitle(e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:border-indigo-500 outline-none text-right shadow-inner" />
                                
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="text-right">
                                        <label className="block text-[8px] font-black text-slate-400 mb-1">اطلاع‌رسانی (دقیقه قبل)</label>
                                        <input type="number" value={eventLeadMinutes} onChange={e => setEventLeadMinutes(Number(e.target.value))} className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:border-indigo-500 outline-none text-center" />
                                    </div>
                                    <div className="text-right">
                                        <label className="block text-[8px] font-black text-slate-400 mb-1">ساعت برگزاری</label>
                                        <input type="time" value={eventTime} onChange={e => setEventTime(e.target.value)} className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:border-indigo-500 outline-none text-center" />
                                    </div>
                                </div>

                                <div className="flex gap-2">
                                    {(['meeting', 'reminder', 'deadline'] as const).map(t => (
                                        <button key={t} onClick={() => setEventType(t)} className={`flex-1 py-2 rounded-xl text-[10px] font-black border transition-all ${eventType === t ? 'bg-indigo-600 border-indigo-700 text-white shadow-lg' : 'bg-white border-slate-200 text-slate-500'}`}>
                                            {t === 'meeting' ? 'جلسه' : t === 'reminder' ? 'یادآور' : 'مهم'}
                                        </button>
                                    ))}
                                </div>
                                <button onClick={handleAddEvent} disabled={!eventTitle.trim()} className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black text-sm hover:bg-indigo-700 shadow-xl transition-all active:scale-95 disabled:opacity-50">
                                    ثبت نهایی یادداشت
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
