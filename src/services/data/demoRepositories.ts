// ریپازیتوری دمو — همان اینترفیس‌های Supabase، روی دادهٔ درون‌حافظه‌ای سیدشده
// از نمونهٔ پروژه. برای پایلوت و تست؛ رفتار قراردادی‌اش با نسخهٔ واقعی یکی است.
import { MOCK_DEPARTMENTS, MOCK_PERSONNEL, MOCK_SHIFT_TYPES } from '../../fixtures/sampleData';
import { DEFAULT_RULES, DEFAULT_AI_SETTINGS, DEFAULT_GLOBAL_SETTINGS } from '../../core/defaults';
import { generateScheduleDeterministic } from '../../core/scheduling/schedulerSolver';
import { LEAVE_TYPES } from '../../features/leave/leaveService';
import { isoFromJalali } from '../../features/leave/leaveService';
import { getDaysInJalaliMonth } from '../../core/jalali';
import type {
  DataRepositories, EntryRecord, HospitalSnapshot, LeaveRecord,
  NursingServiceDbRecord, ScheduleRecord, WorkRecordRecord,
} from './types';
import { DEFAULT_NURSING_PACKAGES } from '../../features/nursingServices/nursingService';

export const DEMO_HOSPITAL_ID = 'demo-hospital';
export const DEMO_SCHEDULE_ID = 'demo-schedule-dep1-1405-7';

export function buildDemoSnapshot(jYear = 1405, jMonth = 7): HospitalSnapshot {
  const dep1 = MOCK_PERSONNEL.filter(p => p.departmentId === 'dep1');
  const solved = generateScheduleDeterministic({
    personnel: dep1, shiftTypes: MOCK_SHIFT_TYPES, currentSchedule: [], requests: [],
    rules: DEFAULT_RULES, aiSettings: DEFAULT_AI_SETTINGS, globalSettings: DEFAULT_GLOBAL_SETTINGS,
    jYear, jMonth,
  });
  const daysInMonth = getDaysInJalaliMonth(jYear, jMonth);
  void daysInMonth;
  const schedule: ScheduleRecord = {
    id: DEMO_SCHEDULE_ID, hospitalId: DEMO_HOSPITAL_ID, wardId: 'dep1', jYear, jMonth, status: 'draft',
  };
  const entries: EntryRecord[] = solved.map((e, i) => ({
    id: `demo-entry-${i}`,
    scheduleId: DEMO_SCHEDULE_ID,
    hospitalId: DEMO_HOSPITAL_ID,
    wardId: 'dep1',
    employeeId: e.personnelId,
    entryDate: e.date,
    jDay: 0, // پایین‌تر از روی روز جلالی پر می‌شود
    shiftTypeId: e.shiftTypeId,
    isManual: e.isManualEntry,
    isLocked: false,
  }));
  // jDay را از روی ترتیب روز ماه پر می‌کنیم (تاریخ میلادیِ ردیف‌ها یکتا و مرتب است)
  const dayByDate = new Map<string, number>();
  for (let d = 1; d <= getDaysInJalaliMonth(jYear, jMonth); d++) dayByDate.set(isoFromJalali(jYear, jMonth, d), d);
  for (const e of entries) e.jDay = dayByDate.get(e.entryDate) ?? 0;

  return {
    wards: MOCK_DEPARTMENTS.map(d => ({ id: d.id, hospitalId: DEMO_HOSPITAL_ID, name: d.name, code: null, isActive: true })),
    employees: MOCK_PERSONNEL.map(p => ({
      id: p.id, hospitalId: DEMO_HOSPITAL_ID, wardId: p.departmentId, profileId: null,
      fullName: p.name, personnelCode: p.personnelCode, roleTitle: p.role,
      employmentStatus: p.employmentStatus, employmentStartJalali: p.employmentDate ?? null,
      baseDutyHoursOverride: p.baseDutyHours ?? null, isActive: true,
    })),
    shiftTypes: MOCK_SHIFT_TYPES.map(s => ({
      id: s.id, hospitalId: DEMO_HOSPITAL_ID, name: s.name, symbol: s.symbol,
      realDurationHours: s.realDuration, calculatedValue: s.calculatedValue,
      fridayValue: s.fridayCalculatedValue, holidayValue: s.holidayCalculatedValue, color: s.displayColor || null,
    })),
    leaveTypes: LEAVE_TYPES.map((t, i) => ({
      id: `demo-lt-${i}`, hospitalId: DEMO_HOSPITAL_ID, code: t.code, name: t.name,
      isPaid: t.isPaid, annualQuotaDays: t.code === 'annual' ? 26 : null, requiresCoverage: true,
    })),
    schedule,
    entries,
    leaves: [],
    workRecords: [],
    nursingPackages: DEFAULT_NURSING_PACKAGES.map(p => ({
      id: p.id, hospitalId: DEMO_HOSPITAL_ID, code: p.code, title: p.title,
      kValue: p.kValue, unit: p.unit, careGroup: p.careGroup ?? null, isActive: true,
    })),
    nursingRecords: buildDemoNursingRecords(entries),
  };
}

/** ثبت‌های دمو خدمات پرستاری از روی مدخل‌های روس‌تر داخلی — چند شیفت آخرِ بازه عمداً بدون ثبت می‌ماند تا داشبورد کسورات نشت نشان دهد. */
function buildDemoNursingRecords(entries: EntryRecord[]): NursingServiceDbRecord[] {
  const shiftMap: Record<string, NursingServiceDbRecord['shift']> = { 's-m': 'morning', 's-e': 'evening', 's-n': 'night' };
  const out: NursingServiceDbRecord[] = [];
  let seq = 0;
  for (const e of entries) {
    if (e.wardId !== 'dep1') continue;
    const shift = shiftMap[e.shiftTypeId];
    if (!shift || e.jDay < 1 || e.jDay > 10) continue; // روزهای ۱۱ و ۱۲ بدون ثبت (نشت نمایشی)
    seq++;
    const pending = seq === 4;
    out.push({
      id: `nsr-${seq}`, hospitalId: DEMO_HOSPITAL_ID, wardId: e.wardId, employeeId: e.employeeId,
      patientRef: `P-${1000 + ((seq * 37) % 60)}`, packageId: 'pkg-g4', count: 2,
      serviceDate: e.entryDate, shift, status: pending ? 'recorded' : 'confirmed',
      confirmedBy: pending ? null : 'p1', confirmedAt: pending ? null : `${e.entryDate}T12:00:00.000Z`,
      createdAt: `${e.entryDate}T08:00:00.000Z`,
    });
  }
  return out;
}

export function createDemoRepositories(seed: HospitalSnapshot = buildDemoSnapshot()): DataRepositories & { snapshot: () => HospitalSnapshot } {
  const state: HospitalSnapshot = structuredClone(seed);
  let seq = 1000;
  return {
    snapshot: () => structuredClone(state),
    org: {
      async listWards(hospitalId) { return state.wards.filter(w => w.hospitalId === hospitalId); },
      async listEmployees(wardId) { return state.employees.filter(e => e.wardId === wardId && e.isActive); },
      async listShiftTypes(hospitalId) { return state.shiftTypes.filter(s => s.hospitalId === hospitalId); },
      async listLeaveTypes(hospitalId) { return state.leaveTypes.filter(l => l.hospitalId === hospitalId); },
      async createEmployees(records) {
        const have = new Set(state.employees.map(e => e.personnelCode));
        const fresh = records.filter(r => !have.has(r.personnelCode));
        state.employees.push(...fresh);
        return structuredClone(fresh);
      },
    },
    nursing: {
      async listPackages(hospitalId) { return state.nursingPackages.filter(p => p.hospitalId === hospitalId && p.isActive); },
      async listRecords(wardId) { return state.nursingRecords.filter(r => r.wardId === wardId); },
      async createRecord(rec) {
        const created: NursingServiceDbRecord = { ...rec, id: `demo-nsr-${++seq}`, createdAt: new Date().toISOString() };
        state.nursingRecords.push(created);
        return structuredClone(created);
      },
      async confirmRecord(id, confirmedByEmployeeId) {
        const r = state.nursingRecords.find(x => x.id === id);
        if (r) { r.status = 'confirmed'; r.confirmedBy = confirmedByEmployeeId; r.confirmedAt = new Date().toISOString(); }
      },
    },
    roster: {
      async getSchedule(wardId, jYear, jMonth) {
        return state.schedule && state.schedule.wardId === wardId && state.schedule.jYear === jYear && state.schedule.jMonth === jMonth
          ? state.schedule : null;
      },
      async listEntries(scheduleId) { return state.entries.filter(e => e.scheduleId === scheduleId); },
      async upsertEntries(entries) {
        for (const e of entries) {
          const i = state.entries.findIndex(x => x.scheduleId === e.scheduleId && x.employeeId === e.employeeId && x.entryDate === e.entryDate);
          if (i >= 0) state.entries[i] = e; else state.entries.push(e);
        }
      },
      async setScheduleStatus(scheduleId, status) {
        if (state.schedule?.id === scheduleId) state.schedule.status = status;
      },
    },
    leave: {
      async listLeaveRequests(wardId) { return state.leaves.filter(l => l.wardId === wardId); },
      async createLeaveRequest(rec) {
        const created: LeaveRecord = { ...rec, id: `demo-leave-${++seq}`, status: 'pending', reviewedBy: null };
        state.leaves.push(created);
        return created;
      },
      async updateLeaveStatus(id, status, reviewedBy) {
        const l = state.leaves.find(x => x.id === id);
        if (l) { l.status = status; l.reviewedBy = reviewedBy; }
      },
    },
    workRecords: {
      async listWorkRecords(wardId, jYear, jMonth) {
        return state.workRecords.filter(w => w.wardId === wardId && w.jYear === jYear && w.jMonth === jMonth);
      },
      async upsertWorkRecords(records: WorkRecordRecord[]) {
        for (const r of records) {
          const i = state.workRecords.findIndex(x => x.employeeId === r.employeeId && x.jYear === r.jYear && x.jMonth === r.jMonth);
          if (i >= 0) state.workRecords[i] = r; else state.workRecords.push(r);
        }
      },
    },
  };
}
