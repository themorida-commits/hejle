import type { ScheduleEntry, Personnel, ShiftType, StaffRequest, CustomRule, AiGenerationSettings, GlobalDutySettings } from '../types';
import { jalaliToGregorian, getDaysInJalaliMonth, getPersianDayOfWeek, calculateDutyHours } from '../utils';
import { NATIONAL_HOLIDAYS } from '../constants';

// Seedable Pseudo-Random Number Generator (Linear Congruential Generator)
// This ensures that for a given seed, the generated sequence of numbers is completely deterministic.
class LCG {
    private seed: number;
    constructor(seed: number = 42) {
        this.seed = seed;
    }
    // Returns a float between 0 and 1
    next(): number {
        this.seed = (this.seed * 1664525 + 1013904223) % 4294967296;
        return this.seed / 4294967296;
    }
}

interface GenerateScheduleParams {
    personnel: Personnel[];
    shiftTypes: ShiftType[];
    currentSchedule: ScheduleEntry[];
    requests: StaffRequest[];
    jMonth: number;
    jYear: number;
    rules: CustomRule[];
    aiSettings: AiGenerationSettings;
    dailyReqs?: { morning: number[], evening: number[], night: number[] };
    globalSettings: GlobalDutySettings;
    manualBalances?: Record<string, number>;
}

export function generateScheduleDeterministic(params: GenerateScheduleParams): ScheduleEntry[] {
    const {
        personnel,
        shiftTypes,
        currentSchedule,
        requests,
        jMonth,
        jYear,
        rules,
        aiSettings,
        dailyReqs,
        globalSettings,
        manualBalances
    } = params;

    if (!personnel || personnel.length === 0) {
        return [];
    }

    const daysInMonth = getDaysInJalaliMonth(jYear, jMonth);
    const holidaysInMonth = new Set(
        (NATIONAL_HOLIDAYS || []).filter(h => h.month === jMonth).map(h => h.day)
    );

    // Compute holiday hour deduction
    let holidayCount = 0;
    for (let d = 1; d <= daysInMonth; d++) {
        const [gy, gm, gd] = jalaliToGregorian(jYear, jMonth, d);
        const isFri = getPersianDayOfWeek(gy, gm, gd) === "ج";
        const isOfficialHol = holidaysInMonth.has(d);
        if (!isFri && isOfficialHol) {
            holidayCount++;
        }
    }
    const holidayDeduction = holidayCount * 6;

    // Identify shift classifications
    const mShift = shiftTypes.find(s => s.symbol === "M" || s.name.includes("صبح"));
    const eShift = shiftTypes.find(s => s.symbol === "E" || s.name.includes("عصر"));
    const nShift = shiftTypes.find(s => s.symbol === "N" || s.name.includes("شب"));
    const offShift = shiftTypes.find(s => s.symbol === "-" || s.symbol === "OFF" || s.symbol === "Off" || s.name.includes("تعطیل") || s.id === "s-off");

    const mShiftId = mShift?.id || "";
    const eShiftId = eShift?.id || "";
    const nShiftId = nShift?.id || "";
    const offShiftId = offShift?.id || "";

    const maxConsecutiveNightsRule = rules.find(r => r.type === "max_consecutive_nights");
    const maxNights = maxConsecutiveNightsRule?.isEnabled ? (maxConsecutiveNightsRule.value || 2) : 2;

    const headNurseRule = rules.find(r => r.type === "head_nurse_morning");
    const isHeadNurseEnabled = headNurseRule?.isEnabled ?? false;

    const maxConsecutiveWorkDays = aiSettings?.maxConsecutiveWorkDays || 6;

    // Extract manual locked schedule entries mapped by personnelId-dateStr
    const lockedScheduleMap = new Map<string, string>(); // "personnelId-dateStr" -> shiftTypeId
    if (currentSchedule) {
        for (const entry of currentSchedule) {
            if (entry.isManualEntry) {
                lockedScheduleMap.set(`${entry.personnelId}-${entry.date}`, entry.shiftTypeId);
            }
        }
    }

    // Helper to calculate the shift value for a person on a specific day
    const getShiftHours = (shiftId: string, day: number): number => {
        const shift = shiftTypes.find(s => s.id === shiftId);
        if (!shift) return 0;
        const [gy, gm, gd] = jalaliToGregorian(jYear, jMonth, day);
        const isFriday = getPersianDayOfWeek(gy, gm, gd) === "ج";
        const isHoliday = holidaysInMonth.has(day);
        if (isHoliday) return shift.holidayCalculatedValue ?? shift.calculatedValue;
        if (isFriday) return shift.fridayCalculatedValue ?? shift.calculatedValue;
        return shift.calculatedValue;
    };

    // We will run 500 trials with different randomized seeds and pick the one with the lowest cost score
    const NUM_TRIALS = 500;
    let bestSchedule: Map<string, string[]> | null = null;
    let bestScore = Infinity;
    let bestHoursMap: Map<string, number> | null = null;

    for (let trial = 1; trial <= NUM_TRIALS; trial++) {
        const lcg = new LCG(trial * 12345);
        const trialSchedule = new Map<string, string[]>(); // personnelId -> shiftTypeIds (index 1..daysInMonth)
        const currentHours = new Map<string, number>();

        // Initialize lists
        for (const p of personnel) {
            trialSchedule.set(p.id, new Array(daysInMonth + 1).fill(""));
            const balanceKey = `${p.id}-${jYear}-${jMonth}`;
            const startingBalance = manualBalances?.[balanceKey] || 0;
            currentHours.set(p.id, startingBalance);
        }

        // Pre-apply manual locks, leave requests, and head nurse holiday OFFs
        for (const p of personnel) {
            const scheduleList = trialSchedule.get(p.id)!;
            const roleIsHeadNurse = p.role.includes("سرپرستار");

            for (let d = 1; d <= daysInMonth; d++) {
                const [gy, gm, gd] = jalaliToGregorian(jYear, jMonth, d);
                const dateStr = `${gy}-${String(gm).padStart(2, "0")}-${String(gd).padStart(2, "0")}`;

                // 1. Check manual locks
                const lockKey = `${p.id}-${dateStr}`;
                if (lockedScheduleMap.has(lockKey)) {
                    const shiftId = lockedScheduleMap.get(lockKey)!;
                    scheduleList[d] = shiftId;
                    currentHours.set(p.id, currentHours.get(p.id)! + getShiftHours(shiftId, d));
                    continue;
                }

                // 2. Check Leave Requests
                const hasLeave = requests.some(r => r.personnelId === p.id && r.requestType === "Leave" && r.date === dateStr);
                if (hasLeave) {
                    scheduleList[d] = offShiftId;
                    continue;
                }

                // 3. Head Nurse Holiday OFF Rule
                if (isHeadNurseEnabled && roleIsHeadNurse) {
                    const isFri = getPersianDayOfWeek(gy, gm, gd) === "ج";
                    const isOfficialHol = holidaysInMonth.has(d);
                    if (isFri || isOfficialHol) {
                        scheduleList[d] = offShiftId;
                        continue;
                    }
                }
            }
        }

        // Loop day-by-day to schedule the unassigned slots
        for (let d = 1; d <= daysInMonth; d++) {
            const [dGy, dGm, dGd] = jalaliToGregorian(jYear, jMonth, d);
            const dayDateStr = `${dGy}-${String(dGm).padStart(2, "0")}-${String(dGd).padStart(2, "0")}`;

            // Check for pre-emptive recovery day from previous day's night shifts
            if (d > 1) {
                for (const p of personnel) {
                    const scheduleList = trialSchedule.get(p.id)!;
                    if (scheduleList[d - 1] === nShiftId && scheduleList[d] === "") {
                        scheduleList[d] = offShiftId;
                    }
                }
            }

            // Determine requirements for this day
            let reqM = 0;
            let reqE = 0;
            let reqN = 0;

            const hasCustomReqs = dailyReqs && (
                (dailyReqs.morning && dailyReqs.morning.some(v => v > 0)) ||
                (dailyReqs.evening && dailyReqs.evening.some(v => v > 0)) ||
                (dailyReqs.night && dailyReqs.night.some(v => v > 0))
            );

            if (hasCustomReqs) {
                reqM = dailyReqs.morning?.[d - 1] || 0;
                reqE = dailyReqs.evening?.[d - 1] || 0;
                reqN = dailyReqs.night?.[d - 1] || 0;
            } else {
                // Determine a sensible default coverage based on active personnel
                const activeCount = personnel.filter(p => {
                    const roleIsHeadNurse = p.role.includes("سرپرستار");
                    const isFri = getPersianDayOfWeek(dGy, dGm, dGd) === "ج";
                    const isOfficialHol = holidaysInMonth.has(d);
                    if (roleIsHeadNurse && (isFri || isOfficialHol)) return false;
                    const hasLeave = requests.some(r => r.personnelId === p.id && r.requestType === "Leave" && r.date === dayDateStr);
                    if (hasLeave) return false;
                    return true;
                }).length;

                reqN = activeCount >= 6 ? 2 : (activeCount >= 3 ? 1 : 0);
                reqE = Math.max(0, Math.floor(activeCount * 0.25));
                reqM = Math.max(0, Math.floor(activeCount * 0.35));
                if (reqM === 0 && activeCount > 0) reqM = 1;
            }

            // Decrement requirements based on pre-assigned shifts (e.g. manual locks or head nurse weekdays)
            for (const p of personnel) {
                const currentShift = trialSchedule.get(p.id)![d];
                if (currentShift !== "") {
                    if (currentShift === mShiftId) reqM = Math.max(0, reqM - 1);
                    else if (currentShift === eShiftId) reqE = Math.max(0, reqE - 1);
                    else if (currentShift === nShiftId) reqN = Math.max(0, reqN - 1);
                }
            }

            // Helper to get eligibility list
            const getEligibles = (sId: string, strict: boolean): Personnel[] => {
                return personnel.filter(p => {
                    if (trialSchedule.get(p.id)![d] !== "") return false;

                    const roleIsHeadNurse = p.role.includes("سرپرستار");

                    // 1. Recovery
                    if (d > 1 && trialSchedule.get(p.id)![d - 1] === nShiftId) {
                        if (strict) return false;
                    }

                    // 2. Max Consecutive Nights
                    if (sId === nShiftId) {
                        let consecutiveNights = 0;
                        for (let i = 1; i <= maxNights; i++) {
                            if (d - i >= 1 && trialSchedule.get(p.id)![d - i] === nShiftId) {
                                consecutiveNights++;
                            } else {
                                break;
                            }
                        }
                        if (consecutiveNights >= maxNights) {
                            if (strict) return false;
                        }

                        // Look-ahead recovery check: if next day is locked to a non-off shift, cannot assign night today
                        if (d < daysInMonth) {
                            const nextShift = trialSchedule.get(p.id)![d + 1];
                            if (nextShift !== "" && nextShift !== offShiftId) {
                                if (strict) return false;
                            }
                        }
                    }

                    // 3. Head Nurse
                    if (isHeadNurseEnabled && roleIsHeadNurse) {
                        const [gy, gm, gd] = jalaliToGregorian(jYear, jMonth, d);
                        const isFri = getPersianDayOfWeek(gy, gm, gd) === "ج";
                        const isOfficialHol = holidaysInMonth.has(d);
                        if (isFri || isOfficialHol) {
                            return false; // must be OFF
                        } else {
                            if (sId !== mShiftId) {
                                return false; // weekdays head nurse must be M
                            }
                        }
                    }

                    return true;
                });
            };

            // Helper to assign a specific shift type
            const assignShiftType = (sId: string, count: number) => {
                let remCount = count;
                if (remCount <= 0) return;

                // Try strict eligibility first, then fallback to relaxed
                let eligibles = getEligibles(sId, true);
                if (eligibles.length === 0) {
                    eligibles = getEligibles(sId, false);
                }

                if (eligibles.length === 0) return;

                // Score candidates
                const candidates = eligibles.map(p => {
                    let score = 0;

                    // A. Hours deficit priority
                    const target = calculateDutyHours(p, globalSettings, holidayDeduction, jYear, jMonth);
                    const current = currentHours.get(p.id) || 0;
                    const deficit = target - current;
                    score += deficit * 5;

                    // B. Preferred Shift Requests
                    const prefShiftReq = requests.find(r => r.personnelId === p.id && r.requestType === "Preferred Shift" && r.date === dayDateStr);
                    if (prefShiftReq) {
                        if (prefShiftReq.preferredShiftId === sId) {
                            score += 150;
                        } else {
                            score -= 100;
                        }
                    }

                    // C. Consecutive Working Days Penalty
                    let consecutiveWork = 0;
                    for (let i = 1; i <= d - 1; i++) {
                        const prevS = trialSchedule.get(p.id)![d - i];
                        if (prevS !== "" && prevS !== offShiftId) {
                            consecutiveWork++;
                        } else {
                            break;
                        }
                    }
                    if (consecutiveWork >= maxConsecutiveWorkDays) {
                        score -= 300;
                    }
                    if (consecutiveWork >= maxConsecutiveWorkDays + 1) {
                        score -= 1000;
                    }

                    // D. Evening-Morning sequence penalty
                    if (sId === mShiftId && d > 1 && trialSchedule.get(p.id)![d - 1] === eShiftId) {
                        score -= 150;
                    }

                    // E. Weekend/Holiday workload balance
                    const [gy, gm, gd] = jalaliToGregorian(jYear, jMonth, d);
                    const isFri = getPersianDayOfWeek(gy, gm, gd) === "ج";
                    const isOfficialHol = holidaysInMonth.has(d);
                    if (isFri || isOfficialHol) {
                        // Count how many Friday/holiday work shifts this person has worked so far
                        let weekendWorkCount = 0;
                        for (let i = 1; i < d; i++) {
                            const [wgy, wgm, wgd] = jalaliToGregorian(jYear, jMonth, i);
                            const wIsFri = getPersianDayOfWeek(wgy, wgm, wgd) === "ج";
                            const wIsHol = holidaysInMonth.has(i);
                            if (wIsFri || wIsHol) {
                                const pastS = trialSchedule.get(p.id)![i];
                                if (pastS !== "" && pastS !== offShiftId) {
                                    weekendWorkCount++;
                                }
                            }
                        }
                        score -= weekendWorkCount * 25;
                    }

                    // F. Randomized Noise for exploration
                    score += lcg.next() * 15;

                    return { p, score };
                });

                // Sort descending
                candidates.sort((a, b) => b.score - a.score);

                // Assign
                const toAssign = Math.min(candidates.length, remCount);
                for (let idx = 0; idx < toAssign; idx++) {
                    const candidate = candidates[idx].p;
                    trialSchedule.get(candidate.id)![d] = sId;
                    currentHours.set(candidate.id, currentHours.get(candidate.id)! + getShiftHours(sId, d));

                    // Pre-emptively apply recovery for night shift assignments
                    if (sId === nShiftId && d < daysInMonth) {
                        const scheduleList = trialSchedule.get(candidate.id)!;
                        if (scheduleList[d + 1] === "") {
                            scheduleList[d + 1] = offShiftId;
                        }
                    }
                }
            };

            // Order of assignment: Night -> Evening -> Morning
            assignShiftType(nShiftId, reqN);
            assignShiftType(eShiftId, reqE);
            assignShiftType(mShiftId, reqM);

            // Assign OFF to any remaining unassigned personnel on day d
            for (const p of personnel) {
                const scheduleList = trialSchedule.get(p.id)!;
                if (scheduleList[d] === "") {
                    scheduleList[d] = offShiftId;
                }
            }
        }

        // Evaluate the trial schedule
        let trialScore = 0;

        for (const p of personnel) {
            const scheduleList = trialSchedule.get(p.id)!;
            const target = calculateDutyHours(p, globalSettings, holidayDeduction, jYear, jMonth);
            const worked = currentHours.get(p.id) || 0;
            const diff = Math.abs(target - worked);

            // 1. Hour deficit deviation cost
            trialScore += diff * 15;

            // 2. Walk through days to detect rules violations
            for (let d = 1; d <= daysInMonth; d++) {
                const shiftId = scheduleList[d];
                const [evalGy, evalGm, evalGd] = jalaliToGregorian(jYear, jMonth, d);
                const evalDateStr = `${evalGy}-${String(evalGm).padStart(2, "0")}-${String(evalGd).padStart(2, "0")}`;

                // Leave request violation
                const hasLeave = requests.some(r => r.personnelId === p.id && r.requestType === "Leave" && r.date === evalDateStr);
                if (hasLeave && shiftId !== offShiftId) {
                    trialScore += 10000;
                }

                // Night shift recovery violation
                if (d > 1 && trialSchedule.get(p.id)![d - 1] === nShiftId && shiftId !== offShiftId) {
                    trialScore += 20000;
                }

                // Evening-Morning sequence violation
                if (d > 1 && trialSchedule.get(p.id)![d - 1] === eShiftId && shiftId === mShiftId) {
                    trialScore += 300;
                }

                // Max consecutive nights
                if (shiftId === nShiftId && d >= maxNights) {
                    let consecutiveNights = 1;
                    for (let i = 1; i <= maxNights; i++) {
                        if (scheduleList[d - i] === nShiftId) {
                            consecutiveNights++;
                        } else {
                            break;
                        }
                    }
                    if (consecutiveNights > maxNights) {
                        trialScore += 20000;
                    }
                }

                // Head Nurse rules
                const roleIsHeadNurse = p.role.includes("سرپرستار");
                if (isHeadNurseEnabled && roleIsHeadNurse) {
                    const isFri = getPersianDayOfWeek(evalGy, evalGm, evalGd) === "ج";
                    const isOfficialHol = holidaysInMonth.has(d);
                    if (isFri || isOfficialHol) {
                        if (shiftId !== offShiftId) {
                            trialScore += 20000;
                        }
                    } else {
                        if (shiftId !== mShiftId && shiftId !== offShiftId) {
                            trialScore += 10000;
                        }
                    }
                }

                // Preferred shifts match
                const prefReq = requests.find(r => r.personnelId === p.id && r.requestType === "Preferred Shift" && r.date === evalDateStr);
                if (prefReq && prefReq.preferredShiftId && shiftId !== prefReq.preferredShiftId) {
                    trialScore += 150;
                }
            }
        }

        // If this trial is better, keep it
        if (trialScore < bestScore) {
            bestScore = trialScore;
            bestSchedule = new Map();
            for (const [key, val] of trialSchedule.entries()) {
                bestSchedule.set(key, [...val]);
            }
            bestHoursMap = new Map(currentHours);

            // Early termination if we find a perfect conflict-free schedule
            if (trialScore < 300) {
                break;
            }
        }
    }

    // Convert the best schedule to the required database structure
    const outputSchedule: ScheduleEntry[] = [];
    if (bestSchedule) {
        for (const p of personnel) {
            const scheduleList = bestSchedule.get(p.id)!;
            for (let d = 1; d <= daysInMonth; d++) {
                const shiftTypeId = scheduleList[d];
                const [gy, gm, gd] = jalaliToGregorian(jYear, jMonth, d);
                const dateStr = `${gy}-${String(gm).padStart(2, "0")}-${String(gd).padStart(2, "0")}`;
                outputSchedule.push({
                    personnelId: p.id,
                    shiftTypeId,
                    date: dateStr,
                    isManualEntry: false
                });
            }
        }
    }

    return outputSchedule;
}
