// تست‌های موتور کارانه — مثال‌های عددی عین گزارش تحقیق از اسناد وزارت بهداشت.
import { describe, it, expect } from 'vitest';
import {
  MOH_KARANEH_1404, computeGroupPools, physicianShareM, physicianQ,
  computePhysicianKaraneh, nonPhysicianPoints, distributePool,
  nursingEntryPoints, computeNursingKaraneh, nursingQualityFactor, median,
} from '../../src/features/performance/karanehEngine';
import {
  DEFAULT_NURSING_PACKAGES, effectiveStatus, recordedTariffRevenue,
  quantitativePointsByNurse, wardRecordingHealth, type NursingServiceRecord,
} from '../../src/features/nursingServices/nursingService';

describe('استخرهای گروهی — سند الف', () => {
  it('سهم پرستاری ۸۵٪ درآمد بسته‌ها و غیرپزشک ۱۰٫۵٪ + ۴٪ است', () => {
    const pools = computeGroupPools(100_000_000_000, 40_000_000_000, 0);
    expect(pools.nursing).toBe(34_000_000_000);
    expect(pools.nonPhysician).toBe(10_500_000_000 + 1_600_000_000);
    expect(pools.physiciansCap).toBe(63_000_000_000);
  });
});

describe('پزشک — سند ب: P = M × Q', () => {
  it('پلکان تجمیعی برخوردار: ۵۰۰ میلیون اول با ۷۰٪', () => {
    expect(physicianShareM(500, 'developed')).toBe(350);
    expect(physicianShareM(1000, 'developed')).toBe(350 + 350);
    expect(physicianShareM(1500, 'developed')).toBe(700 + 325);
  });
  it('Q: امتیاز ۴۰ → ۵۰٪؛ ۷۵ → ۷۵٪؛ ۹۵ → ۱۰۰٪', () => {
    expect(physicianQ(40)).toBe(0.5);
    expect(physicianQ(75)).toBe(0.75);
    expect(physicianQ(95)).toBe(1);
  });
  it('فرمول کامل: کارکرد ۵۰۰، برخوردار، کیفی ۴۰ → ۱۷۵ میلیون ریال', () => {
    expect(computePhysicianKaraneh(500, 'developed', 40)).toBe(175);
  });
});

describe('غیرپزشک — سند ج: مثال خود گزارش (کارشناس رادیولوژی)', () => {
  it('امتیاز = ۵٫۵ × ۱٫۴۵ × ۱٫۱۸ × ۱٫۰ × ۱٫۰ × ۱٫۷ ≈ ۱۶٫۰۰', () => {
    const pts = nonPhysicianPoints({
      employeeId: 'x', jobCoef: 5.5, degree: 'bachelor', seniorityYears: 12,
      quality: 1.0, presenceRatio: 1.0, serviceKind: 'diagnostic', group: 'diagnostic',
    });
    expect(Math.round(pts * 100) / 100).toBe(16.0);
  });
  it('تسهیم: از استخر ۱۰ میلیارد با مجموع ۸۰۰۰ امتیاز → ۲۰ میلیون ریال', () => {
    const rows = distributePool(
      [{ employeeId: 'rad', points: 16 }, { employeeId: 'rest', points: 7984 }],
      10_000_000_000,
    );
    expect(rows.find(r => r.employeeId === 'rad')!.amount).toBe(20_000_000);
  });
  it('سقف حضور اداری ۱٫۵ اعمال می‌شود ولی تشخیصی نه', () => {
    const admin = nonPhysicianPoints({ employeeId: 'a', jobCoef: 1, degree: 'belowDiploma', seniorityYears: 0, quality: 1, presenceRatio: 2, serviceKind: 'other', group: 'admin' });
    const diag = nonPhysicianPoints({ employeeId: 'd', jobCoef: 1, degree: 'belowDiploma', seniorityYears: 0, quality: 1, presenceRatio: 2, serviceKind: 'other', group: 'diagnostic' });
    expect(admin).toBeCloseTo(1 * 1 * 1 * 1 * 1.5 * 1.2);
    expect(diag).toBeCloseTo(1 * 1 * 1 * 1 * 2 * 1.2);
  });
});

describe('پرستاری — سند د', () => {
  it('امتیاز گروه مراقبتی و ضریب شب ۱٫۵', () => {
    expect(nursingEntryPoints({ careGroup: 6, patients: 4, shift: 'morning' })).toBe(52);
    expect(nursingEntryPoints({ careGroup: 6, patients: 4, shift: 'night' })).toBe(78);
    expect(nursingEntryPoints({ triageLevel: 1, patients: 2, shift: 'morning' })).toBe(22);
    expect(nursingEntryPoints({ orMinutes: 90, patients: 1, shift: 'morning' })).toBe(9);
  });
  it('کیفی: کف ۰٫۸ و سقف غیرمستقیم ۱٫۰', () => {
    expect(nursingQualityFactor(0.5, false)).toBe(0.8);
    expect(nursingQualityFactor(1.1, false)).toBe(1.1);
    expect(nursingQualityFactor(1.1, true)).toBe(1.0);
  });
  it('سقف ۲٫۵ برابر میانه + غیرمستقیم‌ها بر مبنای میانه + جمع تسهیم = استخر', () => {
    const rows = computeNursingKaraneh([
      { employeeId: 'n1', rawQuantitative: 100, qualityScore: 1 },
      { employeeId: 'n2', rawQuantitative: 100, qualityScore: 1 },
      { employeeId: 'n3', rawQuantitative: 100, qualityScore: 1 },
      { employeeId: 'n4', rawQuantitative: 1000, qualityScore: 1 }, // باید روی ۲۵۰ سقف بخورد
      { employeeId: 'head', indirectRole: 'headNurse', qualityScore: 1, presenceFactor: 1 },
    ], 1_000_000_000);
    // میانهٔ مستقیم‌ها = ۱۰۰ → سقف ۲۵۰؛ سرپرستار = ۱٫۳ × ۱۰۰ = ۱۳۰
    expect(rows.find(r => r.employeeId === 'n4')!.cappedQuantitative).toBe(250);
    expect(rows.find(r => r.employeeId === 'head')!.cappedQuantitative).toBe(130);
    const total = rows.reduce((s, r) => s + r.amount, 0);
    expect(Math.round(total)).toBe(1_000_000_000);
  });
  it('میانه', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
});

describe('ثبت خدمات پرستاری', () => {
  const now = '2026-09-26T12:00:00.000Z';
  const rec = (over: Partial<NursingServiceRecord>): NursingServiceRecord => ({
    id: 'r1', wardId: 'd1', employeeId: 'e1', patientRef: 'P-1', packageId: 'pkg-dialysis',
    count: 1, dateISO: '2026-09-23', shift: 'morning', status: 'recorded',
    recordedAtISO: '2026-09-23T10:00:00.000Z', ...over,
  });
  it('تأیید خودکار بعد از دو روز', () => {
    expect(effectiveStatus(rec({}), now)).toBe('auto_confirmed');
    expect(effectiveStatus(rec({ recordedAtISO: '2026-09-26T10:00:00.000Z' }), now)).toBe('recorded');
  });
  it('درآمد تعرفه‌ای فقط از ثبت‌های نهایی: دیالیز ۶K × ضریب ۲۰۱٬۰۰۰ (مثال ۱۴۰۲)', () => {
    const { totalK, revenueRials } = recordedTariffRevenue(
      [rec({ status: 'confirmed' }), rec({ id: 'r2', status: 'recorded', recordedAtISO: '2026-09-26T11:00:00.000Z' })],
      DEFAULT_NURSING_PACKAGES, 201_000, now,
    );
    expect(totalK).toBe(6);
    expect(revenueRials).toBe(1_206_000);
  });
  it('امتیاز کمی پرستار از ثبت‌ها با ضریب شب', () => {
    const m = quantitativePointsByNurse([
      rec({ status: 'confirmed', packageId: 'pkg-g6', count: 2, shift: 'night' }),
    ], DEFAULT_NURSING_PACKAGES, now);
    expect(m.get('e1')).toBe(13 * 2 * 1.5);
  });
  it('داشبورد کسورات: پوشش و درآمد در معرض خطر', () => {
    const expected = [
      { employeeId: 'e1', dateISO: '2026-09-23', shift: 'morning' as const },
      { employeeId: 'e1', dateISO: '2026-09-24', shift: 'morning' as const },
    ];
    const h = wardRecordingHealth('d1', expected, [rec({ status: 'confirmed' })], DEFAULT_NURSING_PACKAGES, 200_000, 10, now);
    expect(h.coveragePercent).toBe(50);
    expect(h.estimatedRevenueAtRiskRials).toBe(1 * 10 * 200_000);
  });
});
