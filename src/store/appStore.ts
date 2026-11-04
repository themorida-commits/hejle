import { create } from 'zustand';
import { MOCK_PERSONNEL } from '../fixtures/sampleData';
import { DEFAULT_GLOBAL_SETTINGS } from '../core/defaults';
import { calculateDutyHours } from '../core/duty';
import type { Department, Personnel, ScheduleEntry, ShiftType, StaffRequest } from '../core/types';
import { type LeaveRequest } from '../features/leave/leaveService';
import { type SwapRequest } from '../features/swaps/swapService';
import { type WorkRecord } from '../features/workRecords/workRecordService';
import { type AttendanceEvent } from '../features/attendance/attendanceService';
import { seedDemoCredentials, type Credential } from '../features/credentials/credentialService';
import { isoFromJalali } from '../features/leave/leaveService';
import { buildDemoSnapshot } from '../services/data/demoRepositories';
import { createRepositories, currentDataSource, loadHospitalSnapshot } from '../services/data/index';
import {
  employeeToPersonnel, shiftTypeToDomain, entryToDomain, leaveToDomain, workRecordToDomain,
} from '../services/data/mappers';
import type { HospitalSnapshot } from '../services/data/types';
import { useSessionStore } from './session';

// استور فاز ۱ — از لایهٔ داده تغذیه می‌شود: حالت دمو از DemoRepositories و
// حالت supabase از loadHospitalSnapshot؛ هر دو از همان مپرها رد می‌شوند.
export const J_YEAR = 1405;
export const J_MONTH = 7;

export type ViewRole = 'ward_manager' | 'staff';

export function snapshotToState(snap: HospitalSnapshot) {
  const personnel = snap.employees.map(employeeToPersonnel);
  const nameOf = (id: string) => {
    const p = personnel.find(x => x.id === id);
    return { name: p?.name ?? id, code: p?.personnelCode ?? '' };
  };
  return {
    departments: snap.wards.map(w => ({ id: w.id, name: w.name, themeColor: '' })),
    personnel,
    shiftTypes: snap.shiftTypes.map(shiftTypeToDomain),
    entries: snap.entries.map(entryToDomain),
    leaves: snap.leaves.map(leaveToDomain),
    workRecords: snap.workRecords.map(w => workRecordToDomain(w, nameOf)),
    scheduleStatus: (snap.schedule?.status ?? 'draft') as 'draft' | 'published',
  };
}

/** مرج عکس یک بخش در وضعیت فعلی — قلب بارگذاری تنبل (تست‌پذیر و خالص). */
export function mergeWardIntoState(
  cur: {
    personnel: Personnel[]; entries: ScheduleEntry[]; leaves: LeaveRequest[]; workRecords: WorkRecord[];
    dutyByEmployee: Map<string, number>; leaveBalances: Record<string, { entitled: number; used: number }>;
  },
  snap: HospitalSnapshot,
) {
  const mapped = snapshotToState(snap);
  const newIds = new Set(mapped.personnel.map(p => p.id));
  const duty = new Map(cur.dutyByEmployee);
  for (const p of mapped.personnel) {
    if (!duty.has(p.id)) duty.set(p.id, calculateDutyHours(p, DEFAULT_GLOBAL_SETTINGS, 0, J_YEAR, J_MONTH));
  }
  const balances = { ...cur.leaveBalances };
  for (const p of mapped.personnel) balances[p.id] ??= { entitled: 26, used: 0 };
  return {
    personnel: [...cur.personnel.filter(p => !newIds.has(p.id)), ...mapped.personnel],
    entries: [...cur.entries.filter(e => !newIds.has(e.personnelId)), ...mapped.entries],
    leaves: [...cur.leaves.filter(l => !newIds.has(l.employeeId)), ...mapped.leaves],
    workRecords: [...cur.workRecords.filter(w => !newIds.has(w.employeeId)), ...mapped.workRecords],
    dutyByEmployee: duty,
    leaveBalances: balances,
  };
}

interface AppState {
  dataSource: 'demo' | 'supabase';
  hydrated: boolean;
  loadedWards: string[];
  hydrateFromSupabase: () => Promise<void>;
  loadWard: (wardId: string) => Promise<void>;
  departments: Department[];
  personnel: Personnel[];
  shiftTypes: ShiftType[];
  entries: ScheduleEntry[];
  requests: StaffRequest[];
  leaves: LeaveRequest[];
  swaps: SwapRequest[];
  workRecords: WorkRecord[];
  attendanceEvents: AttendanceEvent[];
  credentials: Credential[];
  departmentId: string;
  scheduleStatus: 'draft' | 'published';
  viewRole: ViewRole;
  currentEmployeeId: string;
  leaveBalances: Record<string, { entitled: number; used: number }>;
  dutyByEmployee: Map<string, number>;

  setDepartment: (id: string) => void;
  setViewRole: (r: ViewRole) => void;
  setCurrentEmployee: (id: string) => void;
  setEntries: (e: ScheduleEntry[]) => void;
  setScheduleStatus: (s: 'draft' | 'published') => void;
  addLeave: (l: LeaveRequest) => void;
  updateLeave: (l: LeaveRequest) => void;
  addSwap: (s: SwapRequest) => void;
  updateSwap: (s: SwapRequest) => void;
  setWorkRecords: (w: WorkRecord[]) => void;
  adjustBalance: (employeeId: string, deltaUsed: number) => void;
  addAttendanceEvent: (e: AttendanceEvent) => void;
  setAttendanceEvents: (e: AttendanceEvent[]) => void;
  addCredential: (c: Credential) => void;
}

/** رویدادهای دمو حضور برای ۱۲ روز اول ماه (شامل یک تأخیر و یک غیبت نمایشی). */
function seedAttendance(entries: ScheduleEntry[]): AttendanceEvent[] {
  const firstDays = new Set(Array.from({ length: 12 }, (_, i) => isoFromJalali(J_YEAR, J_MONTH, i + 1)));
  const times: Record<string, [string, string]> = { 's-m': ['06:55', '13:05'], 's-e': ['13:58', '20:00'], 's-n': ['18:57', '07:02'] };
  const out: AttendanceEvent[] = [];
  let seq = 0;
  for (const e of entries) {
    if (!firstDays.has(e.date)) continue;
    const t = times[e.shiftTypeId];
    if (!t) continue;
    if (e.personnelId === 'p5' && e.date === isoFromJalali(J_YEAR, J_MONTH, 3)) continue; // غیبت نمایشی
    const inTime = e.personnelId === 'p3' && e.shiftTypeId === 's-m' ? '07:20' : t[0]; // تأخیر نمایشی
    out.push({ id: `att-${++seq}`, employeeId: e.personnelId, dateISO: e.date, type: 'in', time: inTime, source: 'device' });
    const outDate = e.shiftTypeId === 's-n'
      ? new Date(new Date(e.date + 'T00:00:00Z').getTime() + 86400000).toISOString().slice(0, 10)
      : e.date;
    out.push({ id: `att-${++seq}`, employeeId: e.personnelId, dateISO: outDate, type: 'out', time: t[1], source: 'device' });
  }
  return out;
}

function seedDuty(): Map<string, number> {
  return new Map(MOCK_PERSONNEL.map(p => [p.id, calculateDutyHours(p, DEFAULT_GLOBAL_SETTINGS, 0, J_YEAR, J_MONTH)]));
}

const demoState = snapshotToState(buildDemoSnapshot());

export const useAppStore = create<AppState>((set, get) => ({
  dataSource: currentDataSource(),
  hydrated: currentDataSource() === 'demo',
  loadedWards: currentDataSource() === 'demo' ? demoState.departments.map(d => d.id) : [],
  hydrateFromSupabase: async () => {
    if (get().hydrated || get().dataSource !== 'supabase') return;
    // زمینهٔ سازمانی اول از نشست واقعی می‌آید (AuthGate آن را از عضویت‌های
    // کاربر پر کرده)؛ env فقط پشتیبانِ پایلوت/بدون‌نشست است.
    const session = useSessionStore.getState();
    const hospitalId = session.hospitalId ?? (import.meta.env.VITE_HOSPITAL_ID as string | undefined);
    const wardId = session.wardId ?? (import.meta.env.VITE_WARD_ID as string | undefined);
    if (!hospitalId || !wardId) { set({ hydrated: true }); return; }
    const snap = await loadHospitalSnapshot(createRepositories('supabase'), {
      hospitalId, wardId, jYear: J_YEAR, jMonth: J_MONTH,
    });
    const mapped = snapshotToState(snap);
    set({
      ...mapped,
      departmentId: wardId,
      // اگر AuthGate هویت واقعی کاربر را ست کرده و در دادهٔ این بخش هست، همان می‌ماند.
      currentEmployeeId: mapped.personnel.some(p => p.id === get().currentEmployeeId)
        ? get().currentEmployeeId
        : mapped.personnel[1]?.id ?? mapped.personnel[0]?.id ?? get().currentEmployeeId,
      hydrated: true,
      loadedWards: [wardId],
    });
  },
  loadWard: async (wardId) => {
    const st = get();
    if (st.dataSource !== 'supabase' || st.loadedWards.includes(wardId)) return;
    set({ loadedWards: [...st.loadedWards, wardId] });
    const repos = createRepositories('supabase');
    const [employees, schedule, leaves, workRecords] = await Promise.all([
      repos.org.listEmployees(wardId),
      repos.roster.getSchedule(wardId, J_YEAR, J_MONTH),
      repos.leave.listLeaveRequests(wardId),
      repos.workRecords.listWorkRecords(wardId, J_YEAR, J_MONTH),
    ]);
    const entries = schedule ? await repos.roster.listEntries(schedule.id) : [];
    const partial: HospitalSnapshot = {
      wards: [], employees, shiftTypes: [], leaveTypes: [], schedule, entries, leaves, workRecords,
    };
    const cur = get();
    set(mergeWardIntoState(cur, partial));
  },
  departments: demoState.departments,
  personnel: demoState.personnel,
  shiftTypes: demoState.shiftTypes,
  entries: demoState.entries,
  requests: [],
  leaves: demoState.leaves,
  swaps: [],
  workRecords: demoState.workRecords,
  attendanceEvents: seedAttendance(demoState.entries),
  credentials: seedDemoCredentials(
    demoState.personnel.filter(p => p.departmentId === 'dep1').map(p => p.id),
    new Date().toISOString().slice(0, 10),
  ),
  departmentId: 'dep1',
  scheduleStatus: demoState.scheduleStatus,
  viewRole: 'ward_manager',
  currentEmployeeId: 'p2',
  leaveBalances: Object.fromEntries(MOCK_PERSONNEL.map(p => [p.id, { entitled: 26, used: 4 }])),
  dutyByEmployee: seedDuty(),

  setDepartment: (id) => { set({ departmentId: id }); void get().loadWard(id); },
  setViewRole: (r) => set({ viewRole: r }),
  setCurrentEmployee: (id) => set({ currentEmployeeId: id }),
  setEntries: (e) => set({ entries: e }),
  setScheduleStatus: (s) => set({ scheduleStatus: s }),
  addLeave: (l) => set((st) => ({ leaves: [...st.leaves, l] })),
  updateLeave: (l) => set((st) => ({ leaves: st.leaves.map(x => (x.id === l.id ? l : x)) })),
  addSwap: (s) => set((st) => ({ swaps: [...st.swaps, s] })),
  updateSwap: (s) => set((st) => ({ swaps: st.swaps.map(x => (x.id === s.id ? s : x)) })),
  setWorkRecords: (w) => set({ workRecords: w }),
  addAttendanceEvent: (e) => set((st) => ({ attendanceEvents: [...st.attendanceEvents, e] })),
  setAttendanceEvents: (e) => set({ attendanceEvents: e }),
  addCredential: (c) => set((st) => ({ credentials: [...st.credentials, c] })),
  adjustBalance: (employeeId, deltaUsed) =>
    set((st) => ({
      leaveBalances: {
        ...st.leaveBalances,
        [employeeId]: {
          entitled: st.leaveBalances[employeeId]?.entitled ?? 26,
          used: (st.leaveBalances[employeeId]?.used ?? 0) + deltaUsed,
        },
      },
    })),
}));
