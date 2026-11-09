import { useMemo, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore, J_YEAR, J_MONTH } from '../store/appStore';
import { buildMonthGrid, applyManualEdit, shiftSymbol, hasAnyDailyReq, contrastTextColor } from '../features/roster/rosterModel';
import {
  LEAVE_CELL, SCREEN_LEAVE_BG, SCREEN_HOLIDAY_BG, weekdayLetters, holidayDayNumbers,
  buildLeaveCellStates, buildLeaveDatesMap, dayCountsByCategory, employmentShort,
} from '../features/roster/rosterPrintModel';
import { computeWorkRecords } from '../features/workRecords/workRecordService';
import { detectConflicts } from '../core/scheduling/conflictDetector';
import { DEFAULT_RULES } from '../core/defaults';
import { buildEmployeeFacts, evaluateRules, DEFAULT_RULE_CONFIGS } from '../core/rules/engine';
import { scheduleSolver } from '../services/scheduleSolverClient';
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
    <details style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '10px 14px', marginBottom: 12 }}>
      <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>ورود برنامهٔ موجود بخش از فایل (برای اجرای موازی)</summary>
      <p style={{ fontSize: 12, color: '#64748b', margin: '8px 0' }}>
        فایل شبکه‌ای برنامه (سطر = نفر، ستون = روزهای ماه) را انتخاب کنید. نمادهای قابل قبول: نماد شیفت (M/E/N…)، نام فارسی (صبح/عصر/شب) و «آف» برای استراحت.
        سلول‌های واردشده روی برنامهٔ فعلی این ماه می‌نشینند و دستی علامت می‌خورند.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={downloadTemplate}>دانلود قالب شبکه‌ای بخش</button>
        <label style={{ border: '1px solid #ccc', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 13, background: '#f8fafc' }}>
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
            <ul style={{ color: '#e11d48', margin: '6px 0' }}>
              {preview.errors.slice(0, 6).map((e, i) => <li key={i}>ردیف {fa(e.row)}: {e.message}</li>)}
            </ul>
          )}
          {preview.warnings.length > 0 && (
            <div style={{ color: '#b45309', fontSize: 12 }}>
              نمادهای ناشناخته: {preview.warnings.slice(0, 6).map(w => `«${w.token}» (ردیف ${fa(w.row)}، روز ${fa(w.day)})`).join(' · ')}
            </div>
          )}
          {preview.entries.length > 0 && <button onClick={() => { st.importEntries(preview.entries); setApplied(preview.entries.length); setPreview(null); }} style={{ marginTop: 6, padding: '7px 16px' }}>اعمال روی برنامهٔ این ماه</button>}
        </div>
      )}
      {applied > 0 && <div style={{ marginTop: 6, fontSize: 13, color: '#16a34a' }}>{fa(applied)} شیفت از فایل روی برنامه نشست.</div>}
    </details>
  );
}

/** پنل «تنظیمات پیشرفتهٔ تولید برنامه» — همان چهار گزینهٔ نسخهٔ قدیمی (دور ۱۵). */
function GenerationSettingsPanel() {
  const st = useAppStore();
  const s = st.aiSettings;
  const set = (patch: Partial<typeof s>) => st.setAiSettings({ ...s, ...patch });
  const label: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5, fontWeight: 600, color: '#334155', minWidth: 180 };
  const hint: CSSProperties = { fontSize: 11, fontWeight: 400, color: '#64748b' };
  return (
    <details style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '10px 14px', marginBottom: 12 }}>
      <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>تنظیمات پیشرفتهٔ تولید برنامه</summary>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 10 }}>
        <label style={label}>
          الگوریتم توزیع شیفت
          <select value={s.distributionAlgorithm} onChange={e => set({ distributionAlgorithm: e.target.value as typeof s.distributionAlgorithm })}>
            <option value="even">توزیع یکنواخت</option>
            <option value="seniority">اولویت با ارشدیت</option>
            <option value="random">توزیع تصادفی</option>
          </select>
          <span style={hint}>شیفت‌های مازاد چطور بین پرسنل پخش شود.</span>
        </label>
        <label style={label}>
          توزیع شیفت آخر هفته
          <select value={s.weekendDistribution} onChange={e => set({ weekendDistribution: e.target.value as typeof s.weekendDistribution })}>
            <option value="even">توزیع یکنواخت</option>
            <option value="seniority">اولویت با ارشدیت</option>
            <option value="none">بدون اولویت</option>
          </select>
          <span style={hint}>جمعه‌ها و تعطیلات رسمی چطور تقسیم شود.</span>
        </label>
        <label style={label}>
          حداقل استراحت بین شیفت (ساعت)
          <input type="number" min={0} max={72} value={s.minRestHours}
            onChange={e => set({ minRestHours: Math.max(0, Math.min(72, Math.floor(Number(e.target.value) || 0))) })} />
          <span style={hint}>استراحت پس از شیفت شب؛ پیش‌فرض ۲۴ ساعت (ریکاوری).</span>
        </label>
        <label style={label}>
          حداکثر روزهای کاری متوالی
          <input type="number" min={1} max={14} value={s.maxConsecutiveWorkDays}
            onChange={e => set({ maxConsecutiveWorkDays: Math.max(1, Math.min(14, Math.floor(Number(e.target.value) || 1))) })} />
          <span style={hint}>یک فرد حداکثر چند روز پشت سر هم کار کند.</span>
        </label>
      </div>
      <p style={{ fontSize: 12, color: '#64748b', margin: '10px 0 2px' }}>
        روند کار مثل نسخهٔ قدیمی است: اول خانه‌هایی را که خودتان می‌دانید با کلیک روی هر باکس و انتخاب شیفت پر کنید — آن خانه‌ها «دستی» و قفل‌اند —
        بعد «تولید خودکار برنامه» بقیهٔ ماه را با همین تنظیمات و نیازهای روزانه می‌چیند و به خانه‌های قفل‌شده دست نمی‌زند.
      </p>
    </details>
  );
}

export default function SchedulerPage() {
  const st = useAppStore();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [picker, setPicker] = useState<{ personnelId: string; dateISO: string } | null>(null);
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

  const openPicker = (personnelId: string, dateISO: string) => {
    if (st.scheduleStatus === 'published') return;
    if (blockedIds.has(personnelId)) return; // قفل صلاحیت
    setPicker(cur => (cur && cur.personnelId === personnelId && cur.dateISO === dateISO ? null : { personnelId, dateISO }));
  };

  const pickShift = (personnelId: string, dateISO: string, shiftTypeId: string) => {
    const others = st.entries.filter(e => !deptIds.has(e.personnelId));
    st.setEntries([...others, ...applyManualEdit(deptEntries, personnelId, dateISO, shiftTypeId)]);
    setPicker(null);
  };

  const regenerate = async () => {
    setBusy(true);
    try {
      const fresh = await scheduleSolver.solve({
        personnel: deptPeople.filter(p => !blockedIds.has(p.id)), shiftTypes: st.shiftTypes,
        // خانه‌های دستیِ سرپرستار قفل‌اند: تولید از روی همان‌ها ادامه می‌دهد (دور ۱۵).
        currentSchedule: deptEntries.filter(e => e.isManualEntry), requests: st.requests,
        rules: DEFAULT_RULES, aiSettings: st.aiSettings, globalSettings: st.globalDutySettings,
        // نیاز روزانه‌ای که سرپرستار در همین جدول وارد کرده، مبنای تولید است؛
        // همه‌صفر یعنی «عدد نداده‌ام» و منطق پیش‌فرض حل‌کننده تصمیم می‌گیرد.
        dailyReqs: hasAnyDailyReq(st.dailyReqs) ? st.dailyReqs : undefined,
        jYear: J_YEAR, jMonth: J_MONTH,
      });
      const others = st.entries.filter(e => !deptIds.has(e.personnelId));
      st.setEntries([...others, ...fresh]);
      st.setScheduleStatus('draft');
    } finally {
      setBusy(false);
    }
  };

  const letters = useMemo(() => weekdayLetters(J_YEAR, J_MONTH), []);
  const holidays = useMemo(() => holidayDayNumbers(J_YEAR, J_MONTH), []);
  const leaveStates = useMemo(
    () => buildLeaveCellStates(st.leaves.filter(l => deptIds.has(l.employeeId))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [st.leaves, st.departmentId],
  );
  const counts = useMemo(
    () => dayCountsByCategory(deptEntries, st.shiftTypes, deptIds, J_YEAR, J_MONTH),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [st.entries, st.departmentId],
  );
  // اعداد ستون‌های ساختار فرم (موظفی/مجموع/کسر-اضافه) — همان منبع واحد صفحهٔ کارکرد و فرم چاپی.
  const records = useMemo(
    () => computeWorkRecords({
      personnel: deptPeople, entries: deptEntries, shiftTypes: st.shiftTypes,
      jYear: J_YEAR, jMonth: J_MONTH, globalSettings: st.globalDutySettings,
      leaveDatesByEmployee: buildLeaveDatesMap(st.leaves),
      hourlyLeaves: st.leaves
        .filter(l => l.status === 'approved' && l.isHourly && deptIds.has(l.employeeId))
        .map(l => ({ employeeId: l.employeeId, dateISO: l.startISO, hours: l.hours ?? 0 })),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [st.entries, st.leaves, st.departmentId],
  );
  const recOf = (id: string) => records.find(r => r.employeeId === id);
  const dayCount = grid.get(deptPeople[0]?.id ?? '')?.length ?? letters.length;

  const fa = (n: number) => n.toLocaleString('fa-IR');
  return (
    <div>
      <h1>برنامهٔ شیفت — مهر ۱۴۰۵ {st.scheduleStatus === 'published' ? '(منتشرشده)' : '(پیش‌نویس)'}</h1>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <select value={st.departmentId} onChange={e => st.setDepartment(e.target.value)}>
          {st.departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <button onClick={regenerate} disabled={busy}>{busy ? 'در حال تولید…' : 'تولید خودکار برنامه'}</button>
        <button className="btn-secondary" onClick={() => navigate('/scheduler/print')}>چاپ فرم چینش</button>
        {st.scheduleStatus === 'draft'
          ? <button onClick={() => st.setScheduleStatus('published')}>انتشار برنامه</button>
          : <button className="btn-secondary" onClick={() => st.setScheduleStatus('draft')}>برگرداندن به پیش‌نویس</button>}
        <span>تعارض‌ها: <strong>{fa(conflicts)}</strong> · نقض سخت قواعد: <strong>{fa(violations.filter(v => v.severity === 'hard').length)}</strong></span>
      </div>
      <p style={{ fontSize: 12, color: '#64748b' }}>روی هر باکس شیفت کلیک کنید تا گزینه‌های شیفت باز شود و انتخاب کنید؛ خانهٔ انتخاب‌شده «دستی» می‌شود و در تولید خودکار قفل می‌ماند. برای سرپرستار، طبق قانون ثابت جدول، فقط صبح و آف قابل انتخاب است. سه ردیف «نیاز بخش» بالای جدول ورودی مستقیم شماست: عدد هر روز را همان‌جا وارد کنید یا با خانهٔ «همهٔ روزها» یک عدد برای کل ماه بگذارید؛ «تولید خودکار برنامه» دقیقاً با همین نیازها می‌چیند. در وضعیت منتشرشده ویرایش قفل است.</p>
      <GenerationSettingsPanel />
      <RosterImportCard />
      {(gate.blocked.length > 0 || gate.warnings.length > 0) && (
        <div style={{ background: '#f8fafc', border: '1px solid #fde68a', borderRadius: 12, padding: '10px 14px', marginBottom: 12, fontSize: 13 }}>
          {gate.blocked.length > 0 && (
            <div style={{ color: '#b45309' }}>
              <strong>قفل صلاحیت — از برنامه کنار گذاشته شدند:</strong>{' '}
              {gate.blocked.map(b => `${nameOf(b.employeeId)} (${b.reasons.join('؛ ')})`).join(' · ')}
            </div>
          )}
          {gate.warnings.length > 0 && (
            <div style={{ color: '#64748b', marginTop: gate.blocked.length ? 6 : 0 }}>
              هشدار مدارک: {gate.warnings.map(w => `${nameOf(w.employeeId)}: ${w.reasons.join('؛ ')}`).join(' · ')}
            </div>
          )}
        </div>
      )}
      <div className="scroll-slim" style={{ overflow: 'auto', maxHeight: 'calc(100vh - 215px)', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, boxShadow: '0 1px 2px rgb(15 23 42 / 0.05), 0 1px 3px rgb(15 23 42 / 0.06)' }}>
        <table className="roster-grid" style={{ borderCollapse: 'collapse', fontSize: 12, minWidth: 1280 }}>
          <thead>
            {([['morning', 'تعداد صبح'], ['evening', 'تعداد عصر'], ['night', 'تعداد شب']] as const).map(([shift, label]) => {
              const rowVals = st.dailyReqs[shift];
              const uniform = rowVals.length > 0 && rowVals.every(v => v === rowVals[0]);
              return (
              <tr key={shift}>
                <th colSpan={5} style={{ background: '#f1f5f9', padding: 3, textAlign: 'right', fontSize: 11, color: '#64748b', whiteSpace: 'nowrap' }}>
                  {label} (نیاز بخش)
                  {' · همهٔ روزها: '}
                  <input
                    type="number" min={0} max={99}
                    value={uniform ? rowVals[0] : ''}
                    placeholder="—"
                    disabled={st.scheduleStatus === 'published'}
                    title="یک عدد برای همهٔ روزهای ماه"
                    onChange={e => st.setDailyReqRow(shift, Number(e.target.value))}
                    style={{ width: 44, fontSize: 11, textAlign: 'center', border: '1px solid #cbd5e1', borderRadius: 999, background: '#fff', padding: '2px 2px' }}
                  />
                </th>
                {Array.from({ length: dayCount }, (_, i) => (
                  <th key={i} style={{ padding: 1, background: '#f1f5f9' }}>
                    <input
                      type="number" min={0} max={99}
                      value={st.dailyReqs[shift][i] ?? 0}
                      disabled={st.scheduleStatus === 'published'}
                      title={`${label} — روز ${fa(i + 1)}`}
                      onChange={e => st.setDailyReq(shift, i, Number(e.target.value))}
                      style={{ width: '100%', minWidth: 26, fontSize: 11, textAlign: 'center', border: '1px solid #e2e8f0', borderRadius: 999, background: '#fff', color: '#334155', padding: '2px 1px' }}
                    />
                  </th>
                ))}
                <th style={{ background: '#f1f5f9' }}></th>
                <th style={{ background: '#f1f5f9' }}></th>
              </tr>
              );
            })}
            <tr>
              <th colSpan={5} style={{ position: 'sticky', right: 0, background: '#f1f5f9', padding: 6, textAlign: 'right' }}></th>
              {letters.slice(0, dayCount).map((l, i) => (
                <th key={i} style={{ padding: 2, fontSize: 10, background: '#f1f5f9', color: l === 'ج' ? '#e11d48' : '#64748b' }}>{l}</th>
              ))}
              <th style={{ background: '#f1f5f9' }}></th>
              <th style={{ background: '#f1f5f9' }}></th>
            </tr>
            <tr>
              <th style={{ position: 'sticky', right: 0, background: '#f1f5f9', padding: 6, textAlign: 'right' }}>نام</th>
              <th style={{ background: '#f1f5f9', padding: 4, whiteSpace: 'nowrap' }}>سمت</th>
              <th style={{ background: '#f1f5f9', padding: 4 }}>وضعیت</th>
              <th style={{ background: '#f1f5f9', padding: 4, whiteSpace: 'nowrap' }}>موظفی ماه</th>
              <th style={{ background: '#f1f5f9', padding: 4, whiteSpace: 'nowrap' }}>طلب/بدهی</th>
              {Array.from({ length: dayCount }, (_, i) => (
                <th key={i} style={{ padding: 4, background: grid.get(deptPeople[0]?.id ?? '')?.[i]?.isFriday ? '#fff1f2' : '#f1f5f9' }}>{fa(i + 1)}</th>
              ))}
              <th style={{ background: '#f1f5f9', padding: 4, whiteSpace: 'nowrap' }}>مجموع ساعت</th>
              <th style={{ background: '#f1f5f9', padding: 4, whiteSpace: 'nowrap' }}>کسر/اضافه</th>
            </tr>
          </thead>
          <tbody>
            {deptPeople.map((p, rowIdx) => {
              const rec = recOf(p.id);
              const bal = st.leaveBalances[p.id];
              const remaining = bal ? bal.entitled - bal.used : null;
              const diff = rec ? rec.workedHours - rec.dutyHours : 0;
              const infoTd = { padding: 6, whiteSpace: 'nowrap', color: '#334155', textAlign: 'center' } as const;
              return (
              <tr key={p.id}>
                <td style={{ position: 'sticky', right: 0, background: '#fff', padding: 6, whiteSpace: 'nowrap', fontWeight: 600 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <span aria-hidden style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: '50%', background: '#e2e8f0', color: '#334155', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{p.name.trim().charAt(0)}</span>
                    {p.name}
                  </span>
                  {blockedIds.has(p.id) && <span style={{ color: '#e11d48', fontSize: 11 }}> · قفل صلاحیت</span>}
                </td>
                <td style={infoTd}>{p.role}</td>
                <td style={infoTd}>{employmentShort(p.employmentStatus)}</td>
                <td style={infoTd}>{rec ? fa(rec.dutyHours) : ''}</td>
                <td style={infoTd}>{remaining !== null ? fa(remaining) : ''}</td>
                {(grid.get(p.id) ?? []).map(cell => {
                  const leaveCode = leaveStates.get(`${p.id}|${cell.dateISO}`);
                  const leaveCell = !cell.entry && leaveCode ? LEAVE_CELL[leaveCode] : undefined;
                  const bg = (leaveCell ? SCREEN_LEAVE_BG[leaveCode!] : undefined)
                    ?? (!cell.entry && holidays.has(cell.jDay) ? SCREEN_HOLIDAY_BG : cell.isFriday ? '#fff1f2' : undefined);
                  const shiftObj = cell.entry ? st.shiftTypes.find(s => s.id === cell.entry!.shiftTypeId) : undefined;
                  const isPickerOpen = picker !== null && picker.personnelId === p.id && picker.dateISO === cell.dateISO;
                  const isHeadNurse = p.role.includes('سرپرستار');
                  const openUp = rowIdx >= deptPeople.length - 4;
                  return (
                    <td
                      key={cell.jDay}
                      style={{ padding: 3, textAlign: 'center', background: bg, position: 'relative' }}
                      title={leaveCell ? `${leaveCell.name} — ${cell.dateISO}` : cell.dateISO}
                    >
                      <button
                        type="button"
                        onClick={() => openPicker(p.id, cell.dateISO)}
                        title={cell.entry?.isManualEntry ? 'دستی (قفل برای تولید خودکار)' : undefined}
                        style={{
                          display: 'block', width: '100%', minWidth: 26, padding: '2px 0', borderRadius: 6, fontSize: 11, fontWeight: 700,
                          border: 'none', boxShadow: cell.entry?.isManualEntry ? 'inset 0 0 0 2px rgb(15 23 42 / 0.4)' : 'none',
                          background: shiftObj ? shiftObj.displayColor : 'transparent',
                          color: shiftObj ? contrastTextColor(shiftObj.displayColor) : '#94a3b8',
                          cursor: st.scheduleStatus === 'draft' ? 'pointer' : 'default',
                        }}
                      >
                        {cell.entry ? shiftSymbol(st.shiftTypes, cell.entry.shiftTypeId) : leaveCell ? leaveCell.label : shiftSymbol(st.shiftTypes, undefined)}
                      </button>
                      {isPickerOpen && (
                        <>
                          <span onClick={() => setPicker(null)} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'transparent' }} />
                          <span style={{
                            position: 'absolute', right: 0, [openUp ? 'bottom' : 'top']: 'calc(100% + 4px)', zIndex: 61, width: 236,
                            background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 8px 20px -6px rgb(15 23 42 / 0.18)',
                            padding: 8, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, textAlign: 'center',
                          } as CSSProperties}>
                            {st.shiftTypes.map(s => {
                              const disabled = isHeadNurse && s.id !== 's-m' && s.id !== 's-off';
                              return (
                                <button
                                  key={s.id} type="button" disabled={disabled}
                                  onClick={() => pickShift(p.id, cell.dateISO, s.id)}
                                  title={disabled ? 'قانون ثابت: سرپرستار فقط شیفت صبح دارد' : s.name}
                                  style={{
                                    border: 'none', borderRadius: 8, padding: '5px 2px 4px', cursor: disabled ? 'not-allowed' : 'pointer',
                                    background: s.displayColor, color: contrastTextColor(s.displayColor), opacity: disabled ? 0.3 : 1,
                                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, boxShadow: 'none',
                                  }}
                                >
                                  <span style={{ fontSize: 11, fontWeight: 800 }}>{s.symbol}</span>
                                  <span style={{ fontSize: 8.5, fontWeight: 600 }}>{s.name}</span>
                                </button>
                              );
                            })}
                          </span>
                        </>
                      )}
                    </td>
                  );
                })}
                <td style={{ ...infoTd, fontWeight: 600 }}>{rec ? fa(rec.workedHours) : ''}</td>
                <td style={{ ...infoTd, fontWeight: 600, color: diff > 0 ? '#16a34a' : diff < 0 ? '#e11d48' : undefined }}>
                  {rec ? `${diff > 0 ? '+' : ''}${fa(diff)}` : ''}
                </td>
              </tr>
              );
            })}
          </tbody>
          <tfoot>
            {([['تعداد صبح', counts.morning], ['تعداد عصر', counts.evening], ['تعداد شب', counts.night]] as const).map(([label, arr]) => (
              <tr key={label}>
                <td colSpan={5} style={{ position: 'sticky', right: 0, background: '#f1f5f9', padding: 6, fontWeight: 700, whiteSpace: 'nowrap' }}>{label}</td>
                {arr.slice(0, dayCount).map((v, i) => (
                  <td key={i} style={{ padding: 4, textAlign: 'center', background: '#f1f5f9', fontWeight: 600 }}>{v > 0 ? fa(v) : ''}</td>
                ))}
                <td style={{ background: '#f1f5f9' }}></td>
                <td style={{ background: '#f1f5f9' }}></td>
              </tr>
            ))}
          </tfoot>
        </table>
      </div>
      {deptPeople.length > 0 && deptEntries.length === 0 && <p>برای این بخش هنوز برنامه‌ای نیست؛ «تولید خودکار برنامه» را بزنید.</p>}

      {st.viewRole === 'ward_manager' && st.swaps.some(s => s.status === 'accepted' && deptIds.has(s.fromEmployeeId)) && (
        <section style={{ marginTop: 20, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16 }}>
          <h2 style={{ marginTop: 0 }}>جابه‌جایی‌های در انتظار تأیید نهایی</h2>
          {st.swaps.filter(s => s.status === 'accepted' && deptIds.has(s.fromEmployeeId)).map(s => (
            <div key={s.id} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <span>{st.personnel.find(p => p.id === s.fromEmployeeId)?.name} ↔ {st.personnel.find(p => p.id === s.toEmployeeId)?.name} · {s.dateISO}</span>
              <button onClick={() => {
                import('../features/swaps/swapService').then(({ approveSwap }) => {
                  const res = approveSwap(s, st.entries, st.currentEmployeeId, { personnel: st.personnel, shiftTypes: st.shiftTypes });
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
