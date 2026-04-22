-- Add topup bonus columns to usage table
alter table public.usage add column if not exists garment_bonus int default 0;
alter table public.usage add column if not exists pose_bonus int default 0;

-- Add topup to subscription_plans if not exists
insert into public.subscription_plans (name, slug, price_inr, duration_months, free_months, garment_limit, pose_limit, description, is_active, display_order)
values ('Top-up Pack', 'topup', 599, 0, 0, 6, 20, 'Add 6 garments + 20 AI images to your current month.', true, 10)
on conflict (slug) do update set
  price_inr = 599, garment_limit = 6, pose_limit = 20, is_active = true;
