
import type { ScheduleEntry, Personnel, ShiftType, CustomRule, StaffRequest } from '../types';
import { holidaysFor } from '../defaults';
import { categorizeShift, DEFAULT_RULE_CONFIGS } from '../rules/engine';
import { jalaliToGregorian, getDaysInJalaliMonth, getPersianDayOfWeek } from '../jalali';

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
    const holidaysInMonth = new Set(holidaysFor(jYear, jMonth).map(h => h.day));

    const morningShiftId = shiftTypes.find(s => s.symbol === 'M' || s.name === 'صبح')?.id;
    const eveningShiftId = shiftTypes.find(s => s.symbol === 'E' || s.name === 'عصر')?.id;
    const offShiftId = shiftTypes.find(s => s.symbol === '-' || s.name === 'تعطیل' || s.id === 's-off')?.id;

    // دستهٔ شیفت فقط از categorizeShift موتور قواعد (منبع واحد حقیقت): شیفت
    // ترکیبی عصر‌وشب (EN) هم «شب» است. قبلاً آشکارساز فقط شناسهٔ شب خالص را
    // می‌شناخت و ریکاوری/توالی بعد از EN را نمی‌دید (ناسازگاری اسپایک CP-SAT).
    const categoryOf = (shiftTypeId: string) => {
        const st = shiftTypeMap.get(shiftTypeId);
        return st ? categorizeShift(st) : 'other';
    };

    // سقف کار متوالیِ یک شیفت منفرد، از پیکربندی پیش‌فرض موتور قواعد خوانده
    // می‌شود تا مقدار ۱۲ ساعت فقط یک منبع داشته باشد.
    const maxConsecutiveHoursCfg = DEFAULT_RULE_CONFIGS.find(r => r.ruleType === 'max_consecutive_hours');
    const maxConsecutiveHours = maxConsecutiveHoursCfg?.isEnabled ? maxConsecutiveHoursCfg.value : undefined;
    const faNum = (n: number) => n.toLocaleString('fa-IR', { maximumFractionDigits: 1 });

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
                
                if (prevEntry && categoryOf(prevEntry.shiftTypeId) === 'night' && entry.shiftTypeId !== offShiftId) {
                    addCellConflict(p.id, date, 'نقض ریکاوری شب کاری (۲۴ ساعت استراحت اجباری)', 'CRITICAL');
                }
                if (prevEntry?.shiftTypeId === eveningShiftId && entry.shiftTypeId === morningShiftId) {
                    addCellConflict(p.id, date, 'توالی خسته‌کننده عصر-صبح', 'IMPORTANT');
                }
            }

            // 2. Max Consecutive Night Shifts Check
            if (categoryOf(entry.shiftTypeId) === 'night' && d >= maxNights) {
                let consecutiveCount = 1;
                for (let i = 1; i < maxNights + 1; i++) {
                    const [bgy, bgm, bgd] = jalaliToGregorian(jYear, jMonth, d - i);
                    const bDate = `${bgy}-${String(bgm).padStart(2, '0')}-${String(bgd).padStart(2, '0')}`;
                    const backEntry = scheduleMap.get(`${p.id}-${bDate}`);
                    if (backEntry && categoryOf(backEntry.shiftTypeId) === 'night') {
                        consecutiveCount++;
                    } else {
                        break;
                    }
                }
                if (consecutiveCount > maxNights) {
                    addCellConflict(p.id, date, `تجاوز از حد مجاز شب‌کاری متوالی (${maxNights} شب)`, 'CRITICAL');
                }
            }

            // 3. Max Consecutive Hours: طول واقعی خودِ شیفت منفرد (مستقل از دسته؛
            // مثلاً شیفت ترکیبی عصر‌وشب با طول ۲۲٫۵ ساعت). موتور قواعد هم همین را
            // در ارزیابی ماهانه flag می‌کند؛ این‌جا روی سلول برنامه هم دیده می‌شود.
            if (maxConsecutiveHours != null) {
                const shift = shiftTypeMap.get(entry.shiftTypeId);
                if (shift && shift.realDuration > maxConsecutiveHours) {
                    addCellConflict(p.id, date, `طول شیفت منفرد (${faNum(shift.realDuration)} ساعت) از سقف کار متوالی (${faNum(maxConsecutiveHours)} ساعت) بیشتر است`, 'CRITICAL');
                }
            }

            // 4. قانون ثابت سرپرستار (مستقل از فعال/غیرفعال‌بودن رکورد قاعده):
            // تنها شیفت کاری مجاز برای سرپرستار، شیفت صبح است.
            if (p.role.includes('سرپرستار')) {
                if ((isFriday || isOfficialHoliday) && entry.shiftTypeId !== offShiftId) {
                    addCellConflict(p.id, date, 'سرپرستار باید در جمعه‌ها و تعطیلات رسمی آف باشد', 'CRITICAL');
                }
                if (!isFriday && !isOfficialHoliday && entry.shiftTypeId !== morningShiftId && entry.shiftTypeId !== offShiftId) {
                    addCellConflict(p.id, date, 'قانون ثابت: سرپرستار فقط شیفت صبح دارد', 'CRITICAL');
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
