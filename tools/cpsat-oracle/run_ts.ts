// CP-SAT quality oracle — TS solver runner.
// Runs the product solver (current code in this repo) on one exported fixture
// and prints a single JSON document to stdout for oracle.py:
//   { entries: [{personnelId, dateISO, shiftTypeId, isManualEntry}],
//     wallMs, hash, expectedGoldenHash, hashMatchesGolden }
//
// The solver inputs are rebuilt from the fixture's embedded solverSpec using
// the product's own modules, so the run always reflects today's solver,
// defaults and sample data — never a recorded output.
//
// Run: node --import tsx tools/cpsat-oracle/run_ts.ts tools/cpsat-oracle/fixtures/<case>.json
import { readFileSync } from 'node:fs';
import { generateScheduleDeterministic } from '../../src/core/scheduling/schedulerSolver';
import { MOCK_PERSONNEL, MOCK_SHIFT_TYPES } from '../../src/fixtures/sampleData';
import {
  DEFAULT_RULES,
  DEFAULT_AI_SETTINGS,
  DEFAULT_GLOBAL_SETTINGS,
} from '../../src/core/defaults';
import { scheduleHash, type OracleFixture } from './cases';

const fixturePath = process.argv[2];
if (!fixturePath) {
  console.error('usage: run_ts.ts <fixture.json>');
  process.exit(2);
}
const fx = JSON.parse(readFileSync(fixturePath, 'utf8')) as OracleFixture & {
  provenanceHeader?: { expectedGoldenHash?: string };
};
const spec = fx.solverSpec;

const t0 = performance.now();
const out = generateScheduleDeterministic({
  personnel: MOCK_PERSONNEL.filter((p) => p.departmentId === spec.departmentId),
  shiftTypes: MOCK_SHIFT_TYPES,
  currentSchedule: spec.locks,
  requests: spec.requests,
  jYear: spec.jYear,
  jMonth: spec.jMonth,
  rules: DEFAULT_RULES,
  aiSettings: DEFAULT_AI_SETTINGS,
  globalSettings: DEFAULT_GLOBAL_SETTINGS,
  ...(spec.dailyReqs ? { dailyReqs: spec.dailyReqs } : {}),
});
const wallMs = performance.now() - t0;
const hash = scheduleHash(out);
const expectedGoldenHash = fx.provenanceHeader?.expectedGoldenHash ?? null;

process.stdout.write(
  JSON.stringify({
    fixture: fx.name,
    solver: 'generateScheduleDeterministic (product TS, current code)',
    wallMs: Math.round(wallMs * 10) / 10,
    hash,
    expectedGoldenHash,
    hashMatchesGolden: expectedGoldenHash ? hash === expectedGoldenHash : null,
    entries: out.map((e) => ({
      personnelId: e.personnelId,
      dateISO: e.date,
      shiftTypeId: e.shiftTypeId,
      isManualEntry: !!e.isManualEntry,
    })),
  }),
);
