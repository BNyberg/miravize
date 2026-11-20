alter table public.user_crypto_profiles
  add column if not exists recovery_rotation_pending boolean not null default false;
