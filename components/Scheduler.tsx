
import React, { useState, useMemo, useEffect, useRef } from 'react';
import type { Department, Personnel, ShiftType, ScheduleEntry, StaffRequest, CustomRule, ChatMessage, AiGenerationSettings, ChangeLog, GlobalDutySettings } from '../types';
import { Page } from '../types';
import { StaffRequestManager } from './StaffRequestManager';
import { AiLoadingModal } from './AiLoadingModal';
import { MONTHS, NATIONAL_HOLIDAYS } from '../constants';
import { jalaliToGregorian, getDaysInJalaliMonth, getPersianDayOfWeek, calculateShiftHoursDetailed, getSeniorityDisplay, calculateDutyHours } from '../utils';
import { completeScheduleAI } from '../services/geminiService';
import { detectConflicts } from '../services/conflictDetector';

// Persian Keyboard to English Mapping for High-Speed Shift Entry
const FARSI_TO_ENG: Record<string, string> = {
    'ض': 'Q', 'ص': 'W', 'ث': 'E', 'ق': 'R', 'ف': 'T', 'غ': 'Y', 'ع': 'U', 'ه': 'I', 'خ': 'O', 'ح': 'P',
    'ش': 'A', 'س': 'S', 'ی': 'D', 'ب': 'F', 'ل': 'G', 'ا': 'H', 'ت': 'J', 'ن': 'K', 'م': 'L',
    'ظ': 'Z', 'ط': 'X', 'ز': 'C', 'ر': 'V', 'ذ': 'B', 'د': 'N', 'پ': 'M', 'ک': ';', 'گ': "'", 'چ': ']', 'ج': '[',
    'ئ': 'M', 'و': 'V', 'آ': 'H', 'ژ': 'C'
};

interface SchedulerProps {
    departments: Department[];
    personnel: Personnel[];
    shiftTypes: ShiftType[];
    schedule: ScheduleEntry[];
    setSchedule: React.Dispatch<React.SetStateAction<ScheduleEntry[]>>;
    requests: StaffRequest[];
    setRequests: React.Dispatch<React.SetStateAction<StaffRequest[]>>;
    rules: CustomRule[];
    aiSettings: AiGenerationSettings;
    setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
    setCurrentPage: (page: Page) => void;
    changeLog: ChangeLog;
    setChangeLog: React.Dispatch<React.SetStateAction<ChangeLog>>;
    scheduleNotes: string;
    setScheduleNotes: React.Dispatch<React.SetStateAction<string>>;
    onSave: () => void;
    onArchive?: (deptId: string, year: number, month: number) => void;
    manualBalances: Record<string, number>;
    setManualBalances: React.Dispatch<React.SetStateAction<Record<string, number>>>;
    globalSettings: GlobalDutySettings;
}

const getTextColorForBackground = (hexColor: string): string => {
    if (!hexColor) return '#000000';
    const r = parseInt(hexColor.slice(1, 3), 16);
    const g = parseInt(hexColor.slice(3, 5), 16);
    const b = parseInt(hexColor.slice(5, 7), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5 ? '#000000' : '#FFFFFF';
};

const getCoverageColor = (current: number, required: number, isFriday: boolean, isHoliday: boolean) => {
    // 1. Default state: If no requirement is defined, set background to White
    if (required === 0) {
        return 'bg-white text-slate-400';
    }
    
    // 2. Deficit (Under-staffed) -> PALE Red (Rose-100) with dark text
    if (current < required) {
        return 'bg-rose-100 text-rose-700 font-black ring-1 ring-rose-200 animate-pulse-slow';
    }
    
    // 3. Perfect match -> Emerald-600
    if (current === required) {
        return 'bg-emerald-600 text-white font-black shadow-lg ring-1 ring-emerald-700 scale-[1.02] z-10';
    }
    
    // 4. Surplus (Over-staffed) -> Orange (Orange-500)
    // current > required
    return 'bg-orange-500 text-white font-black shadow-lg ring-1 ring-orange-600 scale-[1.01]';
};

export function Scheduler({ 
    departments, personnel, shiftTypes, schedule, setSchedule, 
    requests, setRequests, rules, aiSettings, setMessages, setCurrentPage,
    changeLog, setChangeLog, scheduleNotes, setScheduleNotes,
    onSave, onArchive, manualBalances, setManualBalances, globalSettings
}: SchedulerProps) {
    const todayJalali = new Date().toLocaleDateString('fa-IR-u-nu-latn').split('/').map(Number);
    const [jYear, setJYear] = useState(todayJalali[0] || 1404);
    const [jMonth, setJMonth] = useState(todayJalali[1] || 8);
    const [selectedCell, setSelectedCell] = useState<{ personId: string; day: number } | null>(null);
    const [showPalette, setShowPalette] = useState(false);
    const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
    const [selectedDepartmentId, setSelectedDepartmentId] = useState<string>(departments[0]?.id || '');
    const [isAiModalOpen, setIsAiModalOpen] = useState(false);
    const [aiError, setAiError] = useState<string | null>(null);
    const [zoom, setZoom] = useState(100); 

    const gridContainerRef = useRef<HTMLDivElement>(null);
    const [palettePos, setPalettePos] = useState<{ top: number; right: number } | null>(null);

    const [dailyReqs, setDailyReqs] = useState<{ morning: number[]; evening: number[]; night: number[] }>(() => ({
        morning: new Array(31).fill(0),
        evening: new Array(31).fill(0),
        night: new Array(31).fill(0)
    }));

    const daysInJMonth = useMemo(() => getDaysInJalaliMonth(jYear, jMonth), [jYear, jMonth]);
    const daysArray = useMemo(() => Array.from({ length: daysInJMonth }, (_, i) => i + 1), [daysInJMonth]);

    const filteredPersonnel = useMemo(() => personnel.filter(p => !selectedDepartmentId || p.departmentId === selectedDepartmentId), [personnel, selectedDepartmentId]);
    const filteredShiftTypes = useMemo(() => shiftTypes.filter(st => !selectedDepartmentId || st.departmentIds.includes(selectedDepartmentId)), [shiftTypes, selectedDepartmentId]);
    
    const [showNeeds, setShowNeeds] = useState(true);
    const [showStats, setShowStats] = useState(true);

    const scheduleMap = useMemo(() => {
        const map = new Map<string, ScheduleEntry>();
        schedule.forEach(entry => map.set(`${entry.personnelId}-${entry.date}`, entry));
        return map;
    }, [schedule]);

    const requestsMap = useMemo(() => {
        const map = new Map<string, StaffRequest>();
        requests.forEach(req => map.set(`${req.personnelId}-${req.date}`, req));
        return map;
    }, [requests]);

    const shiftTypeMap = useMemo(() => new Map(shiftTypes.map(st => [st.id, st])), [shiftTypes]);
    const holidaysInMonth = useMemo(() => new Set(NATIONAL_HOLIDAYS.filter(h => h.month === jMonth).map(h => h.day)), [jMonth]);
    const conflicts = useMemo(() => detectConflicts(schedule, filteredPersonnel, shiftTypes, rules, requests, jYear, jMonth), [schedule, filteredPersonnel, shiftTypes, rules, requests, jYear, jMonth]);

    const getGregorianFromJDay = (day: number) => {
        const [gy, gm, gd] = jalaliToGregorian(jYear, jMonth, day);
        return `${gy}-${String(gm).padStart(2, '0')}-${String(gd).padStart(2, '0')}`;
    };

    useEffect(() => {
        const handleGlobalKeyDown = (e: KeyboardEvent) => {
            if (!selectedCell) return;
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
            if (e.key === 'Escape') { setSelectedCell(null); setShowPalette(false); return; }
            const currentPersonIdx = filteredPersonnel.findIndex(p => p.id === selectedCell.personId);
            if (e.key === 'ArrowUp') {
                if (currentPersonIdx > 0) setSelectedCell({ ...selectedCell, personId: filteredPersonnel[currentPersonIdx - 1].id });
                setShowPalette(false);
            } else if (e.key === 'ArrowDown') {
                if (currentPersonIdx < filteredPersonnel.length - 1) setSelectedCell({ ...selectedCell, personId: filteredPersonnel[currentPersonIdx + 1].id });
                setShowPalette(false);
            } else if (e.key === 'ArrowLeft') {
                if (selectedCell.day < daysInJMonth) setSelectedCell({ ...selectedCell, day: selectedCell.day + 1 });
                setShowPalette(false);
            } else if (e.key === 'ArrowRight') {
                if (selectedCell.day > 1) setSelectedCell({ ...selectedCell, day: selectedCell.day - 1 });
                setShowPalette(false);
            }
            const currentDateStr = getGregorianFromJDay(selectedCell.day);
            if (e.key === 'Backspace' || e.key === 'Delete') {
                setSchedule(prev => prev.filter(entry => !(entry.personnelId === selectedCell.personId && entry.date === currentDateStr)));
                setRequests(prev => prev.filter(req => !(req.personnelId === selectedCell.personId && req.date === currentDateStr)));
                return;
            }
            const inputKey = e.key;
            const mappedKey = FARSI_TO_ENG[inputKey] || inputKey;
            const normalizedKey = mappedKey.toUpperCase();
            let matchingShift = filteredShiftTypes.find(st => st.symbol.toUpperCase() === normalizedKey);
            if (!matchingShift) matchingShift = filteredShiftTypes.find(st => st.symbol.toUpperCase().startsWith(normalizedKey));
            if (matchingShift) {
                setSchedule(prev => [
                    ...prev.filter(entry => !(entry.personnelId === selectedCell.personId && entry.date === currentDateStr)),
                    { personnelId: selectedCell.personId, date: currentDateStr, shiftTypeId: matchingShift!.id, isManualEntry: true }
                ]);
            }
        };
        window.addEventListener('keydown', handleGlobalKeyDown);
        return () => window.removeEventListener('keydown', handleGlobalKeyDown);
    }, [selectedCell, filteredPersonnel, filteredShiftTypes, setSchedule, setRequests, daysInJMonth, jYear, jMonth]);

    const handleCellClick = (e: React.MouseEvent, personId: string, day: number) => {
        setSelectedCell({ personId, day });
        setShowPalette(false);
    };

    const handleCellDoubleClick = (e: React.MouseEvent, personId: string, day: number) => {
        setSelectedCell({ personId, day });
        const rect = e.currentTarget.getBoundingClientRect();
        const containerRect = gridContainerRef.current?.getBoundingClientRect();
        if (containerRect) {
            setPalettePos({ top: rect.top - containerRect.top, right: (containerRect.right - rect.right) - 30 });
            setShowPalette(true);
        }
    };

    const handleClearSchedule = () => {
        const monthName = MONTHS.find(m => m.value === jMonth)?.name || jMonth;
        const deptName = departments.find(d => d.id === selectedDepartmentId)?.name || 'بخش جاری';
        
        if (window.confirm(`آیا از پاک کردن کامل تمامی داده‌ها (شیفت‌ها، درخواست‌ها، نیازها و ترازها) بخش «${deptName}» در ${monthName} ${jYear} اطمینان دارید؟ این عملیات جدول را برای چینش جدید آماده می‌کند.`)) {
            const startG = getGregorianFromJDay(1);
            const endG = getGregorianFromJDay(daysInJMonth);
            const personnelIdsInDept = new Set(filteredPersonnel.map(p => p.id));
            
            setSchedule(prev => prev.filter(entry => {
                const isCurrentMonth = entry.date >= startG && entry.date <= endG;
                const isCurrentDept = personnelIdsInDept.has(entry.personnelId);
                return !(isCurrentMonth && isCurrentDept);
            }));

            setRequests(prev => prev.filter(req => {
                const isCurrentMonth = req.date >= startG && req.date <= endG;
                const isCurrentDept = personnelIdsInDept.has(req.personnelId);
                return !(isCurrentMonth && isCurrentDept);
            }));

            setManualBalances(prev => {
                const next = { ...prev };
                filteredPersonnel.forEach(p => {
                    const balanceKey = `${p.id}-${jYear}-${jMonth}`;
                    delete next[balanceKey];
                });
                return next;
            });

            setDailyReqs({
                morning: new Array(31).fill(0),
                evening: new Array(31).fill(0),
                night: new Array(31).fill(0)
            });
            
            setSelectedCell(null);
            setShowPalette(false);
        }
    };

    const handleFinalizeArchive = () => {
        if (onArchive && selectedDepartmentId) onArchive(selectedDepartmentId, jYear, jMonth);
    };

    const personnelStats = useMemo(() => {
        const statsMap = new Map();
        let holidayCount = 0;
        for (let i = 1; i <= daysInJMonth; i++) {
            const [gy, gm, gd] = jalaliToGregorian(jYear, jMonth, i);
            if (getPersianDayOfWeek(gy, gm, gd) !== 'ج' && holidaysInMonth.has(i)) holidayCount++;
        }
        filteredPersonnel.forEach(p => {
            let total = 0;
            daysArray.forEach(d => {
                const [gy, gm, gd] = jalaliToGregorian(jYear, jMonth, d);
                const date = `${gy}-${String(gm).padStart(2, '0')}-${String(gd).padStart(2, '0')}`;
                const entry = scheduleMap.get(`${p.id}-${date}`);
                if (entry) {
                    const shift = shiftTypeMap.get(entry.shiftTypeId);
                    if (shift) total += calculateShiftHoursDetailed(shift, getPersianDayOfWeek(gy, gm, gd) === 'ج', holidaysInMonth.has(d));
                }
            });
            const dutyHours = calculateDutyHours(p, globalSettings, holidayCount * 6, jYear, jMonth);
            statsMap.set(p.id, { totalHours: total, dutyHours, overtime: total - dutyHours });
        });
        return statsMap;
    }, [filteredPersonnel, daysArray, jYear, jMonth, scheduleMap, shiftTypeMap, holidaysInMonth, globalSettings, daysInJMonth]);

    const coverageStats = useMemo(() => {
        const stats = { morning: new Array(daysInJMonth).fill(0), evening: new Array(daysInJMonth).fill(0), night: new Array(daysInJMonth).fill(0) };
        daysArray.forEach((day, i) => {
            const dateStr = getGregorianFromJDay(day);
            filteredPersonnel.forEach(p => {
                const entry = scheduleMap.get(`${p.id}-${dateStr}`);
                if (entry) {
                    const shift = shiftTypeMap.get(entry.shiftTypeId);
                    if (shift) {
                        const sym = shift.symbol.toUpperCase();
                        if (sym.includes('M')) stats.morning[i]++;
                        if (sym.includes('E')) stats.evening[i]++;
                        if (sym.includes('N')) stats.night[i]++;
                    }
                }
            });
        });
        return stats;
    }, [filteredPersonnel, daysArray, jYear, jMonth, scheduleMap, shiftTypeMap, daysInJMonth]);

    const handleBatchReq = (type: 'morning' | 'evening' | 'night', v: string) => {
        const val = Math.max(0, parseInt(v) || 0);
        setDailyReqs(p => ({ ...p, [type]: new Array(31).fill(val) }));
    };

    const handleAiGenerate = async () => {
        setIsAiModalOpen(true);
        setAiError(null);
        try {
             const aiSchedule = await completeScheduleAI(
                 filteredPersonnel, 
                 shiftTypes, 
                 schedule, 
                 requests, 
                 jMonth, 
                 jYear, 
                 rules, 
                 aiSettings, 
                 [], 
                 dailyReqs, 
                 globalSettings,
                 manualBalances 
             );
             if (aiSchedule) {
                 const targetPersonnelIds = new Set(filteredPersonnel.map(p => p.id));
                 const startG = getGregorianFromJDay(1);
                 const endG = getGregorianFromJDay(daysInJMonth);

                 setSchedule(prev => [
                     ...prev.filter(e => {
                         const isTargetDeptPerson = targetPersonnelIds.has(e.personnelId);
                         const isCurrentMonth = e.date >= startG && e.date <= endG;
                         return e.isManualEntry || !isTargetDeptPerson || !isCurrentMonth;
                     }),
                     ...aiSchedule
                 ]);
             }
        } catch (error: any) {
             console.error("AI Generation Error", error);
             setAiError(error.message || 'خطا در ارتباط با هوش مصنوعی.');
        } finally {
             setIsAiModalOpen(false);
        }
    };

    const baseWidths = { index: 20, name: 72, role: 38, status: 20, seniority: 18, duty: 22, day: 22, stats: 34 };
    const getScaled = (val: number) => Math.round((val * zoom) / 100);
    const ds = {
        indexW: getScaled(baseWidths.index), nameW: getScaled(baseWidths.name),
        roleW: getScaled(baseWidths.role), statusW: getScaled(baseWidths.status),
        seniorityW: getScaled(baseWidths.seniority), dutyW: getScaled(baseWidths.duty),
        dayW: getScaled(baseWidths.day), statsW: getScaled(baseWidths.stats),
        fontSize: `${getScaled(14)}px`,
        microFontSize: `${getScaled(10)}px`,
        headerSmallFontSize: `${getScaled(7.5)}px`, 
        headerSmallStaticSize: `${getScaled(8)}px`,
        cellSmallFontSize: `${getScaled(9)}px`  
    };
    const offsets = {
        index: 0, name: ds.indexW, role: ds.indexW + ds.nameW,
        status: ds.indexW + ds.nameW + ds.roleW, seniority: ds.indexW + ds.nameW + ds.roleW + ds.statusW,
        duty: ds.indexW + ds.nameW + ds.roleW + ds.statusW + ds.seniorityW,
        totalFixed: ds.indexW + ds.nameW + ds.roleW + ds.statusW + ds.seniorityW + ds.dutyW
    };
    const totalWidth = offsets.totalFixed + (daysInJMonth * ds.dayW) + (2 * ds.statsW);

    return (
        <div className="p-2 bg-slate-200 flex-grow h-full overflow-hidden flex flex-col relative">
            <style>{`
                .collapsible-row { transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1); overflow: hidden; }
                .collapsed { opacity: 0; transform: translateY(-5px); visibility: collapse; height: 0 !important; }
                .expanded { opacity: 1; transform: translateY(0); visibility: visible; }
                @keyframes pulse-slow {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.8; }
                }
                .animate-pulse-slow {
                    animation: pulse-slow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
                }
            `}</style>
            
            <div className="mb-2 shrink-0 flex flex-wrap justify-between items-center bg-white p-2 rounded-xl shadow-md border border-slate-400">
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 bg-slate-50 p-1 rounded-lg border border-slate-300">
                        <select value={jMonth} onChange={(e) => setJMonth(Number(e.target.value))} className="bg-transparent border-none font-black text-slate-800 text-[10px] focus:ring-0">
                            {MONTHS.map(m => <option key={m.value} value={m.value}>{m.name}</option>)}
                        </select>
                        <input type="number" value={jYear} onChange={(e) => setJYear(Number(e.target.value))} className="w-12 bg-transparent border-none font-black text-slate-800 text-[10px] text-center focus:ring-0" />
                        <div className="h-4 w-[1px] bg-slate-400 mx-1"></div>
                        <select value={selectedDepartmentId} onChange={(e) => setSelectedDepartmentId(e.target.value)} className="bg-transparent border-none font-black text-blue-700 text-[10px] focus:ring-0">
                            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                    </div>
                    <div className="flex items-center gap-2 bg-slate-50 px-2 py-1 rounded-lg border border-slate-300">
                        <div className="flex items-center gap-1">
                            <button onClick={() => setZoom(prev => Math.max(50, prev - 10))} className="w-6 h-6 flex items-center justify-center bg-white border border-slate-300 rounded text-slate-700 hover:bg-slate-100 transition-colors shadow-sm"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M20 12H4"/></svg></button>
                            <input type="range" min="50" max="200" value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="w-16 h-1 bg-slate-300 rounded-lg appearance-none cursor-pointer accent-blue-600" />
                            <button onClick={() => setZoom(prev => Math.min(200, prev + 10))} className="w-6 h-6 flex items-center justify-center bg-white border border-slate-300 rounded text-slate-700 hover:bg-slate-100 transition-colors shadow-sm"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4"/></svg></button>
                        </div>
                        <span className="text-[10px] font-black text-slate-600 w-8 text-center">{zoom}%</span>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-slate-900 font-black text-xs tracking-tight px-3 py-1 bg-slate-900/10 rounded-full border border-slate-400 flex items-center gap-2">
                        <HejlehLogoSmall />
                        برنامه هوشمند حجله
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="flex gap-1.5">
                        <button onClick={handleClearSchedule} className="bg-rose-600 text-white px-3 py-1.5 rounded-lg text-[9px] font-black shadow-md flex items-center gap-1 hover:bg-rose-700 transition-all hover:scale-105 active:scale-95">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                            پاک کردن
                        </button>
                        <button onClick={handleAiGenerate} className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-[9px] font-black shadow-sm flex items-center gap-1 hover:bg-blue-700 transition-all hover:scale-105"><svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>تولید هوشمند</button>
                        <button onClick={() => setIsRequestModalOpen(true)} className="bg-amber-500 text-white px-3 py-1.5 rounded-lg text-[9px] font-black shadow-sm hover:bg-amber-600">درخواست</button>
                        <button onClick={onSave} className="bg-slate-600 text-white px-3 py-1.5 rounded-lg text-[9px] font-black shadow-sm hover:bg-slate-700">ذخیره موقت</button>
                        <button onClick={handleFinalizeArchive} className="bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-[9px] font-black shadow-md hover:bg-emerald-700 flex items-center gap-1"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"/></svg>ثبت نهایی</button>
                    </div>
                </div>
            </div>

            <div ref={gridContainerRef} className="flex-grow overflow-auto bg-white border border-slate-400 shadow-2xl rounded-2xl relative custom-scrollbar">
                {selectedCell && showPalette && palettePos && (
                    <div 
                        className="absolute z-[100] bg-white/95 backdrop-blur-sm shadow-2xl rounded-xl border border-slate-300 p-1 flex flex-col gap-1 pointer-events-auto animate-in fade-in zoom-in duration-100"
                        style={{ top: palettePos.top, right: palettePos.right }}
                        onClick={e => e.stopPropagation()}
                    >
                        {filteredShiftTypes.map(st => (
                            <button 
                                key={st.id} 
                                onClick={() => { 
                                    const dateStr = getGregorianFromJDay(selectedCell.day); 
                                    setSchedule(prev => [...prev.filter(e => !(e.personnelId === selectedCell.personId && e.date === dateStr)), { personnelId: selectedCell.personId, date: dateStr, shiftTypeId: st.id, isManualEntry: true }]); 
                                    setShowPalette(false);
                                }} 
                                className="w-6 h-6 rounded-md text-white font-black text-[8px] shadow-sm hover:scale-110 active:scale-95 transition-all flex items-center justify-center relative group" 
                                style={{ backgroundColor: st.displayColor }}
                                title={st.name}
                            >
                                <span>{st.symbol}</span>
                            </button>
                        ))}
                        <button 
                            onClick={() => { 
                                const dateStr = getGregorianFromJDay(selectedCell.day); 
                                setSchedule(prev => prev.filter(e => !(e.personnelId === selectedCell.personId && e.date === dateStr))); 
                                setRequests(prev => prev.filter(req => !(req.personnelId === selectedCell.personId && req.date === dateStr)));
                                setShowPalette(false);
                            }} 
                            className="w-6 h-6 bg-rose-50 text-rose-500 rounded-md flex items-center justify-center border border-rose-300 hover:bg-rose-500 hover:text-white transition-all shadow-sm"
                            title="حذف (Backspace)"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                        </button>
                    </div>
                )}

                <table className="border-separate border-spacing-0 w-full" style={{ direction: 'rtl', minWidth: `${totalWidth}px` }}>
                    <thead className="sticky top-0 z-[60]">
                        {['morning', 'evening', 'night'].map((type) => (
                            <tr key={`need-${type}`} className={`collapsible-row ${showNeeds ? 'expanded' : 'collapsed'}`} style={{ height: showNeeds ? `${getScaled(12)}px` : '0px' }}>
                                <th colSpan={6} className="sticky right-0 z-[70] px-1 border-l-2 border-slate-500 border-b border-slate-300 font-black bg-white/95 align-middle" style={{ right: 0, fontSize: ds.microFontSize }}>
                                    <div className="relative w-full h-full flex items-center justify-center gap-1.5 text-right">
                                        <input type="number" min="0" className="w-8 h-5 bg-white border border-slate-400 rounded text-center font-bold outline-none shadow-sm focus:ring-1 focus:ring-blue-400" style={{ fontSize: '9px' }} onChange={e => handleBatchReq(type as any, e.target.value)} placeholder="0" />
                                        <span className="text-slate-600 font-black whitespace-nowrap">نیاز {type === 'morning' ? 'صبح' : type === 'evening' ? 'عصر' : 'شب'}</span>
                                    </div>
                                </th>
                                {daysArray.map((day, i) => {
                                    const [gy, gm, gd] = jalaliToGregorian(jYear, jMonth, day);
                                    const isF = getPersianDayOfWeek(gy, gm, gd) === 'ج'; const isH = holidaysInMonth.has(day);
                                    return (
                                        <th key={`req-${type}-${i}`} className={`border-l border-slate-300 border-b border-slate-300 p-0 text-center align-middle ${(isH || isF) ? 'bg-orange-100' : ''}`}>
                                            <input type="number" min="0" value={dailyReqs[type as keyof typeof dailyReqs][i] || ''} onChange={e => {
                                                const val = Math.max(0, parseInt(e.target.value) || 0);
                                                setDailyReqs(p => ({ ...p, [type]: p[type].map((curr, idx) => idx === i ? val : curr) }));
                                            }} className="w-full h-full text-center bg-transparent border-none font-mono font-black focus:ring-0 leading-none" style={{ fontSize: ds.microFontSize }} />
                                        </th>
                                    );
                                })}
                                <th colSpan={2} className="bg-slate-200 border-l border-slate-300 border-b border-slate-300"></th>
                            </tr>
                        ))}

                        <tr className="bg-slate-800 text-white border-b-2 border-slate-900 shadow-lg" style={{ height: `${getScaled(48)}px` }}>
                            <th className="sticky right-0 z-[80] bg-slate-800 border-l-2 border-slate-600 text-center whitespace-nowrap align-middle font-black overflow-visible" style={{ right: offsets.index, fontSize: ds.fontSize }}>
                                <div className="flex flex-col items-center justify-between h-full py-1 gap-1">
                                    <button onClick={() => setShowNeeds(!showNeeds)} className="w-5 h-5 rounded-full bg-white/10 hover:bg-white/20 text-white/50 hover:text-white flex items-center justify-center transition-all border border-white/5 shadow-sm active:scale-90" title={showNeeds ? "مخفی کردن نیاز" : "نمایش نیاز"}>
                                        <svg className={`w-4 h-4 transition-transform duration-500 ${showNeeds ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M19 9l-7 7-7-7"/></svg>
                                    </button>
                                    <div className="flex flex-col items-center gap-0.5"><span className="leading-none opacity-90 text-[8px] font-black">ردیف</span></div>
                                    <button onClick={() => setShowStats(!showStats)} className="w-5 h-5 rounded-full bg-white/10 hover:bg-white/20 text-white/50 hover:text-white flex items-center justify-center transition-all border border-white/5 shadow-sm active:scale-90" title={showStats ? "مخفی کردن حاضرین" : "نمایش حاضرین"}>
                                        <svg className={`w-4 h-4 transition-transform duration-500 ${showStats ? '' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 15l7-7 7 7"/></svg>
                                    </button>
                                </div>
                            </th>
                            <th className="sticky z-[80] bg-slate-800 border-l border-slate-600 px-1 text-right whitespace-nowrap align-middle font-black" style={{ right: offsets.name, fontSize: ds.fontSize }}>نام خانوادگی</th>
                            <th className="sticky z-[80] bg-slate-800 border-l border-slate-600 text-center whitespace-nowrap align-middle" style={{ right: offsets.role }}><div className="[writing-mode:vertical-rl] [rotate:180deg] mx-auto whitespace-nowrap font-bold" style={{ fontSize: ds.headerSmallFontSize }}>سمت</div></th>
                            <th className="sticky z-[80] bg-slate-800 border-l border-slate-600 text-center whitespace-nowrap align-middle" style={{ right: offsets.status }}><div className="[writing-mode:vertical-rl] [rotate:180deg] mx-auto whitespace-nowrap font-bold" style={{ fontSize: ds.headerSmallFontSize }}>نوع استخدام</div></th>
                            <th className="sticky z-[80] bg-slate-800 border-l-2 border-slate-500 text-center whitespace-nowrap align-middle shadow-[inset_-2px_0_0_rgba(0,0,0,0.1)]" style={{ right: offsets.seniority }}><div className="[writing-mode:vertical-rl] [rotate:180deg] mx-auto whitespace-nowrap font-bold" style={{ fontSize: ds.headerSmallFontSize }}>سنوات</div></th>
                            <th className="sticky z-[80] bg-slate-800 border-l-4 border-slate-400 text-center whitespace-nowrap align-middle shadow-[inset_-2px_0_0_rgba(0,0,0,0.1)]" style={{ right: offsets.duty }}><div className="[writing-mode:vertical-rl] [rotate:180deg] mx-auto whitespace-nowrap font-bold" style={{ fontSize: ds.headerSmallFontSize }}>موظفی ماه</div></th>
                            {daysArray.map(day => {
                                const [gy, gm, gd] = jalaliToGregorian(jYear, jMonth, day);
                                const dayInitial = getPersianDayOfWeek(gy, gm, gd);
                                const isF = dayInitial === 'ج'; const isH = holidaysInMonth.has(day);
                                return (
                                    <th key={day} className={`border-l border-slate-600 p-0 align-middle font-black overflow-hidden ${(isH || isF) ? 'bg-orange-700' : 'bg-slate-700'}`}>
                                        <div className="flex flex-col h-full w-full justify-between py-1.5">
                                            <div className="flex items-center justify-center text-[8.5px] opacity-100 leading-none">{dayInitial}</div>
                                            <div className="w-full h-[2px] bg-white/40 my-1"></div>
                                            <div className="flex items-center justify-center text-[10px] leading-none">{day}</div>
                                        </div>
                                    </th>
                                );
                            })}
                            <th className="bg-slate-900 border-l border-slate-600 text-center align-middle font-black px-0.5" style={{ fontSize: '7px' }}>کارکرد</th>
                            <th className="bg-slate-900 text-center align-middle font-black px-0.5" style={{ fontSize: '7px' }}>تراز</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y-0">
                        {filteredPersonnel.map((p, pIndex) => {
                            const stats = personnelStats.get(p.id);
                            const balanceKey = `${p.id}-${jYear}-${jMonth}`;
                            const displayOvertime = manualBalances[balanceKey] !== undefined ? manualBalances[balanceKey] : stats?.overtime;
                            const seniority = getSeniorityDisplay(p.employmentDate, jYear, jMonth);
                            return (
                                <tr key={p.id} className="hover:bg-blue-50/50 transition-colors group" style={{ height: `${getScaled(24)}px` }}>
                                    <td className="sticky right-0 z-40 bg-slate-50 border-l border-slate-300 border-b border-slate-300 text-center font-bold text-slate-500 align-middle" style={{ right: offsets.index, fontSize: ds.fontSize }}>{pIndex + 1}</td>
                                    <td className="sticky z-40 bg-white border-l border-slate-300 border-b border-slate-300 px-1 whitespace-nowrap font-black text-slate-800 align-middle overflow-hidden text-ellipsis" style={{ right: offsets.name, fontSize: ds.cellSmallFontSize }}>{p.name}</td>
                                    <td className="sticky z-40 bg-white border-l border-slate-300 border-b border-slate-300 text-slate-600 text-right px-0.5 whitespace-nowrap font-bold align-middle overflow-hidden text-ellipsis" style={{ right: offsets.role, fontSize: ds.cellSmallFontSize }}>{p.role}</td>
                                    <td className={`sticky z-40 bg-white border-l border-slate-300 border-b border-slate-300 text-center whitespace-nowrap align-middle ${p.employmentStatus === 'رسمی' ? 'text-blue-800 font-black' : 'text-slate-600'}`} style={{ right: offsets.status, fontSize: ds.cellSmallFontSize }}>{p.employmentStatus.charAt(0)}</td>
                                    <td className="sticky z-40 bg-white border-l-2 border-slate-400 border-b border-slate-300 text-indigo-700 font-mono text-center font-black align-middle" style={{ right: offsets.seniority, fontSize: ds.cellSmallFontSize }}>{seniority}</td>
                                    <td className="sticky z-40 bg-white border-l-4 border-slate-500 border-b border-slate-300 text-center font-mono font-black align-middle" style={{ right: offsets.duty, fontSize: ds.cellSmallFontSize }}><div className="flex items-center justify-center gap-0.5 leading-none"><span className="text-slate-900">{Math.round(stats?.dutyHours || 0)}</span></div></td>
                                    {daysArray.map(day => {
                                        const dateStr = getGregorianFromJDay(day);
                                        const [gy, gm, gd] = jalaliToGregorian(jYear, jMonth, day);
                                        const isF = getPersianDayOfWeek(gy, gm, gd) === 'ج'; const isH = holidaysInMonth.has(day);
                                        const entry = scheduleMap.get(`${p.id}-${dateStr}`);
                                        const request = requestsMap.get(`${p.id}-${dateStr}`);
                                        const shift = entry ? shiftTypeMap.get(entry.shiftTypeId) : null;
                                        const cellConflicts = conflicts.cellConflicts.get(`${p.id}-${dateStr}`);
                                        let cellBg = (isH || isF) ? 'bg-orange-100' : 'bg-white';
                                        const isSelected = selectedCell?.personId === p.id && selectedCell?.day === day;
                                        return (
                                            <td key={dateStr} className={`border-l border-slate-300 border-b border-slate-300 text-center cursor-pointer relative transition-all align-middle active:scale-95 ${cellBg} ${isSelected ? 'ring-2 ring-blue-500 ring-inset z-[80] shadow-2xl' : ''}`} style={{ backgroundColor: shift?.displayColor || undefined, color: entry ? getTextColorForBackground(shift?.displayColor || '#fff') : undefined }} onClick={(e) => handleCellClick(e, p.id, day)} onDoubleClick={(e) => handleCellDoubleClick(e, p.id, day)} title={request ? (request.requestType === 'Leave' ? 'درخواست مرخصی' : 'شیفت درخواستی') : undefined}>
                                                <span className="font-mono font-black leading-none inline-block align-middle" style={{ fontSize: ds.fontSize }}>{shift?.symbol || ''}</span>
                                                {cellConflicts && (<div className="absolute top-0 right-0 w-2 h-2 flex items-center justify-center"><div className="w-1.5 h-1.5 bg-rose-600 rounded-bl-full shadow-sm"></div></div>)}
                                                {request && (<div className="absolute bottom-0 right-0 p-0.5"><svg className={`w-2 h-2 ${entry ? 'text-white/80' : 'text-amber-500'}`} fill="currentColor" viewBox="0 0 20 20"><path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z"/></svg></div>)}
                                            </td>
                                        );
                                    })}
                                    <td className="bg-slate-100 text-center font-mono font-black border-l border-slate-300 border-b border-slate-300 text-slate-800 align-middle" style={{ fontSize: ds.cellSmallFontSize }}>{Math.round(stats?.totalHours || 0)}</td>
                                    <td className={`text-center font-mono font-black border-b border-slate-300 align-middle ${displayOvertime < 0 ? 'text-rose-700 bg-rose-50' : 'text-emerald-800 bg-emerald-50'}`} style={{ fontSize: ds.cellSmallFontSize }}>{displayOvertime?.toFixed(0)}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                    <tfoot className="sticky bottom-0 z-[60] bg-white border-t-2 border-slate-500 shadow-[0_-5px_15px_rgba(0,0,0,0.05)] overflow-visible">
                        {['morning', 'evening', 'night'].map((type) => (
                            <tr key={`footer-${type}`} className={`collapsible-row ${showStats ? 'expanded' : 'collapsed'}`} style={{ height: showStats ? `${getScaled(12)}px` : '0px' }}>
                                <th colSpan={6} className="sticky right-0 z-[70] border-l-2 border-slate-500 border-b border-slate-300 font-black bg-white/95 align-middle" style={{ right: 0, height: showStats ? `${getScaled(12)}px` : '0px', fontSize: ds.microFontSize }}>
                                    <div className="flex items-center justify-start px-2 w-full h-full text-right">
                                        <span className="opacity-80 whitespace-nowrap">حاضرین {type === 'morning' ? 'صبح' : (type === 'evening' ? 'عصر' : 'شب')}</span>
                                    </div>
                                </th>
                                {daysArray.map((day, i) => {
                                    const [gy, gm, gd] = jalaliToGregorian(jYear, jMonth, day);
                                    const isF = getPersianDayOfWeek(gy, gm, gd) === 'ج'; const isH = holidaysInMonth.has(day);
                                    const count = coverageStats[type as keyof typeof coverageStats][i];
                                    const req = dailyReqs[type as keyof typeof dailyReqs][i];
                                    return (
                                        <th key={`foot-${type}-${i}`} className={`border-l border-slate-300 border-b border-slate-300 text-center font-mono font-black align-middle transition-all duration-300 ${getCoverageColor(count, req, isF, isH)}`} style={{ fontSize: ds.microFontSize }}>{count || 0}</th>
                                    );
                                })}
                                <th colSpan={2} className="bg-slate-300 border-l border-slate-400 border-b border-slate-300 align-middle"></th>
                            </tr>
                        ))}
                    </tfoot>
                </table>
            </div>

            <AiLoadingModal isOpen={isAiModalOpen} />
            {isRequestModalOpen && <StaffRequestManager isOpen={isRequestModalOpen} onClose={() => setIsRequestModalOpen(false)} personnel={filteredPersonnel} shiftTypes={shiftTypes} requests={requests} setRequests={setRequests} schedule={schedule} setSchedule={setSchedule} jYear={jYear} jMonth={jMonth} />}

            {aiError && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 shadow-2xl" dir="rtl">
                    <div className="bg-white rounded-2xl max-w-md w-full p-6 border border-slate-100 flex flex-col gap-4">
                        <div className="flex items-center gap-3 text-rose-500">
                            <span className="p-2 bg-rose-50 rounded-lg">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                            </span>
                            <h3 className="text-lg font-bold text-slate-800">بروز خطای هوش مصنوعی</h3>
                        </div>
                        
                        <p className="text-sm text-slate-600 leading-relaxed text-right font-medium">
                            {aiError}
                        </p>

                        <div className="text-xs bg-slate-50 text-slate-500 rounded-lg p-3 text-right border border-slate-100 leading-relaxed">
                            <span className="font-semibold block mb-1 text-slate-700">توضیحات و راهکار:</span>
                            سیستم به طور خودکار مدل جایگزین را برای دور زدن محدودیت سهمیه فراخوانی کرد، اما ظرفیت برای کارهای بدون هزینه به اتمام رسیده است. شما همچنان می‌توانید چیدمان شیفت‌ها را به صورت دستی و با سرعت بالا با فشردن کلیدهای میانبر ثبت یا ویرایش کنید.
                        </div>

                        <div className="flex justify-end gap-2 mt-2">
                            <button
                                onClick={() => setAiError(null)}
                                className="w-full bg-slate-800 hover:bg-slate-700 active:bg-slate-900 text-white font-medium py-2 px-4 rounded-xl shadow-md transition-colors duration-200 text-sm"
                            >
                                متوجه شدم (بستن)
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function HejlehLogoSmall() {
    return (
        <svg viewBox="0 0 100 100" className="w-5 h-5" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M50 88.5C50 88.5 88 65 88 42C88 25 75 15 60 15C50 15 45 20 45 20C45 20 40 15 30 15C15 15 2 25 2 42C2 65 40 88.5 40 88.5" stroke="#EF4444" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="30" cy="25" r="10" fill="#22C55E" />
            <path d="M12 60C12 60 22 40 62 30" stroke="#22C55E" strokeWidth="8" strokeLinecap="round" />
        </svg>
    );
}
