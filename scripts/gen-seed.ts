// تولید supabase/seed.sql از دادهٔ نمونهٔ پروژه + خروجی حل‌کننده —
// اجرا: npx tsx scripts/gen-seed.ts > supabase/seed.sql
// سید یک بیمارستان دمو می‌سازد: ۳ بخش، ۴۲ پرسنل، انواع شیفت، انواع مرخصی،
// مجموعهٔ قواعد پیش‌فرض قانون بهره‌وری و برنامهٔ مهر ۱۴۰۵ بخش داخلی.
import { buildDemoSnapshot, DEMO_HOSPITAL_ID } from '../src/services/data/demoRepositories';
import { DEFAULT_RULE_CONFIGS } from '../src/core/rules/engine';

const HOSPITAL = 'aaaaaaaa-0000-4000-8000-000000000001';
const RULE_SET = 'f0000000-0000-4000-8000-000000000001';
const SCHEDULE = '5c000000-0000-4000-8000-000000000001';

const wardUuid = (id: string) => ({ dep1: 'd1111111-1111-4111-8111-111111111111', dep2: 'd2222222-2222-4222-8222-222222222222', dep3: 'd3333333-3333-4333-8333-333333333333' })[id]!;
const empUuid = (id: string) => `e0000000-0000-4000-8000-${id.replace('p', '').padStart(12, '0')}`;
const shiftUuid = (id: string, idx: number) => `50000000-0000-4000-8000-${String(idx + 1).padStart(12, '0')}`;
const ltUuid = (code: string) => ({ annual: '70000000-0000-4000-8000-000000000001', sick: '70000000-0000-4000-8000-000000000002', unpaid: '70000000-0000-4000-8000-000000000003', mission: '70000000-0000-4000-8000-000000000004' })[code as 'annual']!;

const q = (v: string | number | boolean | null) =>
  v === null ? 'null' : typeof v === 'number' || typeof v === 'boolean' ? String(v) : `'${String(v).replaceAll("'", "''")}'`;

const snap = buildDemoSnapshot();
const shiftIdMap = new Map(snap.shiftTypes.map((s, i) => [s.id, shiftUuid(s.id, i)]));
const out: string[] = [];
out.push('-- سید دمو حجله v2 — تولیدشده با scripts/gen-seed.ts از دادهٔ نمونهٔ پروژه.');
out.push('-- روی دیتابیس تستی/پایلوت اجرا شود، نه به‌عنوان مایگریشن.');
out.push(`insert into public.hospitals (id, name, code) values (${q(HOSPITAL)}, 'بیمارستان دمو حجله', 'DEMO') on conflict (id) do nothing;`);
for (const w of snap.wards) {
  out.push(`insert into public.wards (id, hospital_id, name) values (${q(wardUuid(w.id))}, ${q(HOSPITAL)}, ${q(w.name)});`);
}
const roles = [...new Set(snap.employees.map(e => e.roleTitle ?? 'پرستار'))];
const posUuid = (idx: number) => `60000000-0000-4000-8000-${String(idx + 1).padStart(12, '0')}`;
roles.forEach((r, i) => {
  out.push(`insert into public.positions (id, hospital_id, title) values (${q(posUuid(i))}, ${q(HOSPITAL)}, ${q(r)});`);
});
for (const e of snap.employees) {
  const pos = posUuid(roles.indexOf(e.roleTitle ?? 'پرستار'));
  out.push(`insert into public.employees (id, hospital_id, ward_id, position_id, full_name, personnel_code, employment_status, employment_start_jalali, base_duty_hours_override) values (${q(empUuid(e.id))}, ${q(HOSPITAL)}, ${q(wardUuid(e.wardId))}, ${q(pos)}, ${q(e.fullName)}, ${q(e.personnelCode)}, ${q(e.employmentStatus)}, ${q(e.employmentStartJalali)}, ${q(e.baseDutyHoursOverride)});`);
}
snap.shiftTypes.forEach((s, i) => {
  out.push(`insert into public.shift_types (id, hospital_id, name, symbol, real_duration_hours, calculated_value, friday_value, holiday_value, color) values (${q(shiftUuid(s.id, i))}, ${q(HOSPITAL)}, ${q(s.name)}, ${q(s.symbol)}, ${q(s.realDurationHours)}, ${q(s.calculatedValue)}, ${q(s.fridayValue)}, ${q(s.holidayValue)}, ${q(s.color)});`);
});
for (const lt of snap.leaveTypes) {
  out.push(`insert into public.leave_types (id, hospital_id, code, name, is_paid, annual_quota_days, requires_coverage) values (${q(ltUuid(lt.code))}, ${q(HOSPITAL)}, ${q(lt.code)}, ${q(lt.name)}, ${q(lt.isPaid)}, ${q(lt.annualQuotaDays)}, ${q(lt.requiresCoverage)});`);
}
out.push(`insert into public.rule_sets (id, hospital_id, name) values (${q(RULE_SET)}, ${q(HOSPITAL)}, 'پیش‌فرض قانون بهره‌وری');`);
DEFAULT_RULE_CONFIGS.forEach((c, i) => {
  out.push(`insert into public.rules (id, rule_set_id, hospital_id, rule_type, params, severity, is_enabled) values ('f1000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}', ${q(RULE_SET)}, ${q(HOSPITAL)}, ${q(c.ruleType)}, ${q(JSON.stringify(c.value != null ? { value: c.value } : {}))}::jsonb, ${q(c.severity)}, ${q(c.isEnabled)});`);
});
out.push(`insert into public.schedules (id, hospital_id, ward_id, j_year, j_month, status) values (${q(SCHEDULE)}, ${q(HOSPITAL)}, ${q(wardUuid('dep1'))}, 1405, 7, 'draft');`);
snap.entries.forEach((e, i) => {
  out.push(`insert into public.schedule_entries (id, schedule_id, hospital_id, ward_id, employee_id, entry_date, j_day, shift_type_id, is_manual, is_locked) values ('90000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}', ${q(SCHEDULE)}, ${q(HOSPITAL)}, ${q(wardUuid('dep1'))}, ${q(empUuid(e.employeeId))}, ${q(e.entryDate)}, ${q(e.jDay)}, ${q(shiftIdMap.get(e.shiftTypeId)!)}, ${q(e.isManual)}, false);`);
});
void DEMO_HOSPITAL_ID;
console.log(out.join('\n'));
