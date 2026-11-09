// ریپازیتوری دمو — همان اینترفیس‌های Supabase، روی دادهٔ درون‌حافظه‌ای سیدشده
// از نمونهٔ پروژه. برای پایلوت و تست؛ رفتار قراردادی‌اش با نسخهٔ واقعی یکی است.
import { MOCK_DEPARTMENTS, MOCK_PERSONNEL, MOCK_SHIFT_TYPES } from '../../fixtures/sampleData';
import { DEFAULT_RULES, DEFAULT_AI_SETTINGS, DEFAULT_GLOBAL_SETTINGS } from '../../core/defaults';
import { generateScheduleDeterministic } from '../../core/scheduling/schedulerSolver';
import { LEAVE_TYPES } from '../../features/leave/leaveService';
import { isoFromJalali } from '../../features/leave/leaveService';
import { getDaysInJalaliMonth } from '../../core/jalali';
import { defaultHospitalSettings } from './settings';
import type {
  AdmissionRecord, DataRepositories, EntryRecord, HospitalSnapshot, HandoverRecord,
  KaranehProfileRecord, LeaveRecord, NursingServiceDbRecord, PatientAssignmentRecord,
  PatientRecord, PatientReportRecord, ScheduleRecord, WorkRecordRecord,
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
    ...buildDemoPatientData(entries),
    karanehProfiles: [{
      id: 'demo-kp-moh', hospitalId: DEMO_HOSPITAL_ID, name: 'پروفایل وزارت بهداشت ۱۴۰۴',
      presetId: 'moh', nursingShare: 0.85, onCallCoef: 4, kRial: 201_000,
      isDefault: true, updatedAt: new Date().toISOString(),
    }],
    settings: defaultHospitalSettings(),
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
      async listEmployeesByHospital(hospitalId) { return state.employees.filter(e => e.hospitalId === hospitalId && e.isActive); },
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
    patients: {
      async listPatients(hospitalId) { return structuredClone(state.patients.filter(p => p.hospitalId === hospitalId)); },
      async listAdmissions(wardId) { return structuredClone(state.admissions.filter(a => a.wardId === wardId)); },
      async listAssignments(wardId) { return structuredClone(state.patientAssignments.filter(a => a.wardId === wardId)); },
      async listReports(wardId) { return structuredClone(state.patientReports.filter(r => r.wardId === wardId)); },
      async listHandovers(wardId) { return structuredClone(state.handovers.filter(h => h.wardId === wardId)); },
      async createPatient(rec) {
        const created: PatientRecord = { ...rec, id: `demo-pat-${++seq}` };
        state.patients.push(created);
        return structuredClone(created);
      },
      async createAdmission(rec) {
        const created: AdmissionRecord = { ...rec, id: `demo-adm-${++seq}` };
        state.admissions.push(created);
        return structuredClone(created);
      },
      async createAssignment(rec) {
        const created: PatientAssignmentRecord = { ...rec, id: `demo-asg-${++seq}` };
        state.patientAssignments.push(created);
        return structuredClone(created);
      },
      async createReport(rec) {
        const created: PatientReportRecord = { ...rec, id: `demo-rep-${++seq}` };
        state.patientReports.push(created);
        return structuredClone(created);
      },
      async updateReport(id, patch) {
        const r = state.patientReports.find(x => x.id === id);
        if (r) Object.assign(r, patch);
      },
      async createHandover(rec) {
        const created: HandoverRecord = { ...rec, id: `demo-hov-${++seq}` };
        state.handovers.push(created);
        return structuredClone(created);
      },
      async acceptHandover(id) {
        const h = state.handovers.find(x => x.id === id);
        if (h) h.acceptedAt = new Date().toISOString();
      },
      async dischargeAdmission(id, status, note, atISO) {
        const a = state.admissions.find(x => x.id === id);
        if (a) { a.status = status; a.dischargeNote = note; a.dischargedAt = atISO; }
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
      async setDailyRequirements(scheduleId, reqs) {
        if (state.schedule?.id === scheduleId) state.schedule.dailyRequirements = reqs;
      },
    },
    leave: {
      async listLeaveRequests(wardId) { return state.leaves.filter(l => l.wardId === wardId); },
      async listLeaveRequestsByHospital(hospitalId) { return state.leaves.filter(l => l.hospitalId === hospitalId); },
      async createLeaveRequest(rec) {
        const created: LeaveRecord = { ...rec, id: `demo-leave-${++seq}`, status: 'pending', reviewedBy: null, approvalStep: 0, approvals: [] };
        state.leaves.push(created);
        return created;
      },
      async updateLeaveStatus(id, status, reviewedBy) {
        const l = state.leaves.find(x => x.id === id);
        if (l) { l.status = status; l.reviewedBy = reviewedBy; }
      },
      async updateApproval(id, patch) {
        const l = state.leaves.find(x => x.id === id);
        if (l) { l.status = patch.status; l.approvalStep = patch.approvalStep; l.approvals = patch.approvals; }
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
    profiles: {
      async listProfiles(hospitalId) {
        return state.karanehProfiles.filter(p => p.hospitalId === hospitalId);
      },
      async saveProfile(rec) {
        const saved: KaranehProfileRecord = { ...rec, updatedAt: new Date().toISOString() };
        const i = state.karanehProfiles.findIndex(p => p.id === rec.id);
        if (saved.isDefault) for (const p of state.karanehProfiles) if (p.hospitalId === rec.hospitalId) p.isDefault = false;
        if (i >= 0) state.karanehProfiles[i] = saved; else state.karanehProfiles.push(saved);
        return structuredClone(saved);
      },
      async setDefaultProfile(hospitalId, id) {
        for (const p of state.karanehProfiles) if (p.hospitalId === hospitalId) p.isDefault = p.id === id;
      },
    },
    settings: {
      async getSettings() { return structuredClone(state.settings); },
      async saveSettings(_hospitalId, settings) { state.settings = structuredClone(settings); },
    },
  };
}

/** دادهٔ دمو پروندهٔ بیمار: سه اپیزود روی بخش داخلی؛ تخصیص‌ها از خودِ روس‌تر حل‌شدهٔ همان روزها ساخته می‌شوند تا «پرستار مسئول هر شیفت» واقعی باشد، نه ساختگی. */
function buildDemoPatientData(entries: EntryRecord[]): Pick<HospitalSnapshot, 'patients' | 'admissions' | 'patientAssignments' | 'patientReports' | 'handovers'> {
  const d = (day: number) => isoFromJalali(1405, 7, day);
  const patients: PatientRecord[] = [
    { id: 'demo-pat-1', hospitalId: DEMO_HOSPITAL_ID, fullName: 'فاطمه احمدی', nationalCode: '0012345678', fileNo: 'P-1001', birthDate: '1980-05-12', gender: 'female' },
    { id: 'demo-pat-2', hospitalId: DEMO_HOSPITAL_ID, fullName: 'علی محمدی', nationalCode: '0023456789', fileNo: 'P-1002', birthDate: '1965-11-03', gender: 'male' },
    { id: 'demo-pat-3', hospitalId: DEMO_HOSPITAL_ID, fullName: 'مریم حسینی', nationalCode: null, fileNo: 'P-1003', birthDate: '1992-02-20', gender: 'female' },
  ];
  const admissions: AdmissionRecord[] = [
    {
      id: 'demo-adm-1', hospitalId: DEMO_HOSPITAL_ID, wardId: 'dep1', patientId: 'demo-pat-1',
      admittedAt: `${d(11)}T03:40:00.000Z`, admissionType: 'emergency', admissionSource: 'اورژانس — آمبولانس ۱۱۵',
      chiefComplaint: 'درد قفسهٔ سینه و تنگی نفس از دو ساعت قبل', admissionReason: 'درد قفسهٔ سینهٔ مشکوک به ACS — مانیتورینگ و بررسی آنزیم‌های قلبی',
      diagnosisText: 'سندروم کرونری حاد (تحت بررسی)', diagnosisIcd10: null,
      attendingName: 'دکتر رضا کریمی', attendingCouncilNo: '۱۲۳۴۵', attendingService: 'قلب و عروق',
      bedLabel: 'تخت ۳', insuranceType: 'تأمین اجتماعی', insuranceNo: '۰۰۱۲۳۴۵۶۷۸', allergySummary: 'پنی‌سیلین',
      status: 'admitted', dischargedAt: null, dischargeNote: null, createdBy: null,
    },
    {
      id: 'demo-adm-2', hospitalId: DEMO_HOSPITAL_ID, wardId: 'dep1', patientId: 'demo-pat-2',
      admittedAt: `${d(12)}T06:15:00.000Z`, admissionType: 'elective', admissionSource: 'پذیرش مرکزی',
      chiefComplaint: 'درد و محدودیت حرکت زانوی راست', admissionReason: 'بستری پیش از عمل تعویض مفصل زانو — آماده‌سازی و آزمایش‌های قبل از عمل',
      diagnosisText: 'استئوآرتریت پیشرفتهٔ زانوی راست', diagnosisIcd10: 'M17.1',
      attendingName: 'دکتر سارا نادری', attendingCouncilNo: '۲۳۴۵۶', attendingService: 'ارتوپدی',
      bedLabel: 'تخت ۵', insuranceType: 'نیروهای مسلح', insuranceNo: '۰۰۲۳۴۵۶۷۸۹', allergySummary: null,
      status: 'admitted', dischargedAt: null, dischargeNote: null, createdBy: null,
    },
    {
      id: 'demo-adm-3', hospitalId: DEMO_HOSPITAL_ID, wardId: 'dep1', patientId: 'demo-pat-3',
      admittedAt: `${d(9)}T08:00:00.000Z`, admissionType: 'emergency', admissionSource: 'اورژانس — مراجعهٔ شخصی',
      chiefComplaint: 'تب و سرفهٔ خلط‌دار', admissionReason: 'پنومونی لوب تحتانی راست — درمان آنتی‌بیوتیکی وریدی',
      diagnosisText: 'پنومونی باکتریال', diagnosisIcd10: 'J18.9',
      attendingName: 'دکتر رضا کریمی', attendingCouncilNo: '۱۲۳۴۵', attendingService: 'داخلی',
      bedLabel: 'تخت ۷', insuranceType: 'خدمات درمانی', insuranceNo: null, allergySummary: null,
      status: 'discharged', dischargedAt: `${d(12)}T07:30:00.000Z`, dischargeNote: 'با حال عمومی خوب و نسخهٔ خوراکی ترخیص شد.', createdBy: null,
    },
  ];
  const catMap: Record<string, PatientAssignmentRecord['shift']> = { 's-m': 'morning', 's-e': 'evening', 's-n': 'night', 's-en': 'night' };
  const headNurseIds = new Set(MOCK_PERSONNEL.filter(p => (p.role ?? '').includes('سرپرستار')).map(p => p.id));
  const assignments: PatientAssignmentRecord[] = [];
  let aseq = 0;
  const pickFor = (day: number, shift: PatientAssignmentRecord['shift'], skip: Set<string>): string | null => {
    const cands = entries.filter(e => e.wardId === 'dep1' && e.entryDate === d(day) && catMap[e.shiftTypeId] === shift);
    const pref = cands.find(e => !headNurseIds.has(e.employeeId) && !skip.has(e.employeeId))
      ?? cands.find(e => !skip.has(e.employeeId));
    return pref?.employeeId ?? null;
  };
  const nurseBySlot = new Map<string, string>();
  for (const [admId, fromDay] of [['demo-adm-1', 11], ['demo-adm-2', 12]] as const) {
    for (let day = fromDay; day <= 13; day++) {
      for (const shift of ['morning', 'evening', 'night'] as const) {
        const used = new Set(nurseBySlot.values());
        const nurse = pickFor(day, shift, admId === 'demo-adm-2' ? used : new Set());
        if (!nurse) continue;
        aseq++;
        assignments.push({
          id: `demo-asg-${aseq}`, hospitalId: DEMO_HOSPITAL_ID, wardId: 'dep1', admissionId: admId,
          employeeId: nurse, role: 'responsible', shift, serviceDate: d(day), assignedBy: null, source: 'roster',
        });
        if (admId === 'demo-adm-1') nurseBySlot.set(`${day}-${shift}`, nurse);
      }
    }
  }
  const morningNurse12 = nurseBySlot.get('12-morning');
  const eveningNurse12 = nurseBySlot.get('12-evening');
  const morningAsg12 = assignments.find(a => a.admissionId === 'demo-adm-1' && a.serviceDate === d(12) && a.shift === 'morning');
  const eveningAsg12 = assignments.find(a => a.admissionId === 'demo-adm-1' && a.serviceDate === d(12) && a.shift === 'evening');
  const patientReports: PatientReportRecord[] = morningNurse12 && morningAsg12 ? [{
    id: 'demo-rep-1', hospitalId: DEMO_HOSPITAL_ID, wardId: 'dep1', admissionId: 'demo-adm-1',
    assignmentId: morningAsg12.id, authorEmployeeId: morningNurse12, shift: 'morning', reportDate: d(12),
    body: {
      assessment: 'هوشیار و آگاه؛ درد قفسهٔ سینه از ۷/۱۰ صبح به ۲/۱۰ کاهش یافته؛ صداهای قلبی منظم.',
      diagnoses: 'درد حاد مرتبط با ایسکمی میوکارد؛ اضطراب مرتبط با بستری',
      actions: 'مانیتورینگ قلبی مداوم، ECG ساعت ۸، نمونهٔ تروپونین دوم ارسال شد، اکسیژن ۲ لیتر با کانولا.',
      response: 'درد کنترل شد؛ بیمار همکاری مناسب دارد؛ تروپونین دوم در انتظار جواب.',
      vitals: 'BP 125/80، HR 78، RR 16، SpO₂ 97٪، T 36.8، درد 2/10',
      braden: 20, morse: 25,
      followups: 'پیگیری جواب تروپونین دوم و اطلاع به پزشک معالج؛ ECG کنترلی ساعت ۱۶.',
      incidents: '',
    },
    status: 'signed', signedAt: `${d(12)}T10:35:00.000Z`,
  }] : [];
  const handovers: HandoverRecord[] = morningNurse12 && eveningNurse12 && morningAsg12 && eveningAsg12 ? [{
    id: 'demo-hov-1', hospitalId: DEMO_HOSPITAL_ID, wardId: 'dep1', admissionId: 'demo-adm-1',
    fromAssignmentId: morningAsg12.id, toAssignmentId: eveningAsg12.id,
    giverEmployeeId: morningNurse12, receiverEmployeeId: eveningNurse12,
    handoverAt: `${d(12)}T10:45:00.000Z`,
    sbar: {
      situation: 'خانم احمدی، تخت ۳، روز دوم بستری با شک به ACS؛ اکنون بدون درد.',
      background: 'ورود از اورژانس با درد قفسهٔ سینه؛ تروپونین اول مرزی؛ حساسیت به پنی‌سیلین.',
      assessment: 'پایدار؛ مانیتورینگ بدون آریتمی؛ در انتظار تروپونین دوم.',
      recommendation: 'جواب تروپونین را پیگیری و بلافاصله به دکتر کریمی اطلاع بده؛ ECG ساعت ۱۶ فراموش نشود.',
    },
    stateSummary: 'هوشیار، SpO₂ 97٪ هوای اتاق، درد 2/10.',
    acceptedAt: `${d(12)}T10:50:00.000Z`,
  }] : [];
  return { patients, admissions, patientAssignments: assignments, patientReports, handovers };
}
