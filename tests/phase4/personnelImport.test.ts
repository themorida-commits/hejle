// تست‌های ایمپورتر لیست پرسنل.
import { describe, it, expect } from 'vitest';
import { parsePersonnelCsv, personnelTemplateCsv } from '../../src/features/import/personnelImport';

describe('parsePersonnelCsv', () => {
  it('ردیف‌های معتبر با سرفصل فارسی خوانده می‌شوند', () => {
    const csv = 'نام و نام خانوادگی,کد پرسنلی,سمت,سابقه خدمت (سال)\nزهرا محمدی,N-201,پرستار,6\nعلی کریمی,N-202,بهیار,۱۲';
    const r = parsePersonnelCsv(csv, 'ward-1');
    expect(r.personnel).toHaveLength(2);
    expect(r.personnel[0]).toMatchObject({ name: 'زهرا محمدی', personnelCode: 'N-201', seniorityLevel: 6, departmentId: 'ward-1' });
    expect(r.personnel[1]!.seniorityLevel).toBe(12); // ارقام فارسی هم خوانده می‌شوند
    expect(r.errors).toEqual([]);
  });
  it('نام یا کد خالی → خطا با شمارهٔ ردیف', () => {
    const csv = 'نام,کد پرسنلی\n,N-300\nسارا رضایی,';
    const r = parsePersonnelCsv(csv, 'w');
    expect(r.personnel).toHaveLength(0);
    expect(r.errors.map(e => e.row)).toEqual([2, 3]);
  });
  it('کد تکراری (داخل فایل یا موجود) رد و گزارش می‌شود', () => {
    const csv = 'نام,کد پرسنلی\nالف,N-1\nب,N-1\nج,N-9';
    const r = parsePersonnelCsv(csv, 'w', new Set(['N-9']));
    expect(r.personnel.map(p => p.personnelCode)).toEqual(['N-1']);
    expect(r.duplicateCodes).toEqual(['N-1', 'N-9']);
  });
  it('سرفصل گمشده → خطای روشن ردیف ۱', () => {
    const r = parsePersonnelCsv('foo,bar\n1,2', 'w');
    expect(r.errors[0]!.row).toBe(1);
  });
  it('قالب آماده خودش قابل خواندن است', () => {
    const r = parsePersonnelCsv(personnelTemplateCsv(), 'w');
    expect(r.personnel).toHaveLength(2);
    expect(r.errors).toEqual([]);
  });
  it('سرفصل انگلیسی هم پشتیبانی می‌شود', () => {
    const r = parsePersonnelCsv('name,personnel_code,role\nTest Person,X-1,Nurse', 'w');
    expect(r.personnel[0]).toMatchObject({ name: 'Test Person', personnelCode: 'X-1', role: 'Nurse' });
  });
});
