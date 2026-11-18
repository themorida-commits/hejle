// ── برنامه‌ریزی جابه‌جایی خانه‌ها (دور ۲۵ — موج ۲ UI) ─────────────────────────
// منطق خالصِ drag-and-drop و ناوبری صفحه‌کلید روی گرید برنامه، جدا از رندر تا
// تست‌پذیر بماند. درگ فقط «برنامهٔ ویرایش» می‌سازد؛ اعمالش با همان applyManualEdit
// پیکر انجام می‌شود و قانون ثابت سرپرستار این‌جا هم پیش از هر ویرایشی چک می‌شود.
import { categorizeShift } from '../../core/rules/engine';
import type { ScheduleEntry, ShiftType } from '../../core/types';

export interface CellRef { personnelId: string; dateISO: string }
export interface PlannedEdit { personnelId: string; dateISO: string; shiftTypeId: string }

export type DragPlan =
  | { ok: true; edits: PlannedEdit[] }
  | { ok: false; reason: string };

const HEAD_NURSE_MSG = 'قانون ثابت: سرپرستار فقط شیفت صبح دارد؛ این جابه‌جایی ممکن نیست.';

export function planCellDrag(args: {
  source: CellRef;
  target: CellRef;
  entries: ScheduleEntry[];
  shiftTypes: ShiftType[];
  isHeadNurse: (personnelId: string) => boolean;
}): DragPlan {
  const { source, target, entries, shiftTypes, isHeadNurse } = args;
  if (source.personnelId === target.personnelId && source.dateISO === target.dateISO) {
    return { ok: false, reason: 'همان خانه است.' };
  }
  const shiftAt = (c: CellRef) => entries.find(e => e.personnelId === c.personnelId && e.date === c.dateISO)?.shiftTypeId;
  const sourceShift = shiftAt(source);
  if (!sourceShift) return { ok: false, reason: 'خانهٔ مبدأ خالی است؛ چیزی برای جابه‌جایی نیست.' };
  const offId = shiftTypes.find(s => categorizeShift(s) === 'off')?.id;
  if (!offId) return { ok: false, reason: 'شیفت «تعطیل» در فهرست شیفت‌ها نیست.' };
  const targetShift = shiftAt(target);

  const guard = (personnelId: string, incomingShiftId: string): string | null => {
    if (!isHeadNurse(personnelId)) return null;
    const t = shiftTypes.find(s => s.id === incomingShiftId);
    if (!t) return null;
    const cat = categorizeShift(t);
    return cat === 'morning' || cat === 'off' ? null : HEAD_NURSE_MSG;
  };

  if (source.personnelId === target.personnelId) {
    // جابه‌جایی در ردیف خود فرد: شیفت به روز مقصد می‌رود و مبدأ تعطیل می‌شود.
    const g = guard(source.personnelId, sourceShift);
    if (g) return { ok: false, reason: g };
    return {
      ok: true,
      edits: [
        { personnelId: target.personnelId, dateISO: target.dateISO, shiftTypeId: sourceShift },
        { personnelId: source.personnelId, dateISO: source.dateISO, shiftTypeId: offId },
      ],
    };
  }
  // سواپ بین دو نفر: هرکس شیفت آن روزِ دیگری را می‌گیرد (خالی = تعطیل).
  const incomingForTarget = sourceShift;
  const incomingForSource = targetShift ?? offId;
  const g1 = guard(target.personnelId, incomingForTarget);
  if (g1) return { ok: false, reason: g1 };
  const g2 = guard(source.personnelId, incomingForSource);
  if (g2) return { ok: false, reason: g2 };
  return {
    ok: true,
    edits: [
      { personnelId: target.personnelId, dateISO: target.dateISO, shiftTypeId: incomingForTarget },
      { personnelId: source.personnelId, dateISO: source.dateISO, shiftTypeId: incomingForSource },
    ],
  };
}

/**
 * همسایهٔ خانه در ناوبری صفحه‌کلید. روزها در گرید راست‌به‌چپ چیده شده‌اند
 * (روز ۱ سمت راست)؛ پس ArrowLeft یعنی «روز بعد» و ArrowRight «روز قبل» —
 * حرکت فیزیکیِ چشم و دست یکی می‌ماند.
 */
export function neighborCell(
  personIdx: number, dayIdx: number, key: string,
  personCount: number, dayCount: number,
): { personIdx: number; dayIdx: number } | null {
  switch (key) {
    case 'ArrowLeft': return dayIdx + 1 < dayCount ? { personIdx, dayIdx: dayIdx + 1 } : null;
    case 'ArrowRight': return dayIdx - 1 >= 0 ? { personIdx, dayIdx: dayIdx - 1 } : null;
    case 'ArrowDown': return personIdx + 1 < personCount ? { personIdx: personIdx + 1, dayIdx } : null;
    case 'ArrowUp': return personIdx - 1 >= 0 ? { personIdx: personIdx - 1, dayIdx } : null;
    default: return null;
  }
}
