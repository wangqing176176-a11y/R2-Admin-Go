-- Run after app_rbac.sql.
-- Authorizes authenticated active team members to read and publish file editor
-- presence only inside private channels for their own team. Safe to run again
-- when upgrading from the earlier Office-only Presence policies.

-- Same-origin HTTP fallback for networks where a direct Realtime WebSocket is
-- slow or unavailable. The service-role API is the only caller; authenticated
-- browser clients do not receive direct table access.
create table if not exists public.app_file_editor_presence (
  team_id uuid not null references public.app_teams(id) on delete cascade,
  bucket_id uuid not null references public.user_r2_buckets(id) on delete cascade,
  document_hash text not null check (document_hash ~ '^[0-9a-f]{32}$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id text not null check (char_length(session_id) between 1 and 160),
  user_name text not null check (char_length(user_name) between 1 and 128),
  online_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (team_id, bucket_id, document_hash, user_id, session_id)
);

create index if not exists app_file_editor_presence_scope_idx
on public.app_file_editor_presence (team_id, bucket_id, document_hash, last_seen_at desc);

create index if not exists app_file_editor_presence_stale_idx
on public.app_file_editor_presence (last_seen_at);

alter table public.app_file_editor_presence enable row level security;
revoke all on public.app_file_editor_presence from anon, authenticated;
grant all on public.app_file_editor_presence to service_role;

create or replace function public.app_sync_file_editor_presence(
  target_action text,
  target_team_id uuid,
  target_bucket_id uuid,
  target_document_hash text,
  target_user_id uuid,
  target_session_id text default '',
  target_user_name text default ''
)
returns table (
  editor_user_id uuid,
  editor_user_name text,
  editor_online_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if target_action not in ('read', 'track', 'untrack') then
    raise exception 'invalid file presence action';
  end if;
  if target_document_hash !~ '^[0-9a-f]{32}$' then
    raise exception 'invalid file presence document hash';
  end if;
  if target_action in ('track', 'untrack') and char_length(target_session_id) not between 1 and 160 then
    raise exception 'invalid file presence session';
  end if;
  if not exists (
    select 1
    from public.user_r2_buckets bucket
    where bucket.id = target_bucket_id
      and bucket.team_id = target_team_id
  ) then
    raise exception 'file presence bucket not found';
  end if;

  delete from public.app_file_editor_presence presence
  where presence.last_seen_at < now() - interval '45 seconds';

  if target_action = 'track' then
    if char_length(target_user_name) not between 1 and 128 then
      raise exception 'invalid file presence user name';
    end if;
    insert into public.app_file_editor_presence (
      team_id,
      bucket_id,
      document_hash,
      user_id,
      session_id,
      user_name,
      last_seen_at
    ) values (
      target_team_id,
      target_bucket_id,
      target_document_hash,
      target_user_id,
      target_session_id,
      target_user_name,
      now()
    )
    on conflict (team_id, bucket_id, document_hash, user_id, session_id)
    do update set
      user_name = excluded.user_name,
      last_seen_at = excluded.last_seen_at;
  elsif target_action = 'untrack' then
    delete from public.app_file_editor_presence presence
    where presence.team_id = target_team_id
      and presence.bucket_id = target_bucket_id
      and presence.document_hash = target_document_hash
      and presence.user_id = target_user_id
      and presence.session_id = target_session_id;
  end if;

  return query
  select distinct on (presence.user_id)
    presence.user_id,
    presence.user_name,
    presence.online_at
  from public.app_file_editor_presence presence
  where presence.team_id = target_team_id
    and presence.bucket_id = target_bucket_id
    and presence.document_hash = target_document_hash
    and presence.last_seen_at >= now() - interval '45 seconds'
  order by presence.user_id, presence.online_at asc;
end;
$$;

revoke all on function public.app_sync_file_editor_presence(text, uuid, uuid, text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.app_sync_file_editor_presence(text, uuid, uuid, text, uuid, text, text) to service_role;

drop policy if exists "app_office_presence_select_team" on realtime.messages;
drop policy if exists "app_office_presence_insert_team" on realtime.messages;
drop policy if exists "app_file_editor_presence_select_team" on realtime.messages;
drop policy if exists "app_file_editor_presence_insert_team" on realtime.messages;
drop function if exists public.can_access_office_presence_team(text);

create or replace function public.can_access_file_editor_presence_team(target_team_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.app_team_members member
    where member.user_id = (select auth.uid())
      and member.status = 'active'
      and member.team_id::text = target_team_id
  );
$$;

revoke all on function public.can_access_file_editor_presence_team(text) from public;
grant execute on function public.can_access_file_editor_presence_team(text) to authenticated;

create policy "app_file_editor_presence_select_team"
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension = 'presence'
  and split_part(realtime.topic(), ':', 1) = 'file-presence'
  and public.can_access_file_editor_presence_team(split_part(realtime.topic(), ':', 2))
);

create policy "app_file_editor_presence_insert_team"
on realtime.messages
for insert
to authenticated
with check (
  realtime.messages.extension = 'presence'
  and split_part(realtime.topic(), ':', 1) = 'file-presence'
  and public.can_access_file_editor_presence_team(split_part(realtime.topic(), ':', 2))
);
