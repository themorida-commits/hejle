-- حجله v2 — مایگریشن ۰۰۰۵: ثبت بسته‌های خدمات پرستاری (P0 نسخهٔ خصوصی)
-- کاتالوگ بسته‌ها (مقدار K پارامتر مصوبهٔ سالانه است) + ثبت خدمت به‌ازای
-- بیمار/نوبت با چرخهٔ دوستونهٔ سند بازتوزیع: ثبت پرستار ← تأیید سرپرستار
-- (وضعیت auto_confirmed در لایهٔ سرویس از روی زمان ثبت حساب می‌شود).

create table public.nursing_packages (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  code text not null,
  title text not null,
  k_value numeric not null check (k_value >= 0),
  unit text not null default 'بیمار/نوبت',
  care_group int check (care_group between 1 and 8),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (hospital_id, code)
);

create table public.nursing_service_records (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  ward_id uuid not null references public.wards(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  patient_ref text not null,
  package_id uuid not null references public.nursing_packages(id),
  service_count int not null default 1 check (service_count > 0),
  service_date date not null,
  shift text not null check (shift in ('morning','evening','night')),
  status text not null default 'recorded' check (status in ('recorded','confirmed')),
  confirmed_by uuid references public.employees(id),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index nsr_ward_date_idx on public.nursing_service_records (ward_id, service_date);
create index nsr_emp_idx on public.nursing_service_records (employee_id);

alter table public.nursing_packages enable row level security;
alter table public.nursing_service_records enable row level security;
grant select, insert, update, delete on public.nursing_packages to authenticated;
grant select, insert, update, delete on public.nursing_service_records to authenticated;

create policy nursing_packages_select on public.nursing_packages for select to authenticated
  using (hospital_id in (select public.member_hospital_ids()));
create policy nursing_packages_write on public.nursing_packages for all to authenticated
  using (public.has_hospital_role(hospital_id, array['hospital_admin','hr_admin']::public.membership_role[]))
  with check (public.has_hospital_role(hospital_id, array['hospital_admin','hr_admin']::public.membership_role[]));

create policy nsr_select on public.nursing_service_records for select to authenticated
  using (
    public.has_hospital_role(hospital_id, array['hospital_admin','hr_admin']::public.membership_role[])
    or public.has_ward_role(hospital_id, ward_id, array['ward_manager']::public.membership_role[])
    or employee_id in (select public.my_employee_ids())
  );
create policy nsr_insert on public.nursing_service_records for insert to authenticated
  with check (
    public.has_ward_role(hospital_id, ward_id, array['ward_manager']::public.membership_role[])
    or employee_id in (select public.my_employee_ids())
  );
create policy nsr_update on public.nursing_service_records for update to authenticated
  using (
    public.has_hospital_role(hospital_id, array['hospital_admin','hr_admin']::public.membership_role[])
    or public.has_ward_role(hospital_id, ward_id, array['ward_manager']::public.membership_role[])
  )
  with check (
    public.has_hospital_role(hospital_id, array['hospital_admin','hr_admin']::public.membership_role[])
    or public.has_ward_role(hospital_id, ward_id, array['ward_manager']::public.membership_role[])
  );
create policy nsr_delete on public.nursing_service_records for delete to authenticated
  using (public.has_hospital_role(hospital_id, array['hospital_admin','hr_admin']::public.membership_role[]));

create trigger audit_nursing_service_records
  after insert or update or delete on public.nursing_service_records
  for each row execute function public.audit_row_change();
