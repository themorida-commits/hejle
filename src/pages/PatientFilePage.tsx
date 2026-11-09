import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAppStore, J_YEAR, J_MONTH } from '../store/appStore';
import { isoFromJalali } from '../features/leave/leaveService';
import {
  SHIFT_LABELS, ADMISSION_TYPE_LABELS, ADMISSION_STATUS_LABELS, ASSIGNMENT_ROLE_LABELS,
  buildEpisodeTimeline, rosterCandidatesByShift, reportCompleteness, emptyReportBody,
  type Admission, type CareShift, type Handover, type NursingReport, type PatientAssignment,
} from '../features/patients/patientService';
import { composeReportDraft } from '../features/agents/reportDraft';

// پروندهٔ بیمار — یک صفحه، چهار جواب دقیق: چرا پذیرش شد، دکترش کیست، هر شیفت
// پرستارش کی بوده و گزارش امضاشده‌اش چیست، و تحویل‌ها به چه کسی انجام شده.
const faDate = (iso: string) => new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium' }).format(new Date(iso));
const faDateTime = (iso: string) => new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
const inputStyle = { display: 'block', padding: 7, borderRadius: 8, border: '1px solid #cbd5e1', background: '#f8fafc' } as const;
const cardStyle = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 16, marginBottom: 16 } as const;
const SHIFTS: CareShift[] = ['morning', 'evening', 'night'];

export default function PatientFilePage() {
  const { admissionId } = useParams();
  const st = useAppStore();
  const navigateBack = <Link to="/patients" style={{ color: '#2563eb', fontSize: 13 }}>→ بازگشت به بیماران بخش</Link>;
  const admission = st.admissions.find(a => a.id === admissionId);
  const patient = admission ? st.patients.find(p => p.id === admission.patientId) : undefined;
  const names = useMemo(() => new Map(st.personnel.map(p => [p.id, p.name])), [st.personnel]);
  const nameOf = (id: string) => names.get(id) ?? id;
  const deptPeople = st.personnel.filter(p => p.departmentId === st.departmentId);
  const canManage = st.viewRole !== 'staff';
  const todayISO = isoFromJalali(J_YEAR, J_MONTH, 13);

  const assignments = useMemo(
    () => st.patientAssignments.filter(a => a.admissionId === admissionId)
      .sort((x, y) => y.dateISO.localeCompare(x.dateISO)), [st.patientAssignments, admissionId]);
  const reports = useMemo(
    () => st.patientReports.filter(r => r.admissionId === admissionId)
      .sort((x, y) => y.dateISO.localeCompare(x.dateISO)), [st.patientReports, admissionId]);
  const handovers = useMemo(
    () => st.handovers.filter(h => h.admissionId === admissionId)
      .sort((x, y) => y.atISO.localeCompare(x.atISO)), [st.handovers, admissionId]);
  const timeline = useMemo(() => (admission ? buildEpisodeTimeline({
    admission, assignments: st.patientAssignments, reports: st.patientReports,
    handovers: st.handovers, employeeName: nameOf,
  }) : []), [admission, st.patientAssignments, st.patientReports, st.handovers]); // eslint-disable-line react-hooks/exhaustive-deps

  // فرم تخصیص
  const [asgForm, setAsgForm] = useState({ dateISO: todayISO, shift: 'morning' as CareShift, employeeId: '', role: 'responsible' as PatientAssignment['role'] });
  const candidates = useMemo(
    () => rosterCandidatesByShift(st.entries, st.shiftTypes, asgForm.dateISO)[asgForm.shift],
    [st.entries, st.shiftTypes, asgForm.dateISO, asgForm.shift]);
  // فرم گزارش
  const [repDate, setRepDate] = useState(todayISO);
  const [repShift, setRepShift] = useState<CareShift>('morning');
  const [repAuthor, setRepAuthor] = useState('');
  const [repBody, setRepBody] = useState(emptyReportBody());
  const [repError, setRepError] = useState('');
  // پیش‌نویس روایی ایجنت (Zone C — دور ۱۸): null یعنی با دکمهٔ ساخت ساخته نشده؛
  // فقط وقتی پرستار از همین مسیر ساخته باشد، هنگام ثبت گزارش draft ایجنت هم ثبت می‌شود.
  const [repNarrative, setRepNarrative] = useState<string | null>(null);
  // فرم تحویل
  const [hovForm, setHovForm] = useState({ fromAssignmentId: '', receiverId: '', dateISO: todayISO, shift: 'evening' as CareShift, situation: '', background: '', assessment: '', recommendation: '', stateSummary: '' });
  // ترخیص
  const [dischargeForm, setDischargeForm] = useState({ status: 'discharged' as Admission['status'], note: '' });

  if (!admission || !patient) {
    return <div>{navigateBack}<p style={{ marginTop: 16, color: '#64748b' }}>پرونده‌ای با این شناسه پیدا نشد.</p></div>;
  }
  const isOpen = admission.status === 'admitted';

  const addAssignment = () => {
    if (!asgForm.employeeId) return;
    st.addPatientAssignment({
      id: `asg-${Date.now()}`, admissionId: admission.id, employeeId: asgForm.employeeId,
      role: asgForm.role, shift: asgForm.shift, dateISO: asgForm.dateISO,
      assignedBy: st.currentEmployeeId, source: candidates.includes(asgForm.employeeId) ? 'roster' : 'manual',
    });
  };

  const addReport = () => {
    const author = repAuthor || st.currentEmployeeId;
    if (!author) return;
    const asg = assignments.find(a => a.dateISO === repDate && a.shift === repShift && a.employeeId === author);
    const report: NursingReport = {
      id: `rep-${Date.now()}`, admissionId: admission.id, authorEmployeeId: author,
      shift: repShift, dateISO: repDate, body: repBody, status: 'draft',
      ...(asg ? { assignmentId: asg.id } : {}),
    };
    st.addPatientReport(report);
    if (repNarrative !== null) {
      st.recordAgentRun('report_draft', { admissionId: admission.id, reportId: report.id },
        { chars: repNarrative.length }, []);
      st.createAgentDraft('report_draft', {
        admissionId: admission.id, reportId: report.id,
        dateISO: repDate, shift: repShift, text: repNarrative,
      });
      setRepNarrative(null);
    }
    setRepBody(emptyReportBody());
    setRepError('');
  };

  const signReport = (r: NursingReport) => {
    const missing = reportCompleteness(r.body);
    if (missing.length) { setRepError(`گزارش ${faDate(r.dateISO)} برای امضا کامل نیست — بخش‌های خالی: ${missing.join('، ')}`); return; }
    setRepError('');
    st.signPatientReport(r.id);
  };

  const addHandover = () => {
    const from = assignments.find(a => a.id === hovForm.fromAssignmentId);
    if (!from || !hovForm.receiverId) return;
    const stamp = Date.now();
    const toAsg: PatientAssignment = {
      id: `asg-${stamp}`, admissionId: admission.id, employeeId: hovForm.receiverId,
      role: 'responsible', shift: hovForm.shift, dateISO: hovForm.dateISO,
      assignedBy: st.currentEmployeeId, source: 'handover',
    };
    st.addPatientAssignment(toAsg);
    const handover: Handover = {
      id: `hov-${stamp}`, admissionId: admission.id, fromAssignmentId: from.id, toAssignmentId: toAsg.id,
      giverEmployeeId: from.employeeId, receiverEmployeeId: hovForm.receiverId,
      atISO: new Date().toISOString(),
      sbar: { situation: hovForm.situation, background: hovForm.background, assessment: hovForm.assessment, recommendation: hovForm.recommendation },
      ...(hovForm.stateSummary.trim() ? { stateSummary: hovForm.stateSummary.trim() } : {}),
    };
    st.addHandover(handover);
    setHovForm(f => ({ ...f, situation: '', background: '', assessment: '', recommendation: '', stateSummary: '' }));
  };

  return (
    <div>
      {navigateBack}
      <div style={{ ...cardStyle, marginTop: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <h1 style={{ margin: 0 }}>{patient.fullName}
            <span style={{ fontSize: 13, color: '#64748b', fontWeight: 400 }}> — پرونده {patient.fileNo}{patient.nationalCode ? ` • کد ملی ${patient.nationalCode}` : ''}{admission.bedLabel ? ` • ${admission.bedLabel}` : ''}</span>
          </h1>
          <span style={{ fontSize: 12, padding: '4px 12px', borderRadius: 999, background: isOpen ? '#dcfce7' : '#e2e8f0', color: isOpen ? '#15803d' : '#475569', fontWeight: 700 }}>
            {ADMISSION_STATUS_LABELS[admission.status]}
          </span>
        </div>
        {admission.allergySummary && (
          <div style={{ background: '#fff1f2', border: '1px solid #fda4af', borderRadius: 10, padding: '8px 12px', marginTop: 10, fontSize: 13, color: '#be123c', fontWeight: 700 }}>
            ⚠ حساسیت دارویی: {admission.allergySummary}
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12, marginTop: 14 }}>
          <div style={{ background: '#f8fafc', borderRadius: 12, padding: 12 }}>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>چرا پذیرش شد؟</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{admission.admissionReason}</div>
            {admission.chiefComplaint && <div style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>شکایت اصلی: {admission.chiefComplaint}</div>}
            {admission.diagnosisText && <div style={{ fontSize: 12, color: '#475569' }}>تشخیص: {admission.diagnosisText}{admission.diagnosisIcd10 ? ` (${admission.diagnosisIcd10})` : ''}</div>}
          </div>
          <div style={{ background: '#f8fafc', borderRadius: 12, padding: 12 }}>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>پزشک معالج</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{admission.attendingName}</div>
            <div style={{ fontSize: 12, color: '#475569' }}>
              {admission.attendingService ?? ''}{admission.attendingCouncilNo ? ` • نظام پزشکی ${admission.attendingCouncilNo}` : ''}
            </div>
          </div>
          <div style={{ background: '#f8fafc', borderRadius: 12, padding: 12 }}>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>پذیرش</div>
            <div style={{ fontSize: 13, color: '#0f172a' }}>{faDateTime(admission.admittedAtISO)} — {ADMISSION_TYPE_LABELS[admission.admissionType]}</div>
            <div style={{ fontSize: 12, color: '#475569' }}>
              {admission.admissionSource ?? ''}{admission.insuranceType ? ` • بیمه: ${admission.insuranceType}` : ''}
            </div>
            {admission.dischargedAtISO && <div style={{ fontSize: 12, color: '#475569' }}>بسته‌شدن: {faDateTime(admission.dischargedAtISO)}{admission.dischargeNote ? ` — ${admission.dischargeNote}` : ''}</div>}
          </div>
        </div>
      </div>

      <div style={cardStyle}>
        <strong style={{ fontSize: 14 }}>پرستار مسئول هر شیفت</strong>
        {assignments.length === 0 && <p style={{ fontSize: 13, color: '#64748b' }}>هنوز تخصیصی ثبت نشده است — بدون تخصیص، پاسخگویی این اپیزود ناقص است.</p>}
        {assignments.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 8 }}>
            <thead><tr style={{ background: '#f1f5f9', textAlign: 'right' }}><th style={{ padding: '8px 10px' }}>تاریخ</th><th>شیفت</th><th>پرستار</th><th>نقش</th><th>گزارش شیفت</th></tr></thead>
            <tbody>
              {assignments.map(a => {
                const rep = reports.find(r => r.assignmentId === a.id);
                return (
                  <tr key={a.id} style={{ borderTop: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '8px 10px' }}>{faDate(a.dateISO)}</td>
                    <td>{SHIFT_LABELS[a.shift]}</td>
                    <td style={{ fontWeight: 700 }}>{nameOf(a.employeeId)}</td>
                    <td>{ASSIGNMENT_ROLE_LABELS[a.role]}</td>
                    <td>{rep ? (rep.status === 'signed' ? 'امضاشده ✓' : 'پیش‌نویس') : <span style={{ color: '#be123c' }}>ثبت نشده</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {isOpen && canManage && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12, alignItems: 'end' }}>
            <label style={{ fontSize: 12 }}>تاریخ خدمت<input type="date" value={asgForm.dateISO} onChange={e => setAsgForm(f => ({ ...f, dateISO: e.target.value }))} style={inputStyle} /></label>
            <label style={{ fontSize: 12 }}>شیفت
              <select value={asgForm.shift} onChange={e => setAsgForm(f => ({ ...f, shift: e.target.value as CareShift }))} style={inputStyle}>
                {SHIFTS.map(s => <option key={s} value={s}>{SHIFT_LABELS[s]}</option>)}
              </select></label>
            <label style={{ fontSize: 12 }}>پرستار (نامزدهای برنامهٔ همان شیفت اول آمده‌اند)
              <select value={asgForm.employeeId} onChange={e => setAsgForm(f => ({ ...f, employeeId: e.target.value }))} style={{ ...inputStyle, minWidth: 200 }}>
                <option value="">— انتخاب —</option>
                {candidates.length > 0 && <optgroup label="در برنامهٔ این شیفت">{candidates.map(id => <option key={id} value={id}>{nameOf(id)}</option>)}</optgroup>}
                <optgroup label="همهٔ پرسنل بخش">{deptPeople.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>
              </select></label>
            <label style={{ fontSize: 12 }}>نقش
              <select value={asgForm.role} onChange={e => setAsgForm(f => ({ ...f, role: e.target.value as PatientAssignment['role'] }))} style={inputStyle}>
                <option value="responsible">پرستار مسئول بیمار</option><option value="associate">پرستار همکار</option><option value="charge">مسئول شیفت</option>
              </select></label>
            <button onClick={addAssignment} disabled={!asgForm.employeeId} style={{ padding: '8px 16px', borderRadius: 10, border: 'none', background: '#2563eb', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>ثبت تخصیص</button>
          </div>
        )}
      </div>

      <div style={cardStyle}>
        <strong style={{ fontSize: 14 }}>گزارش‌های پرستاری</strong>
        {repError && <div style={{ background: '#fff1f2', border: '1px solid #fda4af', borderRadius: 10, padding: 10, marginTop: 10, fontSize: 13, color: '#be123c' }}>{repError}</div>}
        {reports.map(r => (
          <div key={r.id} style={{ borderTop: '1px solid #e2e8f0', padding: '10px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>{faDate(r.dateISO)} — شیفت {SHIFT_LABELS[r.shift]} — {nameOf(r.authorEmployeeId)}</span>
              <span style={{ fontSize: 12, color: r.status === 'signed' ? '#15803d' : '#b45309', fontWeight: 700 }}>
                {r.status === 'signed' ? `امضاشده${r.signedAtISO ? ` — ${faDateTime(r.signedAtISO)}` : ''}` : 'پیش‌نویس'}
              </span>
            </div>
            <div style={{ fontSize: 13, color: '#334155', marginTop: 6, display: 'grid', gap: 3 }}>
              <div><b>ارزیابی:</b> {r.body.assessment}</div>
              <div><b>تشخیص پرستاری:</b> {r.body.diagnoses}</div>
              <div><b>اقدامات:</b> {r.body.actions}</div>
              <div><b>پاسخ/اثربخشی:</b> {r.body.response}</div>
              {r.body.vitals && <div><b>علائم حیاتی:</b> {r.body.vitals}</div>}
              {(r.body.braden !== undefined || r.body.morse !== undefined) && (
                <div><b>نمره‌ها:</b> {r.body.braden !== undefined ? `Braden ${r.body.braden}` : ''}{r.body.morse !== undefined ? ` • Morse ${r.body.morse}` : ''}</div>
              )}
              {r.body.followups && <div><b>پیگیری شیفت بعد:</b> {r.body.followups}</div>}
              {r.body.incidents && <div style={{ color: '#be123c' }}><b>حادثه:</b> {r.body.incidents}</div>}
            </div>
            {r.status === 'draft' && (canManage || r.authorEmployeeId === st.currentEmployeeId) && (
              <button onClick={() => signReport(r)} style={{ marginTop: 8, padding: '6px 14px', borderRadius: 8, border: '1px solid #2563eb', background: '#fff', color: '#2563eb', fontWeight: 700, cursor: 'pointer' }}>امضای گزارش</button>
            )}
          </div>
        ))}
        {reports.length === 0 && <p style={{ fontSize: 13, color: '#64748b' }}>گزارشی ثبت نشده است.</p>}
        {isOpen && (
          <div style={{ borderTop: '1px dashed #cbd5e1', marginTop: 12, paddingTop: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>گزارش تازه — به تخصیص همان پرستار/شیفت گره می‌خورد</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              <label style={{ fontSize: 12 }}>تاریخ<input type="date" value={repDate} onChange={e => setRepDate(e.target.value)} style={inputStyle} /></label>
              <label style={{ fontSize: 12 }}>شیفت
                <select value={repShift} onChange={e => setRepShift(e.target.value as CareShift)} style={inputStyle}>
                  {SHIFTS.map(s => <option key={s} value={s}>{SHIFT_LABELS[s]}</option>)}
                </select></label>
              <label style={{ fontSize: 12 }}>نویسنده
                <select value={repAuthor || st.currentEmployeeId} onChange={e => setRepAuthor(e.target.value)} style={{ ...inputStyle, minWidth: 180 }}>
                  {deptPeople.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select></label>
              <label style={{ fontSize: 12 }}>Braden<input type="number" value={repBody.braden ?? ''} onChange={e => setRepBody(b => ({ ...b, braden: e.target.value === '' ? undefined : Number(e.target.value) }))} style={{ ...inputStyle, width: 80 }} /></label>
              <label style={{ fontSize: 12 }}>Morse<input type="number" value={repBody.morse ?? ''} onChange={e => setRepBody(b => ({ ...b, morse: e.target.value === '' ? undefined : Number(e.target.value) }))} style={{ ...inputStyle, width: 80 }} /></label>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 8 }}>
              {([['assessment', 'ارزیابی سیستماتیک *'], ['diagnoses', 'تشخیص پرستاری *'], ['actions', 'اقدامات *'], ['response', 'پاسخ / اثربخشی *'], ['vitals', 'خلاصهٔ علائم حیاتی'], ['followups', 'پیگیری‌های شیفت بعد'], ['incidents', 'حوادث (خالی = بدون حادثه)']] as const).map(([key, label]) => (
                <label key={key} style={{ fontSize: 12 }}>{label}
                  <textarea value={repBody[key]} onChange={e => setRepBody(b => ({ ...b, [key]: e.target.value }))} rows={2} style={{ ...inputStyle, width: '100%', resize: 'vertical' }} />
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10, alignItems: 'center' }}>
              <button onClick={() => { const t = composeReportDraft(repBody); if (t) setRepNarrative(t); }}
                style={{ padding: '8px 16px', borderRadius: 10, border: '1px solid #2563eb', background: '#fff', color: '#2563eb', fontWeight: 700, cursor: 'pointer' }}>
                ساخت پیش‌نویس روایی از بخش‌ها (ایجنت)
              </button>
              <span style={{ fontSize: 12, color: '#64748b' }}>متن روایی فقط از همین بخش‌های پرشده ساخته می‌شود؛ ویرایش و امضایش با خودتان است.</span>
            </div>
            {repNarrative !== null && (
              <label style={{ fontSize: 12, display: 'block', marginTop: 10 }}>متن روایی پیش‌نویس — آزادانه ویرایش کنید
                <textarea value={repNarrative} onChange={e => setRepNarrative(e.target.value)} rows={6}
                  style={{ ...inputStyle, width: '100%', resize: 'vertical', lineHeight: 2 }} />
              </label>
            )}
            <button onClick={addReport} style={{ marginTop: 10, padding: '8px 16px', borderRadius: 10, border: 'none', background: '#2563eb', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>ثبت پیش‌نویس گزارش</button>
          </div>
        )}
      </div>

      <div style={cardStyle}>
        <strong style={{ fontSize: 14 }}>تحویل شیفت (SBAR) — گیرنده نام‌دار و پذیرش او</strong>
        {handovers.map(h => (
          <div key={h.id} style={{ borderTop: '1px solid #e2e8f0', padding: '10px 0', fontSize: 13 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap' }}>
              <span><b>{nameOf(h.giverEmployeeId)}</b> ← <b>{nameOf(h.receiverEmployeeId)}</b> — {faDateTime(h.atISO)}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: h.acceptedAtISO ? '#15803d' : '#b45309' }}>
                {h.acceptedAtISO ? `پذیرفته شد — ${faDateTime(h.acceptedAtISO)}` : 'در انتظار پذیرش گیرنده'}
              </span>
            </div>
            <div style={{ color: '#334155', marginTop: 4, display: 'grid', gap: 2 }}>
              <div><b>S:</b> {h.sbar.situation}</div><div><b>B:</b> {h.sbar.background}</div>
              <div><b>A:</b> {h.sbar.assessment}</div><div><b>R:</b> {h.sbar.recommendation}</div>
              {h.stateSummary && <div><b>وضعیت هنگام تحویل:</b> {h.stateSummary}</div>}
            </div>
            {!h.acceptedAtISO && h.receiverEmployeeId === st.currentEmployeeId && (
              <button onClick={() => st.acceptHandover(h.id)} style={{ marginTop: 6, padding: '6px 14px', borderRadius: 8, border: 'none', background: '#16a34a', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>پذیرش تحویل (خواندم و فهمیدم)</button>
            )}
          </div>
        ))}
        {handovers.length === 0 && <p style={{ fontSize: 13, color: '#64748b' }}>تحویلی ثبت نشده است.</p>}
        {isOpen && canManage && (
          <div style={{ borderTop: '1px dashed #cbd5e1', marginTop: 12, paddingTop: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>تحویل تازه — تخصیص گیرنده خودکار ساخته می‌شود</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              <label style={{ fontSize: 12 }}>تخصیص دهنده
                <select value={hovForm.fromAssignmentId} onChange={e => setHovForm(f => ({ ...f, fromAssignmentId: e.target.value }))} style={{ ...inputStyle, minWidth: 220 }}>
                  <option value="">— انتخاب —</option>
                  {assignments.map(a => <option key={a.id} value={a.id}>{faDate(a.dateISO)} — {SHIFT_LABELS[a.shift]} — {nameOf(a.employeeId)}</option>)}
                </select></label>
              <label style={{ fontSize: 12 }}>گیرنده
                <select value={hovForm.receiverId} onChange={e => setHovForm(f => ({ ...f, receiverId: e.target.value }))} style={{ ...inputStyle, minWidth: 180 }}>
                  <option value="">— انتخاب —</option>
                  {deptPeople.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select></label>
              <label style={{ fontSize: 12 }}>تاریخ شیفت گیرنده<input type="date" value={hovForm.dateISO} onChange={e => setHovForm(f => ({ ...f, dateISO: e.target.value }))} style={inputStyle} /></label>
              <label style={{ fontSize: 12 }}>شیفت گیرنده
                <select value={hovForm.shift} onChange={e => setHovForm(f => ({ ...f, shift: e.target.value as CareShift }))} style={inputStyle}>
                  {SHIFTS.map(s => <option key={s} value={s}>{SHIFT_LABELS[s]}</option>)}
                </select></label>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 8 }}>
              {([['situation', 'S — وضعیت فعلی'], ['background', 'B — پیشینه'], ['assessment', 'A — ارزیابی'], ['recommendation', 'R — توصیه/پیگیری'], ['stateSummary', 'وضعیت بیمار هنگام تحویل']] as const).map(([key, label]) => (
                <label key={key} style={{ fontSize: 12 }}>{label}
                  <textarea value={hovForm[key]} onChange={e => setHovForm(f => ({ ...f, [key]: e.target.value }))} rows={2} style={{ ...inputStyle, width: '100%', resize: 'vertical' }} />
                </label>
              ))}
            </div>
            <button onClick={addHandover} disabled={!hovForm.fromAssignmentId || !hovForm.receiverId} style={{ marginTop: 10, padding: '8px 16px', borderRadius: 10, border: 'none', background: '#2563eb', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>ثبت تحویل</button>
          </div>
        )}
      </div>

      <div style={cardStyle}>
        <strong style={{ fontSize: 14 }}>خط زمانی اپیزود</strong>
        <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
          {timeline.map((ev, i) => (
            <div key={`${ev.kind}-${ev.refId}-${i}`} style={{ display: 'flex', gap: 10, fontSize: 13, alignItems: 'baseline' }}>
              <span style={{ whiteSpace: 'nowrap', color: '#64748b', fontSize: 12, minWidth: 150 }}>{faDateTime(ev.atISO)}</span>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: ev.kind === 'admission' ? '#2563eb' : ev.kind === 'discharge' ? '#475569' : ev.kind === 'report' ? '#16a34a' : ev.kind === 'handover' ? '#b45309' : '#93c5fd', flexShrink: 0 }} />
              <span><b>{ev.title}</b>{ev.detail ? <span style={{ color: '#475569' }}> — {ev.detail}</span> : null}</span>
            </div>
          ))}
        </div>
      </div>

      {isOpen && canManage && (
        <div style={cardStyle}>
          <strong style={{ fontSize: 14 }}>بستن اپیزود</strong>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10, alignItems: 'end' }}>
            <label style={{ fontSize: 12 }}>نتیجه
              <select value={dischargeForm.status} onChange={e => setDischargeForm(f => ({ ...f, status: e.target.value as Admission['status'] }))} style={inputStyle}>
                <option value="discharged">ترخیص</option><option value="transferred">انتقال</option><option value="lama">ترک با مسئولیت شخصی</option><option value="deceased">فوت</option>
              </select></label>
            <label style={{ fontSize: 12, flex: '1 1 260px' }}>یادداشت<input value={dischargeForm.note} onChange={e => setDischargeForm(f => ({ ...f, note: e.target.value }))} style={{ ...inputStyle, width: '100%' }} /></label>
            <button onClick={() => st.dischargeAdmission(admission.id, dischargeForm.status, dischargeForm.note || undefined)}
              style={{ padding: '8px 16px', borderRadius: 10, border: '1px solid #e11d48', background: '#fff', color: '#e11d48', fontWeight: 700, cursor: 'pointer' }}>
              بستن پرونده
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
