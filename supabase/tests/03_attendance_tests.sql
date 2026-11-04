-- تست‌های RLS حضور و غیاب روی Postgres محلی (بعد از stub 00 + مایگریشن‌های ۱ تا ۳ + seed).
-- اجرا: psql -d <db> -v ON_ERROR_STOP=1 -f supabase/tests/03_attendance_tests.sql
\set ON_ERROR_STOP on

create or replace function pg_temp.as_user(uid text) returns void
language plpgsql as $$
begin
  perform set_config('app.user_id', uid, false);
end $$;

-- ── ساخت صحنه (سوپریوزر؛ RLS اعمال نمی‌شود) ─────────────────────────────────
insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'mgr-att@test'),
  ('22222222-2222-4222-8222-222222222222', 'staff-att@test');
insert into public.profiles (id, full_name) values
  ('11111111-1111-4111-8111-111111111111', 'مدیر تست'),
  ('22222222-2222-4222-8222-222222222222', 'کارمند تست');
update public.employees set profile_id = '22222222-2222-4222-8222-222222222222'
  where id = 'e0000000-0000-4000-8000-000000000001';
insert into public.memberships (user_id, hospital_id, ward_id, role) values
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000001',
   'd1111111-1111-4111-8111-111111111111', 'ward_manager');
insert into public.attendance_events (hospital_id, ward_id, employee_id, event_date, event_type, event_time, source) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'd1111111-1111-4111-8111-111111111111',
   'e0000000-0000-4000-8000-000000000001', date '2026-09-23', 'in', time '06:55', 'device'),
  ('aaaaaaaa-0000-4000-8000-000000000001', 'd1111111-1111-4111-8111-111111111111',
   'e0000000-0000-4000-8000-000000000002', date '2026-09-23', 'in', time '07:05', 'device');

set role authenticated;

-- T-A1: مدیر بخش هر دو رویداد بخش خودش را می‌بیند
select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
do $$ declare n int; begin
  select count(*) into n from public.attendance_events
    where ward_id = 'd1111111-1111-4111-8111-111111111111';
  if n <> 2 then raise exception 'T-A1 manager should see 2 ward events, sees %', n; end if;
end $$;

-- T-A2: کارمند فقط رویداد خودش را می‌بیند
select pg_temp.as_user('22222222-2222-4222-8222-222222222222');
do $$ declare n int; begin
  select count(*) into n from public.attendance_events;
  if n <> 1 then raise exception 'T-A2 staff should see only own event, sees %', n; end if;
end $$;

-- T-A3: کارمند نمی‌تواند برای همکارش رویداد ثبت کند
do $$ begin
  begin
    insert into public.attendance_events (hospital_id, ward_id, employee_id, event_date, event_type, event_time)
    values ('aaaaaaaa-0000-4000-8000-000000000001', 'd1111111-1111-4111-8111-111111111111',
            'e0000000-0000-4000-8000-000000000002', date '2026-09-24', 'in', time '07:00');
    raise exception 'T-A3 SHOULD HAVE FAILED';
  exception when insufficient_privilege then
    null; -- مورد انتظار
  end;
end $$;

reset role;
select 'ATTENDANCE TESTS PASS' as result;
