-- Update subscription plan limits: 12 garments / 40 AI images per month
update public.subscription_plans set
  garment_limit = 12,
  pose_limit    = 40,
  price_inr     = 999,
  description   = '12 garment uploads with LIA tagging + 40 AI model images (poses & try-ons) per month. Includes bio writing, themes, and portfolio publishing.'
where slug = 'monthly';

update public.subscription_plans set
  garment_limit = 72,
  pose_limit    = 240,
  price_inr     = 4995,
  description   = '12 garments + 40 AI images per month for 6 months. Save ₹999 vs monthly.'
where slug = '6month';

update public.subscription_plans set
  garment_limit = 144,
  pose_limit    = 480,
  price_inr     = 9588,
  description   = '12 garments + 40 AI images per month for 12 months. Best value.'
where slug = '12month';

update public.subscription_plans set
  garment_limit = 4,
  pose_limit    = 12,
  price_inr     = 0,
  description   = 'Try LIA features free. 4 garments + 12 AI images.'
where slug = 'free';

-- Add top-up plan if not exists
insert into public.subscription_plans (name, slug, price_inr, duration_months, garment_limit, pose_limit, description, is_active, display_order)
values ('Top-up Pack', 'topup', 599, 0, 6, 20, 'Add 6 garments + 20 AI images to your current plan. Valid for the rest of your billing month.', true, 10)
on conflict (slug) do update set
  price_inr = 599, garment_limit = 6, pose_limit = 20,
  description = 'Add 6 garments + 20 AI images to your current plan.';
