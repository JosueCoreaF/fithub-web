-- Crea el bucket público para imágenes del panel y sus políticas básicas en Supabase Storage.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'fithub-media',
  'fithub-media',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- En Supabase, storage.objects ya suele tener RLS activo.
-- Evitamos ALTER TABLE porque en el SQL Editor normal puede fallar si no eres owner de la tabla.

drop policy if exists "Public read fithub media" on storage.objects;
create policy "Public read fithub media"
on storage.objects
for select
to public
using (bucket_id = 'fithub-media');

drop policy if exists "Authenticated upload fithub media" on storage.objects;
create policy "Authenticated upload fithub media"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'fithub-media');

drop policy if exists "Authenticated update fithub media" on storage.objects;
create policy "Authenticated update fithub media"
on storage.objects
for update
to authenticated
using (bucket_id = 'fithub-media')
with check (bucket_id = 'fithub-media');

drop policy if exists "Authenticated delete fithub media" on storage.objects;
create policy "Authenticated delete fithub media"
on storage.objects
for delete
to authenticated
using (bucket_id = 'fithub-media');