create table if not exists public.user_r2_audit_logs (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.app_teams(id) on delete cascade,
  bucket_id uuid references public.user_r2_buckets(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_name text not null default '',
  actor_email text not null default '',
  actor_role text not null default '',
  action text not null,
  item_type text not null default 'file' check (item_type in ('file', 'folder', 'bucket', 'share', 'system')),
  item_key text not null default '',
  item_name text not null default '',
  source_key text,
  target_key text,
  summary text not null default '',
  status text not null default 'success' check (status in ('success', 'failed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists user_r2_audit_logs_team_created_idx
on public.user_r2_audit_logs (team_id, created_at desc);

create index if not exists user_r2_audit_logs_team_bucket_created_idx
on public.user_r2_audit_logs (team_id, bucket_id, created_at desc);

create index if not exists user_r2_audit_logs_team_action_created_idx
on public.user_r2_audit_logs (team_id, action, created_at desc);

create index if not exists user_r2_audit_logs_team_actor_created_idx
on public.user_r2_audit_logs (team_id, actor_user_id, created_at desc);

create index if not exists user_r2_audit_logs_team_item_key_idx
on public.user_r2_audit_logs (team_id, bucket_id, item_key, created_at desc);

alter table public.user_r2_audit_logs enable row level security;

drop policy if exists "user_r2_audit_logs_select_team_admin" on public.user_r2_audit_logs;
create policy "user_r2_audit_logs_select_team_admin"
on public.user_r2_audit_logs
for select
using (
  exists (
    select 1
    from public.app_team_members m
    where m.team_id = user_r2_audit_logs.team_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role in ('admin', 'super_admin')
  )
);
