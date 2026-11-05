-- ─────────────────────────────────────────────────────────────────────────────
-- مایگریشن ۰۰۰۶ — پروفایل‌های پارامتر کارانه در سطح بیمارستان.
-- تا پیش از این، پارامترهای کارانه (سهم پرستاری، ضریب آنکال، نرخ ریالی K)
-- در localStorage مرورگر هر کاربر بود؛ پروفایل مشترک بیمارستانی وجود نداشت.
-- حالا: هر بیمارستان چند پروفایل نام‌دار دارد و دقیقاً یکی «پیش‌فرض» است.
-- خواندن: هر عضو بیمارستان. نوشتن: فقط نقش‌های بیمارستانی (مدیر/کارگزینی) —
-- پارامتر مالی، عمل مدیریتی است نه تنظیم شخصی.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.karaneh_profiles (
  id            uuid primary key default gen_random_uuid(),
  hospital_id   uuid not null references public.hospitals (id) on delete cascade,
  name          text not null,
  preset_id     text,
  nursing_share numeric not null default 0.85 check (nursing_share >= 0 and nursing_share <= 1),
  on_call_coef  numeric not null default 4    check (on_call_coef >= 0 and on_call_coef <= 10),
  k_rial        numeric not null default 201000 check (k_rial >= 0),
  is_default    boolean not null default false,
  created_by    uuid references auth.users (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- دقیقاً یک پیش‌فرض برای هر بیمارستان
create unique index if not exists karaneh_profiles_one_default
  on public.karaneh_profiles (hospital_id) where is_default;

create index if not exists karaneh_profiles_hospital_idx
  on public.karaneh_profiles (hospital_id);

alter table public.karaneh_profiles enable row level security;

-- grant مایگریشن ۱ فقط جدول‌های همان زمان را پوشش می‌دهد؛ این جدول مال این مایگریشن است
grant select, insert, update, delete on public.karaneh_profiles to authenticated;

drop policy if exists karaneh_profiles_select on public.karaneh_profiles;
create policy karaneh_profiles_select on public.karaneh_profiles
  for select to authenticated
  using (hospital_id in (select public.member_hospital_ids()));

drop policy if exists karaneh_profiles_insert on public.karaneh_profiles;
create policy karaneh_profiles_insert on public.karaneh_profiles
  for insert to authenticated
  with check (public.has_hospital_role(hospital_id, array['hospital_admin', 'hr_admin']::public.membership_role[]));

drop policy if exists karaneh_profiles_update on public.karaneh_profiles;
create policy karaneh_profiles_update on public.karaneh_profiles
  for update to authenticated
  using (public.has_hospital_role(hospital_id, array['hospital_admin', 'hr_admin']::public.membership_role[]))
  with check (public.has_hospital_role(hospital_id, array['hospital_admin', 'hr_admin']::public.membership_role[]));

drop policy if exists karaneh_profiles_delete on public.karaneh_profiles;
create policy karaneh_profiles_delete on public.karaneh_profiles
  for delete to authenticated
  using (public.has_hospital_role(hospital_id, array['hospital_admin', 'hr_admin']::public.membership_role[]));

-- ردپای حسابرسی مثل بقیهٔ جدول‌های حساس
drop trigger if exists audit_karaneh_profiles on public.karaneh_profiles;
create trigger audit_karaneh_profiles
  after insert or update or delete on public.karaneh_profiles
  for each row execute function public.audit_row_change();
