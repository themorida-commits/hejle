import type { ShiftType, Personnel, GlobalDutySettings } from './types';

export function calculateShiftHoursDetailed(shift: ShiftType, isFriday: boolean, isHoliday: boolean): number {
    if (isHoliday) return shift.holidayCalculatedValue;
    if (isFriday) return shift.fridayCalculatedValue;
    return shift.calculatedValue;
}

export function getSeniorityTotalMonths(employmentDateStr?: string, targetYear?: number, targetMonth?: number): number {
    if (!employmentDateStr) return 0;
    const parts = employmentDateStr.split('/').map(Number);
    if (parts.length < 2) return 0;
    
    const startYear = parts[0]!;
    const startMonth = parts[1]!;
    let endYear, endMonth;
    if (targetYear !== undefined && targetMonth !== undefined) {
        endYear = targetYear;
        endMonth = targetMonth;
    } else {
        const today = new Date().toLocaleDateString('fa-IR-u-nu-latn').split('/').map(Number);
        endYear = today[0]!;
        endMonth = today[1]!;
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
