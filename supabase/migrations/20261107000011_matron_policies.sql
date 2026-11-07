-- حجله — مهاجرت ۰۰۱۱: دسترسی‌های نقش مترون در RLS (پس از ۰۰۱۰ اعمال شود).
-- مترون با عضویت سطح بیمارستان (ward_id تهی):
--  • پرسنل، برنامه و شیفت‌های همهٔ بخش‌ها را از راه can_view_ward همین حالا می‌بیند
--    (تابع نسبت به نقش خنثی است) — ویرایش برنامه/پرسنل عمداً برای او باز نمی‌شود؛
--    ناظر و تأییدکننده است، نه ویرایشگر.
--  • این مهاجرت فقط جاهایی را باز می‌کند که فهرست نقش صریح دارند:
--    خواندن و اقدام روی درخواست‌های مرخصی (گام زنجیره) و ماندهٔ مرخصی
--    (اگر زنجیرهٔ بیمارستانی به مترون ختم شود، ثبت نهایی و کسر مانده با اوست).
-- وضعیت: اعمال‌شده ۲۰۲۶-۱۱-۰۷ با دستور صریح سعید («اجرا کن»)؛ هر چهار پالیسی در pg_policies با matron راستی‌آزمایی شدند.

drop policy if exists leave_requests_select on public.leave_requests;
create policy leave_requests_select on public.leave_requests
  for select to authenticated
  using (public.is_own_employee(employee_id)
         or public.has_ward_role(hospital_id, ward_id, array['hospital_admin','hr_admin','ward_manager','matron']::public.membership_role[]));

drop policy if exists leave_requests_update on public.leave_requests;
create policy leave_requests_update on public.leave_requests
  for update to authenticated
  using (public.has_ward_role(hospital_id, ward_id, array['hospital_admin','hr_admin','ward_manager','matron']::public.membership_role[])
         or (public.is_own_employee(employee_id) and status = 'pending'))
  with check (public.has_ward_role(hospital_id, ward_id, array['hospital_admin','hr_admin','ward_manager','matron']::public.membership_role[])
         or (public.is_own_employee(employee_id) and status in ('pending', 'cancelled')));

drop policy if exists leave_balances_select on public.leave_balances;
create policy leave_balances_select on public.leave_balances
  for select to authenticated
  using (public.is_own_employee(employee_id)
         or public.has_ward_role(hospital_id, (select ward_id from public.employees e where e.id = employee_id),
              array['hospital_admin','hr_admin','ward_manager','matron']::public.membership_role[]));

drop policy if exists leave_balances_write on public.leave_balances;
create policy leave_balances_write on public.leave_balances
  for all to authenticated
  using (public.has_ward_role(hospital_id, (select ward_id from public.employees e where e.id = employee_id),
              array['hospital_admin','hr_admin','matron']::public.membership_role[]))
  with check (public.has_ward_role(hospital_id, (select ward_id from public.employees e where e.id = employee_id),
              array['hospital_admin','hr_admin','matron']::public.membership_role[]));
