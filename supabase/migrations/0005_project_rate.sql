alter table public.projects
  add column if not exists hourly_rate numeric(12, 2),
  add column if not exists currency text not null default 'SEK';
