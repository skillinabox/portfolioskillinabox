alter table public.garments add column if not exists pose_mode text default 'lia';
alter table public.garments add column if not exists own_photos jsonb default '[]';
