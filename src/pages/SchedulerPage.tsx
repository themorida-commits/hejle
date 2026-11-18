import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
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
import { buildEmployeeFacts, evaluateRules, DEFAULT_RULE_CONFIGS, categorizeShift } from '../core/rules/engine';
import { scheduleSolver } from '../services/scheduleSolverClient';
import { credentialGate, credentialStatus, STATUS_FA, KIND_FA } from '../features/credentials/credentialService';
import { LEAVE_TYPES } from '../features/leave/leaveService';
import { neighborCell, planCellDrag, type PlannedEdit } from '../features/roster/dragPlan';

const faDayMonth = (iso: string) => new Intl.DateTimeFormat('fa-IR', { day: 'numeric', month: 'long' }).format(new Date(iso));
import { buildSymbolResolver, parseRosterGridCsv, rosterGridTemplateCsv, type RosterImportResult } from '../features/import/rosterImport';
import { explainRoster, type RosterBrief } from '../features/agents/rosterExplain';
import { coverageForDay } from '../features/roster/coverage';
import { toast } from '../store/toast';
import EmptyState from '../components/EmptyState';

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
        <label style={{ border: '1px solid #ccc', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 13, background: '#F9F9F9' }}>
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

/**
 * پنل «توضیح ایجنت» — فاز ۲ لایهٔ ایجنت (Zone C، دور ۱۸): خوانش ساخت‌یافتهٔ
 * برنامهٔ بارگذاری‌شده (توازن شب‌ها، خانه‌های خالی نیاز روزانه، قفل‌های دستی،
 * قانون سرپرستار). فقط خواندنی است؛ «ثبت» آن را پیش‌نویس + ردّ اجرا می‌کند و
 * تصمیم انتشار برنامه همان مسیر همیشگی خودش را دارد.
 */
function RosterExplainPanel() {
  const st = useAppStore();
  const [brief, setBrief] = useState<RosterBrief | null>(null);
  const [saved, setSaved] = useState(false);
  const deptPeople = st.personnel.filter(p => p.departmentId === st.departmentId);
  const deptIds = new Set(deptPeople.map(p => p.id));
  const deptEntries = st.entries.filter(e => deptIds.has(e.personnelId));
  const fa = (n: number) => n.toLocaleString('fa-IR', { maximumFractionDigits: 1 });
  const run = () => {
    setBrief(explainRoster({
      scheduleId: st.scheduleId, personnel: deptPeople, entries: deptEntries,
      shiftTypes: st.shiftTypes, dailyReqs: st.dailyReqs, jYear: J_YEAR, jMonth: J_MONTH,
    }));
    setSaved(false);
  };
  const save = () => {
    if (!brief) return;
    st.recordAgentRun('roster_explain', { scheduleId: st.scheduleId },
      { unfilled: brief.unfilled.length, manualLocks: brief.manualLocks, headNurseViolations: brief.headNurseViolations }, []);
    st.createAgentDraft('roster_explain', {
      scheduleId: st.scheduleId, lines: brief.lines, nightsSpread: brief.nightsSpread,
      unfilled: brief.unfilled, manualLocks: brief.manualLocks,
      headNurseViolations: brief.headNurseViolations, perEmployee: brief.perEmployee,
    });
    setSaved(true);
  };
  return (
    <section style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '12px 16px', marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <strong style={{ fontSize: 13 }}>توضیح ایجنت — خوانش برنامهٔ ماه (Zone C)</strong>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={run} style={{ padding: '6px 14px', borderRadius: 10, border: '1px solid #004E72', background: '#fff', color: '#004E72', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>توضیح ایجنت</button>
          {brief && (
            <button onClick={save} disabled={saved}
              style={{ padding: '6px 14px', borderRadius: 10, border: '1px solid #cbd5e1', background: saved ? '#f1f5f9' : '#fff', color: '#334155', fontSize: 12, fontWeight: 700, cursor: saved ? 'default' : 'pointer' }}>
              {saved ? 'پیش‌نویس ثبت شد' : 'ثبت به‌عنوان پیش‌نویس'}
            </button>
          )}
        </div>
      </div>
      {!brief && <p style={{ fontSize: 12, color: '#64748b', margin: '8px 0 0' }}>توضیح از روی همین مدخل‌های بارگذاری‌شده ساخته می‌شود: توازن شیفت شب، خانه‌های نیاز روزانهٔ پرنشده، سلول‌های دستی و قانون ثابت سرپرستار.</p>}
      {brief && (
        <div style={{ marginTop: 10 }}>
          <ul style={{ margin: 0, paddingInlineStart: 18, fontSize: 13, lineHeight: 2 }}>
            {brief.lines.map((l, i) => <li key={i}>{l}</li>)}
          </ul>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginTop: 10 }}>
            <thead>
              <tr style={{ background: '#f1f5f9', textAlign: 'right' }}>
                <th style={{ padding: '6px 8px' }}>نام</th><th>مجموع</th><th>صبح</th><th>عصر</th><th>شب</th><th>جمعه</th><th>دستی</th>
              </tr>
            </thead>
            <tbody>
              {brief.perEmployee.map(s => (
                <tr key={s.employeeId} style={{ borderTop: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '6px 8px', fontWeight: 700 }}>{s.name}</td>
                  <td>{fa(s.total)}</td><td>{fa(s.mornings)}</td><td>{fa(s.evenings)}</td>
                  <td>{fa(s.nights)}</td><td>{fa(s.weekends)}</td><td>{fa(s.manual)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
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
  const [focusDay, setFocusDay] = useState(15);
  // پنل کناری فرد (دور ۲۴ — موج ۲): کلیک روی نام در گرید، بدون ترک صفحه.
  const [panelPersonId, setPanelPersonId] = useState<string | null>(null);
  useEffect(() => {
    if (!panelPersonId) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPanelPersonId(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [panelPersonId]);
  // کنترل‌های گرید (دور ۲۵ — موج ۲): تراکم، overlayها، فیلتر و نما.
  // view و density از URL هم خوانده می‌شوند تا لینکِ همان نما قابل‌فرستادن باشد.
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => (new URLSearchParams(window.location.search).get('view') === 'list' ? 'list' : 'grid'));
  const [density, setDensity] = useState<'comfortable' | 'compact'>(() => (new URLSearchParams(window.location.search).get('density') === 'compact' ? 'compact' : 'comfortable'));
  const [showLeave, setShowLeave] = useState(true);
  const [showHolidays, setShowHolidays] = useState(true);
  const [showConflicts, setShowConflicts] = useState(true);
  const [nameFilter, setNameFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const gridWrapRef = useRef<HTMLDivElement>(null);
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
  // فیلتر نمایشی ردیف‌ها (دور ۲۵): فقط ارائه است — شمارش پوشش و تعارض‌ها همیشه کل بخش‌اند.
  const visiblePeople = useMemo(
    () => deptPeople.filter(p => (!nameFilter || p.name.includes(nameFilter)) && (!roleFilter || p.role === roleFilter)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deptPeople, nameFilter, roleFilter],
  );
  const deptRoles = useMemo(() => [...new Set(deptPeople.map(p => p.role))], [deptPeople]);
  // خانه‌های درگیر نقض سخت قواعد، برای overlay تعارض روی خود گرید.
  const conflictKeys = useMemo(
    () => new Set(violations.filter(v => v.severity === 'hard' && v.employeeId && v.jDay).map(v => `${v.employeeId}|${v.jDay}`)),
    [violations],
  );

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

  // اعمال چند ویرایش با هم (درگ‌ودراپ — دور ۲۵): همان مسیر applyManualEdit پیکر،
  // با undo روی کل مدخل‌های پیشین.
  const applyEdits = (edits: PlannedEdit[], doneMsg: string) => {
    const prevAll = st.entries;
    const others = st.entries.filter(e => !deptIds.has(e.personnelId));
    let next = deptEntries;
    for (const e of edits) next = applyManualEdit(next, e.personnelId, e.dateISO, e.shiftTypeId);
    st.setEntries([...others, ...next]);
    toast.success(doneMsg, { actionLabel: 'بازگردانی', onAction: () => st.setEntries(prevAll) });
  };

  const onCellDrop = (targetPid: string, targetISO: string, e: React.DragEvent) => {
    e.preventDefault();
    setDragOverKey(null);
    if (st.scheduleStatus === 'published') return;
    const raw = e.dataTransfer.getData('text/plain');
    const [srcPid, srcISO] = raw.split('|');
    if (!srcPid || !srcISO) return;
    if (blockedIds.has(srcPid) || blockedIds.has(targetPid)) {
      toast.error('یکی از طرف‌های جابه‌جایی قفل صلاحیت دارد و قابل ویرایش نیست.');
      return;
    }
    const plan = planCellDrag({
      source: { personnelId: srcPid, dateISO: srcISO },
      target: { personnelId: targetPid, dateISO: targetISO },
      entries: deptEntries, shiftTypes: st.shiftTypes,
      isHeadNurse: id => (deptPeople.find(p => p.id === id)?.role ?? '').includes('سرپرستار'),
    });
    if (!plan.ok) { toast.error(plan.reason); return; }
    applyEdits(plan.edits, srcPid === targetPid ? 'شیفت به روز مقصد منتقل شد.' : 'جابه‌جایی دو خانه اعمال شد.');
  };

  // ناوبری و ویرایش صفحه‌کلیدی روی گرید (دور ۲۵): جهت‌نما بین خانه‌ها (RTL-aware)،
  // ارقام ۱ تا ۹ چیدن مستقیم شیفت از همان فهرست پیکر — جایگزین کاملِ بدون درگ.
  const onGridKeyDown = (e: React.KeyboardEvent) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-cell]');
    if (!btn) return;
    const pIdx = Number(btn.dataset.pidx);
    const jDay = Number(btn.dataset.jday);
    const pid = btn.dataset.pid!;
    const dateISO = btn.dataset.dateiso!;
    if (e.key.startsWith('Arrow')) {
      const nb = neighborCell(pIdx, jDay - 1, e.key, visiblePeople.length, dayCount);
      if (!nb) return;
      e.preventDefault();
      gridWrapRef.current?.querySelector<HTMLButtonElement>(`button[data-pidx="${nb.personIdx}"][data-jday="${nb.dayIdx + 1}"]`)?.focus();
      return;
    }
    if (/^[1-9]$/.test(e.key) && st.scheduleStatus === 'draft' && !picker) {
      const shift = st.shiftTypes[Number(e.key) - 1];
      if (!shift) return;
      if (blockedIds.has(pid)) { toast.error('این همکار قفل صلاحیت دارد و قابل ویرایش نیست.'); return; }
      const person = deptPeople.find(p => p.id === pid);
      if (person?.role.includes('سرپرستار') && shift.id !== 's-m' && shift.id !== 's-off') {
        toast.error('قانون ثابت: سرپرستار فقط شیفت صبح دارد.');
        return;
      }
      e.preventDefault();
      pickShift(pid, dateISO, shift.id);
    }
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
      toast.success('برنامهٔ تازه ساخته شد و خانه‌های دستی قفل ماندند؛ برای نهایی‌شدن، برنامه را منتشر کنید.');
    } finally {
      setBusy(false);
    }
  };

  const publish = () => {
    st.setScheduleStatus('published');
    toast.success('برنامهٔ مهر ۱۴۰۵ منتشر شد؛ ویرایش قفل شد و برنامه برای پرسنل نهایی است.');
  };
  const unpublish = () => {
    st.setScheduleStatus('draft');
    toast.info('برنامه به پیش‌نویس برگشت و ویرایش باز شد؛ تغییرات تا انتشار دوباره نهایی نیست.');
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
  const coverage = coverageForDay(st.dailyReqs, counts, Math.min(focusDay, dayCount) - 1);
  const COVERAGE_STYLE = {
    exact: { bg: '#f0fdf4', border: '#bbf7d0', color: '#166534', label: 'کامل' },
    under: { bg: '#fff1f2', border: '#fecdd3', color: '#881337', label: 'کمبود' },
    over: { bg: '#fffbeb', border: '#fde68a', color: '#78350f', label: 'مازاد' },
    unset: { bg: '#f8fafc', border: '#e2e8f0', color: '#64748b', label: 'نیاز ثبت نشده' },
  } as const;
  const SHIFT_FA = { morning: 'صبح', evening: 'عصر', night: 'شب' } as const;
  return (
    <div style={{ paddingBottom: st.scheduleStatus === 'draft' && deptEntries.length > 0 ? 76 : 0 }}>
      <h1>برنامهٔ شیفت — مهر ۱۴۰۵ {st.scheduleStatus === 'published' ? '(منتشرشده)' : '(پیش‌نویس)'}</h1>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <select value={st.departmentId} onChange={e => st.setDepartment(e.target.value)}>
          {st.departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <button onClick={regenerate} disabled={busy} title="برنامهٔ ماه را با موتور قطعی و نیازهای روزانه می‌سازد؛ خانه‌های دستی قفل می‌مانند">{busy ? 'در حال تولید…' : 'تولید خودکار برنامه'}</button>
        <button className="btn-secondary" onClick={() => navigate('/scheduler/print')} title="فرم رسمی چینش ماه برای چاپ و امضا">چاپ فرم چینش</button>
        {st.scheduleStatus === 'draft'
          ? <button onClick={publish} title="برنامه نهایی می‌شود و ویرایش قفل می‌شود">انتشار برنامه</button>
          : <button className="btn-secondary" onClick={unpublish} title="برنامه از حالت نهایی خارج و ویرایش باز می‌شود">برگرداندن به پیش‌نویس</button>}
        <span>تعارض‌ها: <strong>{fa(conflicts)}</strong> · نقض سخت قواعد: <strong>{fa(violations.filter(v => v.severity === 'hard').length)}</strong></span>
      </div>
      <p style={{ fontSize: 12, color: '#64748b' }}>روی هر باکس شیفت کلیک کنید تا گزینه‌های شیفت باز شود و انتخاب کنید؛ خانهٔ انتخاب‌شده «دستی» می‌شود و در تولید خودکار قفل می‌ماند. برای سرپرستار، طبق قانون ثابت جدول، فقط صبح و آف قابل انتخاب است. سه ردیف «نیاز بخش» بالای جدول ورودی مستقیم شماست: عدد هر روز را همان‌جا وارد کنید یا با خانهٔ «همهٔ روزها» یک عدد برای کل ماه بگذارید؛ «تولید خودکار برنامه» دقیقاً با همین نیازها می‌چیند. در وضعیت منتشرشده ویرایش قفل است.</p>
      <GenerationSettingsPanel />
      <RosterImportCard />
      <RosterExplainPanel />
      {(gate.blocked.length > 0 || gate.warnings.length > 0) && (
        <div style={{ background: '#F9F9F9', border: '1px solid #fde68a', borderRadius: 12, padding: '10px 14px', marginBottom: 12, fontSize: 13 }}>
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
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '8px 14px', marginBottom: 12 }}>
        <strong style={{ fontSize: 13 }}>پوشش روز {fa(Math.min(focusDay, dayCount))} مهر:</strong>
        <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} disabled={focusDay <= 1} onClick={() => setFocusDay(d => Math.max(1, d - 1))}>روز قبل</button>
          <select value={Math.min(focusDay, dayCount)} onChange={e => setFocusDay(Number(e.target.value))} style={{ padding: '4px 8px', fontSize: 12.5 }} aria-label="روز متمرکز نوار پوشش">
            {Array.from({ length: dayCount }, (_, i) => <option key={i} value={i + 1}>روز {fa(i + 1)}</option>)}
          </select>
          <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} disabled={focusDay >= dayCount} onClick={() => setFocusDay(d => Math.min(dayCount, d + 1))}>روز بعد</button>
        </span>
        {coverage.map(c => {
          const cs = COVERAGE_STYLE[c.status];
          return (
            <span key={c.shift} style={{ background: cs.bg, border: `1px solid ${cs.border}`, color: cs.color, borderRadius: 999, padding: '3px 12px', fontSize: 12.5, fontWeight: 600 }}>
              {SHIFT_FA[c.shift]}: نیاز {fa(c.required)} · تخصیص {fa(c.actual)}
              {c.status === 'under' && <> · {fa(-c.delta)} نفر کم</>}
              {c.status === 'over' && <> · {fa(c.delta)} نفر اضافه</>}
              {c.status === 'exact' && <> · کامل</>}
              {c.status === 'unset' && <> · نیاز ثبت نشده</>}
            </span>
          );
        })}
        <span style={{ fontSize: 11.5, color: '#64748b' }}>با کلیک روی شمارهٔ روز در سربرگ جدول هم روز متمرکز عوض می‌شود.</span>
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '8px 14px', marginBottom: 12 }}>
        <span style={{ display: 'flex', gap: 4 }} role="group" aria-label="نمای جدول">
          <button onClick={() => setViewMode('grid')} className={viewMode === 'grid' ? '' : 'btn-secondary'} style={{ padding: '4px 12px', fontSize: 12 }}>گرید</button>
          <button onClick={() => setViewMode('list')} className={viewMode === 'list' ? '' : 'btn-secondary'} style={{ padding: '4px 12px', fontSize: 12 }} title="نمای فهرستی روزبه‌روز برای مرور سریع؛ ویرایش در گرید است">فهرست</button>
        </span>
        <span style={{ display: 'flex', gap: 4 }} role="group" aria-label="تراکم جدول">
          <button onClick={() => setDensity('comfortable')} className={density === 'comfortable' ? '' : 'btn-secondary'} style={{ padding: '4px 12px', fontSize: 12 }}>راحت</button>
          <button onClick={() => setDensity('compact')} className={density === 'compact' ? '' : 'btn-secondary'} style={{ padding: '4px 12px', fontSize: 12 }} title="تراکم فشرده برای بخش‌های پرنفر">فشرده</button>
        </span>
        <label style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: 12.5 }}>
          <input type="checkbox" checked={showLeave} onChange={e => setShowLeave(e.target.checked)} /> مرخصی‌ها
        </label>
        <label style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: 12.5 }}>
          <input type="checkbox" checked={showHolidays} onChange={e => setShowHolidays(e.target.checked)} /> تعطیلات و جمعه‌ها
        </label>
        <label style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: 12.5 }}>
          <input type="checkbox" checked={showConflicts} onChange={e => setShowConflicts(e.target.checked)} /> تعارض‌های سخت
        </label>
        <input value={nameFilter} onChange={e => setNameFilter(e.target.value)} placeholder="فیلتر نام…" aria-label="فیلتر بر اساس نام" style={{ width: 128, padding: '5px 9px', fontSize: 12.5 }} />
        <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} aria-label="فیلتر بر اساس نقش" style={{ padding: '5px 8px', fontSize: 12.5 }}>
          <option value="">همهٔ نقش‌ها</option>
          {deptRoles.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        {(nameFilter || roleFilter) && <span style={{ fontSize: 12, color: '#64748b' }}>{fa(visiblePeople.length)} از {fa(deptPeople.length)} نفر</span>}
        <span style={{ fontSize: 11.5, color: '#94a3b8' }}>صفحه‌کلید: جهت‌نما حرکت بین خانه‌ها · ارقام ۱ تا ۹ چیدن مستقیم شیفت · کشیدن خانه: جابه‌جایی یا سواپ</span>
      </div>
      {viewMode === 'list' ? (
        <section aria-label="نمای فهرستی برنامه" style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '10px 16px' }}>
          {Array.from({ length: dayCount }, (_, i) => {
            const dateISO = (grid.get(deptPeople[0]?.id ?? '') ?? [])[i]?.dateISO;
            if (!dateISO) return null;
            const byCat: Record<'morning' | 'evening' | 'night', string[]> = { morning: [], evening: [], night: [] };
            for (const e of deptEntries) {
              if (e.date !== dateISO) continue;
              const t = st.shiftTypes.find(s => s.id === e.shiftTypeId);
              if (!t) continue;
              const c = categorizeShift(t);
              if (c === 'morning' || c === 'evening' || c === 'night') byCat[c].push(nameOf(e.personnelId));
            }
            const weekday = new Intl.DateTimeFormat('fa-IR', { weekday: 'long' }).format(new Date(dateISO));
            return (
              <div key={dateISO} style={{ display: 'flex', gap: 14, padding: '7px 2px', borderBottom: '1px solid #f1f5f9', fontSize: 12.5, flexWrap: 'wrap', alignItems: 'baseline' }}>
                <strong style={{ minWidth: 118 }}>{fa(i + 1)} مهر · {weekday}</strong>
                {(['morning', 'evening', 'night'] as const).map(c => (
                  <span key={c}><b>{SHIFT_FA[c]}:</b> {byCat[c].length ? byCat[c].join('، ') : '—'}</span>
                ))}
              </div>
            );
          })}
          <p style={{ fontSize: 12, color: '#64748b', marginBottom: 2 }}>نمای فهرستی فقط برای مرور است؛ ویرایش در نمای گرید انجام می‌شود.</p>
        </section>
      ) : (
      <div ref={gridWrapRef} onKeyDown={onGridKeyDown} className="scroll-slim" style={{ overflow: 'auto', maxHeight: 'calc(100vh - 215px)', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, boxShadow: '0 1px 2px rgb(15 23 42 / 0.05), 0 1px 3px rgb(15 23 42 / 0.06)' }}>
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
                <th key={i} onClick={() => setFocusDay(i + 1)} title="تمرکز نوار پوشش روی این روز" style={{ padding: 4, cursor: 'pointer', background: i + 1 === Math.min(focusDay, dayCount) ? '#DCE9F0' : grid.get(deptPeople[0]?.id ?? '')?.[i]?.isFriday ? '#fff1f2' : '#f1f5f9' }}>{fa(i + 1)}</th>
              ))}
              <th style={{ background: '#f1f5f9', padding: 4, whiteSpace: 'nowrap' }}>مجموع ساعت</th>
              <th style={{ background: '#f1f5f9', padding: 4, whiteSpace: 'nowrap' }}>کسر/اضافه</th>
            </tr>
          </thead>
          <tbody>
            {visiblePeople.map((p, rowIdx) => {
              const rec = recOf(p.id);
              const bal = st.leaveBalances[p.id];
              const remaining = bal ? bal.entitled - bal.used : null;
              const diff = rec ? rec.workedHours - rec.dutyHours : 0;
              const infoTd = { padding: 6, whiteSpace: 'nowrap', color: '#334155', textAlign: 'center' } as const;
              return (
              <tr key={p.id}>
                <td
                  onClick={() => setPanelPersonId(p.id)}
                  title="دیدن خلاصهٔ این همکار (مدارک، موظفی، ماندهٔ مرخصی)"
                  style={{ position: 'sticky', right: 0, background: '#fff', padding: 6, whiteSpace: 'nowrap', fontWeight: 600, cursor: 'pointer' }}
                >
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
                  const leaveCell = showLeave && !cell.entry && leaveCode ? LEAVE_CELL[leaveCode] : undefined;
                  const bg = (leaveCell ? SCREEN_LEAVE_BG[leaveCode!] : undefined)
                    ?? (!cell.entry && showHolidays && holidays.has(cell.jDay) ? SCREEN_HOLIDAY_BG : !cell.entry && showHolidays && cell.isFriday ? '#fff1f2' : undefined);
                  const shiftObj = cell.entry ? st.shiftTypes.find(s => s.id === cell.entry!.shiftTypeId) : undefined;
                  const isPickerOpen = picker !== null && picker.personnelId === p.id && picker.dateISO === cell.dateISO;
                  const isHeadNurse = p.role.includes('سرپرستار');
                  const openUp = rowIdx >= visiblePeople.length - 4;
                  const cellKey = `${p.id}|${cell.dateISO}`;
                  const isConflict = showConflicts && conflictKeys.has(`${p.id}|${cell.jDay}`);
                  const compact = density === 'compact';
                  return (
                    <td
                      key={cell.jDay}
                      onDragOver={e => { if (st.scheduleStatus === 'draft') { e.preventDefault(); setDragOverKey(cellKey); } }}
                      onDragLeave={() => setDragOverKey(k => (k === cellKey ? null : k))}
                      onDrop={e => onCellDrop(p.id, cell.dateISO, e)}
                      style={{
                        padding: compact ? 1 : 3, textAlign: 'center', background: bg, position: 'relative',
                        boxShadow: isConflict ? 'inset 0 0 0 2px #f43f5e' : dragOverKey === cellKey ? 'inset 0 0 0 2px #004E72' : undefined,
                      }}
                      title={isConflict ? `نقض سخت قواعد در این خانه — ${cell.dateISO}` : leaveCell ? `${leaveCell.name} — ${cell.dateISO}` : cell.dateISO}
                    >
                      <button
                        type="button"
                        data-cell=""
                        data-pidx={rowIdx}
                        data-jday={cell.jDay}
                        data-pid={p.id}
                        data-dateiso={cell.dateISO}
                        draggable={st.scheduleStatus === 'draft' && !!cell.entry}
                        onDragStart={e => { e.dataTransfer.setData('text/plain', cellKey); e.dataTransfer.effectAllowed = 'move'; }}
                        onClick={() => openPicker(p.id, cell.dateISO)}
                        title={cell.entry?.isManualEntry ? 'دستی (قفل برای تولید خودکار)' : undefined}
                        style={{
                          display: 'block', width: '100%', minWidth: compact ? 22 : 26, padding: compact ? '1px 0' : '2px 0', borderRadius: 6, fontSize: compact ? 10.5 : 11, fontWeight: 700,
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
      )}
      {deptPeople.length > 0 && deptEntries.length === 0 && (
        <div style={{ marginTop: 12 }}>
          <EmptyState
            variant="not-created"
            title="برای این بخش هنوز برنامه‌ای ساخته نشده است"
            hint="با تولید خودکار، برنامهٔ ماه بر اساس نیازهای روزانه و قوانین ساخته می‌شود؛ یا از کارت «ورود برنامهٔ موجود» در بالای صفحه، برنامهٔ فعلی را از فایل وارد کنید."
            actionLabel="تولید خودکار برنامه"
            onAction={() => void regenerate()}
          />
        </div>
      )}

      {st.viewRole === 'ward_manager' && st.swaps.some(s => s.status === 'accepted' && deptIds.has(s.fromEmployeeId)) && (
        <section style={{ marginTop: 20, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16 }}>
          <h2 style={{ marginTop: 0 }}>جابه‌جایی‌های در انتظار تأیید نهایی</h2>
          {st.swaps.filter(s => s.status === 'accepted' && deptIds.has(s.fromEmployeeId)).map(s => (
            <div key={s.id} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <span>{st.personnel.find(p => p.id === s.fromEmployeeId)?.name} ↔ {st.personnel.find(p => p.id === s.toEmployeeId)?.name} · {s.dateISO}</span>
              <button onClick={() => {
                import('../features/swaps/swapService').then(({ approveSwap }) => {
                  const res = approveSwap(s, st.entries, st.currentEmployeeId, { personnel: st.personnel, shiftTypes: st.shiftTypes });
                  if (!res.ok) { toast.error(res.error); return; }
                  const prevSwap = s;
                  const prevEntries = st.entries;
                  st.updateSwap(res.swap);
                  st.setEntries(res.entries);
                  toast.success('جابه‌جایی تأیید و در برنامه اعمال شد.', {
                    actionLabel: 'بازگردانی',
                    onAction: () => { st.updateSwap(prevSwap); st.setEntries(prevEntries); },
                  });
                });
              }}>تأیید و اعمال</button>
            </div>
          ))}
        </section>
      )}
      {panelPersonId && (() => {
        const person = deptPeople.find(p => p.id === panelPersonId);
        if (!person) return null;
        const pEntries = deptEntries.filter(e => e.personnelId === person.id);
        const cat = { morning: 0, evening: 0, night: 0 };
        for (const e of pEntries) {
          const t = st.shiftTypes.find(s => s.id === e.shiftTypeId);
          if (!t) continue;
          const c = categorizeShift(t);
          if (c === 'morning' || c === 'evening' || c === 'night') cat[c]++;
        }
        const rec = recOf(person.id);
        const bal = st.leaveBalances[person.id];
        const creds = st.credentials.filter(c => c.employeeId === person.id);
        const todayISO = new Date().toISOString().slice(0, 10);
        const pLeaves = st.leaves.filter(l => l.employeeId === person.id && l.status !== 'rejected').slice(0, 4);
        const credColor = (s: string) => (s === 'expired' ? '#be123c' : s === 'expiring' ? '#b45309' : '#15803d');
        return (
          <>
            <div onClick={() => setPanelPersonId(null)} style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgb(10 39 53 / 0.35)' }} />
            <aside aria-label={`خلاصهٔ ${person.name}`} style={{ position: 'fixed', top: 0, bottom: 0, insetInlineEnd: 0, width: 'min(340px, 92vw)', background: '#fff', zIndex: 95, boxShadow: '0 0 32px rgb(15 23 42 / 0.25)', padding: 18, overflowY: 'auto' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <span aria-hidden style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 38, height: 38, borderRadius: '50%', background: '#DCE9F0', color: '#004E72', fontSize: 16, fontWeight: 800 }}>{person.name.trim().charAt(0)}</span>
                <span style={{ lineHeight: 1.3 }}>
                  <strong style={{ fontSize: 16, display: 'block' }}>{person.name}</strong>
                  <span style={{ fontSize: 12, color: '#64748b' }}>{person.role} · {employmentShort(person.employmentStatus)} · کد پرسنلی {person.personnelCode}</span>
                </span>
                <button onClick={() => setPanelPersonId(null)} aria-label="بستن پنل" style={{ marginInlineStart: 'auto', background: 'transparent', border: 'none', boxShadow: 'none', fontSize: 18, color: '#64748b', cursor: 'pointer' }}>×</button>
              </div>
              {blockedIds.has(person.id) && (
                <div style={{ background: '#fff1f2', border: '1px solid #fecdd3', color: '#9f1239', borderRadius: 10, padding: '8px 10px', fontSize: 12.5, margin: '10px 0' }}>
                  قفل صلاحیت فعال است — مدرک منقضی دارد و تا رفع آن در برنامه نمی‌نشیند.
                </div>
              )}
              <h3 style={{ fontSize: 13.5, margin: '14px 0 6px' }}>این ماه در برنامه</h3>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 12.5 }}>
                <span className="stat-card" style={{ padding: '8px 12px' }}>صبح <b>{fa(cat.morning)}</b></span>
                <span className="stat-card" style={{ padding: '8px 12px' }}>عصر <b>{fa(cat.evening)}</b></span>
                <span className="stat-card" style={{ padding: '8px 12px' }}>شب <b>{fa(cat.night)}</b></span>
                {rec && <span className="stat-card" style={{ padding: '8px 12px' }}>کارکرد <b>{fa(rec.workedHours)}</b> از موظفی <b>{fa(rec.dutyHours)}</b></span>}
                {bal && <span className="stat-card" style={{ padding: '8px 12px' }}>ماندهٔ مرخصی <b>{fa(Math.max(0, bal.entitled - bal.used))}</b> روز</span>}
              </div>
              <h3 style={{ fontSize: 13.5, margin: '16px 0 6px' }}>مدارک و اعتبارنامه‌ها</h3>
              {creds.length === 0 ? (
                <p style={{ fontSize: 12.5, color: '#64748b', margin: 0 }}>مدرکی ثبت نشده است.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {creds.map(c => {
                    const s = credentialStatus(c, todayISO);
                    return (
                      <div key={c.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, border: '1px solid #e2e8f0', borderRadius: 10, padding: '7px 10px' }}>
                        <span style={{ fontWeight: 600 }}>{c.title}</span>
                        <span style={{ color: '#64748b' }}>{KIND_FA[c.kind]}</span>
                        <span style={{ marginInlineStart: 'auto', color: credColor(s), fontWeight: 700 }}>{STATUS_FA[s]}</span>
                      </div>
                    );
                  })}
                </div>
              )}
              <h3 style={{ fontSize: 13.5, margin: '16px 0 6px' }}>مرخصی‌های اخیر</h3>
              {pLeaves.length === 0 ? (
                <p style={{ fontSize: 12.5, color: '#64748b', margin: 0 }}>مرخصی ثبت‌شده‌ای ندارد.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {pLeaves.map(l => (
                    <div key={l.id} style={{ fontSize: 12.5, border: '1px solid #e2e8f0', borderRadius: 10, padding: '7px 10px', display: 'flex', gap: 8 }}>
                      <span style={{ fontWeight: 600 }}>{LEAVE_TYPES.find(t => t.code === l.leaveTypeCode)?.name ?? l.leaveTypeCode}</span>
                      <span style={{ color: '#64748b' }}>{l.startISO === l.endISO ? faDayMonth(l.startISO) : `${faDayMonth(l.startISO)} تا ${faDayMonth(l.endISO)}`}</span>
                      <span style={{ marginInlineStart: 'auto', fontWeight: 700, color: l.status === 'approved' ? '#15803d' : '#b45309' }}>{l.status === 'approved' ? 'تأییدشده' : 'در انتظار'}</span>
                    </div>
                  ))}
                </div>
              )}
            </aside>
          </>
        );
      })()}
      {st.scheduleStatus === 'draft' && deptEntries.length > 0 && (
        <div style={{
          position: 'fixed', bottom: 0, insetInlineStart: 0, insetInlineEnd: 0, zIndex: 55,
          background: '#fffbeb', borderTop: '1px solid #fde68a', padding: '10px 20px',
          display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap',
          boxShadow: '0 -4px 14px rgb(15 23 42 / 0.06)',
        }}>
          <span style={{ fontSize: 13.5, color: '#78350f' }}>
            <strong>برنامهٔ این ماه هنوز منتشر نشده است.</strong> تا انتشار، برنامه برای پرسنل نهایی نیست.
          </span>
          <button onClick={publish}>انتشار برنامه</button>
        </div>
      )}
    </div>
  );
}
