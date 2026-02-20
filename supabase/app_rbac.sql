-- Run in Supabase SQL editor after user_r2_buckets.sql and user_r2_shares.sql

create extension if not exists pgcrypto;

create table if not exists public.app_user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_teams_owner_unique unique (owner_user_id)
);

create table if not exists public.app_team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.app_teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('super_admin', 'admin', 'member')),
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_team_members_user_unique unique (user_id)
);

create index if not exists app_team_members_team_id_idx on public.app_team_members (team_id);

create table if not exists public.app_member_permissions (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.app_teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  perm_key text not null,
  enabled boolean not null default true,
  expires_at timestamptz,
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_member_permissions_unique unique (team_id, user_id, perm_key)
);

create index if not exists app_member_permissions_team_user_idx on public.app_member_permissions (team_id, user_id);

create table if not exists public.app_permission_requests (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.app_teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  perm_key text not null,
  reason text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'canceled')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists app_permission_requests_team_status_idx on public.app_permission_requests (team_id, status, created_at desc);
create index if not exists app_permission_requests_user_idx on public.app_permission_requests (user_id, created_at desc);

create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_app_user_profiles_updated_at on public.app_user_profiles;
create trigger trg_app_user_profiles_updated_at
before update on public.app_user_profiles
for each row
execute function public.tg_set_updated_at();

drop trigger if exists trg_app_teams_updated_at on public.app_teams;
create trigger trg_app_teams_updated_at
before update on public.app_teams
for each row
execute function public.tg_set_updated_at();

drop trigger if exists trg_app_team_members_updated_at on public.app_team_members;
create trigger trg_app_team_members_updated_at
before update on public.app_team_members
for each row
execute function public.tg_set_updated_at();

drop trigger if exists trg_app_member_permissions_updated_at on public.app_member_permissions;
create trigger trg_app_member_permissions_updated_at
before update on public.app_member_permissions
for each row
execute function public.tg_set_updated_at();

drop trigger if exists trg_app_permission_requests_updated_at on public.app_permission_requests;
create trigger trg_app_permission_requests_updated_at
before update on public.app_permission_requests
for each row
execute function public.tg_set_updated_at();

insert into public.app_user_profiles (user_id, display_name)
select
  u.id,
  coalesce(nullif(split_part(coalesce(u.email, ''), '@', 1), ''), '用户')
from auth.users u
on conflict (user_id) do nothing;

insert into public.app_teams (owner_user_id, name)
select
  p.user_id,
  (coalesce(nullif(p.display_name, ''), '团队') || '的团队')
from public.app_user_profiles p
on conflict (owner_user_id) do nothing;

insert into public.app_team_members (team_id, user_id, role, status)
select
  t.id,
  t.owner_user_id,
  'admin',
  'active'
from public.app_teams t
left join public.app_team_members m on m.user_id = t.owner_user_id
where m.user_id is null;

alter table public.user_r2_buckets add column if not exists team_id uuid;
alter table public.user_r2_shares add column if not exists team_id uuid;

update public.user_r2_buckets b
set team_id = m.team_id
from public.app_team_members m
where m.user_id = b.user_id and b.team_id is null;

update public.user_r2_shares s
set team_id = m.team_id
from public.app_team_members m
where m.user_id = s.user_id and s.team_id is null;

create index if not exists user_r2_buckets_team_id_idx on public.user_r2_buckets (team_id);
create index if not exists user_r2_shares_team_id_idx on public.user_r2_shares (team_id);

-- 保留旧约束时，先按旧约束迁移，再切换为团队唯一约束。
alter table public.user_r2_buckets drop constraint if exists user_r2_buckets_user_account_bucket_unique;
alter table public.user_r2_buckets
  add constraint user_r2_buckets_team_account_bucket_unique unique (team_id, account_id, bucket_name);

-- 基于团队访问：同团队可读，管理员/超级管理员可写。
alter table public.user_r2_buckets enable row level security;
alter table public.user_r2_shares enable row level security;

drop policy if exists "user_r2_buckets_select_own" on public.user_r2_buckets;
drop policy if exists "user_r2_buckets_insert_own" on public.user_r2_buckets;
drop policy if exists "user_r2_buckets_update_own" on public.user_r2_buckets;
drop policy if exists "user_r2_buckets_delete_own" on public.user_r2_buckets;

create policy "user_r2_buckets_select_team"
on public.user_r2_buckets
for select
to authenticated
using (
  exists (
    select 1
    from public.app_team_members m
    where m.user_id = auth.uid()
      and m.status = 'active'
      and m.team_id = user_r2_buckets.team_id
  )
);

create policy "user_r2_buckets_write_team_admin"
on public.user_r2_buckets
for all
to authenticated
using (
  exists (
    select 1
    from public.app_team_members m
    where m.user_id = auth.uid()
      and m.status = 'active'
      and m.team_id = user_r2_buckets.team_id
      and m.role in ('admin', 'super_admin')
  )
)
with check (
  exists (
    select 1
    from public.app_team_members m
    where m.user_id = auth.uid()
      and m.status = 'active'
      and m.team_id = user_r2_buckets.team_id
      and m.role in ('admin', 'super_admin')
  )
);

drop policy if exists "user_r2_shares_select_own" on public.user_r2_shares;
drop policy if exists "user_r2_shares_insert_own" on public.user_r2_shares;
drop policy if exists "user_r2_shares_update_own" on public.user_r2_shares;
drop policy if exists "user_r2_shares_delete_own" on public.user_r2_shares;

create policy "user_r2_shares_select_team"
on public.user_r2_shares
for select
to authenticated
using (
  exists (
    select 1
    from public.app_team_members m
    where m.user_id = auth.uid()
      and m.status = 'active'
      and m.team_id = user_r2_shares.team_id
  )
);

create policy "user_r2_shares_write_team"
on public.user_r2_shares
for all
to authenticated
using (
  exists (
    select 1
    from public.app_team_members m
    where m.user_id = auth.uid()
      and m.status = 'active'
      and m.team_id = user_r2_shares.team_id
  )
)
with check (
  exists (
    select 1
    from public.app_team_members m
    where m.user_id = auth.uid()
      and m.status = 'active'
      and m.team_id = user_r2_shares.team_id
  )
);

alter table public.app_user_profiles enable row level security;
alter table public.app_teams enable row level security;
alter table public.app_team_members enable row level security;
alter table public.app_member_permissions enable row level security;
alter table public.app_permission_requests enable row level security;

drop policy if exists "app_user_profiles_select_self" on public.app_user_profiles;
create policy "app_user_profiles_select_self"
on public.app_user_profiles
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "app_user_profiles_update_self" on public.app_user_profiles;
create policy "app_user_profiles_update_self"
on public.app_user_profiles
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "app_team_members_select_team" on public.app_team_members;
create policy "app_team_members_select_team"
on public.app_team_members
for select
to authenticated
using (
  exists (
    select 1 from public.app_team_members m
    where m.user_id = auth.uid()
      and m.status = 'active'
      and m.team_id = app_team_members.team_id
  )
);

drop policy if exists "app_member_permissions_select_team" on public.app_member_permissions;
create policy "app_member_permissions_select_team"
on public.app_member_permissions
for select
to authenticated
using (
  exists (
    select 1 from public.app_team_members m
    where m.user_id = auth.uid()
      and m.status = 'active'
      and m.team_id = app_member_permissions.team_id
  )
);

drop policy if exists "app_permission_requests_select_team_or_self" on public.app_permission_requests;
create policy "app_permission_requests_select_team_or_self"
on public.app_permission_requests
for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1 from public.app_team_members m
    where m.user_id = auth.uid()
      and m.status = 'active'
      and m.team_id = app_permission_requests.team_id
      and m.role in ('admin', 'super_admin')
  )
);
