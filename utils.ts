
import type { ShiftType, Personnel, GlobalDutySettings } from "./types";

export function jalaliToGregorian(jy: number, jm: number, jd: number): [number, number, number] {
    let sal_a, gy, gm, gd, days;
    jy += 1595;
    days = -355668 + (365 * jy) + (~~(jy / 33) * 8) + ~~(((jy % 33) + 3) / 4) + jd + ((jm < 7) ? (jm - 1) * 31 : ((jm - 7) * 30) + 186);
    gy = 400 * ~~(days / 146097);
    days %= 146097;
    if (days > 36524) {
        gy += 100 * ~~(--days / 36524);
        days %= 36524;
        if (days >= 365) days++;
    }
    gy += 4 * ~~(days / 1461);
    days %= 1461;
    if (days > 365) {
        gy += ~~((days - 1) / 365);
        days = (days - 1) % 365;
    }
    gd = days + 1;
    sal_a = [0, 31, ((gy % 4 === 0 && gy % 100 !== 0) || (gy % 400 === 0)) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    for (gm = 0; gm < 13 && gd > sal_a[gm]; gm++) {
        gd -= sal_a[gm];
    }
    return [gy, gm, gd];
}

function isJalaliLeapYear(jy: number): boolean {
    // Jalali leap years: year % 33 must be in {1, 5, 9, 13, 17, 22, 26, 30}
    const LEAP_REMAINDERS = new Set([1, 5, 9, 13, 17, 22, 26, 30]);
    return LEAP_REMAINDERS.has(jy % 33);
}

export function getDaysInJalaliMonth(year: number, month: number): number {
    if (month <= 6) return 31;
    if (month <= 11) return 30;
    // Month 12 (Esfand): 30 days in leap years, 29 in non-leap years
    return isJalaliLeapYear(year) ? 30 : 29;
}

export function getPersianDayOfWeek(gy: number, gm: number, gd: number): string {
    const date = new Date(gy, gm - 1, gd);
    const day = date.getDay();
    const days = ['ی', 'د', 'س', 'چ', 'پ', 'ج', 'ش'];
    return days[day];
}

export function calculateShiftHoursDetailed(shift: ShiftType, isFriday: boolean, isHoliday: boolean): number {
    if (isHoliday) return shift.holidayCalculatedValue;
    if (isFriday) return shift.fridayCalculatedValue;
    return shift.calculatedValue;
}

export function getSeniorityTotalMonths(employmentDateStr?: string, targetYear?: number, targetMonth?: number): number {
    if (!employmentDateStr) return 0;
    const parts = employmentDateStr.split('/').map(Number);
    if (parts.length < 2) return 0;
    
    const [startYear, startMonth] = parts;
    let endYear, endMonth;
    if (targetYear !== undefined && targetMonth !== undefined) {
        endYear = targetYear;
        endMonth = targetMonth;
    } else {
        const today = new Date().toLocaleDateString('fa-IR-u-nu-latn').split('/').map(Number);
        endYear = today[0];
        endMonth = today[1];
    }
    
    let totalMonths = (endYear - startYear) * 12 + (endMonth - startMonth);
    return Math.max(0, totalMonths);
}

export function getSeniorityDisplay(employmentDateStr?: string, targetYear?: number, targetMonth?: number): string {
    const totalMonths = getSeniorityTotalMonths(employmentDateStr, targetYear, targetMonth);
    const years = Math.floor(totalMonths / 12);
    const months = totalMonths % 12;
    return `${years}.${months}`;
}

export function calculateDutyHours(person: Personnel, settings: GlobalDutySettings, holidayDeduction: number, targetYear: number, targetMonth: number): number {
    if (person.baseDutyHours !== undefined && person.baseDutyHours !== null && person.baseDutyHours !== 0) {
        return person.baseDutyHours - holidayDeduction;
    }

    const statusSetting = settings.employmentStatuses.find(s => s.status === person.employmentStatus);
    let base = statusSetting ? statusSetting.baseHours : 169;

    // 1. Role Deduction
    const roleSetting = settings.roleDeductions.find(r => r.role === person.role);
    if (roleSetting) {
        base -= roleSetting.deduction;
    }

    // 2. Seniority Deduction
    const totalMonths = getSeniorityTotalMonths(person.employmentDate, targetYear, targetMonth);
    const seniorityDeduction = settings.seniorityDeductions.find(s => totalMonths >= s.minMonths && totalMonths < s.maxMonths);
    if (seniorityDeduction) {
        base -= seniorityDeduction.deduction;
    }

    return Math.max(0, base - holidayDeduction);
}

/**
 * ابزار تلاش مجدد با استراتژی عقب‌گرد نمایی
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  delay = 1000
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retries <= 0) throw error;
    
    console.warn(`تلاش مجدد باقی‌مانده: ${retries}. در حال انتظار برای ${delay} میلی‌ثانیه...`);
    
    await new Promise((resolve) => setTimeout(resolve, delay));
    
    // تکرار با دو برابر کردن زمان انتظار
    return withRetry(fn, retries - 1, delay * 2);
  }
}
