-- تست مایگریشن ۰۰۰۸ (محلی): ستون attachment_path روی leave_requests هست.
-- سیاست‌های Storage در محیط محلی اسکیمای storage ندارد و در مایگریشن با گارد رد
-- می‌شود؛ صحت آن‌ها روی پروژهٔ زنده با فهرست سیاست‌ها و تست آپلود راستی‌آزمایی می‌شود.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'leave_requests' and column_name = 'attachment_path'
  ) then
    raise exception 'T-A1 FAILED: attachment_path column missing';
  end if;
  raise notice 'T-A1 PASSED: attachment_path column exists';
end $$;
