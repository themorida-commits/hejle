-- ─────────────────────────────────────────────────────────────────────────────
-- ردپای حسابرسی در عمل (P0-08): تریگر روی جدول‌های حساس؛ هر درج/ویرایش/حذف
-- با بازیگر (auth.uid)، قبل و بعدِ ردیف، خودکار در audit_log ثبت می‌شود.
-- تابع security definer است تا درج ردپا مستقل از policyهای کاربر انجام شود.
--
-- schedule_entries از درج انبوه مستثناست (تولید برنامه صدها ردیف می‌سازد و
-- ردپای سطح برنامه در schedules ثبت می‌شود)؛ فقط ویرایش و حذفش ثبت می‌شود.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.audit_row_change()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  hid uuid;
begin
  hid := coalesce(
    case when tg_op <> 'DELETE' then (to_jsonb(new) ->> 'hospital_id')::uuid end,
    case when tg_op <> 'INSERT' then (to_jsonb(old) ->> 'hospital_id')::uuid end
  );
  insert into public.audit_log (hospital_id, actor_user_id, action, entity, entity_id, before_data, after_data)
  values (
    hid,
    auth.uid(),
    tg_op,
    tg_table_name,
    coalesce(to_jsonb(new) ->> 'id', to_jsonb(old) ->> 'id'),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return coalesce(new, old);
end $$;

create trigger audit_leave_requests
  after insert or update or delete on public.leave_requests
  for each row execute function public.audit_row_change();

create trigger audit_schedules
  after insert or update or delete on public.schedules
  for each row execute function public.audit_row_change();

create trigger audit_work_records
  after insert or update or delete on public.work_records
  for each row execute function public.audit_row_change();

create trigger audit_memberships
  after insert or update or delete on public.memberships
  for each row execute function public.audit_row_change();

create trigger audit_schedule_entries_edits
  after update or delete on public.schedule_entries
  for each row execute function public.audit_row_change();
