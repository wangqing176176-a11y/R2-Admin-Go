-- Run after app_rbac.sql.
-- Authorizes authenticated active team members to read and publish file editor
-- presence only inside private channels for their own team. Safe to run again
-- when upgrading from the earlier Office-only Presence policies.

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
