-- حجله v2 — مایگریشن ۰۰۰۳: حضور و غیاب (فاز ۲)
-- رویدادهای خام ورود/خروج (دستی، دستگاه، ایمپورت فایل)؛ جفت‌سازی و تطبیق با
-- برنامه در لایهٔ سرویس انجام می‌شود، نه در دیتابیس.

create table public.attendance_events (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  ward_id uuid not null references public.wards(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  event_date date not null,
  event_type text not null check (event_type in ('in','out')),
  event_time time not null,
  source text not null default 'manual' check (source in ('manual','device','import')),
  note text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index attendance_events_emp_date_idx on public.attendance_events (employee_id, event_date);
create index attendance_events_ward_date_idx on public.attendance_events (ward_id, event_date);

alter table public.attendance_events enable row level security;

-- grant مایگریشن ۱ فقط جدول‌های همان زمان را پوشش می‌دهد؛ این جدول مال این مایگریشن است
grant select, insert, update, delete on public.attendance_events to authenticated;

-- شناسه‌های کارمندیِ کاربر جاری (security definer تا RLS جدول employees دور زده شود)
create or replace function public.my_employee_ids()
returns setof uuid
language sql security definer set search_path = public
as $$ select id from public.employees where profile_id = auth.uid() $$;

create policy attendance_select on public.attendance_events for select to authenticated
  using (
    public.can_view_ward(hospital_id, ward_id)
    or employee_id in (select public.my_employee_ids())
  );
create policy attendance_insert on public.attendance_events for insert to authenticated
  with check (
    public.has_ward_role(hospital_id, ward_id, array['ward_manager','hr_admin']::public.membership_role[])
    or employee_id in (select public.my_employee_ids())
  );
create policy attendance_update on public.attendance_events for update to authenticated
  using (public.has_ward_role(hospital_id, ward_id, array['ward_manager','hr_admin']::public.membership_role[]))
  with check (public.has_ward_role(hospital_id, ward_id, array['ward_manager','hr_admin']::public.membership_role[]));
create policy attendance_delete on public.attendance_events for delete to authenticated
  using (public.has_ward_role(hospital_id, ward_id, array['ward_manager','hr_admin']::public.membership_role[]));

-- حسابرسی تغییرات رویدادها (اصلاح دستی باید ردیابی شود)
create trigger audit_attendance_events
  after insert or update or delete on public.attendance_events
  for each row execute function public.audit_row_change();
