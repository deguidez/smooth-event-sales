alter table public.platform_settings
  add column if not exists media_storage text not null default 'cloud',
  add column if not exists media_vps_endpoint text,
  add column if not exists media_vps_bucket text;

alter table public.platform_settings
  add constraint platform_settings_media_storage_check check (media_storage in ('cloud', 'vps'));