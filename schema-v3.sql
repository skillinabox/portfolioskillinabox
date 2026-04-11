-- ============================================================
-- SKILLINABOX v3 SCHEMA UPDATE
-- Run in Supabase SQL Editor AFTER schema.sql
-- ============================================================

create table if not exists public.collections (
  id            uuid primary key default gen_random_uuid(),
  learner_id    uuid references public.learners(id) on delete cascade not null,
  name          text not null,
  description   text default '',
  season        text default '',
  year          text default '',
  display_order int  default 0,
  created_at    timestamptz default now()
);
alter table public.collections enable row level security;
drop policy if exists "collections_open" on public.collections;
create policy "collections_open" on public.collections using (true) with check (true);

alter table public.garments  add column if not exists collection_id uuid references public.collections(id) on delete set null;
alter table public.enquiries add column if not exists measurements jsonb;
alter table public.learners  add column if not exists photo_url   text;
alter table public.learners  add column if not exists logo_url    text;
alter table public.learners  add column if not exists bio         text default '';
alter table public.learners  add column if not exists skills      text default '';
alter table public.learners  add column if not exists expertise   text default '';
alter table public.learners  add column if not exists years_exp   text default '';
alter table public.learners  add column if not exists location    text default '';
alter table public.learners  add column if not exists speciality  text default '';
