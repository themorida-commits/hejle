-- ─────────────────────────────────────────────────────────────────────────────
-- استاب محلی برای تست RLS روی Postgres خام (فقط محیط تست — روی Supabase واقعی
-- اسکیمای auth از قبل وجود دارد و این فایل هرگز اجرا نمی‌شود).
-- auth.uid() در Supabase از JWT خوانده می‌شود؛ اینجا از GUC به نام app.user_id.
-- ─────────────────────────────────────────────────────────────────────────────
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, email text);

create or replace function auth.uid()
returns uuid
language sql stable
as $$ select nullif(current_setting('app.user_id', true), '')::uuid $$;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end $$;

grant usage on schema public to authenticated;
grant usage on schema auth to authenticated;
