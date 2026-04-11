-- ============================================================
-- SKILLINABOX PORTFOLIO PLATFORM v2 — FRESH SCHEMA
-- Run this in: Supabase Dashboard > SQL Editor
-- If you ran the old schema, run the DROP section first
-- ============================================================

-- DROP everything first (run this if you had the old schema)
drop table if exists public.enquiries cascade;
drop table if exists public.garments cascade;
drop table if exists public.learners cascade;
drop table if exists public.profiles cascade;
drop function if exists public.handle_new_user cascade;

-- ── Profiles ──────────────────────────────────────────────────
create table public.profiles (
  id         uuid references auth.users(id) on delete cascade primary key,
  role       text not null default 'learner' check (role in ('admin','learner')),
  created_at timestamptz default now()
);

-- Simple open RLS — we control access in the app
alter table public.profiles enable row level security;
create policy "profiles_open" on public.profiles using (true) with check (true);

-- ── Learners ──────────────────────────────────────────────────
create table public.learners (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete set null,
  name       text not null,
  email      text not null unique,
  brand      text default '',
  phone      text default '',
  tagline    text default '',
  instagram  text default '',
  slug       text unique,
  status     text default 'new' check (status in ('new','in-progress','published')),
  created_at timestamptz default now()
);

alter table public.learners enable row level security;
create policy "learners_open" on public.learners using (true) with check (true);

-- ── Garments ──────────────────────────────────────────────────
create table public.garments (
  id           uuid primary key default gen_random_uuid(),
  learner_id   uuid references public.learners(id) on delete cascade not null,
  name         text default '',
  category     text default '',
  fabric       text default '',
  features     text default '',
  colour       text default '',
  occasion     text default '',
  price        numeric,
  description  text default '',
  availability text default 'Made to order',
  sizes        text default 'S, M, L, XL',
  image_url    text,
  status       text default 'uploading' check (status in ('uploading','tagging','tagged','ready','published')),
  poses_ready  boolean default false,
  ai_tagged    boolean default false,
  created_at   timestamptz default now()
);

alter table public.garments enable row level security;
create policy "garments_open" on public.garments using (true) with check (true);

-- ── Enquiries ─────────────────────────────────────────────────
create table public.enquiries (
  id           uuid primary key default gen_random_uuid(),
  learner_id   uuid references public.learners(id) on delete cascade not null,
  from_name    text not null,
  from_email   text,
  from_phone   text,
  type         text not null check (type in ('order','enquiry')),
  garment_name text,
  size         text,
  message      text not null,
  read         boolean default false,
  created_at   timestamptz default now()
);

alter table public.enquiries enable row level security;
create policy "enquiries_open" on public.enquiries using (true) with check (true);

-- ── Auto-create profile on signup ─────────────────────────────
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, role)
  values (new.id, 'learner')
  on conflict (id) do nothing;

  -- Auto-link if learner email matches
  update public.learners
  set profile_id = new.id
  where email = new.email and profile_id is null;

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── Storage bucket ────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('garments', 'garments', true)
on conflict do nothing;

create policy "garments_storage_open"
  on storage.objects using (bucket_id = 'garments') with check (bucket_id = 'garments');

-- ── DONE ──────────────────────────────────────────────────────
-- After running this, create your admin user in Auth > Users
-- Then run: UPDATE public.profiles SET role = 'admin' WHERE id = 'your-user-id';
