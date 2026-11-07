// @ts-nocheck
/**
 * دور ۸ — میز کار نقش‌ها: ناوبری نقش‌محور + صف مرخصی کل بیمارستان.
 * زمینه: پاسخ آقای حجله ۲۰۲۶-۱۱-۰۷ (زنجیرهٔ سرپرستار ← مترون ← اداری) و دستور سعید
 * همان روز: «فیچرهایی که نقش مترون احتیاج داره رو پیاده‌سازی کن؛ HR بیمارستان هم
 * توی محصول باشه» — نقش‌ها نباید فقط برچسب زنجیره باشند.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { navForRole, isHospitalLevelRole, ALL_NAV } from '../../src/features/oversight/roleNav';
import { buildHospitalQueue } from '../../src/features/oversight/hospitalQueue';

const paths = (role: string) => navForRole(role).map(n => n.to);

test('W1: مترون میز خودش را دارد — صف و نظارت هست، تنظیمات و پرونده و سلف‌سرویس نیست', () => {
  const p = paths('matron');
  assert.ok(p.includes('/leave') && p.includes('/scheduler') && p.includes('/work-records'));
  assert.ok(!p.includes('/settings') && !p.includes('/personnel') && !p.includes('/self-service'));
  assert.equal(isHospitalLevelRole('matron'), true);
});

test('W2: اداری (HR) میز خودش را دارد — پرونده و کارکرد هست، برنامهٔ شیفت و تنظیمات نیست', () => {
  const p = paths('hr_admin');
  assert.ok(p.includes('/personnel') && p.includes('/work-records') && p.includes('/leave') && p.includes('/attendance'));
  assert.ok(!p.includes('/scheduler') && !p.includes('/settings'));
  assert.equal(isHospitalLevelRole('hr_admin'), true);
});

test('W3: مدیر بیمارستان همه را دارد؛ پرستار فقط مرخصی و سلف‌سرویس؛ سرپرستار سطح بخش است', () => {
  assert.equal(navForRole('hospital_admin').length, ALL_NAV.length);
  assert.deepEqual(paths('staff').sort(), ['/leave', '/self-service']);
  assert.equal(isHospitalLevelRole('ward_manager'), false);
  assert.ok(paths('ward_manager').includes('/scheduler'));
});

const CHAIN = ['ward_manager', 'matron', 'hr_admin'];
const EMP = [
  { id: 'e1', fullName: 'پرستار یک', wardId: 'wA' },
  { id: 'e2', fullName: 'پرستار دو', wardId: 'wB' },
];
const WARDS = [{ id: 'wA', name: 'داخلی' }, { id: 'wB', name: 'جراحی' }];
const NOW = new Date('2026-11-07T12:00:00Z');
const req = (over: Record<string, unknown>) => ({
  id: 'r', hospitalId: 'h1', wardId: 'wA', employeeId: 'e1', leaveTypeCode: 'annual',
  startDate: '1405-08-20', endDate: '1405-08-22', isHourly: false, hours: null, reason: null,
  status: 'pending', reviewedBy: null, attachmentPath: null, approvalStep: 0, approvals: [],
  ...over,
});
const REQUESTS = [
  req({ id: 'r-step0', approvalStep: 0 }),
  req({ id: 'r-step1', wardId: 'wB', employeeId: 'e2', approvalStep: 1 }),
  req({ id: 'r-done', status: 'approved', approvals: [{ step: 2, role: 'hr_admin', by: 'x', decision: 'approved', at: '2026-11-02T09:00:00Z' }] }),
  req({ id: 'r-old', status: 'approved', approvals: [{ step: 2, role: 'hr_admin', by: 'x', decision: 'approved', at: '2026-09-01T09:00:00Z' }] }),
  req({ id: 'r-rej', status: 'rejected', approvals: [{ step: 0, role: 'ward_manager', by: 'x', decision: 'rejected', at: '2026-11-05T09:00:00Z' }] }),
];
const build = (actorRole: string) => buildHospitalQueue({
  requests: REQUESTS, employees: EMP, wards: WARDS, chain: CHAIN, actorRole, now: NOW,
});

test('W4: صف مترون — فقط گام خودش از همهٔ بخش‌ها؛ نهاییِ تازه در بایگانی، کهنه نه', () => {
  const q = build('matron');
  assert.deepEqual(q.mine.map(i => i.request.id), ['r-step1']);
  assert.equal(q.mine[0].wardName, 'جراحی');
  assert.equal(q.pending.length, 2);
  assert.deepEqual(q.finalizedRecent.map(i => i.request.id), ['r-done']);
});

test('W5: صف اداری خالی از گام (هنوز چیزی به او نرسیده) و مدیر بیمارستان همه را در گام خود می‌بیند', () => {
  assert.equal(build('hr_admin').mine.length, 0);
  assert.equal(build('hospital_admin').mine.length, 2);
});
