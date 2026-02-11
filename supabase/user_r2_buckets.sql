-- Run in Supabase SQL editor.

create extension if not exists pgcrypto;

create table if not exists public.user_r2_buckets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bucket_label text not null default '',
  bucket_name text not null,
  account_id text not null,
  access_key_id_enc text not null,
  secret_access_key_enc text not null,
  public_base_url text,
  custom_base_url text,
  transfer_mode_override text check (transfer_mode_override in ('auto', 'presigned', 'proxy')),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_r2_buckets_user_account_bucket_unique unique (user_id, account_id, bucket_name)
);

create index if not exists user_r2_buckets_user_id_idx on public.user_r2_buckets (user_id);
create unique index if not exists user_r2_buckets_single_default_idx on public.user_r2_buckets (user_id) where is_default = true;

create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_user_r2_buckets_updated_at on public.user_r2_buckets;
create trigger trg_user_r2_buckets_updated_at
before update on public.user_r2_buckets
for each row
execute function public.tg_set_updated_at();

alter table public.user_r2_buckets enable row level security;

drop policy if exists "user_r2_buckets_select_own" on public.user_r2_buckets;
create policy "user_r2_buckets_select_own"
on public.user_r2_buckets
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "user_r2_buckets_insert_own" on public.user_r2_buckets;
create policy "user_r2_buckets_insert_own"
on public.user_r2_buckets
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "user_r2_buckets_update_own" on public.user_r2_buckets;
create policy "user_r2_buckets_update_own"
on public.user_r2_buckets
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "user_r2_buckets_delete_own" on public.user_r2_buckets;
create policy "user_r2_buckets_delete_own"
on public.user_r2_buckets
for delete
to authenticated
using (auth.uid() = user_id);
