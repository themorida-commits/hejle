// تست لایهٔ داده: صفحه‌بندی خواندن (درس سقف PostgREST)، نگاشت‌ها، و قرارداد دمو.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fetchAllPages, createSupabaseRepositories } from '../../src/services/data/supabaseRepositories';
import { createDemoRepositories, buildDemoSnapshot } from '../../src/services/data/demoRepositories';
import { snapshotToState } from '../../src/store/appStore';
import type { SupabaseClient } from '@supabase/supabase-js';

test('D-1 fetchAllPages تا صفحهٔ کوتاه ادامه می‌دهد (۳ صفحه: ۵۰۰+۵۰۰+۲۰۰)', async () => {
  const pages = [500, 500, 200];
  let call = 0;
  const rows = await fetchAllPages(async (from: number) => {
    const size = pages[call++]!;
    return { data: Array.from({ length: size }, (_, i) => from + i), error: null };
  });
  assert.equal(rows.length, 1200);
  assert.equal(call, 3);
});

test('D-2 fetchAllPages خطای سرور را پرتاب می‌کند', async () => {
  await assert.rejects(
    fetchAllPages(async () => ({ data: null, error: { message: 'boom' } })),
    /boom/,
  );
});

// کلاینت جعلی زنجیره‌ای برای اثبات شکل کوئری‌ها و نگاشت ردیف‌ها
function fakeClient(tables: Record<string, unknown[]>) {
  const calls: { table: string; method: string }[] = [];
  const makeBuilder = (table: string) => {
    const builder: Record<string, unknown> = {};
    const rows = tables[table] ?? [];
    let result: unknown[] = rows;
    const chain = (name: string) => (..._args: unknown[]) => { calls.push({ table, method: name }); return builder; };
    builder.select = chain('select');
    builder.eq = chain('eq');
    builder.order = chain('order');
    builder.range = (from: number, to: number) => { calls.push({ table, method: 'range' }); result = rows.slice(from, to + 1); return Promise.resolve({ data: result, error: null }); };
    builder.maybeSingle = () => Promise.resolve({ data: rows[0] ?? null, error: null });
    builder.single = () => Promise.resolve({ data: rows[0] ?? null, error: null });
    builder.insert = () => builder;
    builder.update = () => builder;
    builder.upsert = () => Promise.resolve({ error: null });
    return builder;
  };
  return { client: { from: (t: string) => makeBuilder(t) } as unknown as SupabaseClient, calls };
}

test('D-3 ریپازیتوری سوپابیس: خواندن کارمندان با نگاشت سمت و فیلدها', async () => {
  const { client } = fakeClient({
    employees: [{
      id: 'e1', hospital_id: 'h1', ward_id: 'w1', profile_id: null, full_name: 'سارا رضایی',
      personnel_code: 'P-1', positions: { title: 'سرپرستار' }, employment_status: 'رسمی',
      employment_start_jalali: '1395/02/01', base_duty_hours_override: null, is_active: true,
    }],
  });
  const repos = createSupabaseRepositories(client);
  const emps = await repos.org.listEmployees('w1');
  assert.equal(emps.length, 1);
  assert.equal(emps[0]!.fullName, 'سارا رضایی');
  assert.equal(emps[0]!.roleTitle, 'سرپرستار');
});

test('D-4 دمو: عکس اولیه ۴۲ کارمند، ۳ بخش و ۴۲۰ ردیف برنامهٔ بخش داخلی دارد', () => {
  const snap = buildDemoSnapshot();
  assert.equal(snap.wards.length, 3);
  assert.equal(snap.employees.length, 42);
  assert.equal(snap.entries.length, 420);
  assert.ok(snap.entries.every(e => e.jDay >= 1 && e.jDay <= 30));
});

test('D-5 دمو: چرخهٔ مرخصی روی اینترفیس ریپازیتوری (ساخت ← لیست ← تأیید)', async () => {
  const repos = createDemoRepositories();
  const created = await repos.leave.createLeaveRequest({
    hospitalId: 'demo-hospital', wardId: 'dep1', employeeId: 'p2', leaveTypeCode: 'annual',
    startDate: '2026-10-01', endDate: '2026-10-02', isHourly: false, hours: null, reason: null,
  });
  assert.equal(created.status, 'pending');
  await repos.leave.updateLeaveStatus(created.id, 'approved', 'p1');
  const list = await repos.leave.listLeaveRequests('dep1');
  assert.equal(list.length, 1);
  assert.equal(list[0]!.status, 'approved');
  assert.equal(list[0]!.reviewedBy, 'p1');
});

test('D-6 نگاشت عکس به وضعیت استور: پرسنل و ردیف‌ها سالم می‌رسند', () => {
  const state = snapshotToState(buildDemoSnapshot());
  assert.equal(state.personnel.length, 42);
  assert.equal(state.entries.length, 420);
  assert.equal(state.departments.length, 3);
  const p1 = state.personnel.find(p => p.id === 'p1')!;
  assert.equal(p1.role, 'سرپرستار');
  assert.equal(p1.departmentId, 'dep1');
});

test('D-N1 ریپازیتوری دمو پرستاری: سید بسته‌ها و ثبت‌ها از اسنپ‌شات می‌آید', async () => {
  const repos = createDemoRepositories();
  const packages = await repos.nursing.listPackages('demo-hospital');
  assert.ok(packages.length >= 10);
  const records = await repos.nursing.listRecords('dep1');
  assert.ok(records.length > 0);
  assert.ok(records.every(r => r.wardId === 'dep1'));
});

test('D-N2 چرخهٔ ثبت و تأیید خدمت پرستاری در ریپازیتوری', async () => {
  const repos = createDemoRepositories();
  const created = await repos.nursing.createRecord({
    hospitalId: 'demo-hospital', wardId: 'dep1', employeeId: 'p2', patientRef: 'P-77',
    packageId: 'pkg-g4', count: 3, serviceDate: '2026-09-25', shift: 'night',
    status: 'recorded', confirmedBy: null, confirmedAt: null,
  });
  assert.equal(created.status, 'recorded');
  await repos.nursing.confirmRecord(created.id, 'p1');
  const after = (await repos.nursing.listRecords('dep1')).find(r => r.id === created.id);
  assert.equal(after?.status, 'confirmed');
  assert.equal(after?.confirmedBy, 'p1');
});

test('D-N3 ورود گروهی پرسنل: کد تکراری رد می‌شود', async () => {
  const repos = createDemoRepositories();
  const before = await repos.org.listEmployees('dep1');
  const created = await repos.org.createEmployees([
    {
      id: 'imp-T-1', hospitalId: 'demo-hospital', wardId: 'dep1', profileId: null,
      fullName: 'تست ورود', personnelCode: 'T-1', roleTitle: 'پرستار',
      employmentStatus: 'رسمی', employmentStartJalali: null, baseDutyHoursOverride: null, isActive: true,
    },
    {
      id: 'imp-dup', hospitalId: 'demo-hospital', wardId: 'dep1', profileId: null,
      fullName: 'تکراری', personnelCode: before[0]!.personnelCode, roleTitle: 'پرستار',
      employmentStatus: 'رسمی', employmentStartJalali: null, baseDutyHoursOverride: null, isActive: true,
    },
  ]);
  assert.equal(created.length, 1);
  assert.equal(created[0]!.personnelCode, 'T-1');
});

test('D-N4 اسنپ‌شات به وضعیت استور: بسته‌ها و ثبت‌های پرستاری نگاشت می‌شوند', () => {
  const state = snapshotToState(buildDemoSnapshot());
  assert.ok(state.nursingPackages.length >= 10);
  assert.ok(state.nursingRecords.length > 0);
  assert.ok(state.nursingRecords.every(r => typeof r.packageId === 'string' && r.packageId.length > 0));
});

test('D-K1 پروفایل کارانهٔ دمو: سید پیش‌فرض وزارت بهداشت در اسنپ‌شات هست', async () => {
  const repos = createDemoRepositories();
  const profiles = await repos.profiles.listProfiles('demo-hospital');
  assert.equal(profiles.length, 1);
  assert.equal(profiles[0]!.isDefault, true);
  assert.equal(profiles[0]!.nursingShare, 0.85);
  const state = snapshotToState(buildDemoSnapshot());
  assert.equal(state.karanehProfiles.length, 1);
});

test('D-K2 پروفایل کارانه: ذخیره و جابه‌جایی پیش‌فرض — دقیقاً یک پیش‌فرض می‌ماند', async () => {
  const repos = createDemoRepositories();
  const saved = await repos.profiles.saveProfile({
    id: 'kp-test-1', hospitalId: 'demo-hospital', name: 'پروفایل خصوصی',
    presetId: 'private', nursingShare: 0.8, onCallCoef: 3.5, kRial: 250000, isDefault: false,
  });
  assert.equal(saved.name, 'پروفایل خصوصی');
  await repos.profiles.setDefaultProfile('demo-hospital', 'kp-test-1');
  const profiles = await repos.profiles.listProfiles('demo-hospital');
  assert.equal(profiles.filter(p => p.isDefault).length, 1);
  assert.equal(profiles.find(p => p.isDefault)!.id, 'kp-test-1');
  // ذخیرهٔ ویرایش همان پروفایل، رکورد تازه نمی‌سازد
  await repos.profiles.saveProfile({ ...saved, kRial: 260000 });
  const after = await repos.profiles.listProfiles('demo-hospital');
  assert.equal(after.length, 2);
  assert.equal(after.find(p => p.id === 'kp-test-1')!.kRial, 260000);
});
