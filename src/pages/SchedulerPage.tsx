import { useMemo, useState } from 'react';
import { useAppStore, J_YEAR, J_MONTH } from '../store/appStore';
import { buildMonthGrid, applyManualEdit, shiftSymbol } from '../features/roster/rosterModel';
import { detectConflicts } from '../core/scheduling/conflictDetector';
import { DEFAULT_RULES } from '../core/defaults';
import { buildEmployeeFacts, evaluateRules, DEFAULT_RULE_CONFIGS } from '../core/rules/engine';
import { scheduleSolver } from '../services/scheduleSolverClient';
import { DEFAULT_AI_SETTINGS, DEFAULT_GLOBAL_SETTINGS } from '../core/defaults';
import { credentialGate } from '../features/credentials/credentialService';

export default function SchedulerPage() {
  const st = useAppStore();
  const [busy, setBusy] = useState(false);
  const deptPeople = st.personnel.filter(p => p.departmentId === st.departmentId);
  const deptIds = useMemo(() => new Set(deptPeople.map(p => p.id)), [deptPeople]);
  const deptEntries = st.entries.filter(e => deptIds.has(e.personnelId));
  const grid = useMemo(
    () => buildMonthGrid({ personnel: deptPeople, entries: deptEntries, jYear: J_YEAR, jMonth: J_MONTH }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [st.entries, st.departmentId],
  );

  const conflicts = useMemo(() => {
    const { cellConflicts, dayConflicts } = detectConflicts(deptEntries, deptPeople, st.shiftTypes, DEFAULT_RULES, st.requests, J_YEAR, J_MONTH);
    let n = 0;
    cellConflicts.forEach(v => (n += v.length));
    return n + dayConflicts.size;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st.entries, st.departmentId]);

  const violations = useMemo(() => {
    const facts = buildEmployeeFacts({
      personnel: deptPeople, entries: deptEntries, shiftTypes: st.shiftTypes,
      jYear: J_YEAR, jMonth: J_MONTH, dutyHoursByEmployee: st.dutyByEmployee,
    });
    return evaluateRules({ facts, configs: DEFAULT_RULE_CONFIGS });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st.entries, st.departmentId]);

  // قفل صلاحیت: پروانهٔ منقضی = کنارگذاری از تولید + منع ویرایش دستی
  const gate = useMemo(
    () => credentialGate(deptPeople.map(p => p.id), st.credentials, new Date().toISOString().slice(0, 10)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [st.credentials, st.departmentId],
  );
  const blockedIds = useMemo(() => new Set(gate.blocked.map(b => b.employeeId)), [gate]);
  const nameOf = (id: string) => deptPeople.find(p => p.id === id)?.name ?? id;

  const cycleShift = (personnelId: string, dateISO: string, currentId: string | undefined) => {
    if (st.scheduleStatus === 'published') return;
    if (blockedIds.has(personnelId)) return; // قفل صلاحیت
    const order = ['s-m', 's-e', 's-n', 's-off'];
    const next = order[(order.indexOf(currentId ?? 's-off') + 1) % order.length]!;
    const others = st.entries.filter(e => !deptIds.has(e.personnelId));
    st.setEntries([...others, ...applyManualEdit(deptEntries, personnelId, dateISO, next)]);
  };

  const regenerate = async () => {
    setBusy(true);
    try {
      const fresh = await scheduleSolver.solve({
        personnel: deptPeople.filter(p => !blockedIds.has(p.id)), shiftTypes: st.shiftTypes, currentSchedule: [], requests: st.requests,
        rules: DEFAULT_RULES, aiSettings: DEFAULT_AI_SETTINGS, globalSettings: DEFAULT_GLOBAL_SETTINGS,
        jYear: J_YEAR, jMonth: J_MONTH,
      });
      const others = st.entries.filter(e => !deptIds.has(e.personnelId));
      st.setEntries([...others, ...fresh]);
      st.setScheduleStatus('draft');
    } finally {
      setBusy(false);
    }
  };

  const fa = (n: number) => n.toLocaleString('fa-IR');
  return (
    <div>
      <h1>برنامهٔ شیفت — مهر ۱۴۰۵ {st.scheduleStatus === 'published' ? '(منتشرشده)' : '(پیش‌نویس)'}</h1>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <select value={st.departmentId} onChange={e => st.setDepartment(e.target.value)}>
          {st.departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <button onClick={regenerate} disabled={busy}>{busy ? 'در حال تولید…' : 'تولید خودکار برنامه'}</button>
        {st.scheduleStatus === 'draft'
          ? <button onClick={() => st.setScheduleStatus('published')}>انتشار برنامه</button>
          : <button onClick={() => st.setScheduleStatus('draft')}>برگرداندن به پیش‌نویس</button>}
        <span>تعارض‌ها: <strong>{fa(conflicts)}</strong> · نقض سخت قواعد: <strong>{fa(violations.filter(v => v.severity === 'hard').length)}</strong></span>
      </div>
      <p style={{ fontSize: 12, color: '#68707a' }}>برای ویرایش دستی روی هر سلول کلیک کنید (چرخش صبح ← عصر ← شب ← آف). در وضعیت منتشرشده ویرایش قفل است.</p>
      {(gate.blocked.length > 0 || gate.warnings.length > 0) && (
        <div style={{ background: '#fdf6ec', border: '1px solid #ecd9ae', borderRadius: 12, padding: '10px 14px', marginBottom: 12, fontSize: 13 }}>
          {gate.blocked.length > 0 && (
            <div style={{ color: '#8a5a00' }}>
              <strong>قفل صلاحیت — از برنامه کنار گذاشته شدند:</strong>{' '}
              {gate.blocked.map(b => `${nameOf(b.employeeId)} (${b.reasons.join('؛ ')})`).join(' · ')}
            </div>
          )}
          {gate.warnings.length > 0 && (
            <div style={{ color: '#68707a', marginTop: gate.blocked.length ? 6 : 0 }}>
              هشدار مدارک: {gate.warnings.map(w => `${nameOf(w.employeeId)}: ${w.reasons.join('؛ ')}`).join(' · ')}
            </div>
          )}
        </div>
      )}
      <div style={{ overflowX: 'auto', background: '#fff', border: '1px solid #e3ddd2', borderRadius: 12 }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 12, minWidth: 1100 }}>
          <thead>
            <tr>
              <th style={{ position: 'sticky', right: 0, background: '#f3efe7', padding: 6, textAlign: 'right' }}>نام</th>
              {Array.from({ length: 30 }, (_, i) => (
                <th key={i} style={{ padding: 4, background: grid.get(deptPeople[0]?.id ?? '')?.[i]?.isFriday ? '#fde8e8' : '#f3efe7' }}>{fa(i + 1)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {deptPeople.map(p => (
              <tr key={p.id}>
                <td style={{ position: 'sticky', right: 0, background: '#fff', padding: 6, whiteSpace: 'nowrap', fontWeight: 600 }}>
                  {p.name}{blockedIds.has(p.id) && <span style={{ color: '#b3402f', fontSize: 11 }}> · قفل صلاحیت</span>}
                </td>
                {(grid.get(p.id) ?? []).map(cell => (
                  <td
                    key={cell.jDay}
                    onClick={() => cycleShift(p.id, cell.dateISO, cell.entry?.shiftTypeId)}
                    style={{ padding: 4, textAlign: 'center', cursor: st.scheduleStatus === 'draft' ? 'pointer' : 'default', background: cell.isFriday ? '#fff5f5' : undefined, color: cell.entry?.shiftTypeId === 's-n' ? '#7c3aed' : undefined, fontWeight: cell.entry?.isManualEntry ? 800 : 400 }}
                    title={cell.dateISO}
                  >
                    {shiftSymbol(st.shiftTypes, cell.entry?.shiftTypeId)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {deptPeople.length > 0 && deptEntries.length === 0 && <p>برای این بخش هنوز برنامه‌ای نیست؛ «تولید خودکار برنامه» را بزنید.</p>}

      {st.viewRole === 'ward_manager' && st.swaps.some(s => s.status === 'accepted' && deptIds.has(s.fromEmployeeId)) && (
        <section style={{ marginTop: 20, background: '#fff', border: '1px solid #e3ddd2', borderRadius: 12, padding: 16 }}>
          <h2 style={{ marginTop: 0 }}>جابه‌جایی‌های در انتظار تأیید نهایی</h2>
          {st.swaps.filter(s => s.status === 'accepted' && deptIds.has(s.fromEmployeeId)).map(s => (
            <div key={s.id} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <span>{st.personnel.find(p => p.id === s.fromEmployeeId)?.name} ↔ {st.personnel.find(p => p.id === s.toEmployeeId)?.name} · {s.dateISO}</span>
              <button onClick={() => {
                import('../features/swaps/swapService').then(({ approveSwap }) => {
                  const res = approveSwap(s, st.entries, st.currentEmployeeId);
                  if (!res.ok) { alert(res.error); return; }
                  st.updateSwap(res.swap);
                  st.setEntries(res.entries);
                });
              }}>تأیید و اعمال</button>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
