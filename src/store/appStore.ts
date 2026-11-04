import { create } from 'zustand';
import { MOCK_PERSONNEL } from '../fixtures/sampleData';
import { DEFAULT_GLOBAL_SETTINGS } from '../core/defaults';
import { calculateDutyHours } from '../core/duty';
import type { Department, Personnel, ScheduleEntry, ShiftType, StaffRequest } from '../core/types';
import { type LeaveRequest } from '../features/leave/leaveService';
import { type SwapRequest } from '../features/swaps/swapService';
import { type WorkRecord } from '../features/workRecords/workRecordService';
import { buildDemoSnapshot } from '../services/data/demoRepositories';
import { createRepositories, currentDataSource, loadHospitalSnapshot } from '../services/data/index';
import {
  employeeToPersonnel, shiftTypeToDomain, entryToDomain, leaveToDomain, workRecordToDomain,
} from '../services/data/mappers';
import type { HospitalSnapshot } from '../services/data/types';

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

interface AppState {
  dataSource: 'demo' | 'supabase';
  hydrated: boolean;
  hydrateFromSupabase: () => Promise<void>;
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

function seedDuty(): Map<string, number> {
  return new Map(MOCK_PERSONNEL.map(p => [p.id, calculateDutyHours(p, DEFAULT_GLOBAL_SETTINGS, 0, J_YEAR, J_MONTH)]));
}

const demoState = snapshotToState(buildDemoSnapshot());

export const useAppStore = create<AppState>((set, get) => ({
  dataSource: currentDataSource(),
  hydrated: currentDataSource() === 'demo',
  hydrateFromSupabase: async () => {
    if (get().hydrated || get().dataSource !== 'supabase') return;
    const hospitalId = import.meta.env.VITE_HOSPITAL_ID as string | undefined;
    const wardId = import.meta.env.VITE_WARD_ID as string | undefined;
    if (!hospitalId || !wardId) { set({ hydrated: true }); return; }
    const snap = await loadHospitalSnapshot(createRepositories('supabase'), {
      hospitalId, wardId, jYear: J_YEAR, jMonth: J_MONTH,
    });
    const mapped = snapshotToState(snap);
    set({
      ...mapped,
      departmentId: wardId,
      currentEmployeeId: mapped.personnel[1]?.id ?? mapped.personnel[0]?.id ?? get().currentEmployeeId,
      hydrated: true,
    });
  },
  departments: demoState.departments,
  personnel: demoState.personnel,
  shiftTypes: demoState.shiftTypes,
  entries: demoState.entries,
  requests: [],
  leaves: demoState.leaves,
  swaps: [],
  workRecords: demoState.workRecords,
  departmentId: 'dep1',
  scheduleStatus: demoState.scheduleStatus,
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
