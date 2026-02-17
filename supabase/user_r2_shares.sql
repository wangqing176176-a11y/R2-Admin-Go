-- Run in Supabase SQL editor.

create table if not exists public.user_r2_shares (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bucket_id uuid not null references public.user_r2_buckets(id) on delete cascade,
  share_code text not null,
  item_type text not null check (item_type in ('file', 'folder')),
  item_key text not null,
  item_name text not null,
  note text,
  passcode_enabled boolean not null default false,
  passcode_salt text,
  passcode_hash text,
  expires_at timestamptz,
  is_active boolean not null default true,
  access_count bigint not null default 0,
  last_accessed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_r2_shares_user_share_code_unique unique (user_id, share_code)
);

create index if not exists user_r2_shares_user_id_idx on public.user_r2_shares (user_id, created_at desc);
create unique index if not exists user_r2_shares_share_code_unique_idx on public.user_r2_shares (share_code);
create index if not exists user_r2_shares_bucket_id_idx on public.user_r2_shares (bucket_id);

create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_user_r2_shares_updated_at on public.user_r2_shares;
create trigger trg_user_r2_shares_updated_at
before update on public.user_r2_shares
for each row
execute function public.tg_set_updated_at();

alter table public.user_r2_shares enable row level security;

drop policy if exists "user_r2_shares_select_own" on public.user_r2_shares;
create policy "user_r2_shares_select_own"
on public.user_r2_shares
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "user_r2_shares_insert_own" on public.user_r2_shares;
create policy "user_r2_shares_insert_own"
on public.user_r2_shares
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "user_r2_shares_update_own" on public.user_r2_shares;
create policy "user_r2_shares_update_own"
on public.user_r2_shares
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "user_r2_shares_delete_own" on public.user_r2_shares;
create policy "user_r2_shares_delete_own"
on public.user_r2_shares
for delete
to authenticated
using (auth.uid() = user_id);
