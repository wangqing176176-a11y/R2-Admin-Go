-- Run in Supabase SQL editor after app_rbac.sql.

create table if not exists public.user_r2_favorites (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.app_teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  bucket_id uuid not null references public.user_r2_buckets(id) on delete cascade,
  item_type text not null check (item_type in ('file', 'folder')),
  item_key text not null,
  item_name text not null,
  size bigint not null default 0,
  last_modified timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_r2_favorites_unique unique (team_id, user_id, bucket_id, item_key)
);

create index if not exists user_r2_favorites_user_bucket_idx
on public.user_r2_favorites (team_id, user_id, bucket_id, updated_at desc);

create table if not exists public.user_r2_recycle_bin (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.app_teams(id) on delete cascade,
  bucket_id uuid not null references public.user_r2_buckets(id) on delete cascade,
  deleted_by uuid not null references auth.users(id) on delete cascade,
  item_type text not null check (item_type in ('file', 'folder')),
  item_key text not null,
  item_name text not null,
  original_path text not null default '',
  storage_prefix text not null,
  storage_key text,
  size bigint not null default 0,
  last_modified timestamptz,
  deleted_by_name text not null default '',
  deleted_by_email text not null default '',
  deleted_at timestamptz not null default now(),
  status text not null default 'active' check (status in ('active', 'restored', 'deleted')),
  restored_at timestamptz,
  permanently_deleted_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists user_r2_recycle_bin_team_bucket_idx
on public.user_r2_recycle_bin (team_id, bucket_id, status, deleted_at desc);

create index if not exists user_r2_recycle_bin_deleted_by_idx
on public.user_r2_recycle_bin (team_id, deleted_by, bucket_id, status, deleted_at desc);

create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_user_r2_favorites_updated_at on public.user_r2_favorites;
create trigger trg_user_r2_favorites_updated_at
before update on public.user_r2_favorites
for each row
execute function public.tg_set_updated_at();

drop trigger if exists trg_user_r2_recycle_bin_updated_at on public.user_r2_recycle_bin;
create trigger trg_user_r2_recycle_bin_updated_at
before update on public.user_r2_recycle_bin
for each row
execute function public.tg_set_updated_at();

alter table public.user_r2_favorites enable row level security;
alter table public.user_r2_recycle_bin enable row level security;

drop policy if exists "user_r2_favorites_select_own" on public.user_r2_favorites;
create policy "user_r2_favorites_select_own"
on public.user_r2_favorites
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "user_r2_favorites_write_own" on public.user_r2_favorites;
create policy "user_r2_favorites_write_own"
on public.user_r2_favorites
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "user_r2_recycle_bin_select_own" on public.user_r2_recycle_bin;
create policy "user_r2_recycle_bin_select_own"
on public.user_r2_recycle_bin
for select
to authenticated
using (auth.uid() = deleted_by);

drop policy if exists "user_r2_recycle_bin_write_own" on public.user_r2_recycle_bin;
create policy "user_r2_recycle_bin_write_own"
on public.user_r2_recycle_bin
for all
to authenticated
using (auth.uid() = deleted_by)
with check (auth.uid() = deleted_by);
