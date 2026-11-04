-- تست‌های RLS اعتبارنامه‌ها (بعد از seed؛ صحنه مثل تست ۰۳).
\set ON_ERROR_STOP on

create or replace function pg_temp.as_user(uid text) returns void
language plpgsql as $$
begin
  perform set_config('app.user_id', uid, false);
end $$;

-- صحنه با همان شناسه‌های تست ۰۳ ساخته می‌شود (اگر قبلاً ساخته شده، رد شو)
insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'mgr-att@test'),
  ('22222222-2222-4222-8222-222222222222', 'staff-att@test')
on conflict (id) do nothing;
insert into public.profiles (id, full_name) values
  ('11111111-1111-4111-8111-111111111111', 'مدیر تست'),
  ('22222222-2222-4222-8222-222222222222', 'کارمند تست')
on conflict (id) do nothing;
update public.employees set profile_id = '22222222-2222-4222-8222-222222222222'
  where id = 'e0000000-0000-4000-8000-000000000001';
insert into public.memberships (user_id, hospital_id, ward_id, role) values
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000001',
   'd1111111-1111-4111-8111-111111111111', 'ward_manager')
on conflict do nothing;

set role authenticated;

-- T-C1: مدیر بخش مدارک بخش را می‌بیند (سید دمو برای بخش داخلی مدرک دارد)
select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
do $$ declare n int; begin
  select count(*) into n from public.credentials
    where ward_id = 'd1111111-1111-4111-8111-111111111111';
  if n < 10 then raise exception 'T-C1 manager should see seeded credentials, sees %', n; end if;
end $$;

-- T-C2: کارمند فقط مدارک خودش را می‌بیند
select pg_temp.as_user('22222222-2222-4222-8222-222222222222');
do $$ declare n int; begin
  select count(*) into n from public.credentials;
  if n <> 2 then raise exception 'T-C2 staff should see own 2 credentials, sees %', n; end if;
end $$;

-- T-C3: کارمند نمی‌تواند مدرک ثبت کند
do $$ begin
  begin
    insert into public.credentials (hospital_id, ward_id, employee_id, kind, title)
    values ('aaaaaaaa-0000-4000-8000-000000000001', 'd1111111-1111-4111-8111-111111111111',
            'e0000000-0000-4000-8000-000000000001', 'license', 'جعلی');
    raise exception 'T-C3 SHOULD HAVE FAILED';
  exception when insufficient_privilege then
    null;
  end;
end $$;

reset role;
select 'CREDENTIALS TESTS PASS' as result;
