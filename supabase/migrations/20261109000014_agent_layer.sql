-- حجله v2 — مایگریشن ۰۰۱۴: لایهٔ ایجنت (فاز ۱ — دور ۱۷)
-- مبنای طراحی: تصمیم NUR-DR-2026-003 و سند معماری hejleh-ai-agent-architecture-fa.md.
-- این جداول فقط «ردّ اجرا و پیش‌نویس» نگه می‌دارند: هر خروجی ایجنت با ورودی،
-- citationها و مدلش ثبت می‌شود (audit) و هر اثر عملی اول «پیش‌نویس» است و
-- تصمیم انسان (تأیید/رد + تصمیم‌گیرنده + زمان) رویش می‌نشیند. هستهٔ قطعی
-- (solver + rules engine) تنها تصمیم‌گیرنده می‌ماند؛ برای اکشن‌های Zone D
-- (نهایی‌کردن مبلغ کارانه، تصمیم اعتبار مدرک، رد discretionary مرخصی و
-- override قید سخت) اصلاً ابزار و جدولی وجود ندارد.
-- اعمال روی دیتابیس زنده فقط با دستور صریح سعید.

create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  agent_key text not null,
  zone text not null check (zone in ('A','B','C')),
  input jsonb not null default '{}',
  output jsonb,
  citations jsonb not null default '[]',
  model text,
  status text not null default 'done' check (status in ('done','error')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index agent_runs_hospital_idx on public.agent_runs (hospital_id, created_at desc);

create table public.agent_drafts (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  run_id uuid references public.agent_runs(id) on delete set null,
  kind text not null,
  payload jsonb not null default '{}',
  status text not null default 'draft' check (status in ('draft','approved','rejected')),
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index agent_drafts_hospital_idx on public.agent_drafts (hospital_id, status, created_at desc);

alter table public.agent_runs enable row level security;
alter table public.agent_drafts enable row level security;
grant select, insert, update, delete on public.agent_runs to authenticated;
grant select, insert, update, delete on public.agent_drafts to authenticated;

-- خواندن: هر عضو بیمارستان (نمایش در رابط کاربری به نقش‌های مدیریتی محدود است).
create policy agent_runs_select on public.agent_runs for select to authenticated
  using (hospital_id in (select public.member_hospital_ids()));
create policy agent_drafts_select on public.agent_drafts for select to authenticated
  using (hospital_id in (select public.member_hospital_ids()));

-- نوشتن: مدیر بیمارستان و مترون (سطح بیمارستان) یا سرپرستارِ یکی از بخش‌های
-- همین بیمارستان. این جداول ward ندارند؛ سرپرستاربودن با عضویتِ نقش‌دار در
-- هر بخش بیمارستان سنجیده می‌شود (هم‌معنای has_ward_role بدون ward مشخص).
create policy agent_runs_write on public.agent_runs for all to authenticated
  using (public.has_hospital_role(hospital_id, array['hospital_admin','matron']::public.membership_role[])
         or exists (select 1 from public.memberships m
                    where m.user_id = auth.uid() and m.is_active
                      and m.hospital_id = agent_runs.hospital_id
                      and m.role = 'ward_manager'::public.membership_role))
  with check (public.has_hospital_role(hospital_id, array['hospital_admin','matron']::public.membership_role[])
         or exists (select 1 from public.memberships m
                    where m.user_id = auth.uid() and m.is_active
                      and m.hospital_id = agent_runs.hospital_id
                      and m.role = 'ward_manager'::public.membership_role));
create policy agent_drafts_write on public.agent_drafts for all to authenticated
  using (public.has_hospital_role(hospital_id, array['hospital_admin','matron']::public.membership_role[])
         or exists (select 1 from public.memberships m
                    where m.user_id = auth.uid() and m.is_active
                      and m.hospital_id = agent_drafts.hospital_id
                      and m.role = 'ward_manager'::public.membership_role))
  with check (public.has_hospital_role(hospital_id, array['hospital_admin','matron']::public.membership_role[])
         or exists (select 1 from public.memberships m
                    where m.user_id = auth.uid() and m.is_active
                      and m.hospital_id = agent_drafts.hospital_id
                      and m.role = 'ward_manager'::public.membership_role));
