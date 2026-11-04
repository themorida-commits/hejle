import { useMemo, useState } from 'react';
import { useAppStore, J_YEAR, J_MONTH } from '../store/appStore';
import { buildKaranehSheet, karanehToCsv } from '../features/performance/performanceService';
import { reconcileAttendance, summarizeAttendance } from '../features/attendance/attendanceService';
import {
  MOH_KARANEH_1404, computeGroupPools, computeNursingKaraneh, nursingSlips, slipsToCsv,
  physicianShareM, physicianQ, type KaranehParams,
} from '../features/performance/karanehEngine';

interface HospitalKaranehProfile { nursingShare: number; onCallCoef: number; kRial: number }
const PROFILE_KEY = 'hejleh-karaneh-profile';
function loadProfile(): HospitalKaranehProfile {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (raw) return { nursingShare: 0.85, onCallCoef: 4, kRial: 201_000, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { nursingShare: 0.85, onCallCoef: 4, kRial: 201_000 };
}

function PhysicianCalculator() {
  const [worked, setWorked] = useState(800);           // میلیون ریال کارکرد جزء حرفه‌ای
  const [region, setRegion] = useState<'developed' | 'deprived'>('developed');
  const [quality, setQuality] = useState(75);
  const m = physicianShareM(worked, region);
  const q = physicianQ(quality);
  const p = m * q;
  const fa = (n: number) => Math.round(n).toLocaleString('fa-IR');
  const input = { padding: 6, borderRadius: 8, border: '1px solid #ddd', width: 110, marginInlineStart: 6 } as const;
  // ریز پلکان برای شفافیت محاسبه
  const slices: string[] = [];
  let rem = worked; let lower = 0;
  for (const b of MOH_KARANEH_1404.physicianBrackets) {
    if (rem <= 0) break;
    const width = b.upToMillionRials == null ? rem : Math.min(rem, b.upToMillionRials - lower);
    const rate = region === 'deprived' ? b.deprived : b.developed;
    slices.push(`${fa(width)} × ${(rate * 100).toLocaleString('fa-IR')}٪`);
    rem -= width;
    if (b.upToMillionRials != null) lower = b.upToMillionRials;
  }
  return (
    <div style={{ borderTop: '1px dashed #ddd', paddingTop: 12, marginTop: 12 }}>
      <strong style={{ fontSize: 14 }}>محاسبه‌گر کارانهٔ پزشک (P = M × Q)</strong>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', margin: '10px 0', fontSize: 13 }}>
        <label>کارکرد ماهانه جزء حرفه‌ای (میلیون ریال)<input type="number" style={input} value={worked} onChange={e => setWorked(Number(e.target.value) || 0)} /></label>
        <label>منطقه
          <select style={{ ...input, width: 130 }} value={region} onChange={e => setRegion(e.target.value as typeof region)}>
            <option value="developed">برخوردار</option><option value="deprived">محروم (الف و ب)</option>
          </select></label>
        <label>امتیاز کیفی (۰ تا ۱۰۰)<input type="number" style={input} value={quality} onChange={e => setQuality(Number(e.target.value) || 0)} /></label>
      </div>
      <div style={{ fontSize: 13, display: 'flex', gap: 18, flexWrap: 'wrap' }}>
        <span>ریز پلکان M: {slices.join(' + ') || '—'}</span>
        <span>M = <strong>{fa(m)}</strong> میلیون ریال</span>
        <span>Q = <strong>{(q * 100).toLocaleString('fa-IR')}٪</strong></span>
        <span>کارانهٔ پزشک P = <strong>{fa(p)} میلیون ریال</strong> ({fa(p * 1e6)} ریال)</span>
      </div>
      <p style={{ fontSize: 12, color: '#68707a', marginBottom: 0 }}>در نسخهٔ جاری دستورالعمل سقف ریالی فردی حذف شده است؛ ترمزها سقف جمعی ۶۳٪ و پلکان نزولی‌اند.</p>
    </div>
  );
}
import {
  recordedTariffRevenue, quantitativePointsByNurse,
} from '../features/nursingServices/nursingService';

function MohKaranehSection() {
  const st = useAppStore();
  const nowISO = useMemo(() => new Date().toISOString(), []);
  const [profMillion, setProfMillion] = useState(120000);       // میلیون ریال — ورودی نمایشی واحد مالی
  const [nursingPkgMillion, setNursingPkgMillion] = useState(40000);
  const [profile, setProfile] = useState<HospitalKaranehProfile>(loadProfile);
  const kRial = profile.kRial;
  const setKRial = (v: number) => setProfile(p => { const next = { ...p, kRial: v }; try { localStorage.setItem(PROFILE_KEY, JSON.stringify(next)); } catch { /* ignore */ } return next; });
  const updateProfile = (patch: Partial<HospitalKaranehProfile>) => setProfile(p => { const next = { ...p, ...patch }; try { localStorage.setItem(PROFILE_KEY, JSON.stringify(next)); } catch { /* ignore */ } return next; });
  const params: KaranehParams = useMemo(() => ({
    ...MOH_KARANEH_1404,
    shares: { ...MOH_KARANEH_1404.shares, nursingOfNursingPackages: profile.nursingShare },
    onCallCoef: profile.onCallCoef,
  }), [profile]);
  const deptPeople = st.personnel.filter(p => p.departmentId === st.departmentId);
  const names = useMemo(() => new Map(st.personnel.map(p => [p.id, p.name])), [st.personnel]);
  const pools = useMemo(() => computeGroupPools(profMillion * 1e6, nursingPkgMillion * 1e6, 0, params), [profMillion, nursingPkgMillion, params]);

  // زنجیرهٔ واقعی این بخش: ثبت خدمت ← درآمد تعرفه‌ای ← استخر ۸۵٪ ← تسهیم امتیازی
  const wardRecords = st.nursingRecords.filter(r => r.wardId === st.departmentId);
  const revenue = useMemo(() => recordedTariffRevenue(wardRecords, st.nursingPackages, kRial, nowISO), [wardRecords, st.nursingPackages, kRial, nowISO]);
  const wardPool = revenue.revenueRials * params.shares.nursingOfNursingPackages;
  const quant = useMemo(() => quantitativePointsByNurse(wardRecords, st.nursingPackages, nowISO), [wardRecords, st.nursingPackages, nowISO]);
  const distribution = useMemo(() => computeNursingKaraneh(
    deptPeople.map(p => p.personnelCode.startsWith('HN-')
      ? { employeeId: p.id, indirectRole: 'headNurse' as const, qualityScore: 1, presenceFactor: 1 }
      : { employeeId: p.id, rawQuantitative: quant.get(p.id) ?? 0, qualityScore: 1 }),
    wardPool, params,
  ), [deptPeople, quant, wardPool, params]);
  const slips = useMemo(() => nursingSlips(distribution, names), [distribution, names]);
  const faM = (n: number) => Math.round(n).toLocaleString('fa-IR');

  const exportSlips = () => {
    const url = URL.createObjectURL(new Blob([slipsToCsv(slips)], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = `karaneh-slips-${J_YEAR}-${J_MONTH}.csv`; a.click();
    URL.revokeObjectURL(url);
  };
  const input = { padding: 6, borderRadius: 8, border: '1px solid #ddd', width: 130, marginInlineStart: 6 } as const;

  return (
    <div style={{ background: '#fff', border: '1px solid #cfe0da', borderRadius: 12, padding: 16, marginBottom: 20 }}>
      <h2 style={{ marginTop: 0, fontSize: 17 }}>محاسبه با قالب وزارت بهداشت — ویرایش ۱۴۰۴</h2>
      <p style={{ color: '#68707a', fontSize: 13, maxWidth: 780 }}>
        قالب پیش‌فرض اسناد جاری وزارت بهداشت (سهم‌ها و ضرایب عین دستورالعمل)؛ هر بیمارستان پروفایل پارامتر خودش را دارد و می‌تواند اعداد را با مصوبهٔ داخلی‌اش جایگزین کند.
        تسهیم پرستاری این بخش از روی <strong>ثبت‌های واقعی خدمات همین بخش</strong> محاسبه می‌شود: ثبت خدمت ← درآمد تعرفه‌ای ← استخر ۸۵٪ گروه پرستاری ← امتیاز کمی/کیفی.
      </p>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 12, fontSize: 13 }}>
        <label>درآمد وصولی جزء حرفه‌ای (میلیون ریال)<input type="number" style={input} value={profMillion} onChange={e => setProfMillion(Number(e.target.value) || 0)} /></label>
        <label>درآمد وصولی بسته‌های پرستاری (میلیون ریال)<input type="number" style={input} value={nursingPkgMillion} onChange={e => setNursingPkgMillion(Number(e.target.value) || 0)} /></label>
        <label>ضریب ریالی K<input type="number" style={input} value={kRial} onChange={e => setKRial(Number(e.target.value) || 0)} /></label>
      </div>
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 13, marginBottom: 14 }}>
        <span>سقف پزشکان (۶۳٪): <strong>{faM(pools.physiciansCap / 1e6)}</strong> میلیون ریال</span>
        <span>دستیاران (۴٪): <strong>{faM(pools.assistants / 1e6)}</strong></span>
        <span>غیرپزشکان (۱۰٫۵٪ + ۴٪): <strong>{faM(pools.nonPhysician / 1e6)}</strong></span>
        <span>گروه پرستاری ({(profile.nursingShare * 100).toLocaleString('fa-IR')}٪): <strong>{faM(pools.nursing / 1e6)}</strong></span>
      </div>
      <div style={{ borderTop: '1px dashed #ddd', paddingTop: 12 }}>
        <div style={{ fontSize: 13, marginBottom: 8 }}>
          این بخش: درآمد تعرفه‌ای ثبت‌شده <strong>{faM(revenue.revenueRials)}</strong> ریال (K کل: {revenue.totalK.toLocaleString('fa-IR')}) ←
          استخر قابل توزیع پرستاری <strong>{faM(wardPool)}</strong> ریال
          <button onClick={exportSlips} disabled={!slips.length} style={{ marginInlineStart: 12 }}>خروجی CSV فیش‌های کارانه</button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: 13, minWidth: 640, width: '100%' }}>
            <thead><tr style={{ background: '#eef4f1' }}>
              {['پرستار', 'امتیاز کمی (پس از سقف)', 'ضریب کیفی', 'امتیاز نهایی', 'سهم ٪', 'مبلغ کارانه (ریال)'].map(h => <th key={h} style={{ padding: 7 }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {distribution.map(r => (
                <tr key={r.employeeId} style={{ borderTop: '1px solid #eee', textAlign: 'center' }}>
                  <td style={{ padding: 7, textAlign: 'right', fontWeight: 600 }}>{names.get(r.employeeId) ?? r.employeeId}</td>
                  <td>{r.cappedQuantitative.toLocaleString('fa-IR', { maximumFractionDigits: 1 })}</td>
                  <td>{r.qualityFactor.toLocaleString('fa-IR')}</td>
                  <td>{r.points.toLocaleString('fa-IR', { maximumFractionDigits: 1 })}</td>
                  <td>{(r.share * 100).toLocaleString('fa-IR', { maximumFractionDigits: 1 })}</td>
                  <td><strong>{faM(r.amount)}</strong></td>
                </tr>
              ))}
              {distribution.length === 0 && <tr><td colSpan={6} style={{ padding: 10 }}>پرسنلی در این بخش نیست.</td></tr>}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: 12, color: '#68707a', marginBottom: 0 }}>
          فیش هر پرستار اجزای امتیازش را شفاف نشان می‌دهد و اضافه‌کار جدا از کارانه می‌آید — همان شفافیتی که سند بازتوزیع الزام می‌کند. امتیاز کیفی این نما ۱٫۰ است؛ در بهره‌برداری، از ارزیابی دوره‌ای بیمارستان می‌آید.
        </p>
      </div>
      <div style={{ borderTop: '1px dashed #ddd', paddingTop: 12, marginTop: 12 }}>
        <strong style={{ fontSize: 14 }}>پروفایل پارامتر این بیمارستان</strong>
        <span style={{ fontSize: 12, color: '#68707a', marginInlineStart: 8 }}>مقادیر پیش‌فرض عین دستورالعمل است؛ هر مرکز فقط مصوبهٔ داخلی خودش را جایگزین می‌کند. روی همین دستگاه ذخیره می‌شود.</span>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 10, fontSize: 13 }}>
          <label>سهم گروه پرستاری از درآمد بسته‌ها (٪)
            <input type="number" min={0} max={100} style={input} value={Math.round(profile.nursingShare * 100)} onChange={e => updateProfile({ nursingShare: Math.min(1, Math.max(0, (Number(e.target.value) || 0) / 100)) })} /></label>
          <label>ضریب آنکالی غیرپزشکان (۳ تا ۵)
            <input type="number" min={3} max={5} step={0.5} style={input} value={profile.onCallCoef} onChange={e => updateProfile({ onCallCoef: Math.min(5, Math.max(3, Number(e.target.value) || 4)) })} /></label>
          <label>ضریب ریالی K (ریال)
            <input type="number" style={input} value={profile.kRial} onChange={e => updateProfile({ kRial: Number(e.target.value) || 0 })} /></label>
        </div>
      </div>
      <PhysicianCalculator />
    </div>
  );
}

export default function KaranehPage() {
  const st = useAppStore();
  const deptPeople = st.personnel.filter(p => p.departmentId === st.departmentId);
  const deptIds = useMemo(() => new Set(deptPeople.map(p => p.id)), [deptPeople]);
  const records = st.workRecords.filter(r => deptIds.has(r.employeeId));

  const rows = useMemo(() => {
    if (!records.length) return [];
    const leaveMap = new Map<string, Set<string>>();
    for (const l of st.leaves) {
      if (l.status !== 'approved') continue;
      const set = leaveMap.get(l.employeeId) ?? new Set<string>();
      const cur = new Date(l.startISO + 'T00:00:00');
      const end = new Date(l.endISO + 'T00:00:00');
      while (cur <= end) { set.add(cur.toISOString().slice(0, 10)); cur.setDate(cur.getDate() + 1); }
      leaveMap.set(l.employeeId, set);
    }
    const summaries = summarizeAttendance(reconcileAttendance({
      personnel: deptPeople, entries: st.entries.filter(e => deptIds.has(e.personnelId)),
      events: st.attendanceEvents.filter(e => deptIds.has(e.employeeId)),
      shiftTypes: st.shiftTypes, leaveDatesByEmployee: leaveMap,
    }));
    return buildKaranehSheet(records, summaries);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st.workRecords, st.attendanceEvents, st.departmentId]);

  const fa = (n: number | null) => (n == null ? '—' : n.toLocaleString('fa-IR', { maximumFractionDigits: 1 }));
  const exportCsv = () => {
    const url = URL.createObjectURL(new Blob([karanehToCsv(rows)], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = `karaneh-${J_YEAR}-${J_MONTH}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <MohKaranehSection />
      <h1>برگهٔ کارانه — مهر ۱۴۰۵</h1>
      <p style={{ color: '#68707a', fontSize: 13 }}>
        مؤلفه‌های شفاف کارانه از کارکرد و حضور — فرمول نهایی کارانه سیاست بیمارستان است و این برگه «ورودی» آن است، نه خود فرمول.
        {records.length === 0 && ' اول از صفحهٔ کارکرد، محاسبهٔ ماه را انجام بده.'}
      </p>
      <button onClick={exportCsv} disabled={!rows.length} style={{ marginBottom: 12 }}>خروجی CSV برگهٔ کارانه</button>
      <div style={{ overflowX: 'auto', background: '#fff', border: '1px solid #e3ddd2', borderRadius: 12 }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 13, minWidth: 900 }}>
          <thead><tr style={{ background: '#f3efe7' }}>
            {['نام', 'جمع پرداختی', 'شب', 'تعطیل', 'اضافه‌کار', 'حضور', 'غیبت', 'تأخیر (دقیقه)', 'شاخص حضور ٪', 'مرخصی'].map(h => <th key={h} style={{ padding: 8 }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.employeeId} style={{ borderTop: '1px solid #eee', textAlign: 'center' }}>
                <td style={{ padding: 8, textAlign: 'right', fontWeight: 600 }}>{r.employeeName}</td>
                <td><strong>{fa(r.totalPaidHours)}</strong></td><td>{fa(r.nightHours)}</td><td>{fa(r.holidayHours)}</td>
                <td>{fa(r.overtimeHours)}</td><td>{fa(r.presentDays)}</td><td>{fa(r.absentDays)}</td>
                <td>{fa(r.lateMinutes)}</td><td>{fa(r.attendanceRate)}</td><td>{fa(r.leaveDays)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={10} style={{ padding: 12 }}>هنوز کارکردی محاسبه نشده است.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
