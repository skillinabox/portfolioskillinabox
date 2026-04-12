-- ============================================================
-- SKILLINABOX SUBSCRIPTION SCHEMA
-- Run in Supabase SQL Editor
-- ============================================================

-- ── Subscription Plans (admin-editable) ───────────────────────
create table if not exists public.subscription_plans (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  slug            text unique not null, -- 'free', 'monthly', '6month', '12month'
  price_inr       numeric not null default 0,
  duration_months int  not null default 1,
  free_months     int  not null default 0,  -- bonus months
  garment_limit   int  not null default 10, -- garments per month (-1 = unlimited)
  pose_limit      int  not null default 20, -- poses per month (-1 = unlimited)
  description     text default '',
  is_active       boolean default true,
  display_order   int  default 0,
  created_at      timestamptz default now()
);
alter table public.subscription_plans enable row level security;
create policy "plans_open" on public.subscription_plans using (true) with check (true);

-- Insert default plans
insert into public.subscription_plans (name, slug, price_inr, duration_months, free_months, garment_limit, pose_limit, description, display_order) values
  ('Free Trial',   'free',     0,     1,  0, 5,  10, 'One month free trial — admin granted only', 0),
  ('Monthly',      'monthly',  999,   1,  0, 15, 40, 'Full access · billed monthly', 1),
  ('6 Months',     '6month',   4995,  6,  1, 15, 40, 'Pay for 5 months, get 6 · save ₹999', 2),
  ('12 Months',    '12month',  9588,  12, 0, 15, 40, '₹799/month · best value · paid upfront', 3)
on conflict (slug) do nothing;

-- ── Subscriptions ─────────────────────────────────────────────
create table if not exists public.subscriptions (
  id                    uuid primary key default gen_random_uuid(),
  learner_id            uuid references public.learners(id) on delete cascade not null,
  plan_id               uuid references public.subscription_plans(id) not null,
  status                text not null default 'active' check (status in ('active','expired','cancelled','trial')),
  start_date            timestamptz default now(),
  end_date              timestamptz not null,
  razorpay_order_id     text,
  razorpay_payment_id   text,
  amount_paid           numeric default 0,
  granted_by_admin      boolean default false,
  notes                 text default '',
  created_at            timestamptz default now()
);
alter table public.subscriptions enable row level security;
create policy "subscriptions_open" on public.subscriptions using (true) with check (true);

-- ── Monthly usage tracking ─────────────────────────────────────
create table if not exists public.usage (
  id              uuid primary key default gen_random_uuid(),
  learner_id      uuid references public.learners(id) on delete cascade not null,
  month           text not null, -- format: '2026-04'
  garments_used   int default 0,
  poses_used      int default 0,
  updated_at      timestamptz default now(),
  unique (learner_id, month)
);
alter table public.usage enable row level security;
create policy "usage_open" on public.usage using (true) with check (true);

-- ── Add subscription fields to learners ───────────────────────
alter table public.learners
  add column if not exists subscription_status text default 'none' check (subscription_status in ('none','trial','active','expired')),
  add column if not exists subscription_end    timestamptz,
  add column if not exists is_free_trial_used  boolean default false;
