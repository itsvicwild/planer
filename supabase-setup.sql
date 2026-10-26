-- Wild Workspace: per-user cloud storage with row-level security.
-- Run once in the Supabase SQL Editor for the project used by the app.

create table if not exists public.workspace_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.workspace_data enable row level security;
revoke all on table public.workspace_data from anon;
grant select, insert, update on table public.workspace_data to authenticated;

drop policy if exists "read own workspace" on public.workspace_data;
drop policy if exists "insert own workspace" on public.workspace_data;
drop policy if exists "update own workspace" on public.workspace_data;

create policy "read own workspace" on public.workspace_data
  for select to authenticated
  using (auth.uid() = user_id);

create policy "insert own workspace" on public.workspace_data
  for insert to authenticated
  with check (auth.uid() = user_id);

create policy "update own workspace" on public.workspace_data
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


-- Private file storage for task attachments (up to 10 MiB per file).
insert into storage.buckets (id, name, public, file_size_limit)
values ('ww-attachments', 'ww-attachments', false, 10485760)
on conflict (id) do update set public = false, file_size_limit = 10485760;

drop policy if exists "ww attachments read own files" on storage.objects;
drop policy if exists "ww attachments upload own files" on storage.objects;
drop policy if exists "ww attachments update own files" on storage.objects;
drop policy if exists "ww attachments delete own files" on storage.objects;
create policy "ww attachments read own files" on storage.objects
  for select to authenticated
  using (bucket_id = 'ww-attachments' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "ww attachments upload own files" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'ww-attachments' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "ww attachments update own files" on storage.objects
  for update to authenticated
  using (bucket_id = 'ww-attachments' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'ww-attachments' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "ww attachments delete own files" on storage.objects
  for delete to authenticated
  using (bucket_id = 'ww-attachments' and (storage.foldername(name))[1] = auth.uid()::text);
