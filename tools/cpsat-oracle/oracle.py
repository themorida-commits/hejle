"""CP-SAT quality oracle for the Hejleh roster solver.

For each fixture in fixtures/ (regenerated from the product's own code by
export_fixtures.ts):
  1. runs the product TS solver on the fixture (run_ts.ts, current code);
  2. runs CP-SAT with a FIXED 30s budget (cpsat_model.py);
  3. scores BOTH outputs with the shared checker (checker.py: post-EN-fix,
     category-based semantics + ts_score replication);
  4. emits a per-case verdict.

VERDICT RULES (deterministic, CI-safe):
  FAIL if, on any case,
    - the TS output carries MORE avoidable violations of any hard kind than
      the CP-SAT solution (per-kind comparison; lock/manual-forced violations
      are excluded — locks outrank recovery in product semantics), or
    - ts_score(TS) > ts_score(CP-SAT best) * 1.05.
  PASS otherwise.

Exit codes: 0 = PASS, 1 = FAIL (a real product-quality finding),
2 = oracle error (e.g. CP-SAT infeasible even in soft mode, or no incumbent
within budget) — an oracle error NEVER reads as a product PASS.

CP-SAT under a time budget yields a best-known incumbent, not ground truth;
see README-fa.md for the honest limits.
"""
import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parents[1]
FIXTURES_DIR = HERE / 'fixtures'
BUDGET_S = 30
SCORE_TOLERANCE = 1.05

sys.path.insert(0, str(HERE))
import checker  # noqa: E402
import cpsat_model  # noqa: E402


def run_ts_solver(fixture_path: Path):
    proc = subprocess.run(
        ['node', '--import', 'tsx', str(HERE / 'run_ts.ts'), str(fixture_path)],
        cwd=REPO_ROOT, capture_output=True, text=True,
    )
    if proc.returncode != 0:
        raise RuntimeError(f'TS runner failed: {proc.stderr.strip()[-500:]}')
    return json.loads(proc.stdout)


def fmt_kinds(d):
    parts = [f'{k}={v}' for k, v in d.items() if v]
    return ', '.join(parts) if parts else '-'


def judge_case(fx):
    """Returns (verdict, lines, ts_stats, cp_stats, cp_meta)."""
    ts_out = run_ts_solver(FIXTURES_DIR / f"{fx['name']}.json")
    ts_stats = checker.check(fx, ts_out['entries'])

    cp = cpsat_model.build_and_solve(fx, BUDGET_S, soft_recovery=False)
    cp_mode = 'hard'
    if cp['status'] == 'INFEASIBLE':
        # Lock-conflict case: reprice recovery/consec instead of forbidding
        # (locks outrank the rules in product semantics).
        cp = cpsat_model.build_and_solve(fx, BUDGET_S, soft_recovery=True)
        cp_mode = 'soft-recovery (fallback after INFEASIBLE)'
    if cp['status'] not in ('OPTIMAL', 'FEASIBLE'):
        return 'ORACLE-ERROR', [
            f"  CP-SAT produced no incumbent within {BUDGET_S}s "
            f"(status={cp['status']}, mode={cp_mode}) — cannot judge this case."
        ], ts_stats, None, cp
    cp_stats = checker.check(fx, cp['entries'])

    reasons = []
    for kind in checker.HARD_KINDS:
        t = ts_stats['violations_avoidable'].get(kind, 0)
        c = cp_stats['violations_avoidable'].get(kind, 0)
        if t > c:
            reasons.append(f'avoidable {kind}: TS={t} > CP-SAT={c}')
    if ts_stats['ts_score'] > cp_stats['ts_score'] * SCORE_TOLERANCE:
        reasons.append(
            f"ts_score: TS={ts_stats['ts_score']:.0f} > "
            f"CP-SAT={cp_stats['ts_score']:.0f} x {SCORE_TOLERANCE} "
            f"= {cp_stats['ts_score'] * SCORE_TOLERANCE:.0f}")
    verdict = 'FAIL' if reasons else 'PASS'

    golden = ts_out.get('hashMatchesGolden')
    lines = [
        f"  TS    wall={ts_out['wallMs']:.0f}ms hash={ts_out['hash'][:12]} "
        f"goldenMatch={golden} ts_score={ts_stats['ts_score']:.0f} "
        f"avoidable[{fmt_kinds(ts_stats['violations_avoidable'])}] "
        f"forced[{fmt_kinds(ts_stats['violations_forced'])}]",
        f"  CP    wall={cp['wall_s']:.1f}s status={cp['status']} ({cp_mode}) "
        f"bound={cp.get('best_bound', float('nan')):.0f} "
        f"ts_score={cp_stats['ts_score']:.0f} "
        f"avoidable[{fmt_kinds(cp_stats['violations_avoidable'])}] "
        f"forced[{fmt_kinds(cp_stats['violations_forced'])}]",
    ]
    for r in reasons:
        lines.append(f'  FAIL reason: {r}')
    lines.append(f'  => {verdict}')
    return verdict, lines, ts_stats, cp_stats, cp


def main():
    fixture_files = sorted(FIXTURES_DIR.glob('*.json'))
    if not fixture_files:
        print('ORACLE-ERROR: no fixtures found — run export_fixtures.ts first.')
        return 2
    print(f'=== CP-SAT quality oracle — CP-SAT budget {BUDGET_S}s/case, '
          f'score tolerance x{SCORE_TOLERANCE} ===')
    overall_fail = False
    overall_error = False
    for path in fixture_files:
        fx = checker.load_fixture(path)
        print(f"[{fx['name']}] ({fx.get('provenance', '')})")
        try:
            verdict, lines, _, _, _ = judge_case(fx)
        except Exception as e:  # runner/model crash = oracle error, never PASS
            print(f'  ORACLE-ERROR: {e}')
            overall_error = True
            continue
        for line in lines:
            print(line)
        if verdict == 'FAIL':
            overall_fail = True
        elif verdict == 'ORACLE-ERROR':
            overall_error = True
    if overall_error:
        print('OVERALL: ORACLE-ERROR (exit 2)')
        return 2
    if overall_fail:
        print('OVERALL: FAIL (exit 1) — the TS solver left avoidable quality on the table.')
        return 1
    print('OVERALL: PASS (exit 0)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
