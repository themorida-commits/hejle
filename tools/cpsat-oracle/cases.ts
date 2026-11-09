// CP-SAT quality oracle — shared case definitions + fixture builder.
//
// The two oracle cases are the product's own golden-test cases:
//   dep1-mehr       = G1-2 (dep1 ward, Mehr 1405, default requirements)
//   dep1-mehr-reqs  = G1-8 (same ward/month, custom dailyReqs M=5/E=3/N=2)
// The reqs case is the one path where the CP-SAT spike (2026-11-09) beat the
// TS solver, so it is the oracle's canary.
//
// Fixtures are ALWAYS regenerated from the product code in this repo
// (export_fixtures.ts) — never hand-edited — so the oracle judges the solver
// exactly as it stands today, including the post-EN-fix category semantics.
import { createHash } from 'node:crypto';
import {
  generateScheduleDeterministic,
  type GenerateScheduleParams,
} from '../../src/core/scheduling/schedulerSolver';
import { categorizeShift, DEFAULT_RULE_CONFIGS } from '../../src/core/rules/engine';
import { calculateDutyHours, calculateShiftHoursDetailed } from '../../src/core/duty';
import { jalaliToGregorian, getDaysInJalaliMonth, getPersianDayOfWeek } from '../../src/core/jalali';
import { MOCK_PERSONNEL, MOCK_SHIFT_TYPES } from '../../src/fixtures/sampleData';
import {
  DEFAULT_RULES,
  DEFAULT_AI_SETTINGS,
  DEFAULT_GLOBAL_SETTINGS,
  holidaysFor,
} from '../../src/core/defaults';
import type { ScheduleEntry, StaffRequest } from '../../src/core/types';

export interface OracleCase {
  name: string;
  goldenCase: string;
  expectedGoldenHash: string;
  /** personnel scope in MOCK_PERSONNEL */
  departmentId: string;
  jYear: number;
  jMonth: number;
  dailyReqs?: { morning: number[]; evening: number[]; night: number[] };
  provenance: string;
}

export const ORACLE_CASES: OracleCase[] = [
  {
    name: 'dep1-mehr',
    goldenCase: 'G1-2',
    expectedGoldenHash:
      '9d390ab1974812343b74b393f12e73cca4bf5342a5bf47479cdd190faa2f52b1',
    departmentId: 'dep1',
    jYear: 1405,
    jMonth: 7,
    provenance:
      'G1-2 in tests/golden/solver.golden.test.ts: dep1 (14 staff), Mehr 1405, default requirements',
  },
  {
    name: 'dep1-mehr-reqs',
    goldenCase: 'G1-8',
    expectedGoldenHash:
      'fecbaa52db3ef81944b66aa96d0b143b7d20df33b90cdef3168a6e2729cb8ce7',
    departmentId: 'dep1',
    jYear: 1405,
    jMonth: 7,
    dailyReqs: {
      morning: Array(30).fill(5),
      evening: Array(30).fill(3),
      night: Array(30).fill(2),
    },
    provenance:
      'G1-8 in tests/golden/solver.golden.test.ts: dep1, Mehr 1405, dailyReqs M=5/E=3/N=2 every day',
  },
];

export function personnelForCase(c: OracleCase) {
  return MOCK_PERSONNEL.filter((p) => p.departmentId === c.departmentId);
}

export function buildSolverParams(c: OracleCase): GenerateScheduleParams {
  return {
    personnel: personnelForCase(c),
    shiftTypes: MOCK_SHIFT_TYPES,
    currentSchedule: [],
    requests: [],
    jYear: c.jYear,
    jMonth: c.jMonth,
    rules: DEFAULT_RULES,
    aiSettings: DEFAULT_AI_SETTINGS,
    globalSettings: DEFAULT_GLOBAL_SETTINGS,
    ...(c.dailyReqs ? { dailyReqs: c.dailyReqs } : {}),
  };
}

/** Same canonical hash as tests/golden/solver.golden.test.ts (scheduleHash). */
export function scheduleHash(entries: ScheduleEntry[]): string {
  const canonical = [...entries]
    .sort((a, b) => (a.personnelId + a.date).localeCompare(b.personnelId + b.date))
    .map((e) => `${e.personnelId}|${e.date}|${e.shiftTypeId}|${e.isManualEntry ? 1 : 0}`)
    .join('\n');
  return createHash('sha256').update(canonical).digest('hex');
}

function gdate(jy: number, jm: number, jd: number): string {
  const [gy, gm, gd] = jalaliToGregorian(jy, jm, jd);
  return `${gy}-${String(gm).padStart(2, '0')}-${String(gd).padStart(2, '0')}`;
}

// Start-of-shift hour on the day axis, mirroring schedulerSolver.shiftStartHour:
// morning 7, evening 13, pure night 19, combined evening+night (EN) 13; shifts
// the solver does not place on this axis (on-call etc.) get null.
const START_HOUR_BY_SYMBOL: Record<string, number> = { M: 7, E: 13, N: 19, EN: 13 };

export function buildFixture(c: OracleCase) {
  const { jYear, jMonth } = c;
  const daysInMonth = getDaysInJalaliMonth(jYear, jMonth);
  const holidays = new Set(holidaysFor(jYear, jMonth).map((h) => h.day));

  const days = [];
  let holidayCount = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const [gy, gm, gd] = jalaliToGregorian(jYear, jMonth, d);
    const isFriday = getPersianDayOfWeek(gy, gm, gd) === 'ج';
    const isHoliday = holidays.has(d);
    if (!isFriday && isHoliday) holidayCount++;
    days.push({ jDay: d, dateISO: gdate(jYear, jMonth, d), isFriday, isHoliday });
  }
  const holidayDeduction = holidayCount * 6;

  const hours: Record<string, number[]> = {};
  for (const st of MOCK_SHIFT_TYPES) {
    hours[st.id] = days.map((day) =>
      calculateShiftHoursDetailed(st, day.isFriday, day.isHoliday),
    );
  }

  const maxConcCfg = DEFAULT_RULE_CONFIGS.find(
    (r) => r.ruleType === 'max_consecutive_hours',
  );

  return {
    name: c.name,
    provenance: c.provenance,
    jYear,
    jMonth,
    daysInMonth,
    personnel: personnelForCase(c).map((p) => ({
      id: p.id,
      role: p.role,
      isHeadNurse: p.role.includes('سرپرستار'),
      seniorityLevel: p.seniorityLevel ?? 0,
      employmentStatus: p.employmentStatus,
      employmentDate: p.employmentDate,
      dutyTargetHours: calculateDutyHours(
        p,
        DEFAULT_GLOBAL_SETTINGS,
        holidayDeduction,
        jYear,
        jMonth,
      ),
    })),
    shiftTypes: MOCK_SHIFT_TYPES.map((s) => ({
      id: s.id,
      symbol: s.symbol,
      name: s.name,
      category: categorizeShift(s),
      realDuration: s.realDuration,
      calculatedValue: s.calculatedValue,
      startHour: START_HOUR_BY_SYMBOL[s.symbol] ?? null,
    })),
    days,
    hours,
    // Derived request/lock views consumed by checker.py + cpsat_model.py.
    // Both oracle cases are lock/request-free; the raw product-shaped copies
    // under solverSpec keep run_ts.ts general for future cases.
    requests: [] as Array<Record<string, unknown>>,
    locks: [] as Array<Record<string, unknown>>,
    dailyReqs: c.dailyReqs ?? null,
    aiSettings: DEFAULT_AI_SETTINGS,
    maxNights: DEFAULT_RULES.find((r) => r.type === 'max_consecutive_nights')?.value ?? 2,
    maxConsecutiveHours: maxConcCfg?.isEnabled ? maxConcCfg.value : null,
    solverSpec: {
      departmentId: c.departmentId,
      jYear,
      jMonth,
      dailyReqs: c.dailyReqs ?? null,
      requests: [] as StaffRequest[],
      locks: [] as ScheduleEntry[],
    },
  };
}

export type OracleFixture = ReturnType<typeof buildFixture>;

export function runProductSolver(c: OracleCase) {
  const t0 = performance.now();
  const out = generateScheduleDeterministic(buildSolverParams(c));
  const wallMs = performance.now() - t0;
  return { entries: out, wallMs, hash: scheduleHash(out) };
}
