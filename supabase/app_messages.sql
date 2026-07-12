-- Run once in the Supabase SQL editor for existing installations.
-- New installations can run app_rbac.sql, which already contains the same schema.

create extension if not exists pgcrypto;

create table if not exists public.app_messages (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.app_teams(id) on delete cascade,
  sender_user_id uuid references auth.users(id) on delete cascade,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'direct' check (kind in ('direct', 'system')),
  body text not null check (char_length(body) between 1 and 2000),
  related_type text,
  related_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint app_messages_sender_required check (kind = 'system' or sender_user_id is not null)
);

create index if not exists app_messages_recipient_idx on public.app_messages (team_id, recipient_user_id, created_at desc);
create index if not exists app_messages_sender_idx on public.app_messages (team_id, sender_user_id, created_at desc);

alter table public.app_messages enable row level security;

drop policy if exists "app_messages_select_own" on public.app_messages;
create policy "app_messages_select_own"
on public.app_messages
for select
to authenticated
using (auth.uid() = sender_user_id or auth.uid() = recipient_user_id);

drop policy if exists "app_messages_insert_team" on public.app_messages;
create policy "app_messages_insert_team"
on public.app_messages
for insert
to authenticated
with check (
  sender_user_id = auth.uid()
  and kind = 'direct'
  and exists (
    select 1 from public.app_team_members sender
    join public.app_team_members recipient on recipient.team_id = sender.team_id
    where sender.user_id = auth.uid()
      and recipient.user_id = app_messages.recipient_user_id
      and sender.status = 'active'
      and recipient.status = 'active'
      and sender.team_id = app_messages.team_id
  )
);

drop policy if exists "app_messages_update_received" on public.app_messages;
create policy "app_messages_update_received"
on public.app_messages
for update
to authenticated
using (auth.uid() = recipient_user_id)
with check (auth.uid() = recipient_user_id);
