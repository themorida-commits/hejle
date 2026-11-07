// @ts-nocheck
/**
 * دور ۹ — جدول وزن‌های مسئولیتی کارانهٔ هر بیمارستان (دستور سعید ۲۰۲۶-۱۱-۰۷).
 * بیمارستان جدول خودش را دارد: بازنویسی‌ها در تنظیمات خودش می‌نشینند، روی
 * پیش‌فرض مستند وزارت بهداشت (ضرایب میانه، سند د جدول ۳) اعمال می‌شوند و
 * موتور توزیع دقیقاً با همان اعداد حساب می‌کند.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeHospitalSettings, hospitalSettingsToJson } from '../../src/services/data/settings';
import {
  MOH_KARANEH_1404, effectiveIndirectMultiples, computeNursingKaraneh, RESPONSIBILITY_ITEMS,
} from '../../src/features/performance/karanehEngine';

test('K1: نرمال‌سازی وزن‌ها — معتبرها می‌مانند، ناشناخته و خارج از بازه حذف می‌شوند', () => {
  const s = normalizeHospitalSettings({
    responsibilityWeights: { matron: 2.5, headNurse: 1.333, bogus: 2, supervisor: -1, deputy: 9, aide: 'x' },
  });
  assert.deepEqual(s.responsibilityWeights, { matron: 2.5, headNurse: 1.33 });
});

test('K2: رفت‌وبرگشت JSON تنظیمات، وزن‌ها را سالم نگه می‌دارد', () => {
  const s = normalizeHospitalSettings({ responsibilityWeights: { matron: 2.2 } });
  const back = normalizeHospitalSettings(hospitalSettingsToJson(s));
  assert.deepEqual(back.responsibilityWeights, { matron: 2.2 });
});

test('K3: ضرایب مؤثر — بازنویسی بیمارستان برنده است، بقیه پیش‌فرض سند می‌مانند', () => {
  const eff = effectiveIndirectMultiples({ matron: 3 });
  assert.equal(eff.matron, 3);
  assert.equal(eff.headNurse, MOH_KARANEH_1404.indirectMultiples.headNurse);
  assert.equal(eff.supervisor, MOH_KARANEH_1404.indirectMultiples.supervisor);
  assert.equal(RESPONSIBILITY_ITEMS.length, 8);
});

test('K4: موتور با وزن بیمارستان حساب می‌کند — امتیاز مترون متناسب با وزن تازه', () => {
  const people = [
    { employeeId: 'n1', rawQuantitative: 10, qualityScore: 1 },
    { employeeId: 'n2', rawQuantitative: 20, qualityScore: 1 },
    { employeeId: 'n3', rawQuantitative: 30, qualityScore: 1 },
    { employeeId: 'm1', indirectRole: 'matron' as const, qualityScore: 1, presenceFactor: 1 },
  ];
  // میانهٔ مستقیم‌ها = ۲۰ → پیش‌فرض: ۲۰×۱٫۹=۳۸ ؛ وزن بیمارستان ۳: ۲۰×۳=۶۰
  const base = computeNursingKaraneh(people, 1_000_000);
  assert.equal(base.find(r => r.employeeId === 'm1')?.points, 38);
  const custom = computeNursingKaraneh(people, 1_000_000, {
    ...MOH_KARANEH_1404,
    indirectMultiples: effectiveIndirectMultiples({ matron: 3 }),
  });
  assert.equal(custom.find(r => r.employeeId === 'm1')?.points, 60);
});
