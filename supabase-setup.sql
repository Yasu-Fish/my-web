create extension if not exists pgcrypto;

create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  genre_title text not null,
  name text not null,
  size numeric not null default 0,
  catch_date date,
  comment text not null default '',
  image_path text not null unique,
  image_paths text[] not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.photos
add column if not exists user_id uuid references auth.users(id) on delete set null;

alter table public.photos
add column if not exists catch_date date;

alter table public.photos
add column if not exists image_paths text[] not null default '{}';

update public.photos
set image_paths = array[image_path]
where coalesce(array_length(image_paths, 1), 0) = 0;

alter table public.photos enable row level security;

drop policy if exists "public read photos" on public.photos;
create policy "public read photos"
on public.photos
for select
to anon, authenticated
using (true);

drop policy if exists "public insert photos" on public.photos;
drop policy if exists "authenticated insert own photos" on public.photos;
create policy "authenticated insert own photos"
on public.photos
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "public update photos" on public.photos;
drop policy if exists "authenticated update own photos" on public.photos;
create policy "authenticated update own photos"
on public.photos
for update
to authenticated
using (auth.uid() = user_id or user_id is null)
with check (auth.uid() = user_id or user_id is null);

drop policy if exists "public delete photos" on public.photos;
drop policy if exists "authenticated delete own photos" on public.photos;
create policy "authenticated delete own photos"
on public.photos
for delete
to authenticated
using (auth.uid() = user_id or user_id is null);

create table if not exists public.photo_likes (
  id uuid primary key default gen_random_uuid(),
  photo_id uuid not null references public.photos(id) on delete cascade,
  client_id text not null,
  created_at timestamptz not null default now(),
  unique (photo_id, client_id)
);

alter table public.photo_likes enable row level security;

drop policy if exists "public read photo likes" on public.photo_likes;
create policy "public read photo likes"
on public.photo_likes
for select
to anon, authenticated
using (true);

drop policy if exists "public insert photo likes" on public.photo_likes;
create policy "public insert photo likes"
on public.photo_likes
for insert
to anon, authenticated
with check (client_id <> '');

grant select, insert on public.photo_likes to anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'photoshare-images',
  'photoshare-images',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "public read photoshare images" on storage.objects;
create policy "public read photoshare images"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'photoshare-images');

drop policy if exists "public insert photoshare images" on storage.objects;
drop policy if exists "authenticated insert photoshare images" on storage.objects;
create policy "authenticated insert photoshare images"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'photoshare-images');

drop policy if exists "public update photoshare images" on storage.objects;
drop policy if exists "authenticated update photoshare images" on storage.objects;
create policy "authenticated update photoshare images"
on storage.objects
for update
to authenticated
using (bucket_id = 'photoshare-images')
with check (bucket_id = 'photoshare-images');

drop policy if exists "public delete photoshare images" on storage.objects;
drop policy if exists "authenticated delete photoshare images" on storage.objects;
create policy "authenticated delete photoshare images"
on storage.objects
for delete
to authenticated
using (bucket_id = 'photoshare-images');
