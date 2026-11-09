import { useMemo, useState } from 'react';
import { useAppStore } from '../store/appStore';
import {
  effectiveStatus, recordedTariffRevenue,
  wardRecordingHealth, nursingRecordsToCsv, type NursingServiceRecord,
} from '../features/nursingServices/nursingService';
import { isoFromJalali } from '../features/leave/leaveService';
import { J_YEAR, J_MONTH } from '../store/appStore';

const K_RIAL_DEFAULT = 201_000; // ضریب ریالی K — مثال مصوبهٔ ۱۴۰۲؛ پارامتر سالانه است
const shiftFa = { morning: 'صبح', evening: 'عصر', night: 'شب' } as const;
const shiftMap: Record<string, 'morning' | 'evening' | 'night'> = { 's-m': 'morning', 's-e': 'evening', 's-n': 'night' };

export default function NursingServicesPage() {
  const st = useAppStore();
  const nowISO = useMemo(() => new Date().toISOString(), []);
  const deptPeople = st.personnel.filter(p => p.departmentId === st.departmentId);
  const deptIds = useMemo(() => new Set(deptPeople.map(p => p.id)), [deptPeople]);
  const packages = st.nursingPackages;
  const records = st.nursingRecords.filter(r => r.wardId === st.departmentId);
  const names = useMemo(() => new Map(st.personnel.map(p => [p.id, p.name])), [st.personnel]);
  const pkgOf = useMemo(() => new Map(packages.map(p => [p.id, p])), [packages]);

  const [kRial, setKRial] = useState(K_RIAL_DEFAULT);
  const [form, setForm] = useState({ packageId: 'pkg-g4', patientRef: '', count: 1, dateISO: isoFromJalali(J_YEAR, J_MONTH, 13), shift: 'morning' as const, employeeId: '' });

  const expected = useMemo(() => st.entries
    .filter(e => deptIds.has(e.personnelId) && shiftMap[e.shiftTypeId])
    .map(e => ({ employeeId: e.personnelId, dateISO: e.date, shift: shiftMap[e.shiftTypeId]! })), [st.entries, deptIds]);
  const health = useMemo(() => wardRecordingHealth(st.departmentId, expected, st.nursingRecords, packages, kRial, 7.4, nowISO),
    [st.departmentId, expected, st.nursingRecords, kRial, nowISO]);
  const revenue = useMemo(() => recordedTariffRevenue(records, packages, kRial, nowISO), [records, packages, kRial, nowISO]);
  const isManager = st.viewRole === 'ward_manager';

  const faNum = (n: number) => n.toLocaleString('fa-IR');
  const effectivePackageId = packages.some(p => p.id === form.packageId)
    ? form.packageId
    : (packages.find(p => p.careGroup === 4)?.id ?? packages[0]?.id ?? '');
  const addRecord = () => {
    const employeeId = form.employeeId || (isManager ? deptPeople[0]?.id : st.currentEmployeeId) || '';
    if (!employeeId || !form.patientRef.trim()) return;
    const rec: NursingServiceRecord = {
      id: `nsr-${Date.now()}`, wardId: st.departmentId, employeeId,
      patientRef: form.patientRef.trim(), packageId: effectivePackageId, count: form.count,
      dateISO: form.dateISO, shift: form.shift, status: 'recorded', recordedAtISO: new Date().toISOString(),
    };
    st.addNursingRecord(rec);
    setForm(f => ({ ...f, patientRef: '' }));
  };
  const exportCsv = () => {
    const url = URL.createObjectURL(new Blob([nursingRecordsToCsv(records, packages, names, nowISO)], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = `nursing-services-${J_YEAR}-${J_MONTH}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const card = (title: string, value: string, hint: string, danger = false) => (
    <div style={{ background: '#fff', border: `1px solid ${danger ? '#fda4af' : '#e2e8f0'}`, borderRadius: 12, padding: 14, minWidth: 170 }}>
      <div style={{ fontSize: 12, color: '#64748b' }}>{title}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: danger ? '#e11d48' : '#1e293b', margin: '4px 0' }}>{value}</div>
      <div style={{ fontSize: 12, color: '#64748b' }}>{hint}</div>
    </div>
  );

  return (
    <div>
      <h1>ثبت خدمات پرستاری و داشبورد کسورات — مهر ۱۴۰۵</h1>
      <p style={{ color: '#64748b', fontSize: 13, maxWidth: 760 }}>
        هر خدمت ثبت‌شده، درآمد تعرفه‌ای بیمارستان است؛ هر شیفتِ بدون ثبت، کسور بیمه در آینده.
        ثبت با پرستار است، تأیید با سرپرستار تا دو روز — بعد از آن خودکار تأیید می‌شود (دستورالعمل بازتوزیع گروه پرستاری).
      </p>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <label style={{ fontSize: 13 }}>ضریب ریالی K (ریال):
          <input type="number" value={kRial} onChange={e => setKRial(Number(e.target.value) || 0)}
            style={{ marginInlineStart: 6, width: 120, padding: 6, borderRadius: 8, border: '1px solid #ddd' }} />
        </label>
        <span style={{ fontSize: 12, color: '#64748b' }}>پارامتر سالانهٔ مصوبه است؛ مقدار فعلی مثال ۱۴۰۲ است و هر سال با ابلاغ تازه به‌روز می‌شود.</span>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        {card('پوشش ثبت شیفت‌ها', health.coveragePercent == null ? '—' : `${health.coveragePercent.toLocaleString('fa-IR')}٪`, `${faNum(health.recordedShifts)} از ${faNum(health.expectedNurseShifts)} شیفت این بخش`, (health.coveragePercent ?? 100) < 90)}
        {card('درآمد تعرفه‌ای ثبت‌شده', `${faNum(Math.round(revenue.revenueRials / 10))} تومان`, `مجموع K ثبت و تأییدشده: ${faNum(Math.round(revenue.totalK * 10) / 10)}`)}
        {card('درآمد در معرض کسور (برآورد)', `${faNum(Math.round(health.estimatedRevenueAtRiskRials / 10))} تومان`, 'شیفت‌های بدون ثبت × میانگین K هر شیفت', health.estimatedRevenueAtRiskRials > 0)}
        {card('ثبت‌های در انتظار تأیید', faNum(records.filter(r => effectiveStatus(r, nowISO) === 'recorded').length), 'پس از دو روز خودکار تأیید می‌شوند')}
      </div>

      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 14, marginBottom: 16 }}>
        <strong style={{ fontSize: 14 }}>ثبت خدمت تازه</strong>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10, alignItems: 'end' }}>
          <label style={{ fontSize: 12 }}>بستهٔ خدمت
            <select value={effectivePackageId} onChange={e => setForm(f => ({ ...f, packageId: e.target.value }))} style={{ display: 'block', padding: 7, borderRadius: 8, border: '1px solid #ddd', minWidth: 260 }}>
              {packages.map(p => <option key={p.id} value={p.id}>{p.title} — K={p.kValue}</option>)}
            </select></label>
          <label style={{ fontSize: 12 }}>شناسهٔ بیمار (کد پذیرش)
            <input value={form.patientRef} onChange={e => setForm(f => ({ ...f, patientRef: e.target.value }))} placeholder="P-1024" style={{ display: 'block', padding: 7, borderRadius: 8, border: '1px solid #ddd', width: 110 }} /></label>
          <label style={{ fontSize: 12 }}>تعداد
            <input type="number" min={1} value={form.count} onChange={e => setForm(f => ({ ...f, count: Number(e.target.value) || 1 }))} style={{ display: 'block', padding: 7, borderRadius: 8, border: '1px solid #ddd', width: 70 }} /></label>
          <label style={{ fontSize: 12 }}>تاریخ
            <input type="date" value={form.dateISO} onChange={e => setForm(f => ({ ...f, dateISO: e.target.value }))} style={{ display: 'block', padding: 7, borderRadius: 8, border: '1px solid #ddd' }} /></label>
          <label style={{ fontSize: 12 }}>نوبت
            <select value={form.shift} onChange={e => setForm(f => ({ ...f, shift: e.target.value as typeof f.shift }))} style={{ display: 'block', padding: 7, borderRadius: 8, border: '1px solid #ddd' }}>
              <option value="morning">صبح</option><option value="evening">عصر</option><option value="night">شب</option>
            </select></label>
          {isManager && (
            <label style={{ fontSize: 12 }}>پرستار
              <select value={form.employeeId} onChange={e => setForm(f => ({ ...f, employeeId: e.target.value }))} style={{ display: 'block', padding: 7, borderRadius: 8, border: '1px solid #ddd' }}>
                <option value="">— انتخاب —</option>
                {deptPeople.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select></label>
          )}
          <button onClick={addRecord} style={{ padding: '8px 16px' }}>ثبت خدمت</button>
          <button onClick={exportCsv} disabled={!records.length}>خروجی CSV ثبت‌ها</button>
        </div>
      </div>

      <div style={{ overflowX: 'auto', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12 }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 13, minWidth: 760, width: '100%' }}>
          <thead><tr style={{ background: '#f1f5f9' }}>
            {['تاریخ', 'پرستار', 'بیمار', 'بسته', 'تعداد', 'K', 'نوبت', 'وضعیت', ''].map(h => <th key={h} style={{ padding: 8 }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {records.map(r => {
              const status = effectiveStatus(r, nowISO);
              const pkg = pkgOf.get(r.packageId);
              return (
                <tr key={r.id} style={{ borderTop: '1px solid #eee', textAlign: 'center' }}>
                  <td style={{ padding: 8 }}>{r.dateISO}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{names.get(r.employeeId) ?? r.employeeId}</td>
                  <td>{r.patientRef}</td>
                  <td style={{ textAlign: 'right' }}>{pkg?.title ?? r.packageId}</td>
                  <td>{faNum(r.count)}</td><td>{faNum((pkg?.kValue ?? 0) * r.count)}</td>
                  <td>{shiftFa[r.shift]}</td>
                  <td>{status === 'confirmed' ? 'تأیید سرپرستار' : status === 'auto_confirmed' ? 'تأیید خودکار' : 'در انتظار تأیید'}</td>
                  <td>{isManager && status === 'recorded' && deptIds.has(r.employeeId) && (
                    <button onClick={() => st.confirmNursingRecord(r.id, st.currentEmployeeId)} style={{ padding: '4px 10px' }}>تأیید</button>)}
                  </td>
                </tr>
              );
            })}
            {records.length === 0 && <tr><td colSpan={9} style={{ padding: 12 }}>برای این بخش هنوز ثبتی نیست.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
