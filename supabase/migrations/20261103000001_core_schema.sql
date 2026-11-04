-- ─────────────────────────────────────────────────────────────────────────────
-- حجله نسخهٔ ۲ — اسکیمای رابطه‌ای چندمستأجری (P0-04، تصمیم NUR-DR-2026-002)
--
-- مدل: hospital → ward → membership/role. همهٔ جداول عملیاتی hospital_id دارند
-- و دسترسی فقط از مسیر عضویت (memberships) و RLS می‌گذرد؛ هیچ کلاینتی بدون
-- عضویت فعال، هیچ ردیفی از هیچ بیمارستانی نمی‌بیند.
--
-- نقش‌ها: hospital_admin (مدیر بیمارستان)، hr_admin (منابع انسانی)،
-- ward_manager (سرپرستار)، staff (پرسنل). عضویت با ward_id تهی یعنی دسترسی
-- در سطح کل بیمارستان؛ با ward_id یعنی فقط همان بخش.
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists pgcrypto;

-- ── انواع ────────────────────────────────────────────────────────────────────
create type public.membership_role as enum ('hospital_admin', 'hr_admin', 'ward_manager', 'staff');
create type public.request_status as enum ('pending', 'approved', 'rejected', 'cancelled');
create type public.schedule_status as enum ('draft', 'published');
create type public.work_record_status as enum ('draft', 'approved', 'exported');
create type public.rule_severity as enum ('hard', 'warn');

-- ── سازمان ───────────────────────────────────────────────────────────────────
create table public.hospitals (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.wards (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals (id) on delete cascade,
  name text not null,
  code text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (hospital_id, name)
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  phone text,
  created_at timestamptz not null default now()
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  hospital_id uuid not null references public.hospitals (id) on delete cascade,
  ward_id uuid references public.wards (id) on delete cascade,
  role public.membership_role not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, hospital_id, ward_id)
);

-- ── نیروی انسانی ─────────────────────────────────────────────────────────────
create table public.positions (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals (id) on delete cascade,
  title text not null,
  duty_deduction_hours numeric not null default 0,
  unique (hospital_id, title)
);

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals (id) on delete cascade,
  ward_id uuid not null references public.wards (id) on delete restrict,
  profile_id uuid references public.profiles (id) on delete set null,
  position_id uuid references public.positions (id) on delete set null,
  full_name text not null,
  personnel_code text not null,
  national_code text,
  phone text,
  employment_status text not null default 'رسمی',
  employment_start_jalali text, -- «YYYY/MM/DD» جلالی، مثل محصول فعلی
  base_duty_hours_override numeric,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (hospital_id, personnel_code)
);

-- ── شیفت و برنامه ────────────────────────────────────────────────────────────
create table public.shift_types (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals (id) on delete cascade,
  name text not null,
  symbol text not null,
  start_time time,
  end_time time,
  real_duration_hours numeric not null default 0,
  calculated_value numeric not null default 0,
  friday_value numeric not null default 0,
  holiday_value numeric not null default 0,
  color text,
  unique (hospital_id, symbol)
);

create table public.schedules (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals (id) on delete cascade,
  ward_id uuid not null references public.wards (id) on delete cascade,
  j_year int not null,
  j_month int not null check (j_month between 1 and 12),
  status public.schedule_status not null default 'draft',
  created_by uuid references public.profiles (id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique (ward_id, j_year, j_month)
);

create table public.schedule_entries (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.schedules (id) on delete cascade,
  hospital_id uuid not null references public.hospitals (id) on delete cascade,
  ward_id uuid not null references public.wards (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  entry_date date not null,
  j_day int not null check (j_day between 1 and 31),
  shift_type_id uuid not null references public.shift_types (id) on delete restrict,
  is_manual boolean not null default false,
  is_locked boolean not null default false,
  unique (schedule_id, employee_id, entry_date)
);
create index schedule_entries_by_ward_month on public.schedule_entries (ward_id, entry_date);

create table public.swap_requests (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals (id) on delete cascade,
  ward_id uuid not null references public.wards (id) on delete cascade,
  schedule_id uuid not null references public.schedules (id) on delete cascade,
  from_employee_id uuid not null references public.employees (id) on delete cascade,
  to_employee_id uuid not null references public.employees (id) on delete cascade,
  entry_date date not null,
  counterpart_date date,
  status public.request_status not null default 'pending',
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

-- ── مرخصی ────────────────────────────────────────────────────────────────────
create table public.leave_types (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals (id) on delete cascade,
  code text not null,
  name text not null,
  is_paid boolean not null default true,
  annual_quota_days numeric,
  requires_coverage boolean not null default true,
  unique (hospital_id, code)
);

create table public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals (id) on delete cascade,
  ward_id uuid not null references public.wards (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  leave_type_id uuid not null references public.leave_types (id) on delete restrict,
  start_date date not null,
  end_date date not null,
  is_hourly boolean not null default false,
  hours numeric,
  reason text,
  status public.request_status not null default 'pending',
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);
create index leave_requests_by_ward on public.leave_requests (ward_id, status);

create table public.leave_balances (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  leave_type_id uuid not null references public.leave_types (id) on delete cascade,
  j_year int not null,
  entitled_days numeric not null default 0,
  used_days numeric not null default 0,
  carried_over_days numeric not null default 0,
  unique (employee_id, leave_type_id, j_year)
);

-- ── کارکرد ───────────────────────────────────────────────────────────────────
create table public.work_records (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals (id) on delete cascade,
  ward_id uuid not null references public.wards (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  j_year int not null,
  j_month int not null check (j_month between 1 and 12),
  totals jsonb not null default '{}'::jsonb, -- ساعت عادی/شب/تعطیل/اضافه‌کار/مرخصی + ضرایب اعمال‌شده
  status public.work_record_status not null default 'draft',
  approved_by uuid references public.profiles (id) on delete set null,
  approved_at timestamptz,
  exported_at timestamptz,
  created_at timestamptz not null default now(),
  unique (employee_id, j_year, j_month)
);

-- ── موتور قواعد ──────────────────────────────────────────────────────────────
create table public.rule_sets (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals (id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (hospital_id, name)
);

create table public.rules (
  id uuid primary key default gen_random_uuid(),
  rule_set_id uuid not null references public.rule_sets (id) on delete cascade,
  hospital_id uuid not null references public.hospitals (id) on delete cascade,
  rule_type text not null, -- max_consecutive_hours | overtime_cap_monthly | night_coefficient | ...
  params jsonb not null default '{}'::jsonb,
  severity public.rule_severity not null default 'hard',
  is_enabled boolean not null default true,
  unique (rule_set_id, rule_type)
);

-- ── تعطیلات (داده‌محور: شمسی ثابت + قمری؛ hospital_id تهی = ملی) ─────────────
create table public.holidays (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid references public.hospitals (id) on delete cascade,
  j_year int not null,
  j_month int not null check (j_month between 1 and 12),
  j_day int not null check (j_day between 1 and 31),
  title text not null,
  is_official boolean not null default true,
  unique (hospital_id, j_year, j_month, j_day)
);

-- ── اعلان و ردپای حسابرسی ────────────────────────────────────────────────────
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  hospital_id uuid references public.hospitals (id) on delete set null,
  actor_user_id uuid references public.profiles (id) on delete set null,
  action text not null,
  entity text not null,
  entity_id text,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_by_hospital on public.audit_log (hospital_id, created_at desc);

-- ── توابع کمکی RLS (security definer؛ فقط بر اساس عضویت فعال خود کاربر) ──────
create or replace function public.member_hospital_ids()
returns setof uuid
language sql stable security definer set search_path = public
as $$ select hospital_id from public.memberships where user_id = auth.uid() and is_active $$;

create or replace function public.can_view_ward(p_hospital uuid, p_ward uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.memberships m
    where m.user_id = auth.uid() and m.is_active
      and m.hospital_id = p_hospital
      and (m.ward_id is null or m.ward_id = p_ward)
  )
$$;

create or replace function public.has_ward_role(p_hospital uuid, p_ward uuid, p_roles public.membership_role[])
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.memberships m
    where m.user_id = auth.uid() and m.is_active
      and m.hospital_id = p_hospital
      and m.role = any (p_roles)
      and (m.ward_id is null or m.ward_id = p_ward)
  )
$$;

create or replace function public.has_hospital_role(p_hospital uuid, p_roles public.membership_role[])
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.memberships m
    where m.user_id = auth.uid() and m.is_active
      and m.hospital_id = p_hospital
      and m.role = any (p_roles)
      and m.ward_id is null
  )
$$;

create or replace function public.is_own_employee(p_employee uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.employees e
    where e.id = p_employee and e.profile_id = auth.uid()
  )
$$;

-- ── دسترسی پایه و RLS ────────────────────────────────────────────────────────
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke update, delete on public.audit_log from authenticated;

alter table public.hospitals enable row level security;
alter table public.wards enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.positions enable row level security;
alter table public.employees enable row level security;
alter table public.shift_types enable row level security;
alter table public.schedules enable row level security;
alter table public.schedule_entries enable row level security;
alter table public.swap_requests enable row level security;
alter table public.leave_types enable row level security;
alter table public.leave_requests enable row level security;
alter table public.leave_balances enable row level security;
alter table public.work_records enable row level security;
alter table public.rule_sets enable row level security;
alter table public.rules enable row level security;
alter table public.holidays enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_log enable row level security;

-- hospitals: اعضا می‌بینند؛ فقط مدیر بیمارستان ویرایش می‌کند
create policy hospitals_select on public.hospitals
  for select to authenticated using (id in (select public.member_hospital_ids()));
create policy hospitals_update on public.hospitals
  for update to authenticated
  using (public.has_hospital_role(id, array['hospital_admin']::public.membership_role[]))
  with check (public.has_hospital_role(id, array['hospital_admin']::public.membership_role[]));

-- wards: اعضای بیمارستان می‌بینند؛ مدیر و منابع انسانی می‌نویسند
create policy wards_select on public.wards
  for select to authenticated using (hospital_id in (select public.member_hospital_ids()));
create policy wards_write on public.wards
  for all to authenticated
  using (public.has_hospital_role(hospital_id, array['hospital_admin','hr_admin']::public.membership_role[]))
  with check (public.has_hospital_role(hospital_id, array['hospital_admin','hr_admin']::public.membership_role[]));

-- profiles: هر کس فقط خودش (مدیریت عضویت‌ها از مسیر memberships است)
create policy profiles_select on public.profiles
  for select to authenticated using (id = auth.uid());
create policy profiles_write on public.profiles
  for all to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- memberships: اعضای همان بیمارستان می‌بینند؛ فقط مدیر بیمارستان مدیریت می‌کند
create policy memberships_select on public.memberships
  for select to authenticated using (hospital_id in (select public.member_hospital_ids()));
create policy memberships_write on public.memberships
  for all to authenticated
  using (public.has_hospital_role(hospital_id, array['hospital_admin']::public.membership_role[]))
  with check (public.has_hospital_role(hospital_id, array['hospital_admin']::public.membership_role[]));

-- positions: اعضای بیمارستان می‌بینند؛ مدیر و منابع انسانی می‌نویسند
create policy positions_select on public.positions
  for select to authenticated using (hospital_id in (select public.member_hospital_ids()));
create policy positions_write on public.positions
  for all to authenticated
  using (public.has_hospital_role(hospital_id, array['hospital_admin','hr_admin']::public.membership_role[]))
  with check (public.has_hospital_role(hospital_id, array['hospital_admin','hr_admin']::public.membership_role[]));

-- employees: دید در محدودهٔ بخش عضویت؛ نوشتن با مدیر بخش به بالا در همان محدوده
create policy employees_select on public.employees
  for select to authenticated using (public.can_view_ward(hospital_id, ward_id));
create policy employees_write on public.employees
  for all to authenticated
  using (public.has_ward_role(hospital_id, ward_id, array['hospital_admin','hr_admin','ward_manager']::public.membership_role[]))
  with check (public.has_ward_role(hospital_id, ward_id, array['hospital_admin','hr_admin','ward_manager']::public.membership_role[]));

-- shift_types: سطح بیمارستان
create policy shift_types_select on public.shift_types
  for select to authenticated using (hospital_id in (select public.member_hospital_ids()));
create policy shift_types_write on public.shift_types
  for all to authenticated
  using (public.has_hospital_role(hospital_id, array['hospital_admin','hr_admin']::public.membership_role[]))
  with check (public.has_hospital_role(hospital_id, array['hospital_admin','hr_admin']::public.membership_role[]));

-- schedules + entries: محدودهٔ بخش
create policy schedules_select on public.schedules
  for select to authenticated using (public.can_view_ward(hospital_id, ward_id));
create policy schedules_write on public.schedules
  for all to authenticated
  using (public.has_ward_role(hospital_id, ward_id, array['hospital_admin','hr_admin','ward_manager']::public.membership_role[]))
  with check (public.has_ward_role(hospital_id, ward_id, array['hospital_admin','hr_admin','ward_manager']::public.membership_role[]));

create policy schedule_entries_select on public.schedule_entries
  for select to authenticated using (public.can_view_ward(hospital_id, ward_id));
create policy schedule_entries_write on public.schedule_entries
  for all to authenticated
  using (public.has_ward_role(hospital_id, ward_id, array['hospital_admin','hr_admin','ward_manager']::public.membership_role[]))
  with check (public.has_ward_role(hospital_id, ward_id, array['hospital_admin','hr_admin','ward_manager']::public.membership_role[]));

-- swap_requests: طرفین درخواست + مدیران بخش می‌بینند؛ درج فقط برای خود؛ تأیید با طرف مقابل یا مدیر
create policy swap_requests_select on public.swap_requests
  for select to authenticated
  using (public.can_view_ward(hospital_id, ward_id)
         and (public.has_ward_role(hospital_id, ward_id, array['hospital_admin','hr_admin','ward_manager']::public.membership_role[])
              or public.is_own_employee(from_employee_id) or public.is_own_employee(to_employee_id)));
create policy swap_requests_insert on public.swap_requests
  for insert to authenticated
  with check (public.is_own_employee(from_employee_id));
create policy swap_requests_update on public.swap_requests
  for update to authenticated
  using (public.is_own_employee(to_employee_id)
         or public.has_ward_role(hospital_id, ward_id, array['hospital_admin','hr_admin','ward_manager']::public.membership_role[]))
  with check (public.is_own_employee(to_employee_id)
         or public.has_ward_role(hospital_id, ward_id, array['hospital_admin','hr_admin','ward_manager']::public.membership_role[]));

-- leave_types: سطح بیمارستان
create policy leave_types_select on public.leave_types
  for select to authenticated using (hospital_id in (select public.member_hospital_ids()));
create policy leave_types_write on public.leave_types
  for all to authenticated
  using (public.has_hospital_role(hospital_id, array['hospital_admin','hr_admin']::public.membership_role[]))
  with check (public.has_hospital_role(hospital_id, array['hospital_admin','hr_admin']::public.membership_role[]));

-- leave_requests: خود پرسنل + مدیران محدوده می‌بینند؛ درج برای خود یا مدیر؛
-- ویرایش: مدیر (تأیید/رد) یا خود پرسنل فقط وقتی هنوز pending است (لغو)
create policy leave_requests_select on public.leave_requests
  for select to authenticated
  using (public.is_own_employee(employee_id)
         or public.has_ward_role(hospital_id, ward_id, array['hospital_admin','hr_admin','ward_manager']::public.membership_role[]));
create policy leave_requests_insert on public.leave_requests
  for insert to authenticated
  with check (public.is_own_employee(employee_id)
         or public.has_ward_role(hospital_id, ward_id, array['hospital_admin','hr_admin','ward_manager']::public.membership_role[]));
create policy leave_requests_update on public.leave_requests
  for update to authenticated
  using (public.has_ward_role(hospital_id, ward_id, array['hospital_admin','hr_admin','ward_manager']::public.membership_role[])
         or (public.is_own_employee(employee_id) and status = 'pending'))
  with check (public.has_ward_role(hospital_id, ward_id, array['hospital_admin','hr_admin','ward_manager']::public.membership_role[])
         or (public.is_own_employee(employee_id) and status in ('pending', 'cancelled')));

-- leave_balances: خود پرسنل می‌خواند؛ مدیر و منابع انسانی می‌نویسند
create policy leave_balances_select on public.leave_balances
  for select to authenticated
  using (public.is_own_employee(employee_id)
         or public.has_ward_role(hospital_id, (select ward_id from public.employees e where e.id = employee_id),
              array['hospital_admin','hr_admin','ward_manager']::public.membership_role[]));
create policy leave_balances_write on public.leave_balances
  for all to authenticated
  using (public.has_ward_role(hospital_id, (select ward_id from public.employees e where e.id = employee_id),
              array['hospital_admin','hr_admin']::public.membership_role[]))
  with check (public.has_ward_role(hospital_id, (select ward_id from public.employees e where e.id = employee_id),
              array['hospital_admin','hr_admin']::public.membership_role[]));

-- work_records: خود پرسنل + مدیران محدوده می‌خوانند؛ نوشتن با مدیران محدوده
create policy work_records_select on public.work_records
  for select to authenticated
  using (public.is_own_employee(employee_id)
         or public.has_ward_role(hospital_id, ward_id, array['hospital_admin','hr_admin','ward_manager']::public.membership_role[]));
create policy work_records_write on public.work_records
  for all to authenticated
  using (public.has_ward_role(hospital_id, ward_id, array['hospital_admin','hr_admin','ward_manager']::public.membership_role[]))
  with check (public.has_ward_role(hospital_id, ward_id, array['hospital_admin','hr_admin','ward_manager']::public.membership_role[]));

-- rule_sets + rules: اعضای بیمارستان می‌خوانند؛ مدیر و منابع انسانی می‌نویسند
create policy rule_sets_select on public.rule_sets
  for select to authenticated using (hospital_id in (select public.member_hospital_ids()));
create policy rule_sets_write on public.rule_sets
  for all to authenticated
  using (public.has_hospital_role(hospital_id, array['hospital_admin','hr_admin']::public.membership_role[]))
  with check (public.has_hospital_role(hospital_id, array['hospital_admin','hr_admin']::public.membership_role[]));
create policy rules_select on public.rules
  for select to authenticated using (hospital_id in (select public.member_hospital_ids()));
create policy rules_write on public.rules
  for all to authenticated
  using (public.has_hospital_role(hospital_id, array['hospital_admin','hr_admin']::public.membership_role[]))
  with check (public.has_hospital_role(hospital_id, array['hospital_admin','hr_admin']::public.membership_role[]));

-- holidays: ردیف ملی برای همهٔ اعضا خواندنی است؛ ردیف بیمارستانی برای اعضایش؛
-- نوشتن فقط مدیر همان بیمارستان و فقط روی ردیف‌های بیمارستانی
create policy holidays_select on public.holidays
  for select to authenticated
  using (hospital_id is null or hospital_id in (select public.member_hospital_ids()));
create policy holidays_write on public.holidays
  for all to authenticated
  using (hospital_id is not null and public.has_hospital_role(hospital_id, array['hospital_admin']::public.membership_role[]))
  with check (hospital_id is not null and public.has_hospital_role(hospital_id, array['hospital_admin']::public.membership_role[]));

-- notifications: فقط صاحب اعلان
create policy notifications_select on public.notifications
  for select to authenticated using (user_id = auth.uid());
create policy notifications_update on public.notifications
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_insert on public.notifications
  for insert to authenticated
  with check (hospital_id in (select public.member_hospital_ids()));

-- audit_log: درج برای اعضا (با بازیگر = خودشان)؛ خواندن فقط مدیر/منابع انسانی؛
-- ویرایش و حذف برای همه بسته است (نه policy دارد، نه grant)
create policy audit_log_insert on public.audit_log
  for insert to authenticated
  with check (actor_user_id = auth.uid() and hospital_id in (select public.member_hospital_ids()));
create policy audit_log_select on public.audit_log
  for select to authenticated
  using (public.has_hospital_role(hospital_id, array['hospital_admin','hr_admin']::public.membership_role[]));

-- ── دادهٔ مرجع: تعطیلات ملی ثابت ۱۴۰۵ (همان فهرست محصول فعلی؛ قمری‌ها سالانه
--    به‌صورت داده اضافه می‌شوند، نه کد) ────────────────────────────────────────
insert into public.holidays (hospital_id, j_year, j_month, j_day, title) values
  (null, 1405, 1, 1, 'نوروز'),
  (null, 1405, 1, 2, 'نوروز'),
  (null, 1405, 1, 3, 'نوروز'),
  (null, 1405, 1, 4, 'نوروز'),
  (null, 1405, 1, 12, 'روز جمهوری اسلامی'),
  (null, 1405, 1, 13, 'روز طبیعت'),
  (null, 1405, 3, 14, 'رحلت امام خمینی'),
  (null, 1405, 3, 15, 'قیام ۱۵ خرداد'),
  (null, 1405, 11, 22, 'پیروزی انقلاب اسلامی'),
  (null, 1405, 12, 29, 'ملی شدن صنعت نفت');
