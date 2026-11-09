// CP-SAT quality oracle — fixture exporter.
// Regenerates fixtures/*.json from THIS repo's product code (see cases.ts) and
// stamps each file with a provenance header. Also re-runs the product solver
// at export time and refuses to write a fixture whose solver output no longer
// matches the locked golden hash — that would mean the "golden case" the
// oracle claims to test is not the case it actually built.
//
// Run: node --import tsx tools/cpsat-oracle/export_fixtures.ts
import { writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ORACLE_CASES, buildFixture, runProductSolver } from './cases';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(HERE, 'fixtures');

function gitCommit(): string | null {
  try {
    return execSync('git rev-parse HEAD', { cwd: join(HERE, '..', '..') })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

let failed = false;
for (const c of ORACLE_CASES) {
  const fixture = buildFixture(c);
  const { hash, wallMs } = runProductSolver(c);
  const hashMatchesGolden = hash === c.expectedGoldenHash;
  if (!hashMatchesGolden) failed = true;

  const stamped = {
    ...fixture,
    provenanceHeader: {
      generatedBy: 'tools/cpsat-oracle/export_fixtures.ts',
      generatedAt: new Date().toISOString(),
      gitCommit: gitCommit(),
      goldenCase: c.goldenCase,
      expectedGoldenHash: c.expectedGoldenHash,
      tsHashAtExport: hash,
      hashMatchesGolden,
      productSources: [
        'src/core/scheduling/schedulerSolver.ts',
        'src/core/scheduling/conflictDetector.ts',
        'src/core/rules/engine.ts',
        'src/core/duty.ts',
        'src/core/defaults.ts',
        'src/fixtures/sampleData.ts',
      ],
    },
  };
  writeFileSync(join(FIXTURES_DIR, `${c.name}.json`), JSON.stringify(stamped, null, 1));
  console.log(
    `${c.name}: staff=${fixture.personnel.length} days=${fixture.daysInMonth} ` +
      `tsWallAtExport=${wallMs.toFixed(0)}ms hash=${hash.slice(0, 12)} goldenMatch=${hashMatchesGolden}`,
  );
}
if (failed) {
  console.error('ERROR: a regenerated case no longer matches its golden hash — fixture NOT trustworthy.');
  process.exit(1);
}
console.log('fixtures written to', FIXTURES_DIR);
