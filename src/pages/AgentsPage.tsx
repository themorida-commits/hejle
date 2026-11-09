import { useMemo, useState } from 'react';
import { useAppStore, J_YEAR, J_MONTH } from '../store/appStore';
import { MONTHS } from '../core/defaults';
import { POLICY_CORPUS } from '../features/agents/policyCorpus';
import {
  NO_GROUNDED_ANSWER_FA, credentialRadar, anomalyScan, explainAnomaly,
  type PolicyAnswer, type RadarBucket,
} from '../features/agents/agentCore';

// مرکز ایجنت‌ها — فاز ۱ لایهٔ ایجنت (NUR-DR-2026-003، دور ۱۷).
// هر سه ابزار Zone A هستند: فقط می‌خوانند و توضیح می‌دهند. پاسخ copilot از
// پیکرهٔ مستند خود سیستم می‌آید (با citation)؛ رادار و اسکن قطعی‌اند و هر
// اجرا در «ردّ اجراها» ثبت می‌شود تا قابل audit باشد. تصمیم با انسان است.
const faNum = (n: number) => n.toLocaleString('fa-IR');
const faDateTime = (iso: string) => new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
const inputStyle = { display: 'block', padding: 8, borderRadius: 8, border: '1px solid #cbd5e1', background: '#f8fafc' } as const;
const card = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 16, marginBottom: 16 } as const;

const BUCKET_STYLE: Record<RadarBucket, { label: string; bg: string; color: string }> = {
  expired: { label: 'منقضی', bg: '#fff1f2', color: '#be123c' },
  d30: { label: 'تا ۳۰ روز', bg: '#fff7ed', color: '#c2410c' },
  d60: { label: 'تا ۶۰ روز', bg: '#fefce8', color: '#a16207' },
  d90: { label: 'تا ۹۰ روز', bg: '#f1f5f9', color: '#475569' },
};

const AGENT_LABELS: Record<string, string> = {
  policy_lookup: 'copilot آیین‌نامه',
  credential_radar: 'رادار مدارک',
  anomaly_scan: 'اسکن ناهنجاری کارکرد',
  explain_output: 'توضیح خروجی',
};

export default function AgentsPage() {
  const st = useAppStore();
  const todayISO = new Date().toISOString().slice(0, 10);

  // ── copilot آیین‌نامه ──────────────────────────────────────────────────────
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<PolicyAnswer | null>(null);
  const ask = (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    setAnswer(st.askPolicy(trimmed));
  };

  // ── رادار مدارک ────────────────────────────────────────────────────────────
  const radar = useMemo(
    () => credentialRadar(st.credentials, st.personnel.map(p => ({ id: p.id, name: p.name })), todayISO),
    [st.credentials, st.personnel, todayISO],
  );
  const [radarSaved, setRadarSaved] = useState(false);
  const saveRadarReport = () => {
    st.recordAgentRun('credential_radar', { today: todayISO },
      { counts: radar.counts, tracked: radar.tracked, rows: radar.rows.length }, []);
    setRadarSaved(true);
  };

  // ── اسکن ناهنجاری کارکرد ──────────────────────────────────────────────────
  const deptPersonnel = useMemo(
    () => st.personnel.filter(p => p.departmentId === st.departmentId),
    [st.personnel, st.departmentId],
  );
  const deptIds = useMemo(() => new Set(deptPersonnel.map(p => p.id)), [deptPersonnel]);
  const monthRecords = useMemo(
    () => st.workRecords.filter(r => deptIds.has(r.employeeId)),
    [st.workRecords, deptIds],
  );
  const anomalies = useMemo(() => anomalyScan({
    jYear: J_YEAR, jMonth: J_MONTH,
    records: monthRecords.map(r => ({ employeeId: r.employeeId, employeeName: r.employeeName, overtimeHours: r.overtimeHours, status: r.status })),
    expectedEmployees: deptPersonnel.map(p => ({ id: p.id, name: p.name })),
    leaveUsage: deptPersonnel.flatMap(p => {
      const bal = st.leaveBalances[p.id];
      return bal ? [{
        employeeId: p.id, employeeName: p.name, leaveTypeName: 'استحقاقی',
        usedDays: bal.used, quotaDays: bal.entitled,
      }] : [];
    }),
  }), [monthRecords, deptPersonnel, st.leaveBalances]);
  const [scanSaved, setScanSaved] = useState(false);
  const saveScanReport = () => {
    st.recordAgentRun('anomaly_scan', { jYear: J_YEAR, jMonth: J_MONTH, wardId: st.departmentId },
      { anomalies: anomalies.length, high: anomalies.filter(a => a.severity === 'high').length }, []);
    setScanSaved(true);
  };

  const monthName = MONTHS.find(m => m.value === J_MONTH)?.name ?? '';

  return (
    <div>
      <h1 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', margin: '4px 0 4px' }}>مرکز ایجنت‌ها</h1>
      <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 16px' }}>
        فاز ۱ لایهٔ ایجنت (تصمیم NUR-DR-2026-003): این ابزارها فقط می‌خوانند و توضیح می‌دهند؛
        تصمیم نهایی همیشه با موتور قوانین و انسان است. هر اجرا در ردّ اجراها ثبت می‌شود.
      </p>

      {/* ── الف) copilot آیین‌نامه ─────────────────────────────────────────── */}
      <section style={card}>
        <h2 style={{ fontSize: 15, fontWeight: 800, margin: '0 0 6px' }}>copilot آیین‌نامه و قوانین</h2>
        <p style={{ fontSize: 12, color: '#64748b', margin: '0 0 10px' }}>
          پاسخ فقط از پیکرهٔ مستند خود حجله می‌آید و منبعش کنار پاسخ می‌نشیند؛ سؤالی که سند ندارد، پاسخ بداهه نمی‌گیرد.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            value={question}
            onChange={e => setQuestion(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') ask(question); }}
            placeholder="مثلاً: سقف اضافه‌کار ماهانه چقدر است؟"
            style={{ ...inputStyle, flex: '1 1 320px' }}
          />
          <button onClick={() => ask(question)} style={{ padding: '8px 18px', borderRadius: 10, border: 'none', background: '#2563eb', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
            بپرس
          </button>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
          {POLICY_CORPUS.map(e => (
            <button key={e.id} onClick={() => { setQuestion(e.title); ask(e.title); }}
              style={{ padding: '4px 10px', borderRadius: 999, border: '1px solid #cbd5e1', background: '#f8fafc', color: '#334155', fontSize: 12, cursor: 'pointer' }}>
              {e.title}
            </button>
          ))}
        </div>
        {answer?.kind === 'answer' && (
          <div style={{ marginTop: 14, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 12 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>{answer.entry.title}</div>
            <div style={{ fontSize: 13, lineHeight: 2 }}>{answer.entry.answer}</div>
            <div style={{ marginTop: 8 }}>
              <span style={{ fontSize: 11, background: '#e0e7ff', color: '#3730a3', borderRadius: 999, padding: '3px 10px' }}>
                منبع: {answer.entry.citation}
              </span>
            </div>
          </div>
        )}
        {answer?.kind === 'none' && (
          <div style={{ marginTop: 14, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, padding: 12, fontSize: 13, lineHeight: 2 }}>
            {NO_GROUNDED_ANSWER_FA}
          </div>
        )}
        {st.agentRuns.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 6 }}>ردّ اجراهای اخیر</div>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', fontSize: 12, color: '#64748b' }}>
              {st.agentRuns.slice(0, 6).map(r => (
                <li key={r.id} style={{ padding: '4px 0', borderTop: '1px solid #f1f5f9', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 700, color: '#334155' }}>{AGENT_LABELS[r.agentKey] ?? r.agentKey}</span>
                  <span>Zone {r.zone}</span>
                  <span>{faDateTime(r.createdAt)}</span>
                  {r.citations[0] && <span>منبع: {r.citations[0].source}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* ── ب) رادار مدارک ─────────────────────────────────────────────────── */}
      <section style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <h2 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>رادار مدارک و پروانه‌ها</h2>
          <button onClick={saveRadarReport} disabled={radarSaved}
            style={{ padding: '6px 14px', borderRadius: 10, border: '1px solid #cbd5e1', background: radarSaved ? '#f1f5f9' : '#fff', color: '#334155', fontSize: 12, fontWeight: 700, cursor: radarSaved ? 'default' : 'pointer' }}>
            {radarSaved ? 'گزارش ثبت شد' : 'ثبت گزارش'}
          </button>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '12px 0' }}>
          {(Object.keys(BUCKET_STYLE) as RadarBucket[]).map(b => (
            <span key={b} style={{ background: BUCKET_STYLE[b].bg, color: BUCKET_STYLE[b].color, borderRadius: 12, padding: '8px 14px', fontSize: 13, fontWeight: 700 }}>
              {BUCKET_STYLE[b].label}: {faNum(radar.counts[b])}
            </span>
          ))}
          <span style={{ fontSize: 12, color: '#64748b', alignSelf: 'center' }}>از {faNum(radar.tracked)} مدرکِ دارای تاریخ انقضا</span>
        </div>
        {radar.rows.length === 0 ? (
          <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>مدرکی در بازهٔ ۹۰ روزهٔ انقضا نیست.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f1f5f9', textAlign: 'right' }}>
                <th style={{ padding: '8px 10px' }}>کارمند</th><th>مدرک</th><th>نوع</th><th>انقضا</th><th>مانده</th><th>بازه</th>
              </tr>
            </thead>
            <tbody>
              {radar.rows.map(r => (
                <tr key={r.credentialId} style={{ borderTop: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '8px 10px', fontWeight: 700 }}>{r.employeeName}</td>
                  <td>{r.title}</td>
                  <td>{r.kindLabel}</td>
                  <td>{new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium' }).format(new Date(r.expiresAt))}</td>
                  <td>{r.daysLeft < 0 ? `${faNum(Math.abs(r.daysLeft))} روز گذشته` : `${faNum(r.daysLeft)} روز`}</td>
                  <td><span style={{ background: BUCKET_STYLE[r.bucket].bg, color: BUCKET_STYLE[r.bucket].color, borderRadius: 999, padding: '2px 10px', fontSize: 11, fontWeight: 700 }}>{BUCKET_STYLE[r.bucket].label}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p style={{ fontSize: 11, color: '#94a3b8', margin: '10px 0 0' }}>
          تصمیم اعتبار یا منع به‌کارگیری با سرپرستار است (قفل صلاحیت در تولید برنامه اعمال می‌شود)؛ رادار فقط دیده‌بانی است.
        </p>
      </section>

      {/* ── ج) اینباکس ناهنجاری کارکرد ─────────────────────────────────────── */}
      <section style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <h2 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>اینباکس ناهنجاری کارکرد</h2>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={{ fontSize: 12 }}>ماه
              <select value={J_MONTH} disabled style={{ ...inputStyle, display: 'inline-block', marginInlineStart: 6 }}>
                <option value={J_MONTH}>{monthName} {faNum(J_YEAR)}</option>
              </select>
            </label>
            <button onClick={saveScanReport} disabled={scanSaved}
              style={{ padding: '6px 14px', borderRadius: 10, border: '1px solid #cbd5e1', background: scanSaved ? '#f1f5f9' : '#fff', color: '#334155', fontSize: 12, fontWeight: 700, cursor: scanSaved ? 'default' : 'pointer' }}>
              {scanSaved ? 'گزارش ثبت شد' : 'ثبت گزارش'}
            </button>
          </div>
        </div>
        {monthRecords.length === 0 ? (
          <p style={{ fontSize: 13, color: '#64748b', margin: '12px 0 0' }}>
            برای این ماه هنوز رکورد کارکردی ساخته نشده است؛ از صفحهٔ «کارکرد ماهانه» رکوردها را محاسبه کنید تا اسکن ناهنجاری رویشان اجرا شود.
          </p>
        ) : anomalies.length === 0 ? (
          <p style={{ fontSize: 13, color: '#047857', margin: '12px 0 0', fontWeight: 700 }}>
            ناهنجاری‌ای پیدا نشد: سقف اضافه‌کار، سهمیهٔ مرخصی و نهایی‌بودن رکوردها سالم‌اند.
          </p>
        ) : (
          <ul style={{ margin: '12px 0 0', padding: 0, listStyle: 'none' }}>
            {anomalies.map((a, i) => (
              <li key={`${a.kind}-${a.employeeId}-${i}`} style={{
                borderTop: '1px solid #e2e8f0', padding: '10px 0',
              }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <span style={{
                    fontSize: 11, fontWeight: 800, borderRadius: 999, padding: '2px 10px',
                    background: a.severity === 'high' ? '#fff1f2' : '#fefce8',
                    color: a.severity === 'high' ? '#be123c' : '#a16207',
                  }}>{a.severity === 'high' ? 'مهم' : 'متوسط'}</span>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{a.message}</span>
                </div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 4, lineHeight: 1.9 }}>{explainAnomaly(a)}</div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
