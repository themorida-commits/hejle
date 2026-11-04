import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { pickSessionContext, type MembershipRow } from '../../src/services/auth';

const H = 'aaaaaaaa-0000-4000-8000-000000000001';
const W1 = 'd1111111-1111-4111-8111-111111111111';
const W2 = 'd2222222-2222-4222-8222-222222222222';

const m = (role: MembershipRow['role'], ward_id: string | null, is_active = true): MembershipRow => ({
  hospital_id: H, ward_id, role, is_active,
});

describe('pickSessionContext', () => {
  it('عضویت غیرفعال یا خالی → null', () => {
    assert.equal(pickSessionContext([]), null);
    assert.equal(pickSessionContext([m('staff', W1, false)]), null);
  });

  it('تک‌عضویت فعال همان را برمی‌گرداند', () => {
    assert.deepEqual(pickSessionContext([m('staff', W1)]), { hospitalId: H, wardId: W1, role: 'staff' });
  });

  it('بخش ترجیحی بر نقش مقدم است', () => {
    const ctx = pickSessionContext([m('hospital_admin', null), m('staff', W2)], W2);
    assert.equal(ctx?.wardId, W2);
    assert.equal(ctx?.role, 'staff');
  });

  it('بدون بخش ترجیحی، سرپرستار بخش بر مدیر بیمارستان مقدم است', () => {
    const ctx = pickSessionContext([m('hospital_admin', null), m('ward_manager', W1)]);
    assert.equal(ctx?.role, 'ward_manager');
    assert.equal(ctx?.wardId, W1);
  });
});
