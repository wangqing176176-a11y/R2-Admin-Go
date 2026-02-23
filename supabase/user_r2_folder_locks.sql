-- Run in Supabase SQL editor after app_rbac.sql

create table if not exists public.user_r2_folder_locks (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.app_teams(id) on delete cascade,
  bucket_id uuid not null references public.user_r2_buckets(id) on delete cascade,
  prefix text not null,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  hint text,
  passcode_salt text not null,
  passcode_hash text not null,
  enabled boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_r2_folder_locks_team_bucket_prefix_unique unique (team_id, bucket_id, prefix)
);

create index if not exists user_r2_folder_locks_bucket_idx
  on public.user_r2_folder_locks (bucket_id, enabled, prefix);

create index if not exists user_r2_folder_locks_team_idx
  on public.user_r2_folder_locks (team_id, created_at desc);

create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_user_r2_folder_locks_updated_at on public.user_r2_folder_locks;
create trigger trg_user_r2_folder_locks_updated_at
before update on public.user_r2_folder_locks
for each row
execute function public.tg_set_updated_at();

alter table public.user_r2_folder_locks enable row level security;

drop policy if exists "user_r2_folder_locks_select_team" on public.user_r2_folder_locks;
create policy "user_r2_folder_locks_select_team"
on public.user_r2_folder_locks
for select
to authenticated
using (
  exists (
    select 1
    from public.app_team_members m
    where m.user_id = auth.uid()
      and m.status = 'active'
      and m.team_id = user_r2_folder_locks.team_id
  )
);

drop policy if exists "user_r2_folder_locks_write_team_admin" on public.user_r2_folder_locks;
create policy "user_r2_folder_locks_write_team_admin"
on public.user_r2_folder_locks
for all
to authenticated
using (
  exists (
    select 1
    from public.app_team_members m
    where m.user_id = auth.uid()
      and m.status = 'active'
      and m.team_id = user_r2_folder_locks.team_id
      and m.role in ('admin', 'super_admin')
  )
)
with check (
  exists (
    select 1
    from public.app_team_members m
    where m.user_id = auth.uid()
      and m.status = 'active'
      and m.team_id = user_r2_folder_locks.team_id
      and m.role in ('admin', 'super_admin')
  )
);

