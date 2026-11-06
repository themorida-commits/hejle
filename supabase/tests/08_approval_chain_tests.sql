-- تست مایگریشن ۰۰۰۹ (محلی): ستون‌های زنجیرهٔ تأیید روی leave_requests هست.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'leave_requests' and column_name = 'approval_step'
  ) then
    raise exception 'T-C1 FAILED: approval_step column missing';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'leave_requests' and column_name = 'approvals'
  ) then
    raise exception 'T-C2 FAILED: approvals column missing';
  end if;
  raise notice 'T-C1/T-C2 PASSED: approval chain columns exist';
end $$;
