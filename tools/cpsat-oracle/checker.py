"""Shared schedule checker for the Hejleh CP-SAT quality oracle.

Adapted from the 2026-11-09 CP-SAT spike checker, updated to the product's
POST-EN-FIX semantics (Round 20): every "night" notion is category-based via
the fixture's per-shift `category` (exported from the product's own
`categorizeShift`), exactly as schedulerSolver.ts and conflictDetector.ts
behave today:

  - recovery: ANY night-category shift (pure night, EN combined, night
    on-call) followed by a non-off day is a violation;
  - consecutive nights: counted on the night category, mixed sequences
    included;
  - rest-after-night penalty in ts_score: night end tracked for every
    night-category shift (+31 abs hours, the solver's convention);
  - evening->morning: still the pure-evening -> pure-morning pair only
    (EN->morning is covered by the stronger recovery rule), as in the
    product;
  - shift_too_long: single-shift realDuration above the rules-engine
    max_consecutive_hours cap — the detector's post-fix per-cell check.

ts_score replicates the TS solver's trial evaluation (schedulerSolver.ts,
"Evaluate the trial schedule") in the product's own cost units, so both
solvers' outputs are compared on the product's own scale. The oracle
fixtures use DEFAULT_AI_SETTINGS (distribution 'even'), for which the
evaluation's seniority bonus terms are zero; the deviation weight is 15
(5 only under the 'seniority' distribution mode, which no fixture uses).

Violations are returned per instance, split into:
  - avoidable: produced by the solver's own choices;
  - forced:    at least one cell of the violating pattern is a locked /
               manual entry present in the input (locks outrank recovery in
               product semantics — spike finding, VERDICT-fa.md §4.3).
Requirement underfill is always counted avoidable: locks only ever add or
pin assignments, and neither oracle case carries locks; treat a future
lock-heavy fixture's underfill numbers with that caveat in mind.
"""
import json
from collections import defaultdict

# Violation kinds that take part in the oracle verdict (detector-severity
# classes + coverage). pref_mismatch is a soft preference, reported only.
HARD_KINDS = (
    'recovery',
    'evening_morning',
    'consec_nights',
    'leave',
    'headnurse_fri_holiday',
    'headnurse_weekday',
    'shift_too_long',
    'underfilled',
)


def load_fixture(path):
    with open(path) as f:
        return json.load(f)


def compute_requirements(fx):
    """Replicates schedulerSolver.ts requirement logic exactly.

    Returns req[dateISO][category] = int for morning/evening/night.
    """
    days = fx['days']
    personnel = fx['personnel']
    leave = {(r['personnelId'], r['dateISO']) for r in fx['requests'] if r['type'] == 'Leave'}
    cat_of = {s['id']: s['category'] for s in fx['shiftTypes']}
    reqs = {}
    if fx.get('dailyReqs'):
        dr = fx['dailyReqs']
        for i, day in enumerate(days):
            reqs[day['dateISO']] = {
                'morning': dr['morning'][i] if i < len(dr['morning']) else 0,
                'evening': dr['evening'][i] if i < len(dr['evening']) else 0,
                'night': dr['night'][i] if i < len(dr['night']) else 0,
            }
        return reqs, cat_of
    for day in days:
        active = 0
        for p in personnel:
            if p['isHeadNurse'] and (day['isFriday'] or day['isHoliday']):
                continue
            if (p['id'], day['dateISO']) in leave:
                continue
            active += 1
        req_n = 2 if active >= 6 else (1 if active >= 3 else 0)
        req_e = int(active * 0.25)
        req_m = int(active * 0.35)
        if req_m == 0 and active > 0:
            req_m = 1
        reqs[day['dateISO']] = {'morning': req_m, 'evening': req_e, 'night': req_n}
    return reqs, cat_of


def check(fx, entries):
    days = fx['days']
    personnel = {p['id']: p for p in fx['personnel']}
    cat_of = {s['id']: s['category'] for s in fx['shiftTypes']}
    dur_of = {s['id']: s['realDuration'] for s in fx['shiftTypes']}
    start_of = {s['id']: s.get('startHour') for s in fx['shiftTypes']}
    off_id = next((s['id'] for s in fx['shiftTypes'] if s['symbol'] == '-'), 's-off')
    morning_id = next((s['id'] for s in fx['shiftTypes'] if s['symbol'] == 'M'), 's-m')
    evening_id = next((s['id'] for s in fx['shiftTypes'] if s['symbol'] == 'E'), 's-e')
    reqs, _ = compute_requirements(fx)
    leave = {(r['personnelId'], r['dateISO']) for r in fx['requests'] if r['type'] == 'Leave'}
    prefs = {(r['personnelId'], r['dateISO']): r.get('preferredShiftId')
             for r in fx['requests'] if r['type'] == 'Preferred Shift'}
    sched = {(e['personnelId'], e['dateISO']): e['shiftTypeId'] for e in entries}
    # A cell is "locked" if the fixture input pins it or the produced entry is
    # flagged manual (both solvers preserve manual entries verbatim).
    locked = {(l['personnelId'], l['dateISO']) for l in fx.get('locks', [])}
    locked |= {(e['personnelId'], e['dateISO']) for e in entries if e.get('isManualEntry')}
    max_nights = fx.get('maxNights', 2)
    max_consec_hours = fx.get('maxConsecutiveHours')
    min_rest = fx['aiSettings'].get('minRestHours', 24)

    instances = []  # {kind, personnelId, dayIndex, forced}

    def add(kind, pid, day_index, forced):
        instances.append({'kind': kind, 'personnelId': pid,
                          'dayIndex': day_index, 'forced': bool(forced)})

    # --- requirement fulfillment -------------------------------------------
    under = over = 0
    for di, day in enumerate(days):
        counts = defaultdict(int)
        for pid in personnel:
            s = sched.get((pid, day['dateISO']))
            if s and cat_of.get(s) in ('morning', 'evening', 'night'):
                counts[cat_of[s]] += 1
        for c in ('morning', 'evening', 'night'):
            diff = reqs[day['dateISO']][c] - counts[c]
            if diff > 0:
                under += diff
                for _ in range(diff):
                    add('underfilled', None, di, False)
            elif diff < 0:
                over += -diff

    # --- per-person walks ----------------------------------------------------
    total_dev = 0.0
    ts_score = 0.0
    info = {'pref_mismatch': 0}
    for pid, p in personnel.items():
        seq = [sched.get((pid, day['dateISO']), off_id) for day in days]
        hrs = sum(fx['hours'][s][i] for i, s in enumerate(seq))
        dev = abs(p['dutyTargetHours'] - hrs)
        total_dev += dev
        ts_score += dev * 15  # TS eval term 1 (default 'even' distribution)

        last_night_end = None  # absolute hour of last night-category shift end
        consec_n = 0
        for i, s in enumerate(seq):
            day = days[i]
            is_locked = (pid, day['dateISO']) in locked
            # TS eval: rest-after-night penalty (minRestHours). Night end is
            # tracked for EVERY night-category shift (post-EN-fix solver).
            if s != off_id and start_of.get(s) is not None:
                start_abs = i * 24 + start_of[s]
                if last_night_end is not None:
                    rest = start_abs - last_night_end
                    if rest < min_rest:
                        ts_score += 400 * (min_rest - rest)
            if cat_of.get(s) == 'night':
                last_night_end = i * 24 + 31
            # leave violation
            if (pid, day['dateISO']) in leave and s != off_id:
                add('leave', pid, i, is_locked)
                ts_score += 10000
            # recovery: previous day night-category, today not off
            if i > 0 and cat_of.get(seq[i - 1]) == 'night' and s != off_id:
                forced = is_locked or (pid, days[i - 1]['dateISO']) in locked
                add('recovery', pid, i, forced)
                ts_score += 20000
            # evening -> morning (pure pair, as in solver + detector)
            if i > 0 and seq[i - 1] == evening_id and s == morning_id:
                forced = is_locked or (pid, days[i - 1]['dateISO']) in locked
                add('evening_morning', pid, i, forced)
                ts_score += 300
            # consecutive nights on the category (mixed sequences count)
            consec_n = consec_n + 1 if cat_of.get(s) == 'night' else 0
            if consec_n > max_nights:
                window = range(i - max_nights, i + 1)
                forced = any((pid, days[j]['dateISO']) in locked for j in window)
                add('consec_nights', pid, i, forced)
                ts_score += 20000
            # single-shift duration cap (detector's post-fix cell check)
            if max_consec_hours is not None and dur_of.get(s, 0) > max_consec_hours:
                add('shift_too_long', pid, i, is_locked)
            # head-nurse fixed law
            if p['isHeadNurse']:
                if (day['isFriday'] or day['isHoliday']) and s != off_id:
                    add('headnurse_fri_holiday', pid, i, is_locked)
                    ts_score += 20000
                elif not (day['isFriday'] or day['isHoliday']) and s not in (morning_id, off_id):
                    add('headnurse_weekday', pid, i, is_locked)
                    ts_score += 10000
            # preferred shift mismatch (soft; stats only, not a verdict kind)
            pref = prefs.get((pid, day['dateISO']))
            if pref and s != pref:
                info['pref_mismatch'] += 1
                ts_score += 150

    avoidable = defaultdict(int)
    forced = defaultdict(int)
    for inst in instances:
        (forced if inst['forced'] else avoidable)[inst['kind']] += 1

    return {
        'entries': len(entries),
        'ts_score': ts_score,
        'violations_avoidable': {k: avoidable.get(k, 0) for k in HARD_KINDS},
        'violations_forced': {k: forced.get(k, 0) for k in HARD_KINDS},
        'avoidable_total': sum(avoidable.values()),
        'forced_total': sum(forced.values()),
        'underfilled_cells': under,
        'overfilled_cells': over,
        'hours_deviation_total': total_dev,
        'info': info,
        'instances': instances,
    }
