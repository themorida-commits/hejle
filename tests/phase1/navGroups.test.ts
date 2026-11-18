import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALL_NAV, navForRole, navGroupsForRole } from '../../src/features/oversight/roleNav';

// گروه‌بندی سایدبار (دور ۲۴) فقط ارائه است: نباید هیچ حقی بسازد یا کم کند —
// اجتماع آیتم‌های گروه‌ها برای هر نقش باید دقیقاً همان navForRole باشد.
test('NG-1: اجتماع گروه‌ها برای هر نقش دقیقاً navForRole است، بدون تکرار', () => {
  for (const role of ['hospital_admin', 'matron', 'hr_admin', 'ward_manager', 'staff', 'unknown-role']) {
    const grouped = navGroupsForRole(role).flatMap(g => g.items.map(i => i.to));
    const flat = navForRole(role).map(i => i.to);
    assert.deepEqual([...grouped].sort(), [...flat].sort(), role);
    assert.equal(new Set(grouped).size, grouped.length, `تکرار در ${role}`);
  }
});

test('NG-2: صفحهٔ تأییدها در گروه خودش است و فقط نقش‌های تأییدکننده می‌بینندش', () => {
  const wm = navGroupsForRole('ward_manager');
  const approvalsGroup = wm.find(g => g.id === 'approvals')!;
  assert.ok(approvalsGroup.items.some(i => i.to === '/approvals'));
  assert.ok(approvalsGroup.items.some(i => i.to === '/leave'));
  for (const role of ['matron', 'hr_admin', 'hospital_admin']) {
    assert.ok(navForRole(role).some(i => i.to === '/approvals'), role);
  }
  assert.ok(!navForRole('staff').some(i => i.to === '/approvals'));
});

test('NG-3: مدیر بیمارستان همهٔ مسیرها را در گروه‌ها می‌بیند', () => {
  const grouped = navGroupsForRole('hospital_admin').flatMap(g => g.items.map(i => i.to));
  assert.equal(grouped.length, ALL_NAV.length);
});
