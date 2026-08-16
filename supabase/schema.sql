create extension if not exists pgcrypto;

create table if not exists public.app_data (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  collection_name text not null,
  document_id text not null,
  payload jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, collection_name, document_id)
);

create index if not exists app_data_user_collection_idx on public.app_data (user_id, collection_name);

alter table public.app_data enable row level security;

create policy if not exists app_data_select_policy on public.app_data
  for select using (auth.uid()::text = user_id);

create policy if not exists app_data_insert_policy on public.app_data
  for insert with check (auth.uid()::text = user_id);

create policy if not exists app_data_update_policy on public.app_data
  for update using (auth.uid()::text = user_id) with check (auth.uid()::text = user_id);

create policy if not exists app_data_delete_policy on public.app_data
  for delete using (auth.uid()::text = user_id);
