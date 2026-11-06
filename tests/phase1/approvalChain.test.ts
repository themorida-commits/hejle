// تست زنجیرهٔ تأیید چندمرحله‌ای مرخصی + نرمال‌سازی تنظیمات بیمارستان.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  canActOnLeave, applyChainApproval, applyChainRejection, chainStepRole,
  type LeaveRequest,
} from '../../src/features/leave/leaveService';
import { normalizeHospitalSettings } from '../../src/services/data/settings';

const req = (patch: Partial<LeaveRequest> = {}): LeaveRequest => ({
  id: 'lv-1', employeeId: 'emp-1', leaveTypeCode: 'annual',
  startISO: '2026-09-23', endISO: '2026-09-25', status: 'pending',
  approvalStep: 0, approvals: [],
  ...patch,
});
const CHAIN = ['ward_manager', 'hospital_admin'];
const mgr = { employeeId: 'mgr-1', role: 'ward_manager' };
const admin = { employeeId: 'adm-1', role: 'hospital_admin' };
const DAY = '2026-09-20';

test('C1 زنجیرهٔ تک‌گامی = رفتار قبلی: تأیید سرپرستار نهایی است', () => {
  const out = applyChainApproval(['ward_manager'], req(), mgr, DAY);
  assert.equal(out.finalApproved, true);
  assert.equal(out.request.status, 'approved');
  assert.equal(out.request.approvals?.length, 1);
});

test('C2 دو گام: گام اول وضعیت را pending نگه می‌دارد و گام را جلو می‌برد', () => {
  const s1 = applyChainApproval(CHAIN, req(), mgr, DAY);
  assert.equal(s1.finalApproved, false);
  assert.equal(s1.request.status, 'pending');
  assert.equal(s1.request.approvalStep, 1);
  assert.equal(chainStepRole(CHAIN, s1.request), 'hospital_admin');
  const s2 = applyChainApproval(CHAIN, s1.request, admin, DAY);
  assert.equal(s2.finalApproved, true);
  assert.equal(s2.request.status, 'approved');
  assert.equal(s2.request.approvals?.length, 2);
});

test('C3 رد در گام دوم نهایی است و تاریخچه هر دو اقدام می‌ماند', () => {
  const s1 = applyChainApproval(CHAIN, req(), mgr, DAY).request;
  const rj = applyChainRejection(CHAIN, s1, admin, DAY).request;
  assert.equal(rj.status, 'rejected');
  assert.equal(rj.approvals?.length, 2);
  assert.equal(rj.approvals?.[1]?.decision, 'rejected');
});

test('C4 گاردها: خودتأییدی ممنوع، نقش اشتباه ممنوع، مافوق مجاز', () => {
  assert.equal(canActOnLeave(CHAIN, req(), { employeeId: 'emp-1', role: 'ward_manager' }).ok, false);
  assert.equal(canActOnLeave(CHAIN, req(), admin).ok, true); // مافوق در هر گام
  assert.equal(canActOnLeave(CHAIN, req({ approvalStep: 1 }), mgr).ok, false); // گام ۲ نوبت مدیر بیمارستان است، نه سرپرستار
  assert.equal(canActOnLeave(CHAIN, req(), { employeeId: 'x', role: 'hr_admin' }).ok, false);
  assert.equal(canActOnLeave(CHAIN, req({ status: 'approved' }), mgr).ok, false);
});

test('C5 نرمال‌سازی تنظیمات: خراب → پیش‌فرض امن؛ army → زنجیره و جدول خوانده می‌شود', () => {
  const d = normalizeHospitalSettings(null);
  assert.deepEqual(d.approvalChain, ['ward_manager']);
  assert.ok(d.globalDuty.seniorityDeductions.length > 0);
  const a = normalizeHospitalSettings({
    leaveApprovalChain: ['ward_manager', 'hospital_admin', 'bogus'],
    globalDuty: { seniorityDeductions: [{ minMonths: 0, maxMonths: 48, deduction: 4.33 }] },
  });
  assert.deepEqual(a.approvalChain, ['ward_manager', 'hospital_admin']);
  assert.equal(a.globalDuty.seniorityDeductions[0]?.deduction, 4.33);
  const empty = normalizeHospitalSettings({ leaveApprovalChain: [] });
  assert.deepEqual(empty.approvalChain, ['ward_manager']);
});
