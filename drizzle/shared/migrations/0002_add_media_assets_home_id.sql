alter table media_assets
  add column if not exists home_id integer;

alter table media_assets
  add constraint media_assets_home_id_fkey
  foreign key (home_id)
  references homes(id)
  on delete cascade;

create index if not exists idx_media_assets_home
  on media_assets(home_id);
