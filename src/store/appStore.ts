import { create } from 'zustand';
import { MOCK_DEPARTMENTS, MOCK_PERSONNEL, MOCK_SHIFT_TYPES } from '../fixtures/sampleData';
import { DEFAULT_GLOBAL_SETTINGS, DEFAULT_RULES, DEFAULT_AI_SETTINGS } from '../core/defaults';
import { generateScheduleDeterministic } from '../core/scheduling/schedulerSolver';
import { calculateDutyHours } from '../core/duty';
import type { Department, Personnel, ScheduleEntry, ShiftType, StaffRequest } from '../core/types';
import { type LeaveRequest } from '../features/leave/leaveService';
import { type SwapRequest } from '../features/swaps/swapService';
import { type WorkRecord } from '../features/workRecords/workRecordService';

// استور دمو/پایلوت فاز ۱ — داده از نمونهٔ پروژه سید می‌شود و لایهٔ سرویس‌ها
// (features/*) روی همین شکل داده کار می‌کنند؛ اتصال Supabase همین اینترفیس‌ها را پر می‌کند.
export const J_YEAR = 1405;
export const J_MONTH = 7;

export type ViewRole = 'ward_manager' | 'staff';

interface AppState {
  departments: Department[];
  personnel: Personnel[];
  shiftTypes: ShiftType[];
  entries: ScheduleEntry[];
  requests: StaffRequest[];
  leaves: LeaveRequest[];
  swaps: SwapRequest[];
  workRecords: WorkRecord[];
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
}

function seedEntries(): ScheduleEntry[] {
  const dep1 = MOCK_PERSONNEL.filter(p => p.departmentId === 'dep1');
  return generateScheduleDeterministic({
    personnel: dep1,
    shiftTypes: MOCK_SHIFT_TYPES,
    currentSchedule: [],
    requests: [],
    rules: DEFAULT_RULES,
    aiSettings: DEFAULT_AI_SETTINGS,
    globalSettings: DEFAULT_GLOBAL_SETTINGS,
    jYear: J_YEAR,
    jMonth: J_MONTH,
  });
}

function seedDuty(): Map<string, number> {
  return new Map(MOCK_PERSONNEL.map(p => [p.id, calculateDutyHours(p, DEFAULT_GLOBAL_SETTINGS, 0, J_YEAR, J_MONTH)]));
}

export const useAppStore = create<AppState>((set) => ({
  departments: MOCK_DEPARTMENTS,
  personnel: MOCK_PERSONNEL,
  shiftTypes: MOCK_SHIFT_TYPES,
  entries: seedEntries(),
  requests: [],
  leaves: [],
  swaps: [],
  workRecords: [],
  departmentId: 'dep1',
  scheduleStatus: 'draft',
  viewRole: 'ward_manager',
  currentEmployeeId: 'p2',
  leaveBalances: Object.fromEntries(MOCK_PERSONNEL.map(p => [p.id, { entitled: 26, used: 4 }])),
  dutyByEmployee: seedDuty(),

  setDepartment: (id) => set({ departmentId: id }),
  setViewRole: (r) => set({ viewRole: r }),
  setCurrentEmployee: (id) => set({ currentEmployeeId: id }),
  setEntries: (e) => set({ entries: e }),
  setScheduleStatus: (s) => set({ scheduleStatus: s }),
  addLeave: (l) => set((st) => ({ leaves: [...st.leaves, l] })),
  updateLeave: (l) => set((st) => ({ leaves: st.leaves.map(x => (x.id === l.id ? l : x)) })),
  addSwap: (s) => set((st) => ({ swaps: [...st.swaps, s] })),
  updateSwap: (s) => set((st) => ({ swaps: st.swaps.map(x => (x.id === s.id ? s : x)) })),
  setWorkRecords: (w) => set({ workRecords: w }),
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
