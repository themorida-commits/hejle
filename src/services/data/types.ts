// ─────────────────────────────────────────────────────────────────────────────
// لایهٔ داده (اتصال Supabase) — رکوردها آیینهٔ اسکیمای v2 هستند و ریپازیتوری‌ها
// تنها جایی‌اند که با دیتابیس حرف می‌زنند. صفحات و سرویس‌های features روی
// همین اینترفیس‌ها سوارند؛ منبع داده (demo | supabase) از env انتخاب می‌شود.
// ─────────────────────────────────────────────────────────────────────────────

import type { GlobalDutySettings } from '../../core/types';

/** یک اقدام در زنجیرهٔ تأیید مرخصی (مایگریشن ۰۰۰۹). */
export interface LeaveApprovalEntry {
  step: number;
  role: string;
  by: string;
  decision: 'approved' | 'rejected';
  at: string;
}

/** تنظیمات سطح بیمارستان از hospitals.settings (نرمال‌شده در settings.ts). */
export interface HospitalSettingsRecord {
  /** ترتیب نقش‌های تأییدکنندهٔ مرخصی؛ پیش‌فرض فقط سرپرستار. */
  approvalChain: string[];
  /** پیش‌فرض بخشی‌ای که زنجیره از آن شروع شده (government/private/army)؛ null یعنی سفارشی.
   *  لازم است چون زنجیرهٔ دولتی و ارتش نقش‌های یکسان دارند و از روی خود زنجیره قابل تشخیص نیستند. */
  chainPresetId: 'government' | 'private' | 'army' | null;
  /** نام‌های امضای فرم چاپی چینش شیفت (مدیر خدمات پرستاری و رییس بیمارستان؛ امضای سوم از سرپرستار همان بخش می‌آید). */
  signatures: { matronName: string; chiefName: string };
  /** نیاز ایستادهٔ روزانهٔ بخش برای هر دسته شیفت — ردیف‌های «تعداد صبح/عصر/شب» بالای فرم چاپی؛ صفر یعنی خالی. */
  dailyRequirements: { morning: number; evening: number; night: number };
  /** متن آزاد «توضیحات» ماه روی فرم چاپی (اطلاعیه‌ها و یادداشت‌های همان ماه). */
  rosterNote: string;
  /** وزن‌های مسئولیتی کارانهٔ همین بیمارستان (کلید = نقش غیرمستقیم موتور کارانه)؛
   *  فقط بازنویسی‌ها نگه داشته می‌شوند — خالی یعنی پیش‌فرض مستند وزارت بهداشت. */
  responsibilityWeights: Record<string, number>;
  /** تنظیمات موظفی شامل جدول کاهش ساعت سابقه (Q2) — به‌ازای بیمارستان. */
  globalDuty: GlobalDutySettings;
}

export interface WardRecord {
  id: string; hospitalId: string; name: string; code: string | null; isActive: boolean;
}
export interface EmployeeRecord {
  id: string; hospitalId: string; wardId: string; profileId: string | null;
  fullName: string; personnelCode: string; roleTitle: string | null;
  employmentStatus: string; employmentStartJalali: string | null;
  baseDutyHoursOverride: number | null; isActive: boolean;
}
export interface ShiftTypeRecord {
  id: string; hospitalId: string; name: string; symbol: string;
  realDurationHours: number; calculatedValue: number; fridayValue: number; holidayValue: number;
  color: string | null;
}
export interface LeaveTypeRecord {
  id: string; hospitalId: string; code: string; name: string;
  isPaid: boolean; annualQuotaDays: number | null; requiresCoverage: boolean;
}
export interface ScheduleRecord {
  id: string; hospitalId: string; wardId: string; jYear: number; jMonth: number;
  status: 'draft' | 'published';
  /** نیاز روزانهٔ بخش برای همین ماه (jsonb روی schedules؛ مایگریشن ۰۰۱۲) — قبل از اعمال مایگریشن null است. */
  dailyRequirements?: { morning?: unknown; evening?: unknown; night?: unknown } | null;
}
export interface EntryRecord {
  id: string; scheduleId: string; hospitalId: string; wardId: string; employeeId: string;
  entryDate: string; jDay: number; shiftTypeId: string; isManual: boolean; isLocked: boolean;
}
export interface LeaveRecord {
  id: string; hospitalId: string; wardId: string; employeeId: string; leaveTypeCode: string;
  startDate: string; endDate: string; isHourly: boolean; hours: number | null;
  reason: string | null; status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  reviewedBy: string | null;
  /** مسیر پیوست مدرک در باکت leave-attachments (مایگریشن ۰۰۰۸)؛ null یعنی بدون پیوست. */
  attachmentPath: string | null;
  /** گام فعلی زنجیرهٔ تأیید و تاریخچهٔ اقدام‌ها (مایگریشن ۰۰۰۹). */
  approvalStep: number;
  approvals: LeaveApprovalEntry[];
}
export interface WorkRecordRecord {
  id: string; hospitalId: string; wardId: string; employeeId: string;
  jYear: number; jMonth: number; totals: Record<string, number>;
  status: 'draft' | 'approved' | 'exported';
}

export interface NursingPackageRecord {
  id: string; hospitalId: string; code: string; title: string;
  kValue: number; unit: string; careGroup: number | null; isActive: boolean;
}
export interface NursingServiceDbRecord {
  id: string; hospitalId: string; wardId: string; employeeId: string;
  patientRef: string; packageId: string; count: number; serviceDate: string;
  shift: 'morning' | 'evening' | 'night'; status: 'recorded' | 'confirmed';
  confirmedBy: string | null; confirmedAt: string | null; createdAt: string;
}

export interface OrgRepository {
  listWards(hospitalId: string): Promise<WardRecord[]>;
  listEmployees(wardId: string): Promise<EmployeeRecord[]>;
  /** همهٔ پرسنل بیمارستان — برای نماهای سطح بیمارستان (مترون/اداری). */
  listEmployeesByHospital(hospitalId: string): Promise<EmployeeRecord[]>;
  listShiftTypes(hospitalId: string): Promise<ShiftTypeRecord[]>;
  listLeaveTypes(hospitalId: string): Promise<LeaveTypeRecord[]>;
  /** ورود گروهی پرسنل (ایمپورتر) — کد پرسنلی موجود رد می‌شود، تازه‌ها برمی‌گردند. */
  createEmployees(records: EmployeeRecord[]): Promise<EmployeeRecord[]>;
}
export interface NursingRepository {
  listPackages(hospitalId: string): Promise<NursingPackageRecord[]>;
  listRecords(wardId: string): Promise<NursingServiceDbRecord[]>;
  createRecord(rec: Omit<NursingServiceDbRecord, 'id' | 'createdAt'>): Promise<NursingServiceDbRecord>;
  confirmRecord(id: string, confirmedByEmployeeId: string): Promise<void>;
}
export interface RosterRepository {
  getSchedule(wardId: string, jYear: number, jMonth: number): Promise<ScheduleRecord | null>;
  listEntries(scheduleId: string): Promise<EntryRecord[]>;
  upsertEntries(entries: EntryRecord[]): Promise<void>;
  setScheduleStatus(scheduleId: string, status: 'draft' | 'published'): Promise<void>;
  /** ذخیرهٔ نیاز روزانهٔ بخش روی همان رکورد برنامه (ورودی مستقیم سرپرستار در جدول). */
  setDailyRequirements(scheduleId: string, reqs: { morning: number[]; evening: number[]; night: number[] }): Promise<void>;
}
export interface LeaveRepository {
  listLeaveRequests(wardId: string): Promise<LeaveRecord[]>;
  /** همهٔ درخواست‌های بیمارستان — صف نقش‌های سطح بیمارستان (مترون/اداری). */
  listLeaveRequestsByHospital(hospitalId: string): Promise<LeaveRecord[]>;
  createLeaveRequest(rec: Omit<LeaveRecord, 'id' | 'status' | 'reviewedBy' | 'approvalStep' | 'approvals'>): Promise<LeaveRecord>;
  updateLeaveStatus(id: string, status: LeaveRecord['status'], reviewedBy: string | null): Promise<void>;
  /** ثبت یک اقدام زنجیرهٔ تأیید (گام + تاریخچه + وضعیت نهایی احتمالی). */
  updateApproval(id: string, patch: { status: LeaveRecord['status']; approvalStep: number; approvals: LeaveApprovalEntry[] }): Promise<void>;
}

export interface SettingsRepository {
  getSettings(hospitalId: string): Promise<HospitalSettingsRecord>;
  saveSettings(hospitalId: string, settings: HospitalSettingsRecord): Promise<void>;
}
export interface WorkRecordRepository {
  listWorkRecords(wardId: string, jYear: number, jMonth: number): Promise<WorkRecordRecord[]>;
  upsertWorkRecords(records: WorkRecordRecord[]): Promise<void>;
}

/** پروفایل پارامتر کارانهٔ بیمارستان — جایگزین localStorage مرورگر (مایگریشن ۰۰۰۶). */
export interface KaranehProfileRecord {
  id: string; hospitalId: string; name: string;
  presetId: string | null;
  nursingShare: number; onCallCoef: number; kRial: number;
  isDefault: boolean; updatedAt: string;
}
export interface KaranehProfileRepository {
  listProfiles(hospitalId: string): Promise<KaranehProfileRecord[]>;
  saveProfile(rec: Omit<KaranehProfileRecord, 'updatedAt'>): Promise<KaranehProfileRecord>;
  setDefaultProfile(hospitalId: string, id: string): Promise<void>;
}

// ── پروندهٔ بیمار (مایگریشن ۰۰۱۳) — لایهٔ پاسخگویی اپیزود؛ رکوردها آیینهٔ جداول‌اند.
export interface PatientRecord {
  id: string; hospitalId: string; fullName: string; nationalCode: string | null;
  fileNo: string; birthDate: string | null; gender: 'female' | 'male' | null;
}
export interface AdmissionRecord {
  id: string; hospitalId: string; wardId: string; patientId: string;
  admittedAt: string; admissionType: 'emergency' | 'elective' | 'transfer';
  admissionSource: string | null; chiefComplaint: string | null; admissionReason: string;
  diagnosisText: string | null; diagnosisIcd10: string | null;
  attendingName: string; attendingCouncilNo: string | null; attendingService: string | null;
  bedLabel: string | null; insuranceType: string | null; insuranceNo: string | null;
  allergySummary: string | null;
  status: 'admitted' | 'discharged' | 'transferred' | 'deceased' | 'lama';
  dischargedAt: string | null; dischargeNote: string | null; createdBy: string | null;
}
export interface PatientAssignmentRecord {
  id: string; hospitalId: string; wardId: string; admissionId: string; employeeId: string;
  role: 'responsible' | 'associate' | 'charge';
  shift: 'morning' | 'evening' | 'night'; serviceDate: string;
  assignedBy: string | null; source: 'roster' | 'manual' | 'handover';
}
export interface PatientReportRecord {
  id: string; hospitalId: string; wardId: string; admissionId: string; assignmentId: string | null;
  authorEmployeeId: string; shift: 'morning' | 'evening' | 'night'; reportDate: string;
  body: Record<string, unknown>; status: 'draft' | 'signed'; signedAt: string | null;
}
export interface HandoverRecord {
  id: string; hospitalId: string; wardId: string; admissionId: string;
  fromAssignmentId: string | null; toAssignmentId: string | null;
  giverEmployeeId: string; receiverEmployeeId: string; handoverAt: string;
  sbar: Record<string, unknown>; stateSummary: string | null; acceptedAt: string | null;
}
export interface PatientsRepository {
  listPatients(hospitalId: string): Promise<PatientRecord[]>;
  listAdmissions(wardId: string): Promise<AdmissionRecord[]>;
  listAssignments(wardId: string): Promise<PatientAssignmentRecord[]>;
  listReports(wardId: string): Promise<PatientReportRecord[]>;
  listHandovers(wardId: string): Promise<HandoverRecord[]>;
  createPatient(rec: Omit<PatientRecord, 'id'>): Promise<PatientRecord>;
  createAdmission(rec: Omit<AdmissionRecord, 'id'>): Promise<AdmissionRecord>;
  createAssignment(rec: Omit<PatientAssignmentRecord, 'id'>): Promise<PatientAssignmentRecord>;
  createReport(rec: Omit<PatientReportRecord, 'id'>): Promise<PatientReportRecord>;
  updateReport(id: string, patch: Partial<Pick<PatientReportRecord, 'body' | 'status' | 'signedAt'>>): Promise<void>;
  createHandover(rec: Omit<HandoverRecord, 'id'>): Promise<HandoverRecord>;
  acceptHandover(id: string): Promise<void>;
  dischargeAdmission(id: string, status: AdmissionRecord['status'], note: string | null, atISO: string): Promise<void>;
}


// ── لایهٔ ایجنت (مایگریشن ۰۰۱۴، فاز ۱) — ردّ اجرا و پیش‌نویس؛ تصمیم با انسان است.
export interface AgentRunRecord {
  id: string; hospitalId: string; agentKey: string; zone: 'A' | 'B' | 'C';
  input: Record<string, unknown>; output: Record<string, unknown> | null;
  citations: { title: string; source: string }[];
  model: string | null; status: 'done' | 'error';
  createdBy: string | null; createdAt: string;
}
export interface AgentDraftRecord {
  id: string; hospitalId: string; runId: string | null; kind: string;
  payload: Record<string, unknown>;
  status: 'draft' | 'approved' | 'rejected';
  decidedBy: string | null; decidedAt: string | null;
  createdAt: string; updatedAt: string;
}
export interface AgentsRepository {
  listRuns(hospitalId: string): Promise<AgentRunRecord[]>;
  createRun(rec: Omit<AgentRunRecord, 'id' | 'createdAt'>): Promise<AgentRunRecord>;
  listDrafts(hospitalId: string): Promise<AgentDraftRecord[]>;
  createDraft(rec: Omit<AgentDraftRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<AgentDraftRecord>;
  decideDraft(id: string, status: 'approved' | 'rejected', decidedBy: string | null, atISO: string): Promise<void>;
}

export interface DataRepositories {
  org: OrgRepository;
  roster: RosterRepository;
  leave: LeaveRepository;
  workRecords: WorkRecordRepository;
  nursing: NursingRepository;
  profiles: KaranehProfileRepository;
  settings: SettingsRepository;
  patients: PatientsRepository;
  agents: AgentsRepository;
}

/** عکس کامل دادهٔ یک بیمارستان برای هیدراته‌کردن استور. */
export interface HospitalSnapshot {
  wards: WardRecord[];
  employees: EmployeeRecord[];
  shiftTypes: ShiftTypeRecord[];
  leaveTypes: LeaveTypeRecord[];
  schedule: ScheduleRecord | null;
  entries: EntryRecord[];
  leaves: LeaveRecord[];
  workRecords: WorkRecordRecord[];
  nursingPackages: NursingPackageRecord[];
  nursingRecords: NursingServiceDbRecord[];
  karanehProfiles: KaranehProfileRecord[];
  settings: HospitalSettingsRecord;
  patients: PatientRecord[];
  admissions: AdmissionRecord[];
  patientAssignments: PatientAssignmentRecord[];
  patientReports: PatientReportRecord[];
  handovers: HandoverRecord[];
}
