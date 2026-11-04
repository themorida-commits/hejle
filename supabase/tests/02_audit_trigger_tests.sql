-- ─────────────────────────────────────────────────────────────────────────────
-- تست تریگر حسابرسی (P0-08) — بعد از 01 اجرا می‌شود؛ صحنهٔ همان تست را مصرف می‌کند.
-- وضعیت شروع: مرخصی 81111111 در تست ۵ لغو شده (status=cancelled) و یک ردپای
-- دستی از تست ۶ در لاگ هست. ردپاهای تریگری باید جدا از آن شمرده شوند.
-- ─────────────────────────────────────────────────────────────────────────────
\set ON_ERROR_STOP on

-- کمک‌تابع نشست (در هر نشست psql جدا لازم است)
create or replace function pg_temp.as_user(uid text) returns void
language plpgsql as $$
begin
  perform set_config('app.user_id', uid, false);
end $$;

set role authenticated;

-- ═══ A1: پرسنل مرخصی تازه درج می‌کند → ردپای INSERT با بازیگر خودش ═══
select pg_temp.as_user('33333333-3333-3333-3333-333333333333');
insert into public.leave_requests (hospital_id, ward_id, employee_id, leave_type_id, start_date, end_date)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1111111-1111-1111-1111-111111111111',
        'e1111111-1111-1111-1111-111111111111', '71111111-1111-1111-1111-111111111111',
        '2026-11-05', '2026-11-06');

-- ═══ A2: سرپرستار همان مرخصی لغوشده را دوباره pending می‌کند؟ نه — مرخصی تازه را تأیید می‌کند ═══
select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
update public.leave_requests set status = 'approved', reviewed_by = '22222222-2222-2222-2222-222222222222'
 where employee_id = 'e1111111-1111-1111-1111-111111111111' and status = 'pending';

-- ═══ A3: مدیر بیمارستان ردپاها را می‌خواند و صحت بازیگر/قبل/بعد را چک می‌کند ═══
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
do $$ declare n int; begin
  select count(*) into n from public.audit_log
   where entity = 'leave_requests' and action = 'INSERT'
     and actor_user_id = '33333333-3333-3333-3333-333333333333';
  if n <> 1 then raise exception 'A3: expected 1 INSERT audit by staff, found %', n; end if;
  select count(*) into n from public.audit_log
   where entity = 'leave_requests' and action = 'UPDATE'
     and actor_user_id = '22222222-2222-2222-2222-222222222222'
     and before_data ->> 'status' = 'pending'
     and after_data ->> 'status' = 'approved';
  if n <> 1 then raise exception 'A3: expected 1 UPDATE audit with before/after status, found %', n; end if;
  raise notice 'A3 PASS — audit triggers capture actor + before/after';
end $$;

reset role;
select 'AUDIT TRIGGER TESTS PASSED' as result;
