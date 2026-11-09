import { useMemo, useState } from 'react';
import { useAppStore } from '../store/appStore';
import {
  credentialStatus, summarizeCompliance, KIND_FA, STATUS_FA, type CredentialKind,
} from '../features/credentials/credentialService';
import { parsePersonnelCsv, personnelTemplateCsv, type ImportResult } from '../features/import/personnelImport';

function PersonnelImportCard() {
  const st = useAppStore();
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [fileName, setFileName] = useState('');
  const [applied, setApplied] = useState(0);
  const deptName = st.departments.find(d => d.id === st.departmentId)?.name ?? '';

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setApplied(0);
    setFileName(f.name);
    let text: string;
    if (/\.csv$/i.test(f.name)) {
      text = await f.text();
    } else {
      // اکسل: کتابخانه فقط هنگام نیاز بار می‌شود تا باندل اصلی سبک بماند
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await f.arrayBuffer());
      const sheet = wb.Sheets[wb.SheetNames[0]!]!;
      text = XLSX.utils.sheet_to_csv(sheet);
    }
    const existing = new Set(st.personnel.map(p => p.personnelCode));
    setPreview(parsePersonnelCsv(text, st.departmentId, existing));
  };
  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob([personnelTemplateCsv()], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'personnel-template.csv'; a.click();
    URL.revokeObjectURL(url);
  };
  const apply = () => {
    if (!preview) return;
    st.addPersonnelBulk(preview.personnel);
    setApplied(preview.personnel.length);
    setPreview(null);
  };
  const fa = (n: number) => n.toLocaleString('fa-IR');

  return (
    <section style={{ background: '#fff', border: '1px solid #dbeafe', borderRadius: 12, padding: 14, marginBottom: 16 }}>
      <strong style={{ fontSize: 14 }}>ورود لیست پرسنل بخش {deptName} از فایل</strong>
      <p style={{ fontSize: 12, color: '#64748b', margin: '6px 0 10px' }}>
        فایل اکسل یا CSV لیست پرسنل را انتخاب کنید؛ پیش‌نمایش و خطاها قبل از اعمال نشان داده می‌شود و هیچ ردیفی بی‌صدا حذف نمی‌شود.
        قالب آماده را می‌توانید به بیمارستان بدهید تا همان را پر کند.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={downloadTemplate}>دانلود قالب CSV</button>
        <label style={{ border: '1px solid #ccc', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 13, background: '#f8fafc' }}>
          انتخاب فایل (Excel / CSV)
          <input type="file" accept=".csv,.xlsx,.xls" style={{ display: 'none' }} onChange={e => void onFile(e.target.files?.[0])} />
        </label>
        {fileName && <span style={{ fontSize: 12 }}>{fileName}</span>}
      </div>
      {preview && (
        <div style={{ marginTop: 10, fontSize: 13 }}>
          <div>
            آمادهٔ ورود: <strong>{fa(preview.personnel.length)}</strong> نفر
            {preview.duplicateCodes.length > 0 && <> · تکراری و ردشده: <strong>{preview.duplicateCodes.join('، ')}</strong></>}
            {preview.errors.length > 0 && <> · خطادار: <strong>{fa(preview.errors.length)}</strong> ردیف</>}
          </div>
          {preview.errors.length > 0 && (
            <ul style={{ color: '#e11d48', margin: '6px 0' }}>
              {preview.errors.slice(0, 8).map((e, i) => <li key={i}>ردیف {fa(e.row)}: {e.message}</li>)}
            </ul>
          )}
          {preview.personnel.length > 0 && (
            <>
              <div style={{ fontSize: 12, color: '#64748b', margin: '6px 0' }}>
                نمونه: {preview.personnel.slice(0, 3).map(p => `${p.name} (${p.personnelCode})`).join(' · ')}
              </div>
              <button onClick={apply} style={{ padding: '7px 16px' }}>اعمال ورود به بخش</button>
            </>
          )}
        </div>
      )}
      {applied > 0 && <div style={{ marginTop: 8, fontSize: 13, color: '#16a34a' }}>{fa(applied)} نفر به بخش اضافه شدند.</div>}
    </section>
  );
}

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
    const color = s === 'expired' ? '#be123c' : s === 'expiring' ? '#b45309' : '#15803d';
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
      <PersonnelImportCard />
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        {[
          ['کل مدارک بخش', compliance.total],
          ['معتبر', compliance.valid],
          ['در آستانهٔ انقضا (۶۰ روز)', compliance.expiring],
          ['منقضی', compliance.expired],
        ].map(([label, v]) => (
          <div key={label as string} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '10px 16px', minWidth: 130 }}>
            <div style={{ fontSize: 12, color: '#64748b' }}>{label}</div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>{fa(v as number)}</div>
          </div>
        ))}
      </div>

      {compliance.attention.length > 0 && (
        <section style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 12, padding: 14, marginBottom: 16 }}>
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
        {person && <span style={{ fontSize: 13, color: '#64748b' }}>کد پرسنلی {person.personnelCode} · وضعیت {person.employmentStatus} · شروع {person.employmentDate ?? '—'}</span>}
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', border: '1px solid #e2e8f0', marginBottom: 16 }}>
        <thead><tr style={{ background: '#f1f5f9' }}>
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

      <section style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16 }}>
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
