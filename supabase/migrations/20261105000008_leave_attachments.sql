-- ─────────────────────────────────────────────────────────────────────────────
-- مایگریشن ۰۰۰۸ — پیوست مدرک مرخصی (استعلاجی): ستون attachment_path روی
-- leave_requests + باکت خصوصی «leave-attachments» در Storage.
-- مسیر فایل: <hospital_id>/<employee_id>/<filename> — خواندن برای اعضای همان
-- بیمارستان، بارگذاری/حذف فقط برای خود کارمند (یا مدیر بیمارستان).
-- بخش‌های Storage با گارد وجود اسکیمای storage اجرا می‌شوند تا زنجیرهٔ تست
-- محلی (بدون اسکیمای storage) نشکند؛ روی پروژهٔ واقعی سوپابیس کامل اعمال می‌شود.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.leave_requests add column if not exists attachment_path text;

do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    execute $q$
      insert into storage.buckets (id, name, public)
      values ('leave-attachments', 'leave-attachments', false)
      on conflict (id) do nothing
    $q$;

    execute $q$
      drop policy if exists leave_attach_read on storage.objects
    $q$;
    execute $q$
      create policy leave_attach_read on storage.objects
        for select to authenticated
        using (
          bucket_id = 'leave-attachments'
          and ((storage.foldername(name))[1])::uuid in (select public.member_hospital_ids())
        )
    $q$;

    execute $q$
      drop policy if exists leave_attach_insert on storage.objects
    $q$;
    execute $q$
      create policy leave_attach_insert on storage.objects
        for insert to authenticated
        with check (
          bucket_id = 'leave-attachments'
          and exists (
            select 1 from public.employees e
            where e.profile_id = auth.uid()
              and e.id::text = (storage.foldername(name))[2]
              and e.hospital_id::text = (storage.foldername(name))[1]
          )
        )
    $q$;

    execute $q$
      drop policy if exists leave_attach_delete on storage.objects
    $q$;
    execute $q$
      create policy leave_attach_delete on storage.objects
        for delete to authenticated
        using (
          bucket_id = 'leave-attachments'
          and (
            exists (
              select 1 from public.employees e
              where e.profile_id = auth.uid()
                and e.id::text = (storage.foldername(name))[2]
            )
            or public.has_hospital_role(
              ((storage.foldername(name))[1])::uuid,
              array['hospital_admin', 'hr_admin']::public.membership_role[])
          )
        )
    $q$;
  end if;
end $$;
