-- ============================================================
-- SKILLINABOX PORTFOLIO PLATFORM — DATABASE SCHEMA
-- Run this in: Supabase Dashboard > SQL Editor
-- ============================================================

-- ── Profiles (linked to Supabase Auth) ───────────────────────
create table public.profiles (
  id      uuid references auth.users(id) on delete cascade primary key,
  role    text not null check (role in ('admin', 'learner')) default 'learner',
  created_at timestamptz default now()
);
alter table public.profiles enable row level security;

create policy "Users read own profile"
  on public.profiles for select using (auth.uid() = id);

create policy "Admins read all profiles"
  on public.profiles for select using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

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
  status     text check (status in ('new','in-progress','published')) default 'new',
  created_at timestamptz default now()
);
alter table public.learners enable row level security;

create policy "Admins full access to learners"
  on public.learners for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );
create policy "Learners read own record"
  on public.learners for select using (profile_id = auth.uid());
create policy "Learners update own record"
  on public.learners for update using (profile_id = auth.uid());
create policy "Anyone reads published learners"
  on public.learners for select using (status = 'published');

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
  status       text check (status in ('uploading','tagging','tagged','ready','published')) default 'uploading',
  poses_ready  boolean default false,
  ai_tagged    boolean default false,
  created_at   timestamptz default now()
);
alter table public.garments enable row level security;

create policy "Admins full access to garments"
  on public.garments for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );
create policy "Learners manage own garments"
  on public.garments for all using (
    learner_id in (select id from public.learners where profile_id = auth.uid())
  );
create policy "Anyone reads published garments"
  on public.garments for select using (status = 'published');

-- ── Enquiries ─────────────────────────────────────────────────
create table public.enquiries (
  id           uuid primary key default gen_random_uuid(),
  learner_id   uuid references public.learners(id) on delete cascade not null,
  from_name    text not null,
  from_email   text,
  from_phone   text,
  type         text check (type in ('order','enquiry')) not null,
  garment_name text,
  size         text,
  message      text not null,
  read         boolean default false,
  created_at   timestamptz default now()
);
alter table public.enquiries enable row level security;

create policy "Admins full access to enquiries"
  on public.enquiries for all using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );
create policy "Learners manage own enquiries"
  on public.enquiries for all using (
    learner_id in (select id from public.learners where profile_id = auth.uid())
  );
create policy "Anyone can submit an enquiry"
  on public.enquiries for insert with check (true);

-- ── Auto-link learner on signup ───────────────────────────────
create or replace function public.handle_new_user()
returns trigger as $$
declare
  found_learner public.learners%rowtype;
begin
  insert into public.profiles (id, role) values (new.id, 'learner');
  select * into found_learner from public.learners where email = new.email limit 1;
  if found then
    update public.learners set profile_id = new.id where id = found_learner.id;
  end if;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── Storage: garments bucket ──────────────────────────────────
-- Run AFTER creating the 'garments' bucket in Storage dashboard (set to Public)

insert into storage.buckets (id, name, public) values ('garments', 'garments', true)
  on conflict do nothing;

create policy "Admins upload garments"
  on storage.objects for insert with check (
    bucket_id = 'garments' and
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );
create policy "Learners upload own garments"
  on storage.objects for insert with check (
    bucket_id = 'garments' and
    (storage.foldername(name))[1] in (
      select id::text from public.learners where profile_id = auth.uid()
    )
  );
create policy "Anyone views garment images"
  on storage.objects for select using (bucket_id = 'garments');
create policy "Uploader can delete own files"
  on storage.objects for delete using (auth.uid() = owner);

-- ── Promote a user to admin ───────────────────────────────────
-- After signing up, run this with the user's ID from Auth > Users:
-- UPDATE public.profiles SET role = 'admin' WHERE id = 'paste-user-id-here';
