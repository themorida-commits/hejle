import { create } from 'zustand';
import { MOCK_PERSONNEL } from '../fixtures/sampleData';
import { DEFAULT_GLOBAL_SETTINGS, DEFAULT_AI_SETTINGS } from '../core/defaults';
import { calculateDutyHours } from '../core/duty';
import type { AiGenerationSettings, Department, Personnel, ScheduleEntry, ShiftType, StaffRequest } from '../core/types';
import { type LeaveRequest } from '../features/leave/leaveService';
import { type SwapRequest } from '../features/swaps/swapService';
import { type WorkRecord } from '../features/workRecords/workRecordService';
import { type AttendanceEvent } from '../features/attendance/attendanceService';
import { seedDemoCredentials, type Credential } from '../features/credentials/credentialService';
import type { NursingPackage, NursingServiceRecord } from '../features/nursingServices/nursingService';
import { isoFromJalali } from '../features/leave/leaveService';
import { buildDemoSnapshot } from '../services/data/demoRepositories';
import { createRepositories, currentDataSource, loadHospitalSnapshot, DEMO_HOSPITAL_ID } from '../services/data/index';
import {
  employeeToPersonnel, shiftTypeToDomain, entryToDomain, leaveToDomain, leaveRequestToDb, workRecordToDomain,
  nursingPackageToDomain, nursingRecordToDomain, nursingRecordToDb, personnelToEmployeeRecord,
  patientToDomain, patientToDb, admissionToDomain, admissionToDb, assignmentToDomain, assignmentToDb,
  reportToDomain, reportToDb, handoverToDomain, handoverToDb,
} from '../services/data/mappers';
import type {
  Patient, Admission, PatientAssignment, NursingReport, Handover,
} from '../features/patients/patientService';
import type { AgentRunRecord, HospitalSnapshot, HospitalSettingsRecord, KaranehProfileRecord } from '../services/data/types';
import { askPolicy as runPolicyAnswer, zoneOf, type PolicyAnswer } from '../features/agents/agentCore';
import { POLICY_CORPUS } from '../features/agents/policyCorpus';
import type { GlobalDutySettings } from '../core/types';
import { useSessionStore } from './session';
import {
  normalizeDailyReqs, clampReqValue, type DailyReqs, type DailyReqShift,
} from '../features/roster/rosterModel';
import { getDaysInJalaliMonth } from '../core/jalali';

// استور فاز ۱ — از لایهٔ داده تغذیه می‌شود: حالت دمو از DemoRepositories و
// حالت supabase از loadHospitalSnapshot؛ هر دو از همان مپرها رد می‌شوند.
export const J_YEAR = 1405;
export const J_MONTH = 7;

export type ViewRole = 'ward_manager' | 'matron' | 'hr_admin' | 'staff';

export function snapshotToState(snap: HospitalSnapshot) {
  const personnel = snap.employees.map(employeeToPersonnel);
  const nameOf = (id: string) => {
    const p = personnel.find(x => x.id === id);
    return { name: p?.name ?? id, code: p?.personnelCode ?? '' };
  };
  const annualQuota = snap.leaveTypes.find(t => t.code === 'annual')?.annualQuotaDays ?? 26;
  return {
    departments: snap.wards.map(w => ({ id: w.id, name: w.name, themeColor: '' })),
    personnel,
    shiftTypes: snap.shiftTypes.map(shiftTypeToDomain),
    entries: snap.entries.map(entryToDomain),
    leaves: snap.leaves.map(leaveToDomain),
    workRecords: snap.workRecords.map(w => workRecordToDomain(w, nameOf)),
    scheduleStatus: (snap.schedule?.status ?? 'draft') as 'draft' | 'published',
    scheduleId: snap.schedule?.id ?? null,
    dailyReqs: normalizeDailyReqs(
      snap.schedule?.dailyRequirements, getDaysInJalaliMonth(J_YEAR, J_MONTH), snap.settings.dailyRequirements,
    ),
    nursingPackages: snap.nursingPackages.map(nursingPackageToDomain),
    nursingRecords: snap.nursingRecords.map(nursingRecordToDomain),
    patients: snap.patients.map(patientToDomain),
    admissions: snap.admissions.map(admissionToDomain),
    patientAssignments: snap.patientAssignments.map(assignmentToDomain),
    patientReports: snap.patientReports.map(reportToDomain),
    handovers: snap.handovers.map(handoverToDomain),
    karanehProfiles: snap.karanehProfiles,
    approvalChain: snap.settings.approvalChain,
    chainPresetId: snap.settings.chainPresetId,
    signatures: snap.settings.signatures,
    dailyRequirements: snap.settings.dailyRequirements,
    rosterNote: snap.settings.rosterNote,
    responsibilityWeights: snap.settings.responsibilityWeights,
    globalDutySettings: snap.settings.globalDuty,
    leaveBalances: Object.fromEntries(personnel.map(p => [p.id, { entitled: annualQuota, used: 0 }])),
    dutyByEmployee: new Map(personnel.map(p => [p.id, calculateDutyHours(p, snap.settings.globalDuty, 0, J_YEAR, J_MONTH)])),
  };
}

/** مرج عکس یک بخش در وضعیت فعلی — قلب بارگذاری تنبل (تست‌پذیر و خالص). */
export function mergeWardIntoState(
  cur: {
    personnel: Personnel[]; entries: ScheduleEntry[]; leaves: LeaveRequest[]; workRecords: WorkRecord[];
    nursingRecords: NursingServiceRecord[];
    patients: Patient[]; admissions: Admission[]; patientAssignments: PatientAssignment[];
    patientReports: NursingReport[]; handovers: Handover[];
    dutyByEmployee: Map<string, number>; leaveBalances: Record<string, { entitled: number; used: number }>;
  },
  snap: HospitalSnapshot,
) {
  const mapped = snapshotToState(snap);
  const newIds = new Set(mapped.personnel.map(p => p.id));
  // پروندهٔ بیمار: بیماران سطح بیمارستان‌اند (جایگزینی کامل)؛ بقیه بخش‌محورند —
  // اپیزودهای بخش تازه‌بارگذاری‌شده جای قبلی‌های همان بخش را می‌گیرند.
  const loadedWardId = snap.employees[0]?.wardId ?? mapped.admissions[0]?.wardId ?? null;
  const staleAdmIds = new Set(cur.admissions.filter(a => a.wardId === loadedWardId).map(a => a.id));
  const keptAdmissions = cur.admissions.filter(a => a.wardId !== loadedWardId);
  const keptAssignments = cur.patientAssignments.filter(a => !staleAdmIds.has(a.admissionId));
  const keptReports = cur.patientReports.filter(r => !staleAdmIds.has(r.admissionId));
  const keptHandovers = cur.handovers.filter(h => !staleAdmIds.has(h.admissionId));
  const duty = new Map(cur.dutyByEmployee);
  for (const p of mapped.personnel) {
    if (!duty.has(p.id)) duty.set(p.id, calculateDutyHours(p, snap.settings.globalDuty, 0, J_YEAR, J_MONTH));
  }
  const balances = { ...cur.leaveBalances };
  // سهمیهٔ استحقاقی از خود بیمارستان می‌آید (مثلاً ۳۰ روز مادهٔ ۹۴ قانون ارتش)؛ ۲۶ فقط fallback است
  const annualQuota = snap.leaveTypes.find(t => t.code === 'annual')?.annualQuotaDays ?? 26;
  for (const p of mapped.personnel) balances[p.id] ??= { entitled: annualQuota, used: 0 };
  return {
    personnel: [...cur.personnel.filter(p => !newIds.has(p.id)), ...mapped.personnel],
    entries: [...cur.entries.filter(e => !newIds.has(e.personnelId)), ...mapped.entries],
    leaves: [...cur.leaves.filter(l => !newIds.has(l.employeeId)), ...mapped.leaves],
    workRecords: [...cur.workRecords.filter(w => !newIds.has(w.employeeId)), ...mapped.workRecords],
    nursingRecords: [...cur.nursingRecords.filter(r => !newIds.has(r.employeeId)), ...mapped.nursingRecords],
    patients: mapped.patients,
    admissions: [...keptAdmissions, ...mapped.admissions],
    patientAssignments: [...keptAssignments, ...mapped.patientAssignments],
    patientReports: [...keptReports, ...mapped.patientReports],
    handovers: [...keptHandovers, ...mapped.handovers],
    dutyByEmployee: duty,
    leaveBalances: balances,
    // نیاز روزانه و شناسهٔ برنامه متعلق به بخش تازه‌بارگذاری‌شده است، نه بخش قبلی.
    scheduleId: mapped.scheduleId,
    dailyReqs: mapped.dailyReqs,
    scheduleStatus: mapped.scheduleStatus,
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
  nursingRecords: NursingServiceRecord[];
  nursingPackages: NursingPackage[];
  addNursingRecord: (r: NursingServiceRecord) => void;
  confirmNursingRecord: (id: string, by: string) => void;
  /** پروندهٔ بیمار — لایهٔ پاسخگویی اپیزود (دور ۱۶). */
  patients: Patient[];
  admissions: Admission[];
  patientAssignments: PatientAssignment[];
  patientReports: NursingReport[];
  handovers: Handover[];
  admitPatient: (p: Patient, a: Admission) => void;
  addPatientAssignment: (a: PatientAssignment) => void;
  addPatientReport: (r: NursingReport) => void;
  signPatientReport: (id: string) => void;
  addHandover: (h: Handover) => void;
  acceptHandover: (id: string) => void;
  dischargeAdmission: (id: string, status: Admission['status'], note?: string) => void;
  /** لایهٔ ایجنت فاز ۱ (دور ۱۷) — ردّ اجراها؛ بخشی از snapshot بیمارستان نیست. */
  agentRuns: AgentRunRecord[];
  recordAgentRun: (agentKey: string, input: Record<string, unknown>, output: Record<string, unknown> | null, citations: AgentRunRecord['citations']) => void;
  askPolicy: (question: string) => PolicyAnswer;
  addPersonnelBulk: (list: Personnel[]) => void;
  importEntries: (list: ScheduleEntry[]) => void;
  karanehProfiles: KaranehProfileRecord[];
  /** زنجیرهٔ تأیید مرخصی این بیمارستان (از تنظیمات بیمارستان). */
  approvalChain: string[];
  /** تنظیمات موظفی این بیمارستان شامل جدول کاهش ساعت (از تنظیمات بیمارستان). */
  globalDutySettings: GlobalDutySettings;
  /** پیش‌فرض بخشی زنجیره (government/private/army) یا null برای زنجیرهٔ سفارشی. */
  chainPresetId: 'government' | 'private' | 'army' | null;
  /** نام‌های امضای فرم چاپی + نیاز روزانهٔ بخش + توضیحات ماه (از تنظیمات بیمارستان). */
  signatures: { matronName: string; chiefName: string };
  dailyRequirements: { morning: number; evening: number; night: number };
  /** نیاز روزانهٔ همین ماه به تفکیک روز — ورودی مستقیم سرپرستار در جدول برنامه. */
  dailyReqs: DailyReqs;
  /** تنظیمات پیشرفتهٔ تولید برنامه (پنل نسخهٔ قدیمی — دور ۱۵)؛ فعلاً نشست‌محور است. */
  aiSettings: AiGenerationSettings;
  setAiSettings: (s: AiGenerationSettings) => void;
  scheduleId: string | null;
  setDailyReq: (shift: DailyReqShift, dayIndex: number, value: number) => void;
  setDailyReqRow: (shift: DailyReqShift, value: number) => void;
  rosterNote: string;
  responsibilityWeights: Record<string, number>;
  saveHospitalSettings: (s: HospitalSettingsRecord) => Promise<boolean>;
  saveKaranehProfile: (rec: KaranehProfileRecord) => Promise<boolean>;
  setDefaultKaranehProfile: (id: string) => Promise<void>;
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
    // ردّ اجراهای ایجنت سطح بیمارستان است؛ اگر مایگریشن ۰۰۱۴ هنوز اعمال نشده
    // باشد خواندنش خطا می‌دهد و بی‌سروصدا خالی می‌ماند.
    try {
      const runs = await createRepositories('supabase').agents.listRuns(hospitalId);
      set({ agentRuns: runs });
    } catch (err) { console.error('agent runs load failed', err); }
  },
  loadWard: async (wardId) => {
    const st = get();
    if (st.dataSource !== 'supabase' || st.loadedWards.includes(wardId)) return;
    set({ loadedWards: [...st.loadedWards, wardId] });
    const repos = createRepositories('supabase');
    const hospitalId = useSessionStore.getState().hospitalId ?? undefined;
    const [employees, schedule, leaves, workRecords, nursingRecords, nursingPackages, patients, admissions, patientAssignments, patientReports, handovers] = await Promise.all([
      repos.org.listEmployees(wardId),
      repos.roster.getSchedule(wardId, J_YEAR, J_MONTH),
      repos.leave.listLeaveRequests(wardId),
      repos.workRecords.listWorkRecords(wardId, J_YEAR, J_MONTH),
      repos.nursing.listRecords(wardId),
      hospitalId ? repos.nursing.listPackages(hospitalId) : Promise.resolve([]),
      hospitalId ? repos.patients.listPatients(hospitalId) : Promise.resolve([]),
      repos.patients.listAdmissions(wardId),
      repos.patients.listAssignments(wardId),
      repos.patients.listReports(wardId),
      repos.patients.listHandovers(wardId),
    ]);
    const entries = schedule ? await repos.roster.listEntries(schedule.id) : [];
    const partial: HospitalSnapshot = {
      wards: [], employees, shiftTypes: [], leaveTypes: [], schedule, entries, leaves, workRecords,
      nursingPackages, nursingRecords, karanehProfiles: [],
      patients, admissions, patientAssignments, patientReports, handovers,
      settings: {
        approvalChain: st.approvalChain, chainPresetId: st.chainPresetId,
        signatures: st.signatures, dailyRequirements: st.dailyRequirements, rosterNote: st.rosterNote,
        responsibilityWeights: st.responsibilityWeights,
        globalDuty: st.globalDutySettings,
      },
    };
    const cur = get();
    const merged = mergeWardIntoState(cur, partial);
    set({
      ...merged,
      ...(nursingPackages.length ? { nursingPackages: nursingPackages.map(nursingPackageToDomain) } : {}),
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
  patients: demoState.patients,
  admissions: demoState.admissions,
  patientAssignments: demoState.patientAssignments,
  patientReports: demoState.patientReports,
  handovers: demoState.handovers,
  agentRuns: [],
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
  importEntries: (list) =>
    set((st) => {
      const keys = new Set(list.map(e => `${e.personnelId}|${e.date}`));
      return { entries: [...st.entries.filter(e => !keys.has(`${e.personnelId}|${e.date}`)), ...list] };
    }),
  setScheduleStatus: (s) => set({ scheduleStatus: s }),
  addLeave: (l) => {
    set((st) => ({ leaves: [...st.leaves, l] }));
    // در حالت سوپابیس روی دیتابیس هم نوشته می‌شود تا درخواست با رفرش گم نشود
    if (get().dataSource === 'supabase') {
      const session = useSessionStore.getState();
      const wardId = get().personnel.find(p => p.id === l.employeeId)?.departmentId;
      if (session.hospitalId && wardId) {
        createRepositories('supabase').leave.createLeaveRequest(leaveRequestToDb(l, session.hospitalId, wardId))
          .then(created => set((st) => ({ leaves: st.leaves.map(x => x.id === l.id ? leaveToDomain(created) : x) })))
          .catch(err => console.error('leave create persist failed', err));
      }
    }
  },
  updateLeave: (l) => {
    set((st) => ({ leaves: st.leaves.map(x => (x.id === l.id ? l : x)) }));
    if (get().dataSource === 'supabase') {
      createRepositories('supabase').leave.updateApproval(l.id, {
        status: l.status, approvalStep: l.approvalStep ?? 0, approvals: l.approvals ?? [],
      }).catch(err => console.error('leave approval persist failed', err));
    }
  },
  addSwap: (s) => set((st) => ({ swaps: [...st.swaps, s] })),
  updateSwap: (s) => set((st) => ({ swaps: st.swaps.map(x => (x.id === s.id ? s : x)) })),
  setWorkRecords: (w) => set({ workRecords: w }),
  addAttendanceEvent: (e) => set((st) => ({ attendanceEvents: [...st.attendanceEvents, e] })),
  setAttendanceEvents: (e) => set({ attendanceEvents: e }),
  addCredential: (c) => set((st) => ({ credentials: [...st.credentials, c] })),
  nursingRecords: demoState.nursingRecords,
  nursingPackages: demoState.nursingPackages,
  karanehProfiles: demoState.karanehProfiles,
  approvalChain: demoState.approvalChain,
  chainPresetId: null,
  signatures: { matronName: '', chiefName: '' },
  dailyRequirements: { morning: 0, evening: 0, night: 0 },
  dailyReqs: demoState.dailyReqs,
  aiSettings: DEFAULT_AI_SETTINGS,
  setAiSettings: (s) => set({ aiSettings: s }),
  scheduleId: demoState.scheduleId,
  setDailyReq: (shift, dayIndex, value) => {
    set((st) => {
      const arr = [...st.dailyReqs[shift]];
      arr[dayIndex] = clampReqValue(value);
      return { dailyReqs: { ...st.dailyReqs, [shift]: arr } };
    });
    const st = get();
    if (st.dataSource === 'supabase' && st.scheduleId) {
      createRepositories('supabase').roster.setDailyRequirements(st.scheduleId, st.dailyReqs)
        .catch(err => console.error('daily requirements persist failed', err));
    }
  },
  setDailyReqRow: (shift, value) => {
    set((st) => ({
      dailyReqs: { ...st.dailyReqs, [shift]: st.dailyReqs[shift].map(() => clampReqValue(value)) },
    }));
    const st = get();
    if (st.dataSource === 'supabase' && st.scheduleId) {
      createRepositories('supabase').roster.setDailyRequirements(st.scheduleId, st.dailyReqs)
        .catch(err => console.error('daily requirements persist failed', err));
    }
  },
  rosterNote: '',
  responsibilityWeights: {},
  globalDutySettings: demoState.globalDutySettings,
  saveHospitalSettings: async (s) => {
    try {
      if (get().dataSource === 'supabase') {
        const hospitalId = useSessionStore.getState().hospitalId;
        if (!hospitalId) return false;
        await createRepositories('supabase').settings.saveSettings(hospitalId, s);
      } else {
        await createRepositories('demo').settings.saveSettings('demo', s);
      }
      set({
        approvalChain: s.approvalChain, chainPresetId: s.chainPresetId,
        signatures: s.signatures, dailyRequirements: s.dailyRequirements, rosterNote: s.rosterNote,
        responsibilityWeights: s.responsibilityWeights,
        globalDutySettings: s.globalDuty,
      });
      return true;
    } catch (err) {
      console.error('hospital settings save failed', err);
      return false;
    }
  },
  saveKaranehProfile: async (rec) => {
    try {
      const saved = await createRepositories(get().dataSource).profiles.saveProfile(rec);
      set((st) => {
        const others = st.karanehProfiles.filter(p => p.id !== saved.id);
        const normalized = saved.isDefault
          ? others.map(p => (p.hospitalId === saved.hospitalId ? { ...p, isDefault: false } : p))
          : others;
        return { karanehProfiles: [...normalized, saved] };
      });
      return true;
    } catch (err) {
      console.error('karaneh profile save failed', err);
      return false;
    }
  },
  setDefaultKaranehProfile: async (id) => {
    const hospitalId = get().karanehProfiles.find(p => p.id === id)?.hospitalId;
    if (!hospitalId) return;
    try {
      await createRepositories(get().dataSource).profiles.setDefaultProfile(hospitalId, id);
      set((st) => ({
        karanehProfiles: st.karanehProfiles.map(p =>
          p.hospitalId === hospitalId ? { ...p, isDefault: p.id === id } : p),
      }));
    } catch (err) {
      console.error('karaneh profile set-default failed', err);
    }
  },
  addNursingRecord: (r) => {
    set((st) => ({ nursingRecords: [...st.nursingRecords, r] }));
    // ماندگاری سمت سرور در حالت supabase — خطا فقط لاگ می‌شود؛ وضعیت UI منبع حقیقت نمایشی است.
    if (get().dataSource === 'supabase') {
      const hospitalId = useSessionStore.getState().hospitalId;
      if (hospitalId) {
        void createRepositories('supabase').nursing.createRecord(nursingRecordToDb(r, hospitalId))
          .then(saved => {
            const domain = nursingRecordToDomain(saved);
            set((st) => ({ nursingRecords: st.nursingRecords.map(x => (x.id === r.id ? domain : x)) }));
          })
          .catch(err => console.error('nursing record persist failed', err));
      }
    }
  },
  confirmNursingRecord: (id, by) => {
    set((st) => ({
      nursingRecords: st.nursingRecords.map(r =>
        r.id === id ? { ...r, status: 'confirmed' as const, confirmedBy: by, confirmedAtISO: new Date().toISOString() } : r,
      ),
    }));
    if (get().dataSource === 'supabase') {
      void createRepositories('supabase').nursing.confirmRecord(id, by)
        .catch(err => console.error('nursing confirm persist failed', err));
    }
  },
  admitPatient: (p, a) => {
    set((st) => ({ patients: [...st.patients, p], admissions: [...st.admissions, a] }));
    if (get().dataSource === 'supabase') {
      const hospitalId = useSessionStore.getState().hospitalId;
      if (hospitalId) {
        const repos = createRepositories('supabase');
        void repos.patients.createPatient(patientToDb(p, hospitalId))
          .then(savedP => {
            const domainP = patientToDomain(savedP);
            set((st) => ({
              patients: st.patients.map(x => (x.id === p.id ? domainP : x)),
              admissions: st.admissions.map(x => (x.id === a.id ? { ...x, patientId: domainP.id } : x)),
            }));
            return repos.patients.createAdmission(admissionToDb({ ...a, patientId: domainP.id }, hospitalId, get().currentEmployeeId ?? null));
          })
          .then(savedA => {
            const domainA = admissionToDomain(savedA);
            set((st) => ({ admissions: st.admissions.map(x => (x.id === a.id ? domainA : x)) }));
          })
          .catch(err => console.error('admission persist failed', err));
      }
    }
  },
  addPatientAssignment: (a) => {
    set((st) => ({ patientAssignments: [...st.patientAssignments, a] }));
    if (get().dataSource === 'supabase') {
      const hospitalId = useSessionStore.getState().hospitalId;
      const adm = get().admissions.find(x => x.id === a.admissionId);
      if (hospitalId && adm) {
        void createRepositories('supabase').patients.createAssignment(assignmentToDb(a, hospitalId, adm.wardId))
          .then(saved => {
            const domain = assignmentToDomain(saved);
            set((st) => ({ patientAssignments: st.patientAssignments.map(x => (x.id === a.id ? domain : x)) }));
          })
          .catch(err => console.error('assignment persist failed', err));
      }
    }
  },
  addPatientReport: (r) => {
    set((st) => ({ patientReports: [...st.patientReports, r] }));
    if (get().dataSource === 'supabase') {
      const hospitalId = useSessionStore.getState().hospitalId;
      const adm = get().admissions.find(x => x.id === r.admissionId);
      if (hospitalId && adm) {
        void createRepositories('supabase').patients.createReport(reportToDb(r, hospitalId, adm.wardId))
          .then(saved => {
            const domain = reportToDomain(saved);
            set((st) => ({ patientReports: st.patientReports.map(x => (x.id === r.id ? domain : x)) }));
          })
          .catch(err => console.error('patient report persist failed', err));
      }
    }
  },
  signPatientReport: (id) => {
    const signedAtISO = new Date().toISOString();
    set((st) => ({
      patientReports: st.patientReports.map(r =>
        r.id === id ? { ...r, status: 'signed' as const, signedAtISO } : r),
    }));
    if (get().dataSource === 'supabase') {
      void createRepositories('supabase').patients.updateReport(id, { status: 'signed', signedAt: signedAtISO })
        .catch(err => console.error('patient report sign persist failed', err));
    }
  },
  addHandover: (h) => {
    set((st) => ({ handovers: [...st.handovers, h] }));
    if (get().dataSource === 'supabase') {
      const hospitalId = useSessionStore.getState().hospitalId;
      const adm = get().admissions.find(x => x.id === h.admissionId);
      if (hospitalId && adm) {
        void createRepositories('supabase').patients.createHandover(handoverToDb(h, hospitalId, adm.wardId))
          .then(saved => {
            const domain = handoverToDomain(saved);
            set((st) => ({ handovers: st.handovers.map(x => (x.id === h.id ? domain : x)) }));
          })
          .catch(err => console.error('handover persist failed', err));
      }
    }
  },
  acceptHandover: (id) => {
    const acceptedAtISO = new Date().toISOString();
    set((st) => ({
      handovers: st.handovers.map(h => (h.id === id ? { ...h, acceptedAtISO } : h)),
    }));
    if (get().dataSource === 'supabase') {
      void createRepositories('supabase').patients.acceptHandover(id)
        .catch(err => console.error('handover accept persist failed', err));
    }
  },
  dischargeAdmission: (id, status, note) => {
    const atISO = new Date().toISOString();
    set((st) => ({
      admissions: st.admissions.map(a =>
        a.id === id ? { ...a, status, dischargedAtISO: atISO, ...(note ? { dischargeNote: note } : {}) } : a),
    }));
    if (get().dataSource === 'supabase') {
      void createRepositories('supabase').patients.dischargeAdmission(id, status, note ?? null, atISO)
        .catch(err => console.error('discharge persist failed', err));
    }
  },
  recordAgentRun: (agentKey, input, output, citations) => {
    const st = get();
    const hospitalId = st.dataSource === 'supabase'
      ? useSessionStore.getState().hospitalId
      : DEMO_HOSPITAL_ID;
    if (!hospitalId) return;
    const optimistic: AgentRunRecord = {
      id: `run-${Date.now()}`, hospitalId, agentKey, zone: zoneOf(agentKey) ?? 'A',
      input, output, citations, model: null, status: 'done', createdBy: null,
      createdAt: new Date().toISOString(),
    };
    set((s) => ({ agentRuns: [optimistic, ...s.agentRuns].slice(0, 100) }));
    void createRepositories(st.dataSource).agents.createRun({
      hospitalId, agentKey, zone: optimistic.zone, input, output, citations,
      model: null, status: 'done', createdBy: null,
    })
      .then(saved => set((s) => ({ agentRuns: s.agentRuns.map(r => (r.id === optimistic.id ? saved : r)) })))
      .catch(err => console.error('agent run persist failed', err));
  },
  askPolicy: (question) => {
    const ans = runPolicyAnswer(POLICY_CORPUS, question);
    get().recordAgentRun(
      'policy_lookup',
      { question },
      ans.kind === 'answer'
        ? { answerKind: 'answer', entryId: ans.entry.id, score: ans.score }
        : { answerKind: 'none' },
      ans.kind === 'answer' ? [{ title: ans.entry.title, source: ans.entry.citation }] : [],
    );
    return ans;
  },
  addPersonnelBulk: (list) => {
    set((st) => {
      const codes = new Set(st.personnel.map(p => p.personnelCode));
      const ids = new Set(st.personnel.map(p => p.id));
      const fresh = list.filter(p => !codes.has(p.personnelCode) && !ids.has(p.id));
      return { personnel: [...st.personnel, ...fresh] };
    });
    if (get().dataSource === 'supabase' && list.length > 0) {
      const hospitalId = useSessionStore.getState().hospitalId;
      if (hospitalId) {
        void createRepositories('supabase').org.createEmployees(list.map(p => personnelToEmployeeRecord(p, hospitalId)))
          .catch(err => console.error('personnel import persist failed', err));
      }
    }
  },
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
