// تست‌های پریست‌های پروفایل کارانه.
import { describe, it, expect } from 'vitest';
import { KARANEH_PRESETS, applyPreset } from '../../src/features/performance/karanehPresets';

describe('KARANEH_PRESETS', () => {
  it('هر سه نوع مرکز حاضرند و فقط قالب دولتی مبنای مستند دارد', () => {
    expect(KARANEH_PRESETS.map(p => p.id)).toEqual(['moh', 'private', 'army']);
    const moh = KARANEH_PRESETS[0]!;
    expect(moh.nursingShare).toBe(0.85); // سند الف: ۸۵٪ درآمد بسته‌های پرستاری
    expect(moh.onCallCoef).toBeGreaterThanOrEqual(3);
    expect(moh.onCallCoef).toBeLessThanOrEqual(5);
    // پریست ارتش باید صریح بگوید آیین‌نامه عمومی ندارد
    expect(KARANEH_PRESETS[2]!.note).toContain('منتشر نشده');
  });
  it('اعمال پریست فقط سهم و ضریب را عوض می‌کند و بقیهٔ پروفایل می‌ماند', () => {
    const profile = { nursingShare: 0.5, onCallCoef: 3, kRial: 250_000 };
    const next = applyPreset(profile, KARANEH_PRESETS[1]!);
    expect(next.nursingShare).toBe(0.85);
    expect(next.kRial).toBe(250_000);
    expect(next.presetId).toBe('private');
  });
});
