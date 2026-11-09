// دور ۱۷: لایهٔ ایجنت فاز ۱ — قراردادها:
// (۱) copilot آیین‌نامه روی golden set سؤال‌های واقعی فارسی به مدخل درست می‌رسد؛
// (۲) سؤال ناشناخته پاسخ مستند ندارد (null، بدون citation)؛ (۳) قفل Zone D:
// هیچ‌یک از اکشن‌های «هرگز» ابزار نیست و همهٔ ابزارهای فاز ۱ Zone A هستند؛
// (۴) رادار مدارک بازه‌بندی قطعی دارد؛ (۵) اسکن ناهنجاری چهار پرچم را از روی
// fact می‌سازد و دادهٔ سالم پرچم ندارد؛ (۶) ریپازیتوری دمو ردّ اجرا نگه می‌دارد.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  AGENT_TOOLS, ZONE_D_ACTIONS, zoneOf, answerPolicyQuestion, askPolicy,
  credentialRadar, anomalyScan, explainAnomaly,
  type CredentialRadar,
} from '../../src/features/agents/agentCore';
import { POLICY_CORPUS } from '../../src/features/agents/policyCorpus';
import type { Credential } from '../../src/features/credentials/credentialService';
import { createDemoRepositories, DEMO_HOSPITAL_ID } from '../../src/services/data/demoRepositories';

const GOLDEN: [string, string][] = [
  ['ساعت موظفی هفته چقدر است؟', 'weekly_hours'],
  ['سقف اضافه‌کار ماهانه چقدر است؟', 'overtime_cap'],
  ['ضریب شیفت شب چقدر است؟', 'shift_coefficients'],
  ['عصر با چه ضریبی حساب می‌شود؟', 'shift_coefficients'],
  ['حداکثر چند ساعت می‌شود پشت سر هم کار کرد؟', 'consecutive_limits'],
  ['استراحت بین دو شیفت چقدر است؟', 'consecutive_limits'],
  ['حداکثر چند شب متوالی می‌شود شیفت داد؟', 'consecutive_nights'],
  ['مرخصی استحقاقی سالانه چند روز است؟', 'leave_types_quotas'],
  ['مرخصی زایمان چقدر است؟', 'leave_types_quotas'],
  ['استعلاجی تا چند روز می‌شود گرفت؟', 'leave_types_quotas'],
  ['مرخصی را چه کسی تأیید می‌کند؟', 'approval_chain'],
  ['مرخصی ساعتی چطور حساب می‌شود؟', 'hourly_leave'],
  ['چرا سرپرستار شیفت شب ندارد؟', 'head_nurse_law'],
  ['کارانه چطور بین پرسنل تقسیم می‌شود؟', 'karaneh_shape'],
  ['وزن مسئولیتی یعنی چه؟', 'karaneh_shape'],
  ['تعرفهٔ خدمات پرستاری چطور حساب می‌شود؟', 'nursing_tariff'],
  ['پروانه‌اش منقضی شده، می‌تواند شیفت بگیرد؟', 'credential_gate'],
  ['کارکرد ماهانه چطور محاسبه می‌شود؟', 'work_record_closing'],
  ['جابه‌جایی شیفت چطور انجام می‌شود؟', 'swap_rules'],
];

test('AG-1 copilot آیین‌نامه: golden set سؤال‌های فارسی به مدخل درست می‌رسد', () => {
  for (const [q, expectedId] of GOLDEN) {
    const m = answerPolicyQuestion(POLICY_CORPUS, q);
    assert.ok(m, `بدون پاسخ: ${q}`);
    assert.equal(m.entry.id, expectedId, `سؤال «${q}» به ${m.entry.id} رسید، انتظار ${expectedId}`);
    assert.ok(m.entry.citation.length > 0, 'پاسخ مستند citation دارد');
  }
});

test('AG-2 سؤال ناشناخته: null و پاسخ «بدون سند» — هرگز citation ساخته نمی‌شود', () => {
  assert.equal(answerPolicyQuestion(POLICY_CORPUS, 'قیمت بلیت هواپیما به مشهد چقدر است؟'), null);
  assert.equal(answerPolicyQuestion(POLICY_CORPUS, 'هوای امروز تهران چطور است؟'), null);
  const ans = askPolicy(POLICY_CORPUS, 'بهترین رستوران نزدیک بیمارستان کجاست؟');
  assert.equal(ans.kind, 'none');
});

test('AG-3 قفل Zone D: اکشن‌های «هرگز» ابزار نیستند؛ فاز ۱ فقط Zone A', () => {
  const toolKeys = new Set(AGENT_TOOLS.map(t => t.key));
  for (const d of ZONE_D_ACTIONS) assert.ok(!toolKeys.has(d), `Zone D نباید ابزار باشد: ${d}`);
  for (const t of AGENT_TOOLS) {
    assert.ok(['A', 'B', 'C'].includes(t.zone));
    assert.equal(t.zone, 'A', `ابزار فاز ۱ باید Zone A باشد: ${t.key}`);
    assert.equal(zoneOf(t.key), 'A');
  }
  assert.equal(zoneOf('karaneh_amount_finalize'), null);
});

const cred = (id: string, emp: string, daysFromToday: number | null): Credential => ({
  id, employeeId: emp, kind: 'license', title: `مدرک ${id}`,
  ...(daysFromToday === null ? {} : {
    expiresOnISO: new Date(Date.parse('2026-01-01') + daysFromToday * 86400000).toISOString().slice(0, 10),
  }),
});

test('AG-4 رادار مدارک: بازه‌های منقضی/۳۰/۶۰/۹۰ قطعی و مرتب', () => {
  const employees = [{ id: 'e1', name: 'نفر یک' }, { id: 'e2', name: 'نفر دو' }];
  const radar: CredentialRadar = credentialRadar([
    cred('c-exp', 'e1', -12),
    cred('c-10', 'e1', 10),
    cred('c-45', 'e2', 45),
    cred('c-80', 'e2', 80),
    cred('c-200', 'e1', 200),
    cred('c-none', 'e2', null),
  ], employees, '2026-01-01');
  assert.equal(radar.tracked, 5);
  assert.deepEqual(radar.counts, { expired: 1, d30: 1, d60: 1, d90: 1 });
  assert.deepEqual(radar.rows.map(r => r.credentialId), ['c-exp', 'c-10', 'c-45', 'c-80']);
  assert.equal(radar.rows[0].bucket, 'expired');
  assert.equal(radar.rows[0].daysLeft, -12);
  assert.equal(radar.rows[1].employeeName, 'نفر یک');
});

test('AG-5 اسکن ناهنجاری: چهار پرچم از روی fact؛ دادهٔ سالم خالی', () => {
  const anomalies = anomalyScan({
    jYear: 1405, jMonth: 7,
    records: [
      { employeeId: 'e1', employeeName: 'نفر یک', overtimeHours: 95, status: 'approved' },
      { employeeId: 'e2', employeeName: 'نفر دو', overtimeHours: 10, status: 'draft' },
    ],
    expectedEmployees: [{ id: 'e1', name: 'نفر یک' }, { id: 'e2', name: 'نفر دو' }, { id: 'e4', name: 'نفر چهار' }],
    leaveUsage: [{ employeeId: 'e3', employeeName: 'نفر سه', leaveTypeName: 'استحقاقی', usedDays: 35, quotaDays: 30 }],
  });
  const kinds = anomalies.map(a => `${a.kind}:${a.employeeId}`).sort();
  assert.deepEqual(kinds, [
    'leave_over_quota:e3', 'missing_record:e4', 'overtime_over_cap:e1', 'unfinalized_record:e2',
  ]);
  for (const a of anomalies) {
    assert.ok(a.message.includes(a.employeeName));
    assert.ok(explainAnomaly(a).length > 10);
  }
  const clean = anomalyScan({
    jYear: 1405, jMonth: 7,
    records: [{ employeeId: 'e1', employeeName: 'نفر یک', overtimeHours: 40, status: 'exported' }],
    expectedEmployees: [{ id: 'e1', name: 'نفر یک' }],
    leaveUsage: [{ employeeId: 'e1', employeeName: 'نفر یک', leaveTypeName: 'استحقاقی', usedDays: 10, quotaDays: 30 }],
  });
  assert.deepEqual(clean, []);
});

test('AG-6 ریپازیتوری دمو: ردّ اجرای ایجنت ذخیره و خوانده می‌شود؛ پیش‌نویس تصمیم می‌گیرد', async () => {
  const repos = createDemoRepositories();
  const run = await repos.agents.createRun({
    hospitalId: DEMO_HOSPITAL_ID, agentKey: 'policy_lookup', zone: 'A',
    input: { question: 'سقف اضافه‌کار؟' }, output: { answerKind: 'answer', entryId: 'overtime_cap' },
    citations: [{ title: 'سقف اضافه‌کار ماهانه', source: 'موتور قوانین حجله' }],
    model: null, status: 'done', createdBy: null,
  });
  assert.ok(run.id.startsWith('demo-run-'));
  const runs = await repos.agents.listRuns(DEMO_HOSPITAL_ID);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].agentKey, 'policy_lookup');
  const draft = await repos.agents.createDraft({
    hospitalId: DEMO_HOSPITAL_ID, runId: run.id, kind: 'note',
    payload: { text: 'x' }, status: 'draft', decidedBy: null, decidedAt: null,
  });
  await repos.agents.decideDraft(draft.id, 'approved', 'user-1', new Date().toISOString());
  const drafts = await repos.agents.listDrafts(DEMO_HOSPITAL_ID);
  assert.equal(drafts[0].status, 'approved');
  assert.equal(drafts[0].decidedBy, 'user-1');
});
