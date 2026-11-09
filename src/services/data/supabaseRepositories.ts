// ریپازیتوری‌های Supabase — هر خواندن لیستی صفحه‌بندی می‌شود (درس نسخهٔ فعلی:
// سقف پیش‌فرض PostgREST هزار ردیف است و یک ماهِ یک بخش ۴۲ نفره از آن رد می‌شود).
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AdmissionRecord, AgentDraftRecord, AgentRunRecord, DataRepositories, EmployeeRecord, EntryRecord, HandoverRecord,
  LeaveRecord, LeaveTypeRecord, KaranehProfileRecord, NursingPackageRecord,
  NursingServiceDbRecord, PatientAssignmentRecord, PatientRecord, PatientReportRecord,
  ScheduleRecord, ShiftTypeRecord, WardRecord, WorkRecordRecord,
} from './types';
import { normalizeHospitalSettings, hospitalSettingsToJson } from './settings';

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
  dailyRequirements: (r.daily_requirements ?? null) as ScheduleRecord['dailyRequirements'],
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
  attachmentPath: r.attachment_path ?? null,
  approvalStep: r.approval_step ?? 0, approvals: r.approvals ?? [],
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
const patient = (r: any): PatientRecord => ({
  id: r.id, hospitalId: r.hospital_id, fullName: r.full_name, nationalCode: r.national_code,
  fileNo: r.file_no, birthDate: r.birth_date, gender: r.gender,
});
const admission = (r: any): AdmissionRecord => ({
  id: r.id, hospitalId: r.hospital_id, wardId: r.ward_id, patientId: r.patient_id,
  admittedAt: r.admitted_at, admissionType: r.admission_type, admissionSource: r.admission_source,
  chiefComplaint: r.chief_complaint, admissionReason: r.admission_reason,
  diagnosisText: r.diagnosis_text, diagnosisIcd10: r.diagnosis_icd10,
  attendingName: r.attending_name, attendingCouncilNo: r.attending_council_no,
  attendingService: r.attending_service, bedLabel: r.bed_label,
  insuranceType: r.insurance_type, insuranceNo: r.insurance_no, allergySummary: r.allergy_summary,
  status: r.status, dischargedAt: r.discharged_at, dischargeNote: r.discharge_note, createdBy: r.created_by,
});
const patientAssignment = (r: any): PatientAssignmentRecord => ({
  id: r.id, hospitalId: r.hospital_id, wardId: r.ward_id, admissionId: r.admission_id,
  employeeId: r.employee_id, role: r.role, shift: r.shift, serviceDate: r.service_date,
  assignedBy: r.assigned_by, source: r.source,
});
const patientReport = (r: any): PatientReportRecord => ({
  id: r.id, hospitalId: r.hospital_id, wardId: r.ward_id, admissionId: r.admission_id,
  assignmentId: r.assignment_id, authorEmployeeId: r.author_employee_id, shift: r.shift,
  reportDate: r.report_date, body: r.body ?? {}, status: r.status, signedAt: r.signed_at,
});
const handover = (r: any): HandoverRecord => ({
  id: r.id, hospitalId: r.hospital_id, wardId: r.ward_id, admissionId: r.admission_id,
  fromAssignmentId: r.from_assignment_id, toAssignmentId: r.to_assignment_id,
  giverEmployeeId: r.giver_employee_id, receiverEmployeeId: r.receiver_employee_id,
  handoverAt: r.handover_at, sbar: r.sbar ?? {}, stateSummary: r.state_summary, acceptedAt: r.accepted_at,
});
const agentRun = (r: any): AgentRunRecord => ({
  id: r.id, hospitalId: r.hospital_id, agentKey: r.agent_key, zone: r.zone,
  input: r.input ?? {}, output: r.output ?? null,
  citations: (r.citations ?? []) as AgentRunRecord['citations'],
  model: r.model ?? null, status: r.status, createdBy: r.created_by ?? null, createdAt: r.created_at,
});
const agentDraft = (r: any): AgentDraftRecord => ({
  id: r.id, hospitalId: r.hospital_id, runId: r.run_id ?? null, kind: r.kind,
  payload: r.payload ?? {}, status: r.status, decidedBy: r.decided_by ?? null,
  decidedAt: r.decided_at ?? null, createdAt: r.created_at, updatedAt: r.updated_at,
});
const karanehProfile = (r: any): KaranehProfileRecord => ({
  id: r.id, hospitalId: r.hospital_id, name: r.name, presetId: r.preset_id,
  nursingShare: Number(r.nursing_share), onCallCoef: Number(r.on_call_coef),
  kRial: Number(r.k_rial), isDefault: !!r.is_default, updatedAt: r.updated_at,
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
      async listEmployeesByHospital(hospitalId) {
        const rows = await fetchAllPages((f, t) =>
          client.from('employees').select('*, positions(title)').eq('hospital_id', hospitalId).eq('is_active', true).order('full_name').range(f, t));
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
      async setDailyRequirements(scheduleId, reqs) {
        const { error } = await client.from('schedules').update({ daily_requirements: reqs }).eq('id', scheduleId);
        if (error) throw new Error(`supabase write failed: ${error.message}`);
      },
    },
    leave: {
      async listLeaveRequests(wardId) {
        const rows = await fetchAllPages((f, t) =>
          client.from('leave_requests').select('*, leave_types(code)').eq('ward_id', wardId).order('created_at', { ascending: false }).range(f, t));
        return rows.map(leave);
      },
      async listLeaveRequestsByHospital(hospitalId) {
        const rows = await fetchAllPages((f, t) =>
          client.from('leave_requests').select('*, leave_types(code)').eq('hospital_id', hospitalId).order('created_at', { ascending: false }).range(f, t));
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
          attachment_path: rec.attachmentPath,
        }).select('*, leave_types(code)').single();
        if (error) throw new Error(`supabase write failed: ${error.message}`);
        return leave(data);
      },
      async updateLeaveStatus(id, status, reviewedBy) {
        const { error } = await client.from('leave_requests')
          .update({ status, reviewed_by: reviewedBy, reviewed_at: new Date().toISOString() }).eq('id', id);
        if (error) throw new Error(`supabase write failed: ${error.message}`);
      },
      async updateApproval(id, patch) {
        const { error } = await client.from('leave_requests')
          .update({
            status: patch.status, approval_step: patch.approvalStep, approvals: patch.approvals,
            reviewed_at: new Date().toISOString(),
          }).eq('id', id);
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
    profiles: {
      async listProfiles(hospitalId) {
        const rows = await fetchAllPages((f, t) =>
          client.from('karaneh_profiles').select('*').eq('hospital_id', hospitalId).order('name').range(f, t));
        return rows.map(karanehProfile);
      },
      async saveProfile(rec) {
        const row = {
          id: rec.id, hospital_id: rec.hospitalId, name: rec.name, preset_id: rec.presetId,
          nursing_share: rec.nursingShare, on_call_coef: rec.onCallCoef, k_rial: rec.kRial,
          is_default: rec.isDefault, updated_at: new Date().toISOString(),
        };
        const { data, error } = await client.from('karaneh_profiles')
          .upsert(row, { onConflict: 'id' }).select('*').single();
        if (error) throw new Error(`supabase write failed: ${error.message}`);
        return karanehProfile(data);
      },
      async setDefaultProfile(hospitalId, id) {
        const off = await client.from('karaneh_profiles')
          .update({ is_default: false }).eq('hospital_id', hospitalId).eq('is_default', true);
        if (off.error) throw new Error(`supabase write failed: ${off.error.message}`);
        const on = await client.from('karaneh_profiles')
          .update({ is_default: true }).eq('id', id);
        if (on.error) throw new Error(`supabase write failed: ${on.error.message}`);
      },
    },
    settings: {
      async getSettings(hospitalId) {
        const { data, error } = await client.from('hospitals').select('settings').eq('id', hospitalId).single();
        if (error) return normalizeHospitalSettings(null);
        return normalizeHospitalSettings((data as { settings?: unknown })?.settings);
      },
      async saveSettings(hospitalId, settings) {
        // ادغام با کلیدهای دیگر settings تا چیزی از قلم نیفتد؛ نوشتن طبق RLS فقط hospital_admin
        const { data } = await client.from('hospitals').select('settings').eq('id', hospitalId).single();
        const current = ((data as { settings?: Record<string, unknown> } | null)?.settings ?? {}) as Record<string, unknown>;
        const merged = { ...current, ...hospitalSettingsToJson(settings) };
        const { error } = await client.from('hospitals').update({ settings: merged }).eq('id', hospitalId);
        if (error) throw new Error(`supabase write failed: ${error.message}`);
      },
    },
    patients: {
      async listPatients(hospitalId) {
        const rows = await fetchAllPages((f, t) =>
          client.from('patients').select('*').eq('hospital_id', hospitalId).order('full_name').range(f, t));
        return rows.map(patient);
      },
      async listAdmissions(wardId) {
        const rows = await fetchAllPages((f, t) =>
          client.from('admissions').select('*').eq('ward_id', wardId).order('admitted_at', { ascending: false }).range(f, t));
        return rows.map(admission);
      },
      async listAssignments(wardId) {
        const rows = await fetchAllPages((f, t) =>
          client.from('patient_assignments').select('*').eq('ward_id', wardId).order('service_date').range(f, t));
        return rows.map(patientAssignment);
      },
      async listReports(wardId) {
        const rows = await fetchAllPages((f, t) =>
          client.from('nursing_reports').select('*').eq('ward_id', wardId).order('report_date').range(f, t));
        return rows.map(patientReport);
      },
      async listHandovers(wardId) {
        const rows = await fetchAllPages((f, t) =>
          client.from('handovers').select('*').eq('ward_id', wardId).order('handover_at').range(f, t));
        return rows.map(handover);
      },
      async createPatient(rec) {
        const { data, error } = await client.from('patients').insert({
          hospital_id: rec.hospitalId, full_name: rec.fullName, national_code: rec.nationalCode,
          file_no: rec.fileNo, birth_date: rec.birthDate, gender: rec.gender,
        }).select('*').single();
        if (error) throw new Error(`supabase write failed: ${error.message}`);
        return patient(data);
      },
      async createAdmission(rec) {
        const { data, error } = await client.from('admissions').insert({
          hospital_id: rec.hospitalId, ward_id: rec.wardId, patient_id: rec.patientId,
          admitted_at: rec.admittedAt, admission_type: rec.admissionType, admission_source: rec.admissionSource,
          chief_complaint: rec.chiefComplaint, admission_reason: rec.admissionReason,
          diagnosis_text: rec.diagnosisText, diagnosis_icd10: rec.diagnosisIcd10,
          attending_name: rec.attendingName, attending_council_no: rec.attendingCouncilNo,
          attending_service: rec.attendingService, bed_label: rec.bedLabel,
          insurance_type: rec.insuranceType, insurance_no: rec.insuranceNo, allergy_summary: rec.allergySummary,
          status: rec.status, discharged_at: rec.dischargedAt, discharge_note: rec.dischargeNote, created_by: rec.createdBy,
        }).select('*').single();
        if (error) throw new Error(`supabase write failed: ${error.message}`);
        return admission(data);
      },
      async createAssignment(rec) {
        const { data, error } = await client.from('patient_assignments').insert({
          hospital_id: rec.hospitalId, ward_id: rec.wardId, admission_id: rec.admissionId,
          employee_id: rec.employeeId, role: rec.role, shift: rec.shift, service_date: rec.serviceDate,
          assigned_by: rec.assignedBy, source: rec.source,
        }).select('*').single();
        if (error) throw new Error(`supabase write failed: ${error.message}`);
        return patientAssignment(data);
      },
      async createReport(rec) {
        const { data, error } = await client.from('nursing_reports').insert({
          hospital_id: rec.hospitalId, ward_id: rec.wardId, admission_id: rec.admissionId,
          assignment_id: rec.assignmentId, author_employee_id: rec.authorEmployeeId, shift: rec.shift,
          report_date: rec.reportDate, body: rec.body, status: rec.status, signed_at: rec.signedAt,
        }).select('*').single();
        if (error) throw new Error(`supabase write failed: ${error.message}`);
        return patientReport(data);
      },
      async updateReport(id, patch) {
        const row: Record<string, unknown> = {};
        if (patch.body !== undefined) row.body = patch.body;
        if (patch.status !== undefined) row.status = patch.status;
        if (patch.signedAt !== undefined) row.signed_at = patch.signedAt;
        const { error } = await client.from('nursing_reports').update(row).eq('id', id);
        if (error) throw new Error(`supabase write failed: ${error.message}`);
      },
      async createHandover(rec) {
        const { data, error } = await client.from('handovers').insert({
          hospital_id: rec.hospitalId, ward_id: rec.wardId, admission_id: rec.admissionId,
          from_assignment_id: rec.fromAssignmentId, to_assignment_id: rec.toAssignmentId,
          giver_employee_id: rec.giverEmployeeId, receiver_employee_id: rec.receiverEmployeeId,
          handover_at: rec.handoverAt, sbar: rec.sbar, state_summary: rec.stateSummary, accepted_at: rec.acceptedAt,
        }).select('*').single();
        if (error) throw new Error(`supabase write failed: ${error.message}`);
        return handover(data);
      },
      async acceptHandover(id) {
        const { error } = await client.from('handovers')
          .update({ accepted_at: new Date().toISOString() }).eq('id', id);
        if (error) throw new Error(`supabase write failed: ${error.message}`);
      },
      async dischargeAdmission(id, status, note, atISO) {
        const { error } = await client.from('admissions')
          .update({ status, discharge_note: note, discharged_at: atISO }).eq('id', id);
        if (error) throw new Error(`supabase write failed: ${error.message}`);
      },
    },
    agents: {
      async listRuns(hospitalId) {
        const rows = await fetchAllPages((f, t) =>
          client.from('agent_runs').select('*').eq('hospital_id', hospitalId)
            .order('created_at', { ascending: false }).range(f, t));
        return rows.map(agentRun);
      },
      async createRun(rec) {
        const { data, error } = await client.from('agent_runs').insert({
          hospital_id: rec.hospitalId, agent_key: rec.agentKey, zone: rec.zone,
          input: rec.input, output: rec.output, citations: rec.citations,
          model: rec.model, status: rec.status,
        }).select('*').single();
        if (error) throw new Error(`supabase write failed: ${error.message}`);
        return agentRun(data);
      },
      async listDrafts(hospitalId) {
        const rows = await fetchAllPages((f, t) =>
          client.from('agent_drafts').select('*').eq('hospital_id', hospitalId)
            .order('created_at', { ascending: false }).range(f, t));
        return rows.map(agentDraft);
      },
      async createDraft(rec) {
        const { data, error } = await client.from('agent_drafts').insert({
          hospital_id: rec.hospitalId, run_id: rec.runId, kind: rec.kind, payload: rec.payload,
          status: rec.status,
        }).select('*').single();
        if (error) throw new Error(`supabase write failed: ${error.message}`);
        return agentDraft(data);
      },
      async decideDraft(id, status, decidedBy, atISO) {
        const { error } = await client.from('agent_drafts')
          .update({ status, decided_by: decidedBy, decided_at: atISO, updated_at: atISO }).eq('id', id);
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
  const [wards, employees, shiftTypes, leaveTypes, schedule, leaves, workRecords, nursingPackages, nursingRecords, karanehProfiles, settings, patients, admissions, patientAssignments, patientReports, handovers] = await Promise.all([
    repos.org.listWards(args.hospitalId),
    repos.org.listEmployees(args.wardId),
    repos.org.listShiftTypes(args.hospitalId),
    repos.org.listLeaveTypes(args.hospitalId),
    repos.roster.getSchedule(args.wardId, args.jYear, args.jMonth),
    repos.leave.listLeaveRequests(args.wardId),
    repos.workRecords.listWorkRecords(args.wardId, args.jYear, args.jMonth),
    repos.nursing.listPackages(args.hospitalId),
    repos.nursing.listRecords(args.wardId),
    repos.profiles.listProfiles(args.hospitalId),
    repos.settings.getSettings(args.hospitalId),
    repos.patients.listPatients(args.hospitalId),
    repos.patients.listAdmissions(args.wardId),
    repos.patients.listAssignments(args.wardId),
    repos.patients.listReports(args.wardId),
    repos.patients.listHandovers(args.wardId),
  ]);
  const entries = schedule ? await repos.roster.listEntries(schedule.id) : [];
  return { wards, employees, shiftTypes, leaveTypes, schedule, entries, leaves, workRecords, nursingPackages, nursingRecords, karanehProfiles, settings, patients, admissions, patientAssignments, patientReports, handovers };
}
