-- Incremental upgrade after user_r2_folder_locks.sql; existing passwords remain valid.
begin;
alter table public.user_r2_folder_locks
  add column if not exists access_policy jsonb;
alter table public.user_r2_folder_locks alter column passcode_salt drop not null;
alter table public.user_r2_folder_locks alter column passcode_hash drop not null;

-- API handlers use the service role. Do not expose hashes, hidden paths or ACLs
-- through the authenticated PostgREST endpoint.
revoke all on public.user_r2_folder_locks from anon, authenticated;
grant all on public.user_r2_folder_locks to service_role;
-- These metadata tables also contain object paths. The application already
-- accesses them through server handlers, where folder policies are enforced.
revoke all on public.user_r2_favorites, public.user_r2_recycle_bin,
  public.user_r2_shares, public.user_r2_audit_logs from anon, authenticated;
grant all on public.user_r2_favorites, public.user_r2_recycle_bin,
  public.user_r2_shares, public.user_r2_audit_logs to service_role;

create table if not exists public.folder_unlock_attempts (
  policy_id uuid not null references public.user_r2_folder_locks(id) on delete cascade,
  subject text not null,
  started_at timestamptz not null default now(),
  attempts integer not null default 0,
  primary key (policy_id, subject)
);
alter table public.folder_unlock_attempts enable row level security;
revoke all on public.folder_unlock_attempts from anon, authenticated;

create or replace function public.consume_folder_unlock_attempt(p_policy_id uuid, p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  current_time_value timestamptz := clock_timestamp();
  counter record;
  blocked boolean := false;
  retry_seconds integer := 1;
begin
  -- Serialize both the per-folder and per-user counters across Edge instances.
  perform pg_advisory_xact_lock(hashtextextended(p_policy_id::text, 0));
  insert into public.folder_unlock_attempts(policy_id, subject)
  values (p_policy_id, '*'), (p_policy_id, p_user_id::text)
  on conflict do nothing;
  for counter in select * from public.folder_unlock_attempts
    where policy_id = p_policy_id and subject in ('*', p_user_id::text) for update
  loop
    if counter.started_at <= current_time_value - interval '5 minutes' then
      update public.folder_unlock_attempts set started_at = current_time_value, attempts = 1
      where policy_id = p_policy_id and subject = counter.subject;
    elsif counter.attempts >= (case when counter.subject = '*' then 100 else 10 end) then
      blocked := true;
      retry_seconds := greatest(retry_seconds, ceil(extract(epoch from counter.started_at + interval '5 minutes' - current_time_value))::integer);
    else
      update public.folder_unlock_attempts set attempts = attempts + 1
      where policy_id = p_policy_id and subject = counter.subject;
    end if;
  end loop;
  return jsonb_build_object('allowed', not blocked, 'retryAfter', retry_seconds);
end;
$$;
revoke all on function public.consume_folder_unlock_attempt(uuid, uuid) from public, anon, authenticated;
grant execute on function public.consume_folder_unlock_attempt(uuid, uuid) to service_role;

-- Prevent concurrent policy creation from introducing nested protections.
create or replace function public.validate_folder_access_policy()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.bucket_id::text, 1));
  if new.enabled and exists (
    select 1 from public.user_r2_folder_locks f
    where f.team_id = new.team_id and f.bucket_id = new.bucket_id and f.enabled and f.id <> new.id
    and (starts_with(f.prefix, new.prefix) or starts_with(new.prefix, f.prefix))
  ) then
    raise exception '暂不支持嵌套保护文件夹';
  end if;
  if new.access_policy is not null then
    if coalesce(new.access_policy->>'mode', '') not in ('password', 'members', 'members_password')
      or jsonb_typeof(new.access_policy->'allowedUserIds') is distinct from 'array'
      or jsonb_typeof(new.access_policy->'allowedRoles') is distinct from 'array'
      or jsonb_typeof(new.access_policy->'deniedUserIds') is distinct from 'array'
      or jsonb_typeof(new.access_policy->'hideUnauthorized') is distinct from 'boolean' then
      raise exception '文件夹访问策略无效';
    end if;
    if new.access_policy->>'mode' <> 'members' and (new.passcode_salt is null or new.passcode_hash is null) then
      raise exception '请设置访问密码';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists validate_folder_access_policy on public.user_r2_folder_locks;
create trigger validate_folder_access_policy before insert or update on public.user_r2_folder_locks
for each row execute function public.validate_folder_access_policy();
notify pgrst, 'reload schema';
commit;
