-- ═══════════════════════════════════════════════════════════════════════════
-- حجله v2 — وصل‌کردن یک کاربر واقعی به بیمارستان/بخش (onboarding پایلوت)
-- ═══════════════════════════════════════════════════════════════════════════
-- پیش‌نیاز: کاربر اول در داشبورد سوپابیس ساخته شده باشد:
--   Authentication → Users → Add user (ایمیل + رمز، تیک Auto Confirm).
-- بعد این فایل را در SQL Editor اجرا کنید؛ فقط سه مقدار بالای فایل را عوض کنید.
-- این اسکریپت: پروفایل را می‌سازد/کامل می‌کند، عضویت فعال می‌دهد و اگر
-- employee_code داده شده باشد، رکورد کارمندی را به همین کاربر وصل می‌کند.
-- idempotent است: اجرای دوباره‌اش خطا نمی‌دهد.

do $$
declare
  v_email          text := 'manager@example.com';   -- ← ایمیل کاربر
  v_full_name      text := 'سرپرستار بخش داخلی';      -- ← نام نمایشی
  v_role           text := 'ward_manager';           -- ← hospital_admin | hr_admin | ward_manager | staff
  v_employee_code  text := 'HN-101';                 -- ← کد پرسنلی برای لینک (یا null)؛ HN-101 = سرپرستار دموی بخش داخلی
  v_hospital_id    uuid := 'aaaaaaaa-0000-4000-8000-000000000001';  -- بیمارستان دمو
  v_ward_id        uuid := 'd1111111-1111-4111-8111-111111111111';  -- بخش داخلی (برای نقش‌های بیمارستانی: null)
  v_user_id        uuid;
begin
  select id into v_user_id from auth.users where email = v_email;
  if v_user_id is null then
    raise exception 'کاربری با ایمیل % در auth.users نیست؛ اول در داشبورد بسازیدش', v_email;
  end if;

  insert into public.profiles (id, full_name)
  values (v_user_id, v_full_name)
  on conflict (id) do update set full_name = excluded.full_name;

  insert into public.memberships (user_id, hospital_id, ward_id, role, is_active)
  values (v_user_id, v_hospital_id, v_ward_id, v_role::public.membership_role, true)
  on conflict (user_id, hospital_id, ward_id) do update set role = excluded.role, is_active = true;

  if v_employee_code is not null then
    update public.employees
    set profile_id = v_user_id
    where hospital_id = v_hospital_id and personnel_code = v_employee_code;
    if not found then
      raise exception 'کارمندی با کد % در این بیمارستان نیست', v_employee_code;
    end if;
  end if;

  raise notice 'OK: % (%) ← %', v_email, v_role, coalesce(v_employee_code, '—');
end $$;

-- بررسی نتیجه:
-- select p.full_name, m.role, m.ward_id, e.personnel_code
-- from public.memberships m
-- join public.profiles p on p.id = m.user_id
-- left join public.employees e on e.profile_id = p.id
-- where m.is_active;
