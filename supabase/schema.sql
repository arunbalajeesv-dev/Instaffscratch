-- Instaff admin: editable content + service images.
-- Run once in Supabase: SQL Editor > New query > paste > Run.

-- One row holds all editable content (banners, per-service images and text).
create table if not exists public.site_content (
  id         text primary key default 'main',
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
insert into public.site_content (id) values ('main') on conflict do nothing;

alter table public.site_content enable row level security;

-- Anyone (the customer app) can read. Only the signed-in admin can change it.
drop policy if exists "content is public to read" on public.site_content;
create policy "content is public to read" on public.site_content
  for select using (true);

drop policy if exists "admin edits content" on public.site_content;
create policy "admin edits content" on public.site_content
  for all to authenticated using (true) with check (true);

-- Public bucket for service images.
insert into storage.buckets (id, name, public)
values ('service-images', 'service-images', true)
on conflict (id) do nothing;

drop policy if exists "images are public to read" on storage.objects;
create policy "images are public to read" on storage.objects
  for select using (bucket_id = 'service-images');

drop policy if exists "admin manages images" on storage.objects;
create policy "admin manages images" on storage.objects
  for all to authenticated
  using (bucket_id = 'service-images') with check (bucket_id = 'service-images');
