// ریپازیتوری‌های Supabase — هر خواندن لیستی صفحه‌بندی می‌شود (درس نسخهٔ فعلی:
// سقف پیش‌فرض PostgREST هزار ردیف است و یک ماهِ یک بخش ۴۲ نفره از آن رد می‌شود).
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  DataRepositories, EmployeeRecord, EntryRecord, LeaveRecord, LeaveTypeRecord,
  NursingPackageRecord, NursingServiceDbRecord,
  ScheduleRecord, ShiftTypeRecord, WardRecord, WorkRecordRecord,
} from './types';

const PAGE = 500;

interface PageResult<T> { data: T[] | null; error: { message: string } | null }

/** خواندن کامل یک کوئری با range — تا وقتی صفحهٔ کوتاه نیامده ادامه می‌دهد. */
export async function fetchAllPages<T>(
  run: (from: number, to: number) => PromiseLike<PageResult<T>>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await run(from, from + PAGE - 1);
    if (error) throw new Error(`supabase read failed: ${error.message}`);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

// ── نگاشت ردیف‌های خام (snake_case) ──────────────────────────────────────────
/* eslint-disable @typescript-eslint/no-explicit-any */
const ward = (r: any): WardRecord => ({ id: r.id, hospitalId: r.hospital_id, name: r.name, code: r.code, isActive: r.is_active });
const employee = (r: any): EmployeeRecord => ({
  id: r.id, hospitalId: r.hospital_id, wardId: r.ward_id, profileId: r.profile_id,
  fullName: r.full_name, personnelCode: r.personnel_code, roleTitle: r.positions?.title ?? null,
  employmentStatus: r.employment_status, employmentStartJalali: r.employment_start_jalali,
  baseDutyHoursOverride: r.base_duty_hours_override, isActive: r.is_active,
});
const shiftType = (r: any): ShiftTypeRecord => ({
  id: r.id, hospitalId: r.hospital_id, name: r.name, symbol: r.symbol,
  realDurationHours: r.real_duration_hours, calculatedValue: r.calculated_value,
  fridayValue: r.friday_value, holidayValue: r.holiday_value, color: r.color,
});
const leaveType = (r: any): LeaveTypeRecord => ({
  id: r.id, hospitalId: r.hospital_id, code: r.code, name: r.name,
  isPaid: r.is_paid, annualQuotaDays: r.annual_quota_days, requiresCoverage: r.requires_coverage,
});
const schedule = (r: any): ScheduleRecord => ({
  id: r.id, hospitalId: r.hospital_id, wardId: r.ward_id, jYear: r.j_year, jMonth: r.j_month, status: r.status,
});
const entry = (r: any): EntryRecord => ({
  id: r.id, scheduleId: r.schedule_id, hospitalId: r.hospital_id, wardId: r.ward_id,
  employeeId: r.employee_id, entryDate: r.entry_date, jDay: r.j_day, shiftTypeId: r.shift_type_id,
  isManual: r.is_manual, isLocked: r.is_locked,
});
const leave = (r: any): LeaveRecord => ({
  id: r.id, hospitalId: r.hospital_id, wardId: r.ward_id, employeeId: r.employee_id,
  leaveTypeCode: r.leave_types?.code ?? '', startDate: r.start_date, endDate: r.end_date,
  isHourly: r.is_hourly, hours: r.hours, reason: r.reason, status: r.status, reviewedBy: r.reviewed_by,
});
const workRecord = (r: any): WorkRecordRecord => ({
  id: r.id, hospitalId: r.hospital_id, wardId: r.ward_id, employeeId: r.employee_id,
  jYear: r.j_year, jMonth: r.j_month, totals: r.totals ?? {}, status: r.status,
});
const nursingPackage = (r: any): NursingPackageRecord => ({
  id: r.id, hospitalId: r.hospital_id, code: r.code, title: r.title,
  kValue: Number(r.k_value), unit: r.unit, careGroup: r.care_group, isActive: r.active,
});
const nursingRecord = (r: any): NursingServiceDbRecord => ({
  id: r.id, hospitalId: r.hospital_id, wardId: r.ward_id, employeeId: r.employee_id,
  patientRef: r.patient_ref, packageId: r.package_id, count: r.service_count,
  serviceDate: r.service_date, shift: r.shift, status: r.status,
  confirmedBy: r.confirmed_by, confirmedAt: r.confirmed_at, createdAt: r.created_at,
});
/* eslint-enable @typescript-eslint/no-explicit-any */

export function createSupabaseRepositories(client: SupabaseClient): DataRepositories {
  return {
    org: {
      async listWards(hospitalId) {
        const rows = await fetchAllPages((f, t) =>
          client.from('wards').select('*').eq('hospital_id', hospitalId).order('name').range(f, t));
        return rows.map(ward);
      },
      async listEmployees(wardId) {
        const rows = await fetchAllPages((f, t) =>
          client.from('employees').select('*, positions(title)').eq('ward_id', wardId).eq('is_active', true).order('full_name').range(f, t));
        return rows.map(employee);
      },
      async listShiftTypes(hospitalId) {
        const rows = await fetchAllPages((f, t) =>
          client.from('shift_types').select('*').eq('hospital_id', hospitalId).order('symbol').range(f, t));
        return rows.map(shiftType);
      },
      async listLeaveTypes(hospitalId) {
        const rows = await fetchAllPages((f, t) =>
          client.from('leave_types').select('*').eq('hospital_id', hospitalId).order('code').range(f, t));
        return rows.map(leaveType);
      },
      async createEmployees(records) {
        if (records.length === 0) return [];
        const hospitalId = records[0]!.hospitalId;
        const existing = await fetchAllPages((f, t) =>
          client.from('employees').select('personnel_code').eq('hospital_id', hospitalId).range(f, t));
        const have = new Set(existing.map((r: { personnel_code: string }) => r.personnel_code));
        const fresh = records.filter(r => !have.has(r.personnelCode));
        if (fresh.length === 0) return [];
        const { data, error } = await client.from('employees').insert(fresh.map(r => ({
          hospital_id: r.hospitalId, ward_id: r.wardId, full_name: r.fullName,
          personnel_code: r.personnelCode, employment_status: r.employmentStatus,
          employment_start_jalali: r.employmentStartJalali,
          base_duty_hours_override: r.baseDutyHoursOverride, is_active: true,
        }))).select('*, positions(title)');
        if (error) throw new Error(`supabase write failed: ${error.message}`);
        return (data ?? []).map(employee);
      },
    },
    roster: {
      async getSchedule(wardId, jYear, jMonth) {
        const { data, error } = await client.from('schedules').select('*')
          .eq('ward_id', wardId).eq('j_year', jYear).eq('j_month', jMonth).maybeSingle();
        if (error) throw new Error(`supabase read failed: ${error.message}`);
        return data ? schedule(data) : null;
      },
      async listEntries(scheduleId) {
        const rows = await fetchAllPages((f, t) =>
          client.from('schedule_entries').select('*').eq('schedule_id', scheduleId).order('entry_date').range(f, t));
        return rows.map(entry);
      },
      async upsertEntries(entries) {
        const rows = entries.map(e => ({
          id: e.id, schedule_id: e.scheduleId, hospital_id: e.hospitalId, ward_id: e.wardId,
          employee_id: e.employeeId, entry_date: e.entryDate, j_day: e.jDay,
          shift_type_id: e.shiftTypeId, is_manual: e.isManual, is_locked: e.isLocked,
        }));
        for (let i = 0; i < rows.length; i += PAGE) {
          const { error } = await client.from('schedule_entries')
            .upsert(rows.slice(i, i + PAGE), { onConflict: 'schedule_id,employee_id,entry_date' });
          if (error) throw new Error(`supabase write failed: ${error.message}`);
        }
      },
      async setScheduleStatus(scheduleId, status) {
        const { error } = await client.from('schedules').update({ status }).eq('id', scheduleId);
        if (error) throw new Error(`supabase write failed: ${error.message}`);
      },
    },
    leave: {
      async listLeaveRequests(wardId) {
        const rows = await fetchAllPages((f, t) =>
          client.from('leave_requests').select('*, leave_types(code)').eq('ward_id', wardId).order('created_at', { ascending: false }).range(f, t));
        return rows.map(leave);
      },
      async createLeaveRequest(rec) {
        // leave_type_id از روی کد حل می‌شود (رکورد دامنه کد را نگه می‌دارد)
        const { data: lt, error: ltErr } = await client.from('leave_types').select('id')
          .eq('hospital_id', rec.hospitalId).eq('code', rec.leaveTypeCode).single();
        if (ltErr || !lt) throw new Error(`leave type not found: ${rec.leaveTypeCode}`);
        const { data, error } = await client.from('leave_requests').insert({
          hospital_id: rec.hospitalId, ward_id: rec.wardId, employee_id: rec.employeeId,
          leave_type_id: (lt as { id: string }).id, start_date: rec.startDate, end_date: rec.endDate,
          is_hourly: rec.isHourly, hours: rec.hours, reason: rec.reason,
        }).select('*, leave_types(code)').single();
        if (error) throw new Error(`supabase write failed: ${error.message}`);
        return leave(data);
      },
      async updateLeaveStatus(id, status, reviewedBy) {
        const { error } = await client.from('leave_requests')
          .update({ status, reviewed_by: reviewedBy, reviewed_at: new Date().toISOString() }).eq('id', id);
        if (error) throw new Error(`supabase write failed: ${error.message}`);
      },
    },
    nursing: {
      async listPackages(hospitalId) {
        const rows = await fetchAllPages((f, t) =>
          client.from('nursing_packages').select('*').eq('hospital_id', hospitalId).eq('active', true).order('code').range(f, t));
        return rows.map(nursingPackage);
      },
      async listRecords(wardId) {
        const rows = await fetchAllPages((f, t) =>
          client.from('nursing_service_records').select('*').eq('ward_id', wardId).order('service_date').range(f, t));
        return rows.map(nursingRecord);
      },
      async createRecord(rec) {
        const { data, error } = await client.from('nursing_service_records').insert({
          hospital_id: rec.hospitalId, ward_id: rec.wardId, employee_id: rec.employeeId,
          patient_ref: rec.patientRef, package_id: rec.packageId, service_count: rec.count,
          service_date: rec.serviceDate, shift: rec.shift, status: rec.status,
          confirmed_by: rec.confirmedBy, confirmed_at: rec.confirmedAt,
        }).select('*').single();
        if (error) throw new Error(`supabase write failed: ${error.message}`);
        return nursingRecord(data);
      },
      async confirmRecord(id, confirmedByEmployeeId) {
        const { error } = await client.from('nursing_service_records')
          .update({ status: 'confirmed', confirmed_by: confirmedByEmployeeId, confirmed_at: new Date().toISOString() })
          .eq('id', id);
        if (error) throw new Error(`supabase write failed: ${error.message}`);
      },
    },
    workRecords: {
      async listWorkRecords(wardId, jYear, jMonth) {
        const rows = await fetchAllPages((f, t) =>
          client.from('work_records').select('*').eq('ward_id', wardId)
            .eq('j_year', jYear).eq('j_month', jMonth).range(f, t));
        return rows.map(workRecord);
      },
      async upsertWorkRecords(records) {
        const rows = records.map(w => ({
          id: w.id, hospital_id: w.hospitalId, ward_id: w.wardId, employee_id: w.employeeId,
          j_year: w.jYear, j_month: w.jMonth, totals: w.totals, status: w.status,
        }));
        const { error } = await client.from('work_records')
          .upsert(rows, { onConflict: 'employee_id,j_year,j_month' });
        if (error) throw new Error(`supabase write failed: ${error.message}`);
      },
    },
  };
}

/** عکس کامل یک بخش برای ماه مشخص — مسیر هیدراته‌شدن استور در حالت supabase. */
export async function loadHospitalSnapshot(
  repos: DataRepositories,
  args: { hospitalId: string; wardId: string; jYear: number; jMonth: number },
) {
  const [wards, employees, shiftTypes, leaveTypes, schedule, leaves, workRecords, nursingPackages, nursingRecords] = await Promise.all([
    repos.org.listWards(args.hospitalId),
    repos.org.listEmployees(args.wardId),
    repos.org.listShiftTypes(args.hospitalId),
    repos.org.listLeaveTypes(args.hospitalId),
    repos.roster.getSchedule(args.wardId, args.jYear, args.jMonth),
    repos.leave.listLeaveRequests(args.wardId),
    repos.workRecords.listWorkRecords(args.wardId, args.jYear, args.jMonth),
    repos.nursing.listPackages(args.hospitalId),
    repos.nursing.listRecords(args.wardId),
  ]);
  const entries = schedule ? await repos.roster.listEntries(schedule.id) : [];
  return { wards, employees, shiftTypes, leaveTypes, schedule, entries, leaves, workRecords, nursingPackages, nursingRecords };
}
