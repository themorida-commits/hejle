-- تست‌های RLS پروفایل کارانه (مایگریشن ۰۰۰۶) — بعد از seed؛ صحنهٔ کاربران مثل تست‌های ۰۵.
\set ON_ERROR_STOP on

create or replace function pg_temp.as_user(uid text) returns void
language plpgsql as $$
begin
  perform set_config('app.user_id', uid, false);
end $$;

-- پروفایل پایه را با نقش مالک می‌سازیم
insert into public.karaneh_profiles (id, hospital_id, name, preset_id, nursing_share, on_call_coef, k_rial, is_default)
values ('f1000000-0000-4000-8000-000000000001',
        'aaaaaaaa-0000-4000-8000-000000000001', 'پروفایل پایه', 'moh', 0.85, 4, 201000, true)
on conflict (id) do nothing;

set role authenticated;

-- T-K1: عضو بخش (سرپرستار تست 1111… = ward_manager) پروفایل را می‌خواند ولی نمی‌تواند بنویسد
select pg_temp.as_user('11111111-1111-4111-8111-111111111111');
do $$ declare n int; begin
  select count(*) into n from public.karaneh_profiles;
  if n < 1 then raise exception 'T-K1 ward member should read profiles, sees %', n; end if;
end $$;
do $$ begin
  begin
    insert into public.karaneh_profiles (hospital_id, name) values
      ('aaaaaaaa-0000-4000-8000-000000000001', 'تلاش سرپرستار');
  exception when others then
    null; -- رد RLS با خطا قابل قبول است؛ سنجش اصلی روی ساخته‌نشدن ردیف است
  end;
end $$;
do $$ declare n int; begin
  select count(*) into n from public.karaneh_profiles where name = 'تلاش سرپرستار';
  if n <> 0 then raise exception 'T-K1 ward_manager must NOT insert profiles'; end if;
end $$;

-- T-K2: بیگانه (کاربر بدون عضویت) هیچ پروفیلی نمی‌بیند
select pg_temp.as_user('99999999-9999-4999-8999-999999999999');
do $$ declare n int; begin
  select count(*) into n from public.karaneh_profiles;
  if n <> 0 then raise exception 'T-K2 outsider should see 0 profiles, sees %', n; end if;
end $$;

reset role;

-- T-K3: قید «دقیقاً یک پیش‌فرض» — درج پیش‌فرض دوم باید خطا بدهد
do $$ begin
  insert into public.karaneh_profiles (hospital_id, name, is_default)
  values ('aaaaaaaa-0000-4000-8000-000000000001', 'پیش‌فرض دوم', true);
  raise exception 'T-K3 second default should be rejected by unique index';
exception when unique_violation then
  null; -- مورد انتظار
end $$;

select 'ALL KARANEH PROFILE TESTS PASSED' as result;
