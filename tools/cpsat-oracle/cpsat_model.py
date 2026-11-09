"""CP-SAT model for the Hejleh quality oracle.

Adapted from the 2026-11-09 CP-SAT spike model, updated to the product's
POST-EN-FIX semantics: night handling is category-based (via the fixture's
per-shift `category`, exported from the product's `categorizeShift`), so a
locked combined evening+night (EN) shift counts as a night for recovery and
for the consecutive-nights cap — exactly as schedulerSolver.ts and
conflictDetector.ts behave today.

Hierarchy mirrored from the product: manual locks are absolute (pre-applied);
recovery bends around them. In the default (hard) mode, recovery and the
consecutive-nights cap are structural constraints wherever the neighbouring
cells are solver-controlled; if that makes the model INFEASIBLE (the spike's
lock-conflict case), oracle.py retries with soft_recovery=True, where those
rules are priced at the product's own penalty weights instead — and the
checker still classifies any resulting lock-involved violation as forced.

Objective: mirror of the TS solver's trial evaluation plus its
candidate-scoring fairness terms (the spike's documented approximation), all
in integer arithmetic at 2x the TS cost units (half-hour scaling).
"""
import os
import time

from ortools.sat.python import cp_model

import checker


def _gen_ids(fx):
    by_symbol = {s['symbol']: s['id'] for s in fx['shiftTypes']}
    return (by_symbol.get('M', 's-m'), by_symbol.get('E', 's-e'),
            by_symbol.get('N', 's-n'), by_symbol.get('-', 's-off'))


def build_and_solve(fx, time_limit, soft_recovery=False):
    days = fx['days']
    D = len(days)
    personnel = fx['personnel']
    pidx = {p['id']: i for i, p in enumerate(personnel)}
    didx = {d['dateISO']: i for i, d in enumerate(days)}
    M_ID, E_ID, N_ID, OFF_ID = _gen_ids(fx)
    GEN_SHIFTS = [M_ID, E_ID, N_ID, OFF_ID]
    cat_of = {s['id']: s['category'] for s in fx['shiftTypes']}
    start_of = {s['id']: s.get('startHour') for s in fx['shiftTypes']}
    reqs, _ = checker.compute_requirements(fx)
    hours2 = {sid: [int(round(h * 2)) for h in fx['hours'][sid]] for sid in fx['hours']}
    target2 = {p['id']: int(round(p['dutyTargetHours'] * 2)) for p in personnel}
    leave = {(r['personnelId'], r['dateISO']) for r in fx['requests'] if r['type'] == 'Leave'}
    prefs = [r for r in fx['requests'] if r['type'] == 'Preferred Shift']
    locks = {(l['personnelId'], l['dateISO']): l['shiftTypeId'] for l in fx['locks']}
    max_nights = fx.get('maxNights', 2)
    max_work = fx['aiSettings'].get('maxConsecutiveWorkDays', 6)
    min_rest = fx['aiSettings'].get('minRestHours', 24)

    def is_locked(pid, di):
        return (pid, days[di]['dateISO']) in locks

    def locked_shift(pid, di):
        return locks.get((pid, days[di]['dateISO']))

    def night_indicator(pid, di, x):
        """1 if the cell is a night-category assignment (var or lock const)."""
        lk = locked_shift(pid, di)
        if lk is not None:
            return 1 if cat_of.get(lk) == 'night' else 0
        return x[pid, di, N_ID]  # the only night-category generated shift

    model = cp_model.CpModel()
    x = {}
    allowed_map = {}
    for p in personnel:
        for di, day in enumerate(days):
            allowed = list(GEN_SHIFTS)
            lk = locks.get((p['id'], day['dateISO']))
            if lk and lk not in allowed:
                allowed.append(lk)
            allowed_map[p['id'], di] = allowed
            for sid in allowed:
                x[p['id'], di, sid] = model.NewBoolVar(f"x_{p['id']}_{di}_{sid}")
            model.AddExactlyOne([x[p['id'], di, sid] for sid in allowed])

    def work(pid, di):
        return 1 - x[pid, di, OFF_ID]

    obj = []  # (coefficient in 2x TS units, var)

    # --- hard: leave, locks, head-nurse fixed law ----------------------------
    for p in personnel:
        pid = p['id']
        for di, day in enumerate(days):
            lk = locks.get((pid, day['dateISO']))
            if lk:
                model.Add(x[pid, di, lk] == 1)
                continue  # locks are absolute in the product (pre-applied)
            if (pid, day['dateISO']) in leave:
                model.Add(x[pid, di, OFF_ID] == 1)
            if p['isHeadNurse']:
                if day['isFriday'] or day['isHoliday']:
                    model.Add(x[pid, di, OFF_ID] == 1)
                else:
                    for sid in (E_ID, N_ID):
                        model.Add(x[pid, di, sid] == 0)
                    # a locked exotic evening/night for the head nurse is a
                    # lock conflict; locks win (handled by `continue` above).

    # --- recovery after a night-category shift --------------------------------
    for p in personnel:
        pid = p['id']
        for di in range(D - 1):
            if is_locked(pid, di + 1):
                continue  # locks outrank recovery: nothing to constrain/price
            n_ind = night_indicator(pid, di, x)
            if not soft_recovery:
                if isinstance(n_ind, int):
                    if n_ind == 1:
                        model.Add(x[pid, di + 1, OFF_ID] == 1)
                else:
                    model.Add(x[pid, di + 1, OFF_ID] == 1).OnlyEnforceIf(n_ind)
            else:
                rec = model.NewBoolVar(f"rec_{pid}_{di}")
                model.Add(rec >= n_ind - x[pid, di + 1, OFF_ID])
                obj.append((2 * 20000, rec))
                # TS eval also charges the min-rest deficit on top: night ends
                # at abs hour 31 of its day; a start s next day rests
                # (24 + start - 31) = start - 7 hours.
                for sid2 in allowed_map[pid, di + 1]:
                    st = start_of.get(sid2)
                    if st is None or sid2 == OFF_ID:
                        continue
                    deficit = min_rest + 7 - st
                    if deficit <= 0:
                        continue
                    both = model.NewBoolVar(f"rest_{pid}_{di}_{sid2}")
                    model.Add(both >= n_ind + x[pid, di + 1, sid2] - 1)
                    obj.append((2 * 400 * deficit, both))

    # --- consecutive nights cap (category-based) ------------------------------
    for p in personnel:
        pid = p['id']
        for di in range(D - max_nights):
            window = [night_indicator(pid, di + k, x) for k in range(max_nights + 1)]
            if not soft_recovery:
                model.Add(sum(window) <= max_nights)
            else:
                excess = model.NewIntVar(0, max_nights + 1, f"cn_{pid}_{di}")
                model.Add(sum(window) - max_nights <= excess)
                obj.append((2 * 20000, excess))

    # --- requirements with under/over slack ----------------------------------
    for di, day in enumerate(days):
        lock_counts = {}
        for (pid, dISO), sid in locks.items():
            if dISO == day['dateISO']:
                c = cat_of[sid]
                lock_counts[c] = lock_counts.get(c, 0) + 1
        for cat, gen in (('morning', M_ID), ('evening', E_ID), ('night', N_ID)):
            req = reqs[day['dateISO']][cat]
            cnt = sum(x[p['id'], di, s] for p in personnel
                      for s in allowed_map[p['id'], di] if cat_of.get(s) == cat)
            under = model.NewIntVar(0, req, f"under_{di}_{cat}")
            over_ub = max(0, lock_counts.get(cat, 0) - req)
            over = model.NewIntVar(0, over_ub, f"over_{di}_{cat}")
            model.Add(cnt + under - over == req)
            obj.append((2 * 10000, under))
            if over_ub:
                obj.append((2 * 1000, over))

    # --- soft: duty-hours deviation (TS eval weight 15/hour) ------------------
    for p in personnel:
        pid = p['id']
        worked2 = sum(hours2[s][di] * x[pid, di, s]
                      for di in range(D) for s in allowed_map[pid, di])
        dev = model.NewIntVar(0, 2 * 400, f"dev_{pid}")
        model.Add(dev >= worked2 - target2[pid])
        model.Add(dev >= target2[pid] - worked2)
        obj.append((15, dev))  # 2 * 15 * (dev2/2) = 15 * dev2

    # --- soft: evening->morning (TS eval 300) ---------------------------------
    for p in personnel:
        pid = p['id']
        for di in range(1, D):
            if is_locked(pid, di - 1) or is_locked(pid, di):
                continue  # lock-involved pairs are input facts, not choices
            em = model.NewBoolVar(f"em_{pid}_{di}")
            model.Add(em >= x[pid, di - 1, E_ID] + x[pid, di, M_ID] - 1)
            obj.append((2 * 300, em))

    # --- soft: preferred-shift mismatch (TS eval 150) --------------------------
    for r in prefs:
        pid, di = r['personnelId'], didx[r['dateISO']]
        sid = r.get('preferredShiftId')
        if (pid, di, sid) in x:
            obj.append((2 * 150, 1 - x[pid, di, sid]))

    # --- soft: consecutive work days beyond max (candidate-scoring mirror, 300/day)
    for p in personnel:
        pid = p['id']
        for start in range(D - max_work):
            excess = model.NewIntVar(0, 1, f"cw_{pid}_{start}")
            model.Add(sum(work(pid, start + k) for k in range(max_work + 1)) - max_work <= excess)
            obj.append((2 * 300, excess))

    # --- soft: fairness of nights & weekend work (aiSettings 'even' mirror, 25/unit)
    non_hn = [p for p in personnel if not p['isHeadNurse']]
    if non_hn:
        total_night_req = sum(reqs[d['dateISO']]['night'] for d in days)
        night_target = round(total_night_req / len(non_hn))
        wk_days = [di for di, d in enumerate(days) if d['isFriday'] or d['isHoliday']]
        total_wk_req = sum(sum(reqs[days[di]['dateISO']].values()) for di in wk_days)
        wk_target = round(total_wk_req / len(non_hn)) if wk_days else 0
        for p in non_hn:
            pid = p['id']
            ncount = sum(x[pid, di, s] for di in range(D)
                         for s in allowed_map[pid, di] if cat_of.get(s) == 'night')
            ndev = model.NewIntVar(0, D, f"ndev_{pid}")
            model.Add(ndev >= ncount - night_target)
            model.Add(ndev >= night_target - ncount)
            obj.append((2 * 25, ndev))
            if wk_days:
                wcount = sum(work(pid, di) for di in wk_days)
                wdev = model.NewIntVar(0, len(wk_days), f"wdev_{pid}")
                model.Add(wdev >= wcount - wk_target)
                model.Add(wdev >= wk_target - wcount)
                obj.append((2 * 25, wdev))

    model.Minimize(sum(coef * var for coef, var in obj))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = float(time_limit)
    solver.parameters.num_search_workers = min(8, os.cpu_count() or 4)
    t0 = time.perf_counter()
    status = solver.Solve(model)
    wall = time.perf_counter() - t0
    out = {
        'fixture': fx['name'],
        'solver': 'OR-Tools CP-SAT',
        'time_limit_s': time_limit,
        'soft_recovery': soft_recovery,
        'status': solver.StatusName(status),
        'wall_s': round(wall, 3),
    }
    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        entries = []
        for p in personnel:
            for di, day in enumerate(days):
                for sid in allowed_map[p['id'], di]:
                    if solver.Value(x[p['id'], di, sid]) == 1:
                        entries.append({
                            'personnelId': p['id'], 'dateISO': day['dateISO'],
                            'shiftTypeId': sid,
                            'isManualEntry': (p['id'], day['dateISO']) in locks,
                        })
        out['objective'] = solver.ObjectiveValue() / 2
        out['best_bound'] = solver.BestObjectiveBound() / 2
        out['entries'] = entries
    return out
