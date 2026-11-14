drop policy avatars_select on storage.objects;

create policy avatars_select on storage.objects
  for select using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
