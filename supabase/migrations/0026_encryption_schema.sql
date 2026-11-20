-- Additive encryption storage. Plaintext names and descriptions are not read or rewritten.

alter table public.workspaces
  add column require_mfa boolean not null default false,
  add column encryption_status text not null default 'plaintext',
  add column current_key_version integer,
  add column key_rotation_status text not null default 'stable',
  add column name_ciphertext jsonb;

alter table public.workspaces
  add constraint workspaces_encryption_status_ok
    check (encryption_status in ('plaintext', 'dual', 'ciphertext_only')),
  add constraint workspaces_key_rotation_status_ok
    check (key_rotation_status in ('stable', 'rotating')),
  add constraint workspaces_current_key_version_ok
    check (current_key_version is null or current_key_version >= 1);

alter table public.clients
  add column name_ciphertext jsonb;

alter table public.projects
  add column name_ciphertext jsonb,
  add column description_ciphertext jsonb;

alter table public.activities
  add column name_ciphertext jsonb;

alter table public.tags
  add column name_ciphertext jsonb;

alter table public.project_aliases
  add column shortcut_ciphertext jsonb;

alter table public.time_entries
  add column description_ciphertext jsonb;

alter table public.requests
  add column requester_ciphertext jsonb,
  add column request_ciphertext jsonb,
  add column additional_notes_ciphertext jsonb,
  add column website_ciphertext jsonb;

alter table public.tasks
  add column requester_ciphertext jsonb,
  add column task_ciphertext jsonb,
  add column additional_notes_ciphertext jsonb,
  add column website_ciphertext jsonb;

create table public.user_crypto_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  public_key text not null,
  public_key_fingerprint text not null,
  encrypted_private_key jsonb not null,
  recovery_wrapped_private_key jsonb not null,
  display_name_ciphertext jsonb,
  crypto_version integer not null default 1,
  crypto_status text not null default 'setup_pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_crypto_profiles_status_ok
    check (crypto_status in ('setup_pending', 'ready')),
  constraint user_crypto_profiles_version_ok
    check (crypto_version >= 1)
);

create table public.workspace_member_key_envelopes (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  key_version integer not null,
  recipient_public_key_fingerprint text not null,
  sealed_workspace_key text not null,
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id, key_version),
  constraint workspace_member_key_envelopes_version_ok
    check (key_version >= 1)
);

create index workspace_member_key_envelopes_user
  on public.workspace_member_key_envelopes (user_id);

alter table public.user_crypto_profiles enable row level security;
alter table public.workspace_member_key_envelopes enable row level security;

create policy user_crypto_profiles_select on public.user_crypto_profiles
  for select to authenticated
  using (user_id = auth.uid());

create policy user_crypto_profiles_insert on public.user_crypto_profiles
  for insert to authenticated
  with check (user_id = auth.uid());

create policy user_crypto_profiles_update on public.user_crypto_profiles
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy user_crypto_profiles_aal on public.user_crypto_profiles
  as restrictive to authenticated
  using (public.aal_satisfies_mfa())
  with check (public.aal_satisfies_mfa());

create policy workspace_member_key_envelopes_select on public.workspace_member_key_envelopes
  for select to authenticated
  using (user_id = auth.uid() and public.is_workspace_member(workspace_id));

create policy workspace_member_key_envelopes_aal on public.workspace_member_key_envelopes
  as restrictive to authenticated
  using (public.aal_satisfies_mfa())
  with check (public.aal_satisfies_mfa());
