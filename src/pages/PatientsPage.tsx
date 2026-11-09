import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAppStore, J_YEAR, J_MONTH } from '../store/appStore';
import { isoFromJalali } from '../features/leave/leaveService';
import {
  SHIFT_LABELS, ADMISSION_TYPE_LABELS, ADMISSION_STATUS_LABELS,
  resolveResponsibleAt, validateAdmissionInput,
  type Admission, type CareShift, type Patient,
} from '../features/patients/patientService';

// بیماران بخش — نمای پاسخگویی: برای هر بستری در یک نگاه معلوم است چرا پذیرش
// شده، پزشکش کیست و امروز در هر شیفت پرستار مسئولش چه کسی است (دور ۱۶).
const faDateTime = (iso: string) => new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
const SHIFTS: CareShift[] = ['morning', 'evening', 'night'];
const inputStyle = { display: 'block', padding: 7, borderRadius: 8, border: '1px solid #cbd5e1', background: '#F9F9F9' } as const;

export default function PatientsPage() {
  const st = useAppStore();
  const navigate = useNavigate();
  const todayISO = isoFromJalali(J_YEAR, J_MONTH, 13);
  const canManage = st.viewRole !== 'staff';
  const names = useMemo(() => new Map(st.personnel.map(p => [p.id, p.name])), [st.personnel]);
  const patientOf = useMemo(() => new Map(st.patients.map(p => [p.id, p])), [st.patients]);
  const wardAdmissions = st.admissions.filter(a => a.wardId === st.departmentId);
  const active = wardAdmissions.filter(a => a.status === 'admitted');
  const closed = wardAdmissions.filter(a => a.status !== 'admitted');

  const missingToday = active.filter(a =>
    SHIFTS.some(s => !resolveResponsibleAt(st.patientAssignments, a.id, todayISO, s))).length;

  const [showForm, setShowForm] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [form, setForm] = useState({
    fullName: '', fileNo: '', nationalCode: '', admissionType: 'emergency' as Admission['admissionType'],
    admissionSource: '', chiefComplaint: '', admissionReason: '', diagnosisText: '',
    attendingName: '', attendingService: '', bedLabel: '', insuranceType: '', allergySummary: '',
  });

  const admit = () => {
    const errs = validateAdmissionInput(form);
    setErrors(errs);
    if (errs.length) return;
    const stamp = Date.now();
    const patient: Patient = {
      id: `pat-${stamp}`, fullName: form.fullName.trim(), fileNo: form.fileNo.trim(),
      ...(form.nationalCode.trim() ? { nationalCode: form.nationalCode.trim() } : {}),
    };
    const admission: Admission = {
      id: `adm-${stamp}`, wardId: st.departmentId, patientId: patient.id,
      admittedAtISO: new Date().toISOString(), admissionType: form.admissionType,
      admissionReason: form.admissionReason.trim(), attendingName: form.attendingName.trim(), status: 'admitted',
      ...(form.admissionSource.trim() ? { admissionSource: form.admissionSource.trim() } : {}),
      ...(form.chiefComplaint.trim() ? { chiefComplaint: form.chiefComplaint.trim() } : {}),
      ...(form.diagnosisText.trim() ? { diagnosisText: form.diagnosisText.trim() } : {}),
      ...(form.attendingService.trim() ? { attendingService: form.attendingService.trim() } : {}),
      ...(form.bedLabel.trim() ? { bedLabel: form.bedLabel.trim() } : {}),
      ...(form.insuranceType.trim() ? { insuranceType: form.insuranceType.trim() } : {}),
      ...(form.allergySummary.trim() ? { allergySummary: form.allergySummary.trim() } : {}),
    };
    st.admitPatient(patient, admission);
    navigate(`/patients/${admission.id}`);
  };

  return (
    <div>
      <h1>بیماران بخش</h1>
      <p style={{ color: '#64748b', fontSize: 13, maxWidth: 780 }}>
        پروندهٔ پاسخگویی اپیزود: برای هر بیمار دقیقاً معلوم است چرا پذیرش شده، پزشک معالجش کیست و در هر شیفت
        پرستار مسئولش چه کسی است و گزارشش کجاست. دستورات، دارو و نتایج آزمایش در HIS می‌ماند؛ اینجا فقط ارجاع و پاسخگویی است.
      </p>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div className="stat-card" style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 14, minWidth: 170 }}>
          <div style={{ fontSize: 12, color: '#64748b' }}>بستری‌های فعلی بخش</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#0A2735', margin: '4px 0' }}>{active.length.toLocaleString('fa-IR')}</div>
          <div style={{ fontSize: 12, color: '#64748b' }}>اپیزود باز</div>
        </div>
        <div className="stat-card" style={{ background: '#fff', border: `1px solid ${missingToday ? '#fda4af' : '#e2e8f0'}`, borderRadius: 16, padding: 14, minWidth: 170 }}>
          <div style={{ fontSize: 12, color: '#64748b' }}>بدون پرستار مسئول در یکی از شیفت‌های امروز</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: missingToday ? '#e11d48' : '#16a34a', margin: '4px 0' }}>{missingToday.toLocaleString('fa-IR')}</div>
          <div style={{ fontSize: 12, color: '#64748b' }}>شکاف پاسخگویی — از پروندهٔ بیمار تخصیص بدهید</div>
        </div>
        {canManage && (
          <button onClick={() => setShowForm(s => !s)} style={{ alignSelf: 'center', padding: '10px 18px', borderRadius: 10, border: 'none', background: '#004E72', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
            {showForm ? 'بستن فرم پذیرش' : '＋ پذیرش بیمار تازه'}
          </button>
        )}
      </div>

      {showForm && canManage && (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 16, marginBottom: 16 }}>
          <strong style={{ fontSize: 14 }}>برگ پذیرش — حداقل‌های پروندهٔ دقیق</strong>
          {errors.length > 0 && (
            <div style={{ background: '#fff1f2', border: '1px solid #fda4af', borderRadius: 10, padding: 10, marginTop: 10, fontSize: 13, color: '#be123c' }}>
              {errors.map(e => <div key={e}>{e}</div>)}
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
            <label style={{ fontSize: 12 }}>نام بیمار *<input value={form.fullName} onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))} style={{ ...inputStyle, width: 200 }} /></label>
            <label style={{ fontSize: 12 }}>شماره پرونده *<input value={form.fileNo} onChange={e => setForm(f => ({ ...f, fileNo: e.target.value }))} placeholder="P-1004" style={{ ...inputStyle, width: 120 }} /></label>
            <label style={{ fontSize: 12 }}>کد ملی<input value={form.nationalCode} onChange={e => setForm(f => ({ ...f, nationalCode: e.target.value }))} style={{ ...inputStyle, width: 130 }} /></label>
            <label style={{ fontSize: 12 }}>نوع پذیرش
              <select value={form.admissionType} onChange={e => setForm(f => ({ ...f, admissionType: e.target.value as Admission['admissionType'] }))} style={inputStyle}>
                <option value="emergency">اورژانسی</option><option value="elective">عادی</option><option value="transfer">انتقالی</option>
              </select></label>
            <label style={{ fontSize: 12 }}>مسیر ورود<input value={form.admissionSource} onChange={e => setForm(f => ({ ...f, admissionSource: e.target.value }))} placeholder="اورژانس — آمبولانس ۱۱۵" style={{ ...inputStyle, width: 180 }} /></label>
            <label style={{ fontSize: 12 }}>تخت<input value={form.bedLabel} onChange={e => setForm(f => ({ ...f, bedLabel: e.target.value }))} placeholder="تخت ۴" style={{ ...inputStyle, width: 90 }} /></label>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
            <label style={{ fontSize: 12, flex: '1 1 260px' }}>شکایت اصلی (با کلمات بیمار)<input value={form.chiefComplaint} onChange={e => setForm(f => ({ ...f, chiefComplaint: e.target.value }))} style={{ ...inputStyle, width: '100%' }} /></label>
            <label style={{ fontSize: 12, flex: '1 1 260px' }}>علت پذیرش *<input value={form.admissionReason} onChange={e => setForm(f => ({ ...f, admissionReason: e.target.value }))} style={{ ...inputStyle, width: '100%' }} /></label>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
            <label style={{ fontSize: 12, flex: '1 1 220px' }}>تشخیص اولیه<input value={form.diagnosisText} onChange={e => setForm(f => ({ ...f, diagnosisText: e.target.value }))} style={{ ...inputStyle, width: '100%' }} /></label>
            <label style={{ fontSize: 12 }}>پزشک معالج *<input value={form.attendingName} onChange={e => setForm(f => ({ ...f, attendingName: e.target.value }))} style={{ ...inputStyle, width: 170 }} /></label>
            <label style={{ fontSize: 12 }}>سرویس<input value={form.attendingService} onChange={e => setForm(f => ({ ...f, attendingService: e.target.value }))} placeholder="قلب و عروق" style={{ ...inputStyle, width: 130 }} /></label>
            <label style={{ fontSize: 12 }}>بیمه<input value={form.insuranceType} onChange={e => setForm(f => ({ ...f, insuranceType: e.target.value }))} style={{ ...inputStyle, width: 130 }} /></label>
            <label style={{ fontSize: 12 }}>حساسیت دارویی<input value={form.allergySummary} onChange={e => setForm(f => ({ ...f, allergySummary: e.target.value }))} placeholder="پنی‌سیلین" style={{ ...inputStyle, width: 130 }} /></label>
          </div>
          <button onClick={admit} style={{ marginTop: 14, padding: '9px 20px', borderRadius: 10, border: 'none', background: '#004E72', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>ثبت پذیرش و ساخت پرونده</button>
        </div>
      )}

      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, overflow: 'hidden', marginBottom: 16 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f1f5f9', textAlign: 'right' }}>
              <th style={{ padding: '10px 12px' }}>تخت</th><th>بیمار</th><th>علت پذیرش</th><th>پزشک معالج</th>
              <th>پذیرش</th><th>پرستار مسئول امروز (صبح/عصر/شب)</th><th></th>
            </tr>
          </thead>
          <tbody>
            {active.map(a => {
              const p = patientOf.get(a.patientId);
              return (
                <tr key={a.id} style={{ borderTop: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 700 }}>{a.bedLabel ?? '—'}</td>
                  <td>
                    <div style={{ fontWeight: 700, color: '#0A2735' }}>{p?.fullName ?? '—'}</div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>پرونده {p?.fileNo ?? ''}{a.allergySummary ? <span style={{ color: '#e11d48', fontWeight: 700 }}> • حساسیت: {a.allergySummary}</span> : null}</div>
                  </td>
                  <td style={{ maxWidth: 260 }}>
                    <div>{a.admissionReason}</div>
                    <div style={{ fontSize: 12, color: '#64748b' }}>{ADMISSION_TYPE_LABELS[a.admissionType]}{a.diagnosisText ? ` — ${a.diagnosisText}` : ''}</div>
                  </td>
                  <td>{a.attendingName}{a.attendingService ? <div style={{ fontSize: 12, color: '#64748b' }}>{a.attendingService}</div> : null}</td>
                  <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{faDateTime(a.admittedAtISO)}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {SHIFTS.map(s => {
                        const asg = resolveResponsibleAt(st.patientAssignments, a.id, todayISO, s);
                        return (
                          <span key={s} style={{
                            fontSize: 11, padding: '2px 8px', borderRadius: 999,
                            background: asg ? '#DCE9F0' : '#fff1f2', color: asg ? '#003A56' : '#be123c',
                            border: `1px solid ${asg ? '#DCE9F0' : '#fda4af'}`,
                          }}>{SHIFT_LABELS[s]}: {asg ? (names.get(asg.employeeId) ?? '—') : 'تعیین نشده'}</span>
                        );
                      })}
                    </div>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}><Link to={`/patients/${a.id}`} style={{ color: '#004E72', fontWeight: 700 }}>پرونده ←</Link></td>
                </tr>
              );
            })}
            {active.length === 0 && (
              <tr><td colSpan={7} style={{ padding: 18, color: '#64748b' }}>بیمار بستری‌ای در این بخش ثبت نشده است.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {closed.length > 0 && (
        <div style={{ fontSize: 13, color: '#475569' }}>
          <strong>بسته‌شده‌های این بخش:</strong>{' '}
          {closed.map(a => (
            <span key={a.id} style={{ marginInlineEnd: 12 }}>
              <Link to={`/patients/${a.id}`} style={{ color: '#004E72' }}>{patientOf.get(a.patientId)?.fullName ?? a.id}</Link>
              {' '}({ADMISSION_STATUS_LABELS[a.status]})
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
