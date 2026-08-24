-- 团队级在线预览源配置迁移。
-- local: 文件仅在当前浏览器内处理；third_party: 允许 Office Online、Photopea、XMind。
alter table public.app_teams
  add column if not exists preview_mode text not null default 'local';

alter table public.app_teams
  add column if not exists preview_settings jsonb;

update public.app_teams
set preview_settings = case
  when preview_mode = 'third_party' then '{"office":"microsoft","design":"photopea","xmind":"xmind"}'::jsonb
  else '{"office":"local","design":"local","xmind":"local"}'::jsonb
end
where preview_settings is null;

alter table public.app_teams
  alter column preview_settings set default '{"office":"local","design":"local","xmind":"local"}'::jsonb,
  alter column preview_settings set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'app_teams_preview_mode_check'
  ) then
    alter table public.app_teams
      add constraint app_teams_preview_mode_check
      check (preview_mode in ('local', 'third_party'));
  end if;
end $$;

comment on column public.app_teams.preview_mode is
  '在线预览策略：local=浏览器本地安全预览，third_party=允许第三方预览平台';

comment on column public.app_teams.preview_settings is
  '按文件类型配置预览源：office、design、xmind；local 表示不使用外部预览平台';
