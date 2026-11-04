import { useMemo, useState } from 'react';
import { useAppStore } from '../store/appStore';
import {
  credentialStatus, summarizeCompliance, KIND_FA, STATUS_FA, type CredentialKind,
} from '../features/credentials/credentialService';

const TODAY = new Date().toISOString().slice(0, 10);

export default function PersonnelPage() {
  const st = useAppStore();
  const [selected, setSelected] = useState('');
  const [kind, setKind] = useState<CredentialKind>('certificate');
  const [title, setTitle] = useState('');
  const [expires, setExpires] = useState('');

  const deptPeople = st.personnel.filter(p => p.departmentId === st.departmentId);
  const deptIds = useMemo(() => new Set(deptPeople.map(p => p.id)), [deptPeople]);
  const deptCreds = st.credentials.filter(c => deptIds.has(c.employeeId));
  const nameOf = (id: string) => st.personnel.find(p => p.id === id)?.name ?? id;
  const compliance = useMemo(() => summarizeCompliance(deptCreds, nameOf, TODAY), [st.credentials, st.departmentId]); // eslint-disable-line react-hooks/exhaustive-deps
  const person = deptPeople.find(p => p.id === (selected || st.currentEmployeeId)) ?? deptPeople[0];
  const personCreds = person ? deptCreds.filter(c => c.employeeId === person.id) : [];
  const fa = (n: number) => n.toLocaleString('fa-IR');

  const badge = (c: (typeof deptCreds)[number]) => {
    const s = credentialStatus(c, TODAY);
    const color = s === 'expired' ? '#b91c1c' : s === 'expiring' ? '#b45309' : '#15803d';
    return <span style={{ color, fontWeight: 700 }}>{STATUS_FA[s]}</span>;
  };

  const add = () => {
    if (!person || !title.trim()) return;
    st.addCredential({
      id: `cred-${Date.now()}`, employeeId: person.id, kind, title: title.trim(),
      expiresOnISO: expires || undefined,
    });
    setTitle(''); setExpires('');
  };

  return (
    <div>
      <h1>پروندهٔ پرسنلی و اعتبارنامه‌ها</h1>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        {[
          ['کل مدارک بخش', compliance.total],
          ['معتبر', compliance.valid],
          ['در آستانهٔ انقضا (۶۰ روز)', compliance.expiring],
          ['منقضی', compliance.expired],
        ].map(([label, v]) => (
          <div key={label as string} style={{ background: '#fff', border: '1px solid #e3ddd2', borderRadius: 12, padding: '10px 16px', minWidth: 130 }}>
            <div style={{ fontSize: 12, color: '#68707a' }}>{label}</div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>{fa(v as number)}</div>
          </div>
        ))}
      </div>

      {compliance.attention.length > 0 && (
        <section style={{ background: '#fdf3e7', border: '1px solid #e3ddd2', borderRadius: 12, padding: 14, marginBottom: 16 }}>
          <strong>نیازمند پیگیری:</strong>
          <ul style={{ margin: '8px 0 0' }}>
            {compliance.attention.map(a => (
              <li key={a.credential.id}>{a.employeeName} — {a.credential.title} ({STATUS_FA[a.status]}، انقضا: {a.credential.expiresOnISO})</li>
            ))}
          </ul>
        </section>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={person?.id ?? ''} onChange={e => setSelected(e.target.value)}>
          {deptPeople.map(p => <option key={p.id} value={p.id}>{p.name} — {p.role}</option>)}
        </select>
        {person && <span style={{ fontSize: 13, color: '#68707a' }}>کد پرسنلی {person.personnelCode} · وضعیت {person.employmentStatus} · شروع {person.employmentDate ?? '—'}</span>}
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', border: '1px solid #e3ddd2', marginBottom: 16 }}>
        <thead><tr style={{ background: '#f3efe7' }}>
          <th style={{ padding: 8, textAlign: 'right' }}>مدرک</th><th>نوع</th><th>صادرکننده</th><th>انقضا</th><th>وضعیت</th>
        </tr></thead>
        <tbody>
          {personCreds.map(c => (
            <tr key={c.id} style={{ borderTop: '1px solid #eee' }}>
              <td style={{ padding: 8 }}>{c.title}</td><td>{KIND_FA[c.kind]}</td><td>{c.issuer ?? '—'}</td>
              <td>{c.expiresOnISO ?? '—'}</td><td>{badge(c)}</td>
            </tr>
          ))}
          {personCreds.length === 0 && <tr><td colSpan={5} style={{ padding: 12 }}>مدرکی ثبت نشده است.</td></tr>}
        </tbody>
      </table>

      <section style={{ background: '#fff', border: '1px solid #e3ddd2', borderRadius: 12, padding: 16 }}>
        <h2 style={{ marginTop: 0 }}>ثبت مدرک تازه برای {person?.name}</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={kind} onChange={e => setKind(e.target.value as CredentialKind)}>
            {(Object.keys(KIND_FA) as CredentialKind[]).map(k => <option key={k} value={k}>{KIND_FA[k]}</option>)}
          </select>
          <input placeholder="عنوان مدرک" value={title} onChange={e => setTitle(e.target.value)} style={{ minWidth: 240 }} />
          <label style={{ fontSize: 13 }}>انقضا: <input type="date" value={expires} onChange={e => setExpires(e.target.value)} /></label>
          <button onClick={add}>ثبت مدرک</button>
        </div>
      </section>
    </div>
  );
}
