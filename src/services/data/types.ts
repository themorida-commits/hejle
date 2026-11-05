// ─────────────────────────────────────────────────────────────────────────────
// لایهٔ داده (اتصال Supabase) — رکوردها آیینهٔ اسکیمای v2 هستند و ریپازیتوری‌ها
// تنها جایی‌اند که با دیتابیس حرف می‌زنند. صفحات و سرویس‌های features روی
// همین اینترفیس‌ها سوارند؛ منبع داده (demo | supabase) از env انتخاب می‌شود.
// ─────────────────────────────────────────────────────────────────────────────

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
}
export interface LeaveRepository {
  listLeaveRequests(wardId: string): Promise<LeaveRecord[]>;
  createLeaveRequest(rec: Omit<LeaveRecord, 'id' | 'status' | 'reviewedBy'>): Promise<LeaveRecord>;
  updateLeaveStatus(id: string, status: LeaveRecord['status'], reviewedBy: string | null): Promise<void>;
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

export interface DataRepositories {
  org: OrgRepository;
  roster: RosterRepository;
  leave: LeaveRepository;
  workRecords: WorkRecordRepository;
  nursing: NursingRepository;
  profiles: KaranehProfileRepository;
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
}
