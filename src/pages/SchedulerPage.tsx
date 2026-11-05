import { useMemo, useState } from 'react';
import { useAppStore, J_YEAR, J_MONTH } from '../store/appStore';
import { buildMonthGrid, applyManualEdit, shiftSymbol } from '../features/roster/rosterModel';
import { detectConflicts } from '../core/scheduling/conflictDetector';
import { DEFAULT_RULES } from '../core/defaults';
import { buildEmployeeFacts, evaluateRules, DEFAULT_RULE_CONFIGS } from '../core/rules/engine';
import { scheduleSolver } from '../services/scheduleSolverClient';
import { DEFAULT_AI_SETTINGS, DEFAULT_GLOBAL_SETTINGS } from '../core/defaults';
import { credentialGate } from '../features/credentials/credentialService';
import { buildSymbolResolver, parseRosterGridCsv, rosterGridTemplateCsv, type RosterImportResult } from '../features/import/rosterImport';

function RosterImportCard() {
  const st = useAppStore();
  const [preview, setPreview] = useState<RosterImportResult | null>(null);
  const [applied, setApplied] = useState(0);
  const deptPeople = st.personnel.filter(p => p.departmentId === st.departmentId);

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setApplied(0);
    let text: string;
    if (/\.csv$/i.test(f.name)) text = await f.text();
    else {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await f.arrayBuffer());
      text = XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]!]!);
    }
    const resolve = buildSymbolResolver(st.shiftTypes);
    setPreview(parseRosterGridCsv(text, { jYear: J_YEAR, jMonth: J_MONTH, personnel: deptPeople, resolve }));
  };
  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob([rosterGridTemplateCsv(deptPeople, J_YEAR, J_MONTH)], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'roster-grid-template.csv'; a.click();
    URL.revokeObjectURL(url);
  };
  const fa = (n: number) => n.toLocaleString('fa-IR');
  return (
    <details style={{ background: '#fff', border: '1px solid #e3ddd2', borderRadius: 12, padding: '10px 14px', marginBottom: 12 }}>
      <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>ورود برنامهٔ موجود بخش از فایل (برای اجرای موازی)</summary>
      <p style={{ fontSize: 12, color: '#68707a', margin: '8px 0' }}>
        فایل شبکه‌ای برنامه (سطر = نفر، ستون = روزهای ماه) را انتخاب کنید. نمادهای قابل قبول: نماد شیفت (M/E/N…)، نام فارسی (صبح/عصر/شب) و «آف» برای استراحت.
        سلول‌های واردشده روی برنامهٔ فعلی این ماه می‌نشینند و دستی علامت می‌خورند.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={downloadTemplate}>دانلود قالب شبکه‌ای بخش</button>
        <label style={{ border: '1px solid #ccc', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 13, background: '#f8f6f1' }}>
          انتخاب فایل (Excel / CSV)
          <input type="file" accept=".csv,.xlsx,.xls" style={{ display: 'none' }} onChange={e => void onFile(e.target.files?.[0])} />
        </label>
      </div>
      {preview && (
        <div style={{ marginTop: 8, fontSize: 13 }}>
          <div>
            {fa(preview.stats.people)} نفر · {fa(preview.stats.filledCells)} شیفت خوانده شد · {fa(preview.stats.offCells)} آف
            {preview.warnings.length > 0 && <> · {fa(preview.warnings.length)} نماد ناشناخته</>}
          </div>
          {preview.errors.length > 0 && (
            <ul style={{ color: '#b3402f', margin: '6px 0' }}>
              {preview.errors.slice(0, 6).map((e, i) => <li key={i}>ردیف {fa(e.row)}: {e.message}</li>)}
            </ul>
          )}
          {preview.warnings.length > 0 && (
            <div style={{ color: '#8a5a00', fontSize: 12 }}>
              نمادهای ناشناخته: {preview.warnings.slice(0, 6).map(w => `«${w.token}» (ردیف ${fa(w.row)}، روز ${fa(w.day)})`).join(' · ')}
            </div>
          )}
          {preview.entries.length > 0 && <button onClick={() => { st.importEntries(preview.entries); setApplied(preview.entries.length); setPreview(null); }} style={{ marginTop: 6, padding: '7px 16px' }}>اعمال روی برنامهٔ این ماه</button>}
        </div>
      )}
      {applied > 0 && <div style={{ marginTop: 6, fontSize: 13, color: '#1e6b3a' }}>{fa(applied)} شیفت از فایل روی برنامه نشست.</div>}
    </details>
  );
}

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
      <RosterImportCard />
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
