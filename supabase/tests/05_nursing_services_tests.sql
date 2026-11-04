-- تست‌های RLS ثبت خدمات پرستاری (بعد از seed؛ صحنهٔ کاربران مثل تست‌های ۰۳/۰۴).
\set ON_ERROR_STOP on

create or replace function pg_temp.as_user(uid text) returns void
language plpgsql as $$
begin
  perform set_config('app.user_id', uid, false);
end $$;

-- پرستار تست عضویت staff هم دارد (مثل آنبوردینگ واقعی link_user.sql)
insert into public.memberships (user_id, hospital_id, ward_id, role) values
  ('22222222-2222-4222-8222-222222222222', 'aaaaaaaa-0000-4000-8000-000000000001',
   'd1111111-1111-4111-8111-111111111111', 'staff')
on conflict do nothing;

-- بستهٔ تست را با نقش مالک می‌سازیم تا صحنه آماده شود
insert into public.nursing_packages (id, hospital_id, code, title, k_value, care_group)
values ('f0000000-0000-4000-8000-000000000001',
        'aaaaaaaa-0000-4000-8000-000000000001', 'NC-G4', 'مراقبت گروه ۴', 3.7, 4)
on conflict (id) do nothing;

set role authenticated;

-- T-N1: پرستار ثبت خدمت خودش را می‌بیند و می‌تواند ثبت کند؛ ثبت همکار را نمی‌بیند
select pg_temp.as_user('22222222-2222-4222-8222-222222222222');
insert into public.nursing_service_records
  (hospital_id, ward_id, employee_id, patient_ref, package_id, service_count, service_date, shift)
values ('aaaaaaaa-0000-4000-8000-000000000001', 'd1111111-1111-4111-8111-111111111111',
        'e0000000-0000-4000-8000-000000000001', 'P-900', 'f0000000-0000-4000-8000-000000000001', 2, '2026-09-23', 'morning');
do $$ declare n int; begin
  select count(*) into n from public.nursing_service_records;
  if n <> 1 then raise exception 'T-N1 staff should see exactly own record, sees %', n; end if;
end $$;

-- T-N2: پرستار نمی‌تواند ثبت را تأیید (update) کند — تأیید با سرپرستار است.
-- در RLS، آپدیتِ بدون مجوز سطر را بی‌سروصدا رد می‌کند؛ پس نتیجه را می‌سنجیم:
do $$ declare s text; begin
  update public.nursing_service_records set status = 'confirmed' where patient_ref = 'P-900';
  select status into s from public.nursing_service_records where patient_ref = 'P-900';
  if s is distinct from 'recorded' then
    raise exception 'T-N2 staff update leaked: status became %', s;
  end if;
end $$;

-- T-N3: مدیر بخش ثبت‌های بخش را می‌بیند و تأیید می‌کند
select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
do $$ declare n int; begin
  select count(*) into n from public.nursing_service_records
    where ward_id = 'd1111111-1111-4111-8111-111111111111';
  if n < 1 then raise exception 'T-N3 manager should see ward records, sees %', n; end if;
end $$;
update public.nursing_service_records set status = 'confirmed', confirmed_at = now()
  where patient_ref = 'P-900';
do $$ declare n int; begin
  select count(*) into n from public.nursing_service_records where status = 'confirmed';
  if n < 1 then raise exception 'T-N3 manager confirm failed'; end if;
end $$;

-- T-N4: پرستار نمی‌تواند کاتالوگ بسته‌ها را تغییر دهد ولی می‌تواند بخواند
select pg_temp.as_user('22222222-2222-4222-8222-222222222222');
do $$ declare n int; begin
  select count(*) into n from public.nursing_packages;
  if n < 1 then raise exception 'T-N4 staff should read packages'; end if;
  begin
    insert into public.nursing_packages (hospital_id, code, title, k_value)
    values ('aaaaaaaa-0000-4000-8000-000000000001', 'HACK', 'نفوذ', 999);
    raise exception 'T-N4 staff package write should have been denied';
  exception when insufficient_privilege or others then
    if sqlerrm like 'T-N4%' then raise; end if;
  end;
end $$;

reset role;
select 'ALL NURSING SERVICES TESTS PASSED' as result;
