// P0-05: برابری خروجی مسیر ورکر/جایگزین با هش‌های طلایی G1 — حل در هر مسیری همان نتیجه را می‌دهد.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { solveOnce } from '../src/core/scheduling/solveRequest';
import { ScheduleSolverClient } from '../src/services/scheduleSolverClient';
import { MOCK_PERSONNEL, MOCK_SHIFT_TYPES } from '../src/fixtures/sampleData';
import { DEFAULT_RULES, DEFAULT_AI_SETTINGS, DEFAULT_GLOBAL_SETTINGS } from '../src/core/defaults';
import type { ScheduleEntry, StaffRequest } from '../src/core/types';

function scheduleHash(entries: ScheduleEntry[]): string {
  const canonical = [...entries]
    .sort((a, b) => (a.personnelId + a.date).localeCompare(b.personnelId + b.date))
    .map(e => `${e.personnelId}|${e.date}|${e.shiftTypeId}|${e.isManualEntry ? 1 : 0}`)
    .join('\n');
  return createHash('sha256').update(canonical).digest('hex');
}

const dep1 = MOCK_PERSONNEL.filter(p => p.departmentId === 'dep1');
const params = {
  personnel: dep1,
  shiftTypes: MOCK_SHIFT_TYPES,
  currentSchedule: [] as ScheduleEntry[],
  requests: [] as StaffRequest[],
  rules: DEFAULT_RULES,
  aiSettings: DEFAULT_AI_SETTINGS,
  globalSettings: DEFAULT_GLOBAL_SETTINGS,
  jYear: 1405,
  jMonth: 7,
};

test('P0-05 solveOnce همان هش طلایی مهر را می‌دهد', () => {
  assert.equal(scheduleHash(solveOnce(params)), '9d390ab1974812343b74b393f12e73cca4bf5342a5bf47479cdd190faa2f52b1');
});

test('P0-05 کلاینت (مسیر جایگزین بدون ورکر در محیط تست) همان هش را می‌دهد', async () => {
  const client = new ScheduleSolverClient();
  const out = await client.solve(params);
  client.dispose();
  assert.equal(scheduleHash(out), '9d390ab1974812343b74b393f12e73cca4bf5342a5bf47479cdd190faa2f52b1');
});
