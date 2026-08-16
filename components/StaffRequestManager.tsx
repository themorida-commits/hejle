
import React, { useState, useMemo } from 'react';
import type { Personnel, ShiftType, StaffRequest, ScheduleEntry } from '../types';
import { jalaliToGregorian, getDaysInJalaliMonth } from '../utils';

interface StaffRequestManagerProps {
    isOpen: boolean;
    onClose: () => void;
    personnel: Personnel[];
    shiftTypes: ShiftType[];
    requests: StaffRequest[];
    setRequests: React.Dispatch<React.SetStateAction<StaffRequest[]>>;
    schedule: ScheduleEntry[];
    setSchedule: React.Dispatch<React.SetStateAction<ScheduleEntry[]>>;
    jYear: number;
    jMonth: number;
}

interface GroupedRequest {
    personnelId: string;
    requestType: 'Leave' | 'Preferred Shift';
    preferredShiftId?: string;
    startDay: number;
    endDay: number;
    requestIds: string[];
}

export function StaffRequestManager({ isOpen, onClose, personnel, shiftTypes, requests, setRequests, schedule, setSchedule, jYear, jMonth }: StaffRequestManagerProps) {
    const [newRequestPersonnelId, setNewRequestPersonnelId] = useState<string>(personnel[0]?.id || '');
    const [startDay, setStartDay] = useState<number>(1);
    const [endDay, setEndDay] = useState<number>(1);
    const [newRequestType, setNewRequestType] = useState<'Leave' | 'Preferred Shift'>('Leave');
    const [newRequestShiftId, setNewRequestShiftId] = useState<string | undefined>(shiftTypes[0]?.id);
    
    const personnelMap = useMemo(() => new Map(personnel.map(p => [p.id, p.name])), [personnel]);
    const shiftTypeMap = useMemo(() => new Map(shiftTypes.map(st => [st.id, st.name])), [shiftTypes]);
    const daysInMonth = useMemo(() => getDaysInJalaliMonth(jYear, jMonth), [jYear, jMonth]);
    const daysArray = useMemo(() => Array.from({ length: daysInMonth }, (_, i) => i + 1), [daysInMonth]);

    const offShiftId = useMemo(() => shiftTypes.find(st => st.symbol === '-' || st.name.includes('آف') || st.name.includes('مرخصی'))?.id || 's-off', [shiftTypes]);

    // Grouping requests logic
    const groupedRequests = useMemo(() => {
        if (requests.length === 0) return [];

        // 1. Sort requests by personnel and then by date
        const sorted = [...requests].sort((a, b) => {
            if (a.personnelId !== b.personnelId) return a.personnelId.localeCompare(b.personnelId);
            return a.date.localeCompare(b.date);
        });

        const groups: GroupedRequest[] = [];
        if (sorted.length === 0) return groups;

        let currentGroup: GroupedRequest | null = null;

        sorted.forEach(req => {
            const dayNum = parseInt(req.date.split('-')[2]);
            
            const isMatch = currentGroup && 
                            currentGroup.personnelId === req.personnelId && 
                            currentGroup.requestType === req.requestType && 
                            currentGroup.preferredShiftId === req.preferredShiftId &&
                            (dayNum === currentGroup.endDay + 1);

            if (isMatch && currentGroup) {
                currentGroup.endDay = dayNum;
                currentGroup.requestIds.push(req.id);
            } else {
                currentGroup = {
                    personnelId: req.personnelId,
                    requestType: req.requestType,
                    preferredShiftId: req.preferredShiftId,
                    startDay: dayNum,
                    endDay: dayNum,
                    requestIds: [req.id]
                };
                groups.push(currentGroup);
            }
        });

        return groups;
    }, [requests]);

    const handleAddRequest = (e: React.FormEvent) => {
        e.preventDefault();
        const batchRequests: StaffRequest[] = [];
        const batchScheduleUpdates: ScheduleEntry[] = [];
        const from = Math.min(startDay, endDay);
        const to = Math.max(startDay, endDay);

        for (let d = from; d <= to; d++) {
            const [gy, gm, gd] = jalaliToGregorian(jYear, jMonth, d);
            const dateStr = `${gy}-${String(gm).padStart(2, '0')}-${String(gd).padStart(2, '0')}`;
            const reqId = `req-${Date.now()}-${d}`;
            
            batchRequests.push({
                id: reqId,
                personnelId: newRequestPersonnelId,
                date: dateStr,
                requestType: newRequestType,
                ...(newRequestType === 'Preferred Shift' && { preferredShiftId: newRequestShiftId }),
            });

            const shiftIdToApply = newRequestType === 'Leave' ? offShiftId : newRequestShiftId;
            if (shiftIdToApply) {
                batchScheduleUpdates.push({
                    personnelId: newRequestPersonnelId,
                    date: dateStr,
                    shiftTypeId: shiftIdToApply,
                    isManualEntry: true 
                });
            }
        }

        setRequests(prev => {
            const updateDates = new Set(batchRequests.map(r => r.date));
            return [...prev.filter(r => !(r.personnelId === newRequestPersonnelId && updateDates.has(r.date))), ...batchRequests];
        });

        setSchedule(prev => {
            const updateDates = new Set(batchScheduleUpdates.map(u => u.date));
            return [...prev.filter(u => !(u.personnelId === newRequestPersonnelId && updateDates.has(u.date))), ...batchScheduleUpdates];
        });
    };

    const handleDeleteGroup = (group: GroupedRequest) => {
        const idsToRemove = new Set(group.requestIds);
        
        // 1. Remove from requests list
        setRequests(prev => prev.filter(r => !idsToRemove.has(r.id)));

        // 2. Remove from the main schedule array
        const datesToRemove = new Set();
        for(let d = group.startDay; d <= group.endDay; d++) {
            const [gy, gm, gd] = jalaliToGregorian(jYear, jMonth, d);
            datesToRemove.add(`${gy}-${String(gm).padStart(2, '0')}-${String(gd).padStart(2, '0')}`);
        }

        setSchedule(prev => prev.filter(entry => 
            !(entry.personnelId === group.personnelId && datesToRemove.has(entry.date))
        ));
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100]">
            <div className="bg-white p-6 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl border-t-8 border-amber-500 animate-in zoom-in duration-200">
                <div className="flex justify-between items-center mb-4 border-b pb-3">
                    <h2 className="text-xl font-black text-slate-800">مدیریت لیست درخواست‌ها</h2>
                    <button type="button" onClick={onClose} className="text-slate-400 hover:text-rose-500 text-3xl font-light transition-colors">&times;</button>
                </div>
                
                <div className="flex-grow overflow-y-auto pr-2 custom-scrollbar">
                    <div className="bg-slate-50 p-4 rounded-xl mb-6 border border-slate-200 shadow-inner">
                        <form onSubmit={handleAddRequest} className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
                            <div className="md:col-span-1 text-right">
                                <label className="block text-[10px] font-black text-slate-400 mb-1">پرسنل</label>
                                <select value={newRequestPersonnelId} onChange={e => setNewRequestPersonnelId(e.target.value)} className="w-full p-2 border border-slate-200 rounded-lg text-xs font-bold bg-white">
                                    {personnel.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                            </div>
                            <div className="text-right">
                                <label className="block text-[10px] font-black text-slate-400 mb-1">از روز</label>
                                <select value={startDay} onChange={e => setStartDay(Number(e.target.value))} className="w-full p-2 border border-slate-200 rounded-lg text-xs font-bold text-center">
                                    {daysArray.map(d => <option key={d} value={d}>{d}</option>)}
                                </select>
                            </div>
                            <div className="text-right">
                                <label className="block text-[10px] font-black text-slate-400 mb-1">تا روز</label>
                                <select value={endDay} onChange={e => setEndDay(Number(e.target.value))} className="w-full p-2 border border-slate-200 rounded-lg text-xs font-bold text-center">
                                    {daysArray.map(d => <option key={d} value={d}>{d}</option>)}
                                </select>
                            </div>
                            <div className="text-right">
                                <label className="block text-[10px] font-black text-slate-400 mb-1">نوع</label>
                                <select value={newRequestType} onChange={e => setNewRequestType(e.target.value as any)} className="w-full p-2 border border-slate-200 rounded-lg text-xs font-bold">
                                    <option value="Leave">مرخصی</option>
                                    <option value="Preferred Shift">شیفت دلخواه</option>
                                </select>
                            </div>
                            {newRequestType === 'Preferred Shift' && (
                                <div className="text-right">
                                    <label className="block text-[10px] font-black text-slate-400 mb-1">شیفت مورد نظر</label>
                                    <select value={newRequestShiftId} onChange={e => setNewRequestShiftId(e.target.value)} className="w-full p-2 border border-slate-200 rounded-lg text-xs font-bold">
                                        {shiftTypes.filter(s => s.symbol !== '-').map(st => <option key={st.id} value={st.id}>{st.name} ({st.symbol})</option>)}
                                    </select>
                                </div>
                            )}
                            <button type="submit" className={`py-2 bg-blue-600 text-white rounded-lg text-[11px] font-black shadow-md hover:bg-blue-700 transition-all ${newRequestType === 'Preferred Shift' ? 'md:col-span-1' : 'md:col-span-2'}`}>ثبت و اعمال</button>
                        </form>
                    </div>

                    <div className="text-right">
                        <h3 className="text-xs font-black text-slate-500 mb-3 flex items-center gap-2 justify-end">
                            <span className="bg-slate-200 px-2 py-0.5 rounded-md text-[10px]">{groupedRequests.length}</span>
                            لیست درخواست‌های فعال (خلاصه)
                        </h3>
                        <div className="space-y-2">
                            {groupedRequests.map((group, idx) => {
                                const dayDisplay = group.startDay === group.endDay 
                                    ? group.startDay 
                                    : `${group.startDay} الی ${group.endDay}`;

                                return (
                                    <div key={idx} className="bg-white border border-slate-200 p-3 rounded-xl flex justify-between items-center hover:border-amber-300 hover:shadow-md transition-all group">
                                        <button 
                                            type="button"
                                            onClick={() => handleDeleteGroup(group)} 
                                            className="p-2 text-rose-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                                            title="حذف بازه درخواستی"
                                        >
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                                        </button>
                                        <div className="flex items-center gap-3">
                                            <div className="text-right">
                                                <p className="font-black text-slate-800 text-xs">{personnelMap.get(group.personnelId)}</p>
                                                <p className="text-[9px] font-bold text-slate-400 mt-0.5">
                                                    {group.requestType === 'Leave' ? 'درخواست مرخصی' : `شیفت دلخواه: ${shiftTypeMap.get(group.preferredShiftId || '')}`}
                                                </p>
                                            </div>
                                            <div className={`px-2 min-w-[36px] h-9 rounded-xl flex flex-col items-center justify-center font-black text-xs shadow-sm border ${group.requestType === 'Leave' ? 'bg-rose-50 text-rose-600 border-rose-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100'}`}>
                                                <span className="text-[8px] opacity-50 leading-none mb-0.5">
                                                    {group.startDay === group.endDay ? 'روز' : 'بازه'}
                                                </span>
                                                <span className="leading-none whitespace-nowrap">{dayDisplay}</span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                            {groupedRequests.length === 0 && (
                                <div className="text-center py-12 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                                    <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center mx-auto mb-3 shadow-sm">
                                        <svg className="w-6 h-6 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
                                    </div>
                                    <p className="text-xs font-black text-slate-400">هیچ درخواستی ثبت نشده است.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="mt-6 flex justify-end gap-2 border-t pt-4">
                     <button type="button" onClick={onClose} className="px-10 py-2.5 bg-slate-100 text-slate-600 rounded-xl font-black text-xs hover:bg-slate-200 transition-all">بستن پنجره</button>
                </div>
            </div>
        </div>
    );
}
