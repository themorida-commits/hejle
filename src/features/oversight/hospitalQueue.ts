/**
 * صف مرخصیِ کل بیمارستان برای نقش‌های سطح بیمارستان (مترون، اداری، مدیر بیمارستان).
 * سازنده خالص است: از روی درخواست‌ها + پرسنل + بخش‌ها می‌گوید چه چیزی در گامِ
 * «من» است، چه چیزی در کل بیمارستان در انتظار است و چه چیزهایی تازگی نهایی شده‌اند
 * (بایگانی ثبت اداری). اقدام روی هر مورد از داخل بخش خودش انجام می‌شود — این صف
 * فقط دید و مسیریابی است تا منطق محافظ زنجیره (مانده، پچ برنامه) دور نخورد.
 */
import type { LeaveRecord } from '../../services/data/types';

export interface QueueItem {
  request: LeaveRecord;
  employeeName: string;
  wardName: string;
  /** نقشِ گام فعلی زنجیره؛ برای نهایی‌شده‌ها null. */
  stepRole: string | null;
}

export interface HospitalQueue {
  /** در انتظارِ گامِ نقش من (مدیر بیمارستان در هر گام اختیار دارد). */
  mine: QueueItem[];
  /** همهٔ در انتظارهای بیمارستان. */
  pending: QueueItem[];
  /** نهایی‌شده‌های ۳۰ روز اخیر — بایگانی ثبت اداری. */
  finalizedRecent: QueueItem[];
}

interface PersonLike { id: string; fullName: string; wardId: string }
interface WardLike { id: string; name: string }

const DAY_MS = 24 * 60 * 60 * 1000;

export function buildHospitalQueue(args: {
  requests: LeaveRecord[];
  employees: PersonLike[];
  wards: WardLike[];
  chain: string[];
  actorRole: string;
  now?: Date;
}): HospitalQueue {
  const empById = new Map(args.employees.map(e => [e.id, e]));
  const wardById = new Map(args.wards.map(w => [w.id, w]));
  const now = args.now ?? new Date();

  const toItem = (r: LeaveRecord): QueueItem => {
    const emp = empById.get(r.employeeId);
    return {
      request: r,
      employeeName: emp?.fullName ?? '—',
      wardName: wardById.get(r.wardId)?.name ?? '—',
      stepRole: r.status === 'pending' ? (args.chain[r.approvalStep] ?? null) : null,
    };
  };

  const pending = args.requests.filter(r => r.status === 'pending').map(toItem);
  const mine = pending.filter(it =>
    it.stepRole !== null && (it.stepRole === args.actorRole || args.actorRole === 'hospital_admin'));
  const finalizedRecent = args.requests
    .filter(r => r.status === 'approved')
    .filter(r => {
      const last = r.approvals[r.approvals.length - 1];
      if (!last?.at) return false;
      const t = new Date(last.at).getTime();
      return Number.isFinite(t) && now.getTime() - t <= 30 * DAY_MS && t <= now.getTime() + DAY_MS;
    })
    .map(toItem);

  return { mine, pending, finalizedRecent };
}
