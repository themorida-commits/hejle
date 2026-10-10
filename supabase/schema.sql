-- =====================================================================
-- Hejleh App — Supabase schema (production hardened)
-- اجرا: Supabase Dashboard → SQL Editor → New query → paste → Run
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- جدول اصلی داده‌های برنامه (الگوی document store روی Postgres)
-- ---------------------------------------------------------------------
create table if not exists public.app_data (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  collection_name text not null,
  document_id text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- فقط مجموعه‌های مجاز (اعتبارسنجی در مرز سیستم)
  constraint app_data_collection_name_check check (
    collection_name in (
      'departments',
      'personnel',
      'shiftTypes',
      'schedule',
      'requests',
      'rules',
      'archives',
      'calendarEvents',
      'globalSettings',
      'manualBalances'
    )
  ),
  -- سقف ۱ مگابایت برای هر سند (جلوگیری از اشباع دیتابیس)
  constraint app_data_payload_size_check check (
    octet_length(payload::text) <= 1048576
  ),
  unique (user_id, collection_name, document_id)
);

comment on table public.app_data is 'داده‌های کاربرها؛ هر ردیف یک سند jsonb در یک مجموعه منطقی';
comment on column public.app_data.user_id is 'مالک سند؛ به auth.users متصل و با حذف کاربر پاک می‌شود';

-- پوشش کوئری‌های اصلی (select/update/delete روی هر مجموعه)
create index if not exists app_data_user_collection_idx
  on public.app_data (user_id, collection_name);

-- ---------------------------------------------------------------------
-- به‌روزرسانی خودکار updated_at
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists app_data_set_updated_at on public.app_data;
create trigger app_data_set_updated_at
  before update on public.app_data
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Row Level Security
-- هر کاربر فقط سندهای خودش را می‌بیند/نمی‌نویسد.
-- نکته مهم عملکرد: auth.uid() داخل (select ...) قرار گرفته تا
-- فقط یک‌بار برای هر کوئری ارزیابی شود (initplan optimization).
-- ---------------------------------------------------------------------
alter table public.app_data enable row level security;

drop policy if exists app_data_select_policy on public.app_data;
create policy app_data_select_policy on public.app_data
  for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists app_data_insert_policy on public.app_data;
create policy app_data_insert_policy on public.app_data
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists app_data_update_policy on public.app_data;
create policy app_data_update_policy on public.app_data
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists app_data_delete_policy on public.app_data;
create policy app_data_delete_policy on public.app_data
  for delete
  to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- جایگزینی اتمیک یک مجموعه (حذف سندهای منسوخ + upsert سندهای فعلی)
-- در یک رفت‌وبرگشت تراکنشنی، با همان هویت کاربر (security invoker).
-- ---------------------------------------------------------------------
create or replace function public.replace_collection(
  p_collection text,
  p_rows jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a JSON array';
  end if;

  -- حذف سندهایی که روی کلاینت دیگر وجود ندارند
  delete from public.app_data
  where user_id = (select auth.uid())
    and collection_name = p_collection
    and document_id not in (
      select elem ->> 'document_id'
      from jsonb_array_elements(p_rows) as elem
      where elem ? 'document_id'
    );

  -- درج/به‌روزرسانی سندهای فعلی
  insert into public.app_data (user_id, collection_name, document_id, payload)
  select
    (select auth.uid()),
    p_collection,
    elem ->> 'document_id',
    elem -> 'payload'
  from jsonb_array_elements(p_rows) as elem
  where elem ? 'document_id'
  on conflict (user_id, collection_name, document_id)
  do update set
    payload = excluded.payload,
    updated_at = now();
end;
$$;

revoke all on function public.replace_collection(text, jsonb) from anon;

-- ---------------------------------------------------------------------
-- محدودسازی نرخ درخواست endpoints هوش مصنوعی
-- ---------------------------------------------------------------------
create table if not exists public.ai_request_log (
  id bigint generated always as identity primary key,
  user_key text not null,
  endpoint text not null,
  created_at timestamptz not null default now()
);

create index if not exists ai_request_log_lookup_idx
  on public.ai_request_log (user_key, endpoint, created_at desc);

alter table public.ai_request_log enable row level security;

-- دسترسی مستقیم به جدول لاگ برای هیچ نقشی مجاز نیست
revoke all on public.ai_request_log from anon, authenticated;

create or replace function public.try_consume_ai_quota(
  p_user_key text,
  p_endpoint text,
  p_max_requests integer default 30,
  p_window_seconds integer default 60
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  used_count integer;
begin
  if p_endpoint is null or length(p_endpoint) = 0 then
    return false;
  end if;

  -- کاربران وارد‌شده قادر به جعل کلید کاربر دیگر نیستند
  if (select auth.uid()) is not null then
    p_user_key := 'user:' || (select auth.uid())::text;
  end if;

  if p_user_key is null or length(p_user_key) = 0 then
    return false;
  end if;

  select count(*) into used_count
  from public.ai_request_log
  where user_key = p_user_key
    and endpoint = p_endpoint
    and created_at > now() - make_interval(secs => p_window_seconds);

  if used_count >= p_max_requests then
    return false;
  end if;

  insert into public.ai_request_log (user_key, endpoint)
  values (p_user_key, p_endpoint);

  return true;
end;
$$;

-- پاکسازی خودکار لاگ‌های قدیمی (در صورت فعال بودن pg_cron)
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      perform cron.schedule(
        'cleanup-hejleh-ai-logs',
        '15 * * * *',
        $cron$delete from public.ai_request_log where created_at < now() - interval '24 hours'$cron$
      );
    exception when others then
      null;
    end;
  end if;
end $$;
