-- Add batch/cohort field to learners for grouping
alter table public.learners add column if not exists batch text default '';
