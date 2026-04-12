-- Run this in Supabase SQL Editor
-- Adds poses storage to garments table

alter table public.garments
  add column if not exists poses jsonb default '{}';

-- poses will store: { "front": "url", "side": "url", "walking": "url", "sitting": "url" }
