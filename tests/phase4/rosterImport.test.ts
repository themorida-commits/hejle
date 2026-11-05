// تست‌های ایمپورتر روس‌تر تاریخی (فرمت شبکه‌ای).
import { describe, it, expect } from 'vitest';
import { buildSymbolResolver, parseRosterGridCsv, rosterGridTemplateCsv } from '../../src/features/import/rosterImport';
import { MOCK_PERSONNEL, MOCK_SHIFT_TYPES } from '../../src/fixtures/sampleData';

const dep1 = MOCK_PERSONNEL.filter(p => p.departmentId === 'dep1');
const resolve = buildSymbolResolver(MOCK_SHIFT_TYPES);
const ctx = { jYear: 1405, jMonth: 7, personnel: dep1, resolve };

describe('buildSymbolResolver', () => {
  it('نماد، نام فارسی و آف حل می‌شوند', () => {
    expect(resolve('M')).toBe('s-m');
    expect(resolve('شب')).toBe('s-n');
    expect(resolve('مرخصی')).toBe('s-h');
    expect(resolve('آف')).toBe('OFF');
    expect(resolve('XYZ')).toBeNull();
  });
});

describe('parseRosterGridCsv', () => {
  it('شبکه با روزهای فارسی و نمادهای مخلوط خوانده می‌شود', () => {
    const p = dep1[0]!;
    const csv = `نام,کد پرسنلی,۱,۲,۳\n${p.name},${p.personnelCode},M,شب,آف`;
    const r = parseRosterGridCsv(csv, ctx);
    expect(r.errors).toEqual([]);
    expect(r.entries).toHaveLength(2);
    expect(r.entries[0]).toMatchObject({ personnelId: p.id, shiftTypeId: 's-m', isManualEntry: true });
    expect(r.entries[1]!.shiftTypeId).toBe('s-n');
    expect(r.stats.offCells).toBe(1);
  });
  it('کد ناشناخته خطا و نماد ناشناخته هشدار می‌دهد', () => {
    const p = dep1[1]!;
    const csv = `نام,کد پرسنلی,1,2\nالف,XX-9,M,E\nب,${p.personnelCode},M,QQ`;
    const r = parseRosterGridCsv(csv, ctx);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]!.message).toContain('XX-9');
    expect(r.warnings).toEqual([{ row: 3, day: 2, token: 'QQ' }]);
    expect(r.entries).toHaveLength(1);
  });
  it('قالب آماده برای همهٔ پرسنل بخش ردیف دارد و خودش پارس می‌شود', () => {
    const tpl = rosterGridTemplateCsv(dep1, 1405, 7);
    const r = parseRosterGridCsv(tpl, ctx);
    expect(r.errors).toEqual([]);
    expect(r.stats.people).toBe(dep1.length);
    expect(r.entries).toHaveLength(0); // سلول‌ها خالی‌اند
  });
});
