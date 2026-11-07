import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAppStore } from '../../store/appStore';
import { useSessionStore } from '../../store/session';
import { createRepositories } from '../../services/data';
import { DEMO_HOSPITAL_ID } from '../../services/data/demoRepositories';
import { LEAVE_TYPES } from '../leave/leaveService';
import { buildHospitalQueue, type HospitalQueue } from './hospitalQueue';

/** اختلاف روز دو تاریخ ISO (ستون‌های date دیتابیس، UTC) — شامل هر دو سر بازه. */
const isoDaysInclusive = (start: string, end: string) =>
  Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1;
import { isHospitalLevelRole } from './roleNav';

const ROLE_FA: Record<string, string> = {
  ward_manager: 'سرپرستار بخش', hospital_admin: 'مدیر بیمارستان',
  hr_admin: 'اداری (منابع انسانی)', matron: 'مترون', staff: 'پرسنل',
};
const typeName = (code: string) => LEAVE_TYPES.find(t => t.code === code)?.name ?? code;
const faNum = (n: number) => n.toLocaleString('fa-IR');

/**
 * میز کار سطح بیمارستان — صف مرخصیِ همهٔ بخش‌ها برای مترون، اداری و مدیر بیمارستان.
 * اقدام (تأیید/رد) از داخل بخشِ خودِ درخواست انجام می‌شود تا منطق محافظ زنجیره
 * (مانده و پچ برنامه) سر جایش بماند؛ دکمهٔ هر سطر فقط بخش فعال را عوض می‌کند.
 */
export default function HospitalQueueSection({ actorRole, variant }: { actorRole: string; variant: 'full' | 'panel' }) {
  const dataSource = useAppStore(s => s.dataSource);
  const setDepartment = useAppStore(s => s.setDepartment);
  const [queue, setQueue] = useState<HospitalQueue | null>(null);

  useEffect(() => {
    if (!isHospitalLevelRole(actorRole)) return;
    let cancelled = false;
    (async () => {
      try {
        const repos = createRepositories(dataSource);
        const hospitalId = dataSource === 'supabase'
          ? useSessionStore.getState().hospitalId
          : DEMO_HOSPITAL_ID;
        if (!hospitalId) return;
        const [requests, employees, wards, settings] = await Promise.all([
          repos.leave.listLeaveRequestsByHospital(hospitalId),
          repos.org.listEmployeesByHospital(hospitalId),
          repos.org.listWards(hospitalId),
          repos.settings.getSettings(hospitalId),
        ]);
        if (cancelled) return;
        setQueue(buildHospitalQueue({
          requests,
          employees: employees.map(e => ({ id: e.id, fullName: e.fullName, wardId: e.wardId })),
          wards: wards.map(w => ({ id: w.id, name: w.name })),
          chain: settings.approvalChain,
          actorRole,
        }));
      } catch {
        /* نمای بیمارستانی تزئینی نیست ولی نباید صفحهٔ بخش را بشکند؛ خطا = سکوت */
      }
    })();
    return () => { cancelled = true; };
  }, [actorRole, dataSource]);

  if (!isHospitalLevelRole(actorRole) || !queue) return null;

  if (variant === 'panel') {
    return (
      <section style={{ background: '#fff', border: '1px solid #e3ddd2', borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <h2 style={{ marginTop: 0, fontSize: 16 }}>میز کار من — {ROLE_FA[actorRole] ?? actorRole} (کل بیمارستان)</h2>
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 14 }}>
          <span>در گام من: <strong>{faNum(queue.mine.length)}</strong></span>
          <span>کل در انتظار بیمارستان: <strong>{faNum(queue.pending.length)}</strong></span>
          <span>نهایی‌شدهٔ ۳۰ روز اخیر: <strong>{faNum(queue.finalizedRecent.length)}</strong></span>
          <Link to="/leave">رفتن به صف مرخصی ←</Link>
        </div>
      </section>
    );
  }

  const row = (it: HospitalQueue['mine'][number], showStep: boolean) => (
    <tr key={it.request.id} style={{ borderTop: '1px solid #eee' }}>
      <td style={{ padding: '6px 8px' }}>{it.employeeName}</td>
      <td style={{ padding: '6px 8px' }}>{it.wardName}</td>
      <td style={{ padding: '6px 8px' }}>{typeName(it.request.leaveTypeCode)}</td>
      <td style={{ padding: '6px 8px' }}>{it.request.startDate} تا {it.request.endDate}</td>
      <td style={{ padding: '6px 8px' }}>{it.request.isHourly ? `${faNum(it.request.hours ?? 0)} ساعت` : `${faNum(isoDaysInclusive(it.request.startDate, it.request.endDate))} روز`}</td>
      {showStep && <td style={{ padding: '6px 8px' }}>{it.stepRole ? (ROLE_FA[it.stepRole] ?? it.stepRole) : '—'}</td>}
      <td style={{ padding: '6px 8px' }}>
        <button onClick={() => setDepartment(it.request.wardId)} style={{ cursor: 'pointer' }}>بررسی در بخش</button>
      </td>
    </tr>
  );
  const table = (items: HospitalQueue['mine'], showStep: boolean) => (
    <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13, background: '#fff' }}>
      <thead>
        <tr style={{ textAlign: 'right', color: '#68707a' }}>
          <th style={{ padding: '6px 8px' }}>نام</th><th style={{ padding: '6px 8px' }}>بخش</th>
          <th style={{ padding: '6px 8px' }}>نوع</th><th style={{ padding: '6px 8px' }}>بازه</th>
          <th style={{ padding: '6px 8px' }}>مدت</th>
          {showStep && <th style={{ padding: '6px 8px' }}>گام فعلی</th>}
          <th style={{ padding: '6px 8px' }}></th>
        </tr>
      </thead>
      <tbody>{items.map(it => row(it, showStep))}</tbody>
    </table>
  );

  return (
    <section style={{ marginBottom: 20 }}>
      <h2>صف کل بیمارستان — {ROLE_FA[actorRole] ?? actorRole}</h2>
      <h3 style={{ fontSize: 14 }}>در گام من ({faNum(queue.mine.length)})</h3>
      {queue.mine.length ? table(queue.mine, false) : <p style={{ color: '#68707a', fontSize: 13 }}>چیزی در گام شما نیست.</p>}
      <h3 style={{ fontSize: 14 }}>همهٔ در انتظارهای بیمارستان ({faNum(queue.pending.length)})</h3>
      {queue.pending.length ? table(queue.pending, true) : <p style={{ color: '#68707a', fontSize: 13 }}>درخواستی در انتظار نیست.</p>}
      {actorRole === 'hr_admin' && (
        <>
          <h3 style={{ fontSize: 14 }}>بایگانی ثبت اداری — نهایی‌شده‌های ۳۰ روز اخیر ({faNum(queue.finalizedRecent.length)})</h3>
          {queue.finalizedRecent.length ? table(queue.finalizedRecent, false) : <p style={{ color: '#68707a', fontSize: 13 }}>موردی نیست.</p>}
        </>
      )}
    </section>
  );
}
