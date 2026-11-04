// تست‌های قفل صلاحیت در روس‌تر.
import { describe, it, expect } from 'vitest';
import { credentialGate, type Credential } from '../../src/features/credentials/credentialService';

const TODAY = '2026-09-23';
const cred = (over: Partial<Credential>): Credential => ({
  id: Math.random().toString(36).slice(2), employeeId: 'e1', kind: 'license',
  title: 'پروانهٔ اشتغال', expiresOnISO: '2027-01-01', ...over,
});

describe('credentialGate', () => {
  it('پروانهٔ منقضی بدون جایگزین معتبر → منع', () => {
    const g = credentialGate(['e1'], [cred({ expiresOnISO: '2026-01-01' })], TODAY);
    expect(g.blocked.map(b => b.employeeId)).toEqual(['e1']);
    expect(g.eligibleIds).toEqual([]);
  });
  it('پروانهٔ منقضی + پروانهٔ معتبر تازه → منع نیست', () => {
    const g = credentialGate(['e1'], [
      cred({ id: 'old', expiresOnISO: '2025-01-01' }),
      cred({ id: 'new', expiresOnISO: '2028-01-01' }),
    ], TODAY);
    expect(g.blocked).toEqual([]);
    expect(g.eligibleIds).toEqual(['e1']);
  });
  it('پروانهٔ در آستانهٔ انقضا → فقط هشدار', () => {
    const g = credentialGate(['e1'], [cred({ expiresOnISO: '2026-10-15' })], TODAY);
    expect(g.blocked).toEqual([]);
    expect(g.warnings[0]?.employeeId).toBe('e1');
  });
  it('گواهی منقضی (غیرپروانه) → هشدار، نه منع', () => {
    const g = credentialGate(['e1'], [
      cred({}),
      cred({ id: 'c2', kind: 'certificate', title: 'کنترل عفونت', expiresOnISO: '2026-01-01' }),
    ], TODAY);
    expect(g.blocked).toEqual([]);
    expect(g.warnings[0]?.reasons.join(' ')).toContain('کنترل عفونت');
  });
  it('بدون هیچ مدرکی → هشدارِ نبود پروانه، نه منع', () => {
    const g = credentialGate(['e9'], [], TODAY);
    expect(g.blocked).toEqual([]);
    expect(g.eligibleIds).toEqual(['e9']);
    expect(g.warnings[0]?.reasons.join(' ')).toContain('ثبت نشده');
  });
});
