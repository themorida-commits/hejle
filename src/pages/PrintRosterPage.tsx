import { useMemo, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore, J_YEAR, J_MONTH } from '../store/appStore';
import { useSessionStore } from '../store/session';
import { buildMonthGrid, shiftSymbol } from '../features/roster/rosterModel';
import {
  LEAVE_CELL, HOLIDAY_BG, weekdayLetters, holidayDayNumbers, buildLeaveCellStates,
  buildLeaveDatesMap, dayCountsByCategory, buildAnnex, employmentShort,
} from '../features/roster/rosterPrintModel';
import { computeWorkRecords } from '../features/workRecords/workRecordService';
import { MONTHS } from '../core/defaults';
import { getDaysInJalaliMonth } from '../core/jalali';

// فرم چاپی رسمی «برنامه چینش شیفت» (دور ۷) — همان فرم کاغذی بخش، از دادهٔ زندهٔ ماه.
// اعداد کارکرد/موظفی از computeWorkRecords (منبع واحد با صفحهٔ کارکرد) و مانده از leaveBalances می‌آید.
const fa = (n: number) => n.toLocaleString('fa-IR', { maximumFractionDigits: 1 });
const cell: CSSProperties = { border: '1px solid #444', padding: '2px 1px', textAlign: 'center', fontSize: 10 };
const head: CSSProperties = { ...cell, background: '#eee', fontWeight: 700 };

export default function PrintRosterPage() {
  const st = useAppStore();
  const session = useSessionStore();
  const navigate = useNavigate();

  const deptPeople = useMemo(() => st.personnel.filter(p => p.departmentId === st.departmentId), [st.personnel, st.departmentId]);
  const deptIds = useMemo(() => new Set(deptPeople.map(p => p.id)), [deptPeople]);
  const deptEntries = useMemo(() => st.entries.filter(e => deptIds.has(e.personnelId)), [st.entries, deptIds]);
  const grid = useMemo(
    () => buildMonthGrid({ personnel: deptPeople, entries: deptEntries, jYear: J_YEAR, jMonth: J_MONTH }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [st.entries, st.departmentId],
  );
  const days = getDaysInJalaliMonth(J_YEAR, J_MONTH);
  const letters = useMemo(() => weekdayLetters(J_YEAR, J_MONTH), []);
  const holidays = useMemo(() => holidayDayNumbers(J_YEAR, J_MONTH), []);
  const leaveStates = useMemo(() => buildLeaveCellStates(st.leaves.filter(l => deptIds.has(l.employeeId))), [st.leaves, deptIds]);
  const counts = useMemo(
    () => dayCountsByCategory(deptEntries, st.shiftTypes, deptIds, J_YEAR, J_MONTH),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [st.entries, st.departmentId],
  );
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
  const annex = useMemo(() => buildAnnex(st.leaves, deptPeople, J_YEAR, J_MONTH), [st.leaves, deptPeople]);
  const wardName = st.departments.find(d => d.id === st.departmentId)?.name ?? '';
  const hospitalName = session.hospitals.find(h => h.hospitalId === session.hospitalId)?.hospitalName
    ?? (st.dataSource === 'demo' ? 'بیمارستان دمو' : '…………');
  const headNurse = deptPeople.find(p => p.role.includes('سرپرستار'))?.name ?? '';
  const monthName = MONTHS.find(m => m.value === J_MONTH)?.name ?? '';
  // نیاز روزانه از ورودی مستقیم سرپرستار در جدول برنامه می‌آید (به‌تفکیک روز)؛
  // سه‌تایی تنظیمات فقط مقدار اولیهٔ همان آرایه‌هاست.
  const reqRow = (label: string, values: number[]) => (
    <tr>
      <th colSpan={6} style={head}>{label}</th>
      {Array.from({ length: days }, (_, i) => (
        <th key={i} style={head}>{(values[i] ?? 0) > 0 ? fa(values[i]!) : ''}</th>
      ))}
      <th style={head}></th>
      <th style={head}></th>
    </tr>
  );
  const countRow = (label: string, arr: number[]) => (
    <tr>
      <th colSpan={6} style={head}>{label}</th>
      {arr.map((v, i) => <th key={i} style={head}>{v > 0 ? fa(v) : ''}</th>)}
      <th style={head}></th>
      <th style={head}></th>
    </tr>
  );
  const annexTable = (title: string, rows: { name: string; detail: string }[]) => (
    <div style={{ flex: '1 1 46%' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead><tr><th colSpan={2} style={head}>{title}</th></tr></thead>
        <tbody>
          {(rows.length > 0 ? rows : [{ name: '', detail: '' }, { name: '', detail: '' }]).map((r, i) => (
            <tr key={i}>
              <td style={{ ...cell, width: '38%', minHeight: 18 }}>{r.name}</td>
              <td style={cell}>{r.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div>
      <div className="no-print" style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button onClick={() => navigate('/scheduler')}>بازگشت به برنامهٔ شیفت</button>
        <button onClick={() => window.print()} style={{ padding: '7px 18px' }}>چاپ فرم (A3 افقی)</button>
        <span style={{ fontSize: 12, color: '#68707a' }}>
          این فرم از دادهٔ زندهٔ {monthName} {fa(J_YEAR)} ساخته می‌شود؛ اعداد کارکرد همان اعداد صفحهٔ «کارکرد ماهانه» است.
        </span>
      </div>

      <div className="print-area" dir="rtl" style={{ background: '#fff', color: '#000', padding: 8 }}>
        <h1 style={{ textAlign: 'center', fontSize: 16, margin: '4px 0 10px' }}>
          برنامه چینش شیفت ماه {monthName} سال {fa(J_YEAR)} پرسنل پرستاری بیمارستان {hospitalName} — بخش {wardName}
          {st.scheduleStatus === 'published' ? '' : ' (پیش‌نویس)'}
        </h1>
        <table style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed' }}>
          <thead>
            {reqRow('تعداد صبح', st.dailyReqs.morning)}
            {reqRow('تعداد عصر', st.dailyReqs.evening)}
            {reqRow('تعداد شب', st.dailyReqs.night)}
            <tr>
              <th colSpan={6} style={head}></th>
              {letters.map((l, i) => (
                <th key={i} style={{ ...head, color: l === 'ج' ? '#b3402f' : undefined }}>{l}</th>
              ))}
              <th style={head}></th>
              <th style={head}></th>
            </tr>
            <tr>
              <th style={{ ...head, width: 26 }}>ردیف</th>
              <th style={{ ...head, width: 110 }}>اسامی</th>
              <th style={{ ...head, width: 30 }}>وضعیت</th>
              <th style={{ ...head, width: 62 }}>سمت</th>
              <th style={{ ...head, width: 40 }}>موظفی ماه</th>
              <th style={{ ...head, width: 40 }}>طلب/بدهی</th>
              {Array.from({ length: days }, (_, i) => (
                <th key={i} style={head}>{fa(i + 1)}</th>
              ))}
              <th style={{ ...head, width: 44 }}>مجموع ساعت شیفت</th>
              <th style={{ ...head, width: 44 }}>کسر/اضافه کار</th>
            </tr>
          </thead>
          <tbody>
            {deptPeople.map((p, idx) => {
              const rec = recOf(p.id);
              const bal = st.leaveBalances[p.id];
              const remaining = bal ? bal.entitled - bal.used : null;
              const diff = rec ? rec.workedHours - rec.dutyHours : 0;
              return (
                <tr key={p.id}>
                  <td style={cell}>{fa(idx + 1)}</td>
                  <td style={{ ...cell, textAlign: 'right', whiteSpace: 'nowrap', overflow: 'hidden' }}>{p.name}</td>
                  <td style={cell}>{employmentShort(p.employmentStatus)}</td>
                  <td style={{ ...cell, whiteSpace: 'nowrap', overflow: 'hidden' }}>{p.role}</td>
                  <td style={cell}>{rec ? fa(rec.dutyHours) : ''}</td>
                  <td style={cell}>{remaining !== null ? fa(remaining) : ''}</td>
                  {(grid.get(p.id) ?? []).map(c => {
                    const leaveCode = leaveStates.get(`${p.id}|${c.dateISO}`);
                    const leaveCell = leaveCode ? LEAVE_CELL[leaveCode] : undefined;
                    const isHoliday = holidays.has(c.jDay);
                    const bg = leaveCell?.bg ?? (isHoliday && !c.entry ? HOLIDAY_BG : c.isFriday ? '#fdf2f2' : undefined);
                    return (
                      <td key={c.jDay} style={{ ...cell, background: bg, fontWeight: c.entry?.isManualEntry ? 700 : 400 }}>
                        {c.entry ? shiftSymbol(st.shiftTypes, c.entry.shiftTypeId) : leaveCell ? leaveCell.label : ''}
                      </td>
                    );
                  })}
                  <td style={cell}>{rec ? fa(rec.workedHours) : ''}</td>
                  <td style={cell}>{rec ? `${diff > 0 ? '+' : ''}${fa(diff)}` : ''}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            {countRow('تعداد صبح', counts.morning)}
            {countRow('تعداد عصر', counts.evening)}
            {countRow('تعداد شب', counts.night)}
          </tfoot>
        </table>

        <table style={{ borderCollapse: 'collapse', width: '100%', marginTop: 10 }}>
          <tbody>
            <tr>
              <td style={{ ...cell, width: '33%', height: 44, verticalAlign: 'top', textAlign: 'right', padding: 6 }}>
                سرپرستار بخش {wardName}: {headNurse}
              </td>
              <td style={{ ...cell, width: '34%', verticalAlign: 'top', textAlign: 'right', padding: 6 }}>
                مدیر خدمات پرستاری: {st.signatures.matronName}
              </td>
              <td style={{ ...cell, verticalAlign: 'top', textAlign: 'right', padding: 6 }}>
                رییس بیمارستان: {st.signatures.chiefName}
              </td>
            </tr>
          </tbody>
        </table>

        <div style={{ pageBreakBefore: 'always', marginTop: 18 }}>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            {annexTable('تشویقی', annex.incentive)}
            {annexTable('تو راهی', annex.enroute)}
            {annexTable('استعلاجی', annex.sick)}
            {annexTable('ماموریت', annex.mission)}
          </div>
          <p style={{ fontSize: 11, marginTop: 12 }}>
            توضیحات: {st.rosterNote || '—'}
          </p>
          <p style={{ fontSize: 11 }}>
            راهنمای رنگ و نشانه‌ها: زرد = تعطیل رسمی ·{' '}
            {Object.values(LEAVE_CELL).map(v => `${v.label} = ${v.name}`).join(' · ')}
          </p>
        </div>
      </div>
    </div>
  );
}
