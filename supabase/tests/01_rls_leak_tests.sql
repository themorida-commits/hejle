-- ─────────────────────────────────────────────────────────────────────────────
-- تست نشت RLS (گیت G2) — دو بیمارستان، چند نقش؛ هر نشت بین‌مستأجری = exception.
-- اجرا: بعد از 00_local_stub.sql و مایگریشن اسکیما، روی دیتابیس تستی.
-- ─────────────────────────────────────────────────────────────────────────────
\set ON_ERROR_STOP on

-- ── ساخت صحنه (به‌عنوان سوپریوزر، RLS هنوز اعمال نمی‌شود) ────────────────────
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'admin-a@test'),
  ('22222222-2222-2222-2222-222222222222', 'manager-a1@test'),
  ('33333333-3333-3333-3333-333333333333', 'staff-a1@test'),
  ('44444444-4444-4444-4444-444444444444', 'admin-b@test'),
  ('55555555-5555-5555-5555-555555555555', 'staff-a2@test');
insert into public.profiles (id, full_name) select id, email from auth.users;

insert into public.hospitals (id, name, code) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'بیمارستان الف', 'A'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'بیمارستان ب', 'B');
insert into public.wards (id, hospital_id, name) values
  ('a1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'داخلی الف'),
  ('a2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'جراحی الف'),
  ('b1111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'داخلی ب');

insert into public.memberships (user_id, hospital_id, ward_id, role) values
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', null, 'hospital_admin'),
  ('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1111111-1111-1111-1111-111111111111', 'ward_manager'),
  ('33333333-3333-3333-3333-333333333333', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1111111-1111-1111-1111-111111111111', 'staff'),
  ('55555555-5555-5555-5555-555555555555', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2222222-2222-2222-2222-222222222222', 'staff'),
  ('44444444-4444-4444-4444-444444444444', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', null, 'hospital_admin');

insert into public.employees (id, hospital_id, ward_id, profile_id, full_name, personnel_code) values
  ('e1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 'پرستار الف۱', 'A-1'),
  ('e2222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2222222-2222-2222-2222-222222222222', '55555555-5555-5555-5555-555555555555', 'پرستار الف۲', 'A-2'),
  ('e3333333-3333-3333-3333-333333333333', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b1111111-1111-1111-1111-111111111111', null, 'پرستار ب۱', 'B-1');

insert into public.shift_types (id, hospital_id, name, symbol) values
  ('51111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'صبح', 'M'),
  ('52222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'صبح', 'M');
insert into public.schedules (id, hospital_id, ward_id, j_year, j_month) values
  ('5c111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1111111-1111-1111-1111-111111111111', 1405, 7),
  ('5c222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b1111111-1111-1111-1111-111111111111', 1405, 7);
insert into public.schedule_entries (schedule_id, hospital_id, ward_id, employee_id, entry_date, j_day, shift_type_id) values
  ('5c111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1111111-1111-1111-1111-111111111111', 'e1111111-1111-1111-1111-111111111111', '2026-09-23', 1, '51111111-1111-1111-1111-111111111111'),
  ('5c222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b1111111-1111-1111-1111-111111111111', 'e3333333-3333-3333-3333-333333333333', '2026-09-23', 1, '52222222-2222-2222-2222-222222222222');

insert into public.leave_types (id, hospital_id, code, name) values
  ('71111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'annual', 'استحقاقی');
insert into public.leave_requests (id, hospital_id, ward_id, employee_id, leave_type_id, start_date, end_date) values
  ('81111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1111111-1111-1111-1111-111111111111', 'e1111111-1111-1111-1111-111111111111', '71111111-1111-1111-1111-111111111111', '2026-10-01', '2026-10-03');
insert into public.work_records (hospital_id, ward_id, employee_id, j_year, j_month, totals) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1111111-1111-1111-1111-111111111111', 'e1111111-1111-1111-1111-111111111111', 1405, 7, '{"total": 170}'::jsonb),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b1111111-1111-1111-1111-111111111111', 'e3333333-3333-3333-3333-333333333333', 1405, 7, '{"total": 165}'::jsonb);

-- ── کمک‌تابع اجرای نقش کاربر ─────────────────────────────────────────────────
create or replace function pg_temp.as_user(uid text) returns void
language plpgsql as $$
begin
  perform set_config('app.user_id', uid, false);
end $$;

-- ═══ تست ۱: مدیر بیمارستان ب هیچ داده‌ای از الف نمی‌بیند ═══
set role authenticated;
select pg_temp.as_user('44444444-4444-4444-4444-444444444444');
do $$ declare n int; begin
  select count(*) into n from public.employees where hospital_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  if n <> 0 then raise exception 'LEAK T1: admin-b sees % employees of A', n; end if;
  select count(*) into n from public.employees where hospital_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  if n <> 1 then raise exception 'T1: admin-b should see own 1 employee, sees %', n; end if;
  select count(*) into n from public.schedule_entries where hospital_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  if n <> 0 then raise exception 'LEAK T1: admin-b sees schedule entries of A'; end if;
  select count(*) into n from public.work_records where hospital_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  if n <> 0 then raise exception 'LEAK T1: admin-b sees work records of A'; end if;
  raise notice 'T1 PASS';
end $$;

-- ═══ تست ۲: پرسنل بخش الف۱، بخش الف۲ و بیمارستان ب را نمی‌بیند ═══
select pg_temp.as_user('33333333-3333-3333-3333-333333333333');
do $$ declare n int; begin
  select count(*) into n from public.employees;
  if n <> 1 then raise exception 'T2: staff-a1 should see exactly 1 employee (own ward), sees %', n; end if;
  select count(*) into n from public.work_records;
  if n <> 1 then raise exception 'T2: staff-a1 should see only own work record, sees %', n; end if;
  raise notice 'T2 PASS';
end $$;

-- ═══ تست ۳: سرپرستار الف۱ نمی‌تواند در الف۲ کارمند درج کند (باید خطای RLS بدهد) ═══
select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
do $$ declare blocked boolean := false; begin
  begin
    insert into public.employees (hospital_id, ward_id, full_name, personnel_code)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a2222222-2222-2222-2222-222222222222', 'نفوذی', 'X-9');
  exception when others then blocked := true;
  end;
  if not blocked then raise exception 'LEAK T3: ward manager inserted employee into another ward'; end if;
  raise notice 'T3 PASS';
end $$;

-- ═══ تست ۴: پرسنل نمی‌تواند مرخصی خودش را تأیید کند ═══
select pg_temp.as_user('33333333-3333-3333-3333-333333333333');
do $$ declare n int := 0; blocked boolean := false; s public.request_status; begin
  begin
    update public.leave_requests set status = 'approved'
     where id = '81111111-1111-1111-1111-111111111111';
    get diagnostics n = row_count;
  exception when others then blocked := true;
  end;
  if not blocked and n <> 0 then raise exception 'LEAK T4: staff approved own leave (% rows)', n; end if;
  select status into s from public.leave_requests where id = '81111111-1111-1111-1111-111111111111';
  if s <> 'pending' then raise exception 'LEAK T4: leave status changed to %', s; end if;
  raise notice 'T4 PASS';
end $$;

-- ═══ تست ۵: پرسنل می‌تواند مرخصی pending خودش را لغو کند ═══
do $$ declare n int; s public.request_status; begin
  update public.leave_requests set status = 'cancelled'
   where id = '81111111-1111-1111-1111-111111111111';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'T5: staff could not cancel own pending leave'; end if;
  raise notice 'T5 PASS';
end $$;

-- ═══ تست ۶: ردپای حسابرسی — پرسنل نمی‌خواند، هیچ‌کس ویرایش/حذف نمی‌کند ═══
do $$ declare n int; blocked boolean := false; begin
  insert into public.audit_log (hospital_id, actor_user_id, action, entity)
  values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'test', 'leave_requests');
  select count(*) into n from public.audit_log;
  if n <> 0 then raise exception 'LEAK T6: staff can read audit_log (% rows)', n; end if;
  begin
    delete from public.audit_log;
  exception when others then blocked := true;
  end;
  if not blocked then raise exception 'LEAK T6: audit_log deletable'; end if;
  raise notice 'T6 PASS';
end $$;

-- ═══ تست ۷: مدیر بیمارستان الف ردپای بیمارستان خودش را می‌خواند، نه ب را ═══
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
do $$ declare n int; begin
  select count(*) into n from public.audit_log where hospital_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  if n < 1 then raise exception 'T7: admin-a should read own hospital audit (>=1), sees %', n; end if;
  select count(*) into n from public.audit_log where hospital_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  if n <> 0 then raise exception 'LEAK T7: admin-a reads audit of hospital B (% rows)', n; end if;
  select count(*) into n from public.employees;
  if n <> 2 then raise exception 'T7: admin-a should see both A employees, sees %', n; end if;
  raise notice 'T7 PASS';
end $$;

-- ═══ تست ۸: بدون نشست (کاربر نامشخص) هیچ‌چیز دیده نمی‌شود ═══
select pg_temp.as_user('');
do $$ declare n int; begin
  select count(*) into n from public.employees;
  if n <> 0 then raise exception 'LEAK T8: anonymous sees employees'; end if;
  select count(*) into n from public.hospitals;
  if n <> 0 then raise exception 'LEAK T8: anonymous sees hospitals'; end if;
  raise notice 'T8 PASS';
end $$;

reset role;
select 'ALL RLS LEAK TESTS PASSED' as result;
