// تایپ‌های ردیف‌های دیتابیس نسخهٔ ۲ — آیینهٔ مایگریشن 20261103000001.
// در فاز ۱ با خروجی رسمی «supabase gen types» جایگزین می‌شود.
export type MembershipRole = 'hospital_admin' | 'hr_admin' | 'ward_manager' | 'matron' | 'staff';
export type RequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export type ScheduleStatus = 'draft' | 'published';
export type WorkRecordStatus = 'draft' | 'approved' | 'exported';
export type RuleSeverity = 'hard' | 'warn';

export interface HospitalRow {
  id: string;
  name: string;
  code: string;
  settings: Record<string, unknown>;
  created_at: string;
}

export interface WardRow {
  id: string;
  hospital_id: string;
  name: string;
  code: string | null;
  is_active: boolean;
  created_at: string;
}

export interface MembershipRow {
  id: string;
  user_id: string;
  hospital_id: string;
  ward_id: string | null;
  role: MembershipRole;
  is_active: boolean;
  created_at: string;
}

export interface EmployeeRow {
  id: string;
  hospital_id: string;
  ward_id: string;
  profile_id: string | null;
  position_id: string | null;
  full_name: string;
  personnel_code: string;
  national_code: string | null;
  phone: string | null;
  employment_status: string;
  employment_start_jalali: string | null;
  base_duty_hours_override: number | null;
  is_active: boolean;
  created_at: string;
}

export interface ScheduleRow {
  id: string;
  hospital_id: string;
  ward_id: string;
  j_year: number;
  j_month: number;
  status: ScheduleStatus;
  created_by: string | null;
  published_at: string | null;
  created_at: string;
}

export interface ScheduleEntryRow {
  id: string;
  schedule_id: string;
  hospital_id: string;
  ward_id: string;
  employee_id: string;
  entry_date: string;
  j_day: number;
  shift_type_id: string;
  is_manual: boolean;
  is_locked: boolean;
}

export interface LeaveRequestRow {
  id: string;
  hospital_id: string;
  ward_id: string;
  employee_id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  is_hourly: boolean;
  hours: number | null;
  reason: string | null;
  status: RequestStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
}

export interface WorkRecordRow {
  id: string;
  hospital_id: string;
  ward_id: string;
  employee_id: string;
  j_year: number;
  j_month: number;
  totals: Record<string, number>;
  status: WorkRecordStatus;
  approved_by: string | null;
  approved_at: string | null;
  exported_at: string | null;
  created_at: string;
}

export interface RuleRow {
  id: string;
  rule_set_id: string;
  hospital_id: string;
  rule_type: string;
  params: Record<string, unknown>;
  severity: RuleSeverity;
  is_enabled: boolean;
}

export interface HolidayRow {
  id: string;
  hospital_id: string | null;
  j_year: number;
  j_month: number;
  j_day: number;
  title: string;
  is_official: boolean;
}
