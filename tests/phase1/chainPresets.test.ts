// تست پیش‌فرض‌های بخشی زنجیرهٔ تأیید مرخصی (پژوهش زنجیره‌ها، ۲۰۲۶-۱۱-۰۶).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CHAIN_PRESETS, matchChainPreset, normalizeHospitalSettings, hospitalSettingsToJson,
} from '../../src/services/data/settings';

test('P1: هر سه پیش‌فرض بخشی وجود دارد و زنجیره‌شان معتبر است', () => {
  assert.deepEqual(CHAIN_PRESETS.map(p => p.id), ['government', 'private', 'army']);
  const known = new Set(['ward_manager', 'hospital_admin', 'hr_admin']);
  for (const p of CHAIN_PRESETS) {
    assert.ok(p.chain.length >= 1 && p.chain.length <= 4, `${p.id}: طول زنجیره`);
    assert.ok(p.chain.every(r => known.has(r)), `${p.id}: فقط نقش‌های شناخته‌شده و غیر staff`);
    assert.equal(p.chain[0], 'ward_manager', `${p.id}: گام اول همیشه مسئول بخش/سرپرستار است`);
  }
});

test('P2: پیش‌فرض خصوصی مسیر منابع انسانی را پیش از مدیریت دارد', () => {
  const priv = CHAIN_PRESETS.find(p => p.id === 'private')!;
  assert.deepEqual(priv.chain, ['ward_manager', 'hr_admin', 'hospital_admin']);
});

test('P3: پیش‌فرض نیروهای مسلح هشدار «پیش‌فرض عمومی ندارد» را حمل می‌کند', () => {
  const army = CHAIN_PRESETS.find(p => p.id === 'army')!;
  assert.ok(army.note.includes('پیش‌فرض عمومی ندارد'));
  assert.ok(army.note.includes('آیین‌نامهٔ داخلی'));
});

test('P4: تطبیق زنجیره با پیش‌فرض — رفت‌وبرگشت و حالت سفارشی', () => {
  for (const p of CHAIN_PRESETS) {
    if (p.id === 'army') continue; // زنجیرهٔ ارتش با دولتی نقش‌های یکسان دارد؛ ابهام ذاتی است (P6)
    assert.equal(matchChainPreset([...p.chain])?.id, p.id);
  }
  // ابهام مستند: زنجیرهٔ ارتش از روی نقش‌ها از دولتی قابل تشخیص نیست و تطبیق، دولتی برمی‌گرداند؛
  // برای همین بخشِ انتخاب‌شده جداگانه در chainPresetId ذخیره می‌شود (P6).
  const army = CHAIN_PRESETS.find(p => p.id === 'army')!;
  assert.equal(matchChainPreset([...army.chain])?.id, 'government');
  assert.equal(matchChainPreset(['ward_manager']), null);
  assert.equal(matchChainPreset(['hr_admin', 'hospital_admin']), null);
  assert.equal(matchChainPreset([]), null);
});

test('P6: ‏chainPresetId در نرمال‌سازی و سریال‌سازی رفت‌وبرگشت می‌کند و مقدار نامعتبر رد می‌شود', () => {
  for (const id of ['government', 'private', 'army'] as const) {
    const s = normalizeHospitalSettings({ chainPresetId: id });
    assert.equal(s.chainPresetId, id);
    const back = normalizeHospitalSettings(hospitalSettingsToJson(s));
    assert.equal(back.chainPresetId, id);
  }
  assert.equal(normalizeHospitalSettings({ chainPresetId: 'nonsense' }).chainPresetId, null);
  assert.equal(normalizeHospitalSettings(null).chainPresetId, null);
});

test('P7: نقش «مترون» در زنجیره معتبر است — زنجیرهٔ واقعی بوعلی سالم رد می‌شود', () => {
  // پاسخ آقای حجله ۲۰۲۶-۱۱-۰۷: فرم ← سرپرستار ← مترون ← اداری بیمارستان
  const s = normalizeHospitalSettings({ leaveApprovalChain: ['ward_manager', 'matron', 'hr_admin'] });
  assert.deepEqual(s.approvalChain, ['ward_manager', 'matron', 'hr_admin']);
});

test('P5: زنجیرهٔ هر پیش‌فرض از نرمال‌سازی تنظیمات سالم رد می‌شود', () => {
  for (const p of CHAIN_PRESETS) {
    const s = normalizeHospitalSettings({ leaveApprovalChain: [...p.chain] });
    assert.deepEqual(s.approvalChain, [...p.chain], `${p.id}: نرمال‌سازی نباید زنجیره را عوض کند`);
  }
});
