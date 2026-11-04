-- حجله v2 — مایگریشن ۰۰۰۴: اعتبارنامه‌ها و مدارک پرسنلی (فاز ۳)
-- پروانهٔ اشتغال، گواهی‌های آموزشی و مدارک لازم برای credentialing؛ وضعیت
-- اعتبار (معتبر/در حال انقضا/منقضی) در لایهٔ سرویس از روی تاریخ‌ها حساب می‌شود.

create table public.credentials (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  ward_id uuid references public.wards(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  kind text not null check (kind in ('license','certificate','training','other')),
  title text not null,
  issuer text,
  issued_on date,
  expires_on date,
  document_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index credentials_emp_idx on public.credentials (employee_id);
create index credentials_expiry_idx on public.credentials (expires_on);

alter table public.credentials enable row level security;
grant select, insert, update, delete on public.credentials to authenticated;

create policy credentials_select on public.credentials for select to authenticated
  using (
    public.has_hospital_role(hospital_id, array['hospital_admin','hr_admin']::public.membership_role[])
    or (ward_id is not null and public.has_ward_role(hospital_id, ward_id, array['ward_manager']::public.membership_role[]))
    or employee_id in (select public.my_employee_ids())
  );
create policy credentials_insert on public.credentials for insert to authenticated
  with check (
    public.has_hospital_role(hospital_id, array['hospital_admin','hr_admin']::public.membership_role[])
    or (ward_id is not null and public.has_ward_role(hospital_id, ward_id, array['ward_manager']::public.membership_role[]))
  );
create policy credentials_update on public.credentials for update to authenticated
  using (
    public.has_hospital_role(hospital_id, array['hospital_admin','hr_admin']::public.membership_role[])
    or (ward_id is not null and public.has_ward_role(hospital_id, ward_id, array['ward_manager']::public.membership_role[]))
  )
  with check (
    public.has_hospital_role(hospital_id, array['hospital_admin','hr_admin']::public.membership_role[])
    or (ward_id is not null and public.has_ward_role(hospital_id, ward_id, array['ward_manager']::public.membership_role[]))
  );
create policy credentials_delete on public.credentials for delete to authenticated
  using (public.has_hospital_role(hospital_id, array['hospital_admin','hr_admin']::public.membership_role[]));

create trigger audit_credentials
  after insert or update or delete on public.credentials
  for each row execute function public.audit_row_change();
