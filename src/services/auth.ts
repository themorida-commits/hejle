import { supabase } from './supabaseClient';
import type { SessionRole } from '../store/session';

// ── لایهٔ احراز هویت (حالت supabase) ─────────────────────────────────────────
// اصل DR-002: هویت و دسترسی قطعی و سمت سرور است (Supabase Auth + RLS)؛
// این فایل فقط نشست را می‌خواند و «زمینهٔ سازمانی» کاربر را از روی عضویت‌هایش
// انتخاب می‌کند. هیچ تصمیم دسترسی در کلاینت گرفته نمی‌شود — RLS داور نهایی است.

export interface MembershipRow {
  hospital_id: string;
  ward_id: string | null;
  role: SessionRole;
  is_active: boolean;
}

export interface SessionContext {
  hospitalId: string;
  wardId: string | null;
  role: SessionRole;
}

const ROLE_PRIORITY: Record<SessionRole, number> = {
  ward_manager: 0,
  hospital_admin: 1,
  // مترون (مدیر خدمات پرستاری) — گام واقعی زنجیرهٔ بوعلی طبق پاسخ آقای حجله ۲۰۲۶-۱۱-۰۷
  matron: 2,
  hr_admin: 3,
  staff: 4,
};

/**
 * انتخاب زمینهٔ نشست از روی عضویت‌ها — خالص و قابل تست.
 * ترتیب ترجیح: عضویت فعال ← بخش ترجیحی (از env پایلوت) ← نقش عملیاتی‌تر
 * (سرپرستار بخش جلوتر از نقش‌های بیمارستانی، چون کار روزانه در بخش است).
 */
export function pickSessionContext(
  memberships: MembershipRow[],
  preferredWardId?: string | null,
): SessionContext | null {
  const active = memberships.filter(m => m.is_active);
  if (active.length === 0) return null;
  const sorted = [...active].sort((a, b) => {
    const aPref = preferredWardId && a.ward_id === preferredWardId ? 0 : 1;
    const bPref = preferredWardId && b.ward_id === preferredWardId ? 0 : 1;
    if (aPref !== bPref) return aPref - bPref;
    return ROLE_PRIORITY[a.role] - ROLE_PRIORITY[b.role];
  });
  const top = sorted[0]!;
  return { hospitalId: top.hospital_id, wardId: top.ward_id, role: top.role };
}

/**
 * زمینهٔ هر بیمارستان به‌صورت جدا (برای سوییچر چندبیمارستانی): برای هر
 * بیمارستانِ دارای عضویت فعال، همان انتخاب ترجیحی pickSessionContext.
 */
export function pickHospitalContexts(
  memberships: MembershipRow[],
  preferredWardId?: string | null,
): SessionContext[] {
  const byHospital = new Map<string, MembershipRow[]>();
  for (const m of memberships) {
    if (!m.is_active) continue;
    const list = byHospital.get(m.hospital_id) ?? [];
    list.push(m);
    byHospital.set(m.hospital_id, list);
  }
  const out: SessionContext[] = [];
  for (const rows of byHospital.values()) {
    const ctx = pickSessionContext(rows, preferredWardId);
    if (ctx) out.push(ctx);
  }
  return out;
}

/** نام بیمارستان‌ها برای نمایش در سوییچر (RLS عضویت اجازهٔ خواندن می‌دهد). */
export async function fetchHospitalNames(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase.from('hospitals').select('id, name').in('id', ids);
  if (error) return new Map();
  return new Map((data ?? []).map(h => [h.id as string, h.name as string]));
}

export async function fetchMyMemberships(userId: string): Promise<MembershipRow[]> {
  const { data, error } = await supabase
    .from('memberships')
    .select('hospital_id, ward_id, role, is_active')
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
  return (data ?? []) as MembershipRow[];
}

/** شناسهٔ رکورد کارمندیِ وصل‌شده به این کاربر (اگر در onboarding لینک شده باشد). */
export async function fetchMyEmployeeId(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('employees')
    .select('id')
    .eq('profile_id', userId)
    .limit(1);
  if (error) return null;
  return data?.[0]?.id ?? null;
}

export async function signInWithPassword(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}
