-- Run in Supabase SQL Editor
alter table public.garments
  add column if not exists gender        text default 'female' check (gender in ('female','male','unisex')),
  add column if not exists poses         jsonb default '{}',
  add column if not exists pending_poses jsonb default '{}';
