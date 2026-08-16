
import type { ScheduleEntry, Personnel, ShiftType, CustomRule, StaffRequest } from '../types';
import { NATIONAL_HOLIDAYS } from '../constants';
import { jalaliToGregorian, getDaysInJalaliMonth, getPersianDayOfWeek } from '../utils';

export function detectConflicts(
    schedule: ScheduleEntry[],
    personnel: Personnel[],
    shiftTypes: ShiftType[],
    rules: CustomRule[],
    requests: StaffRequest[],
    jYear: number,
    jMonth: number
): { cellConflicts: Map<string, string[]>; dayConflicts: Map<string, string[]> } {
    const cellConflicts = new Map<string, string[]>();
    const dayConflicts = new Map<string, string[]>();

    const scheduleMap = new Map(schedule.map(entry => [`${entry.personnelId}-${entry.date}`, entry]));
    const shiftTypeMap = new Map(shiftTypes.map(st => [st.id, st]));
    const daysInMonth = getDaysInJalaliMonth(jYear, jMonth);
    const holidaysInMonth = new Set(NATIONAL_HOLIDAYS.filter(h => h.month === jMonth).map(h => h.day));

    const morningShiftId = shiftTypes.find(s => s.symbol === 'M' || s.name === 'صبح')?.id;
    const eveningShiftId = shiftTypes.find(s => s.symbol === 'E' || s.name === 'عصر')?.id;
    const nightShiftId = shiftTypes.find(s => s.symbol === 'N' || s.name === 'شب')?.id;
    const offShiftId = shiftTypes.find(s => s.symbol === '-' || s.name === 'تعطیل' || s.id === 's-off')?.id;

    const addCellConflict = (personnelId: string, date: string, message: string, priority: string = 'CRITICAL') => {
        const key = `${personnelId}-${date}`;
        if (!cellConflicts.has(key)) cellConflicts.set(key, []);
        const formatted = `[${priority === 'CRITICAL' ? 'خطا' : 'هشدار'}] ${message}`;
        if (!cellConflicts.get(key)!.includes(formatted)) cellConflicts.get(key)!.push(formatted);
    };

    // Global rule settings
    const maxConsecutiveNightsRule = rules.find(r => r.type === 'max_consecutive_nights');
    const maxNights = maxConsecutiveNightsRule?.isEnabled ? (maxConsecutiveNightsRule.value || 2) : 999;

    // Rule Checking Logic
    for (let d = 1; d <= daysInMonth; d++) {
        const [gy, gm, gd] = jalaliToGregorian(jYear, jMonth, d);
        const date = `${gy}-${String(gm).padStart(2, '0')}-${String(gd).padStart(2, '0')}`;
        const isFriday = getPersianDayOfWeek(gy, gm, gd) === 'ج';
        const isOfficialHoliday = holidaysInMonth.has(d);
        
        personnel.forEach(p => {
            const entry = scheduleMap.get(`${p.id}-${date}`);
            if (!entry) return;

            // 1. Recovery Check (Interconnected with Previous Day)
            if (d > 1) {
                const [pgy, pgm, pgd] = jalaliToGregorian(jYear, jMonth, d - 1);
                const prevDate = `${pgy}-${String(pgm).padStart(2, '0')}-${String(pgd).padStart(2, '0')}`;
                const prevEntry = scheduleMap.get(`${p.id}-${prevDate}`);
                
                if (prevEntry?.shiftTypeId === nightShiftId && entry.shiftTypeId !== offShiftId) {
                    addCellConflict(p.id, date, 'نقض ریکاوری شب کاری (۲۴ ساعت استراحت اجباری)', 'CRITICAL');
                }
                if (prevEntry?.shiftTypeId === eveningShiftId && entry.shiftTypeId === morningShiftId) {
                    addCellConflict(p.id, date, 'توالی خسته‌کننده عصر-صبح', 'IMPORTANT');
                }
            }

            // 2. Max Consecutive Night Shifts Check
            if (entry.shiftTypeId === nightShiftId && d >= maxNights) {
                let consecutiveCount = 1;
                for (let i = 1; i < maxNights + 1; i++) {
                    const [bgy, bgm, bgd] = jalaliToGregorian(jYear, jMonth, d - i);
                    const bDate = `${bgy}-${String(bgm).padStart(2, '0')}-${String(bgd).padStart(2, '0')}`;
                    if (scheduleMap.get(`${p.id}-${bDate}`)?.shiftTypeId === nightShiftId) {
                        consecutiveCount++;
                    } else {
                        break;
                    }
                }
                if (consecutiveCount > maxNights) {
                    addCellConflict(p.id, date, `تجاوز از حد مجاز شب‌کاری متوالی (${maxNights} شب)`, 'CRITICAL');
                }
            }

            // 3. Role specific rules (Interconnected with Calendar)
            const headNurseRule = rules.find(r => r.type === 'head_nurse_morning');
            if (headNurseRule?.isEnabled && p.role.includes('سرپرستار')) {
                if ((isFriday || isOfficialHoliday) && entry.shiftTypeId !== offShiftId) {
                    addCellConflict(p.id, date, 'سرپرستار باید در جمعه‌ها و تعطیلات رسمی آف باشد', 'CRITICAL');
                }
                if (!isFriday && !isOfficialHoliday && entry.shiftTypeId !== morningShiftId && entry.shiftTypeId !== offShiftId) {
                    addCellConflict(p.id, date, 'سرپرستار در روزهای عادی باید در شیفت صبح باشد', headNurseRule.priority);
                }
            }
        });
    }

    // Requests check (Interconnected with Schedule)
    requests.forEach(req => {
        const entry = scheduleMap.get(`${req.personnelId}-${req.date}`);
        if (entry) {
            const shift = shiftTypeMap.get(entry.shiftTypeId);
            const isOff = shift?.symbol === '-' || shift?.id === 's-off';
            if (req.requestType === 'Leave' && !isOff) {
                addCellConflict(req.personnelId, req.date, 'مغایرت با مرخصی درخواستی', 'IMPORTANT');
            }
        }
    });

    return { cellConflicts, dayConflicts };
}
