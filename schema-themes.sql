alter table public.learners add column if not exists theme text default 'classic';
alter table public.learners add column if not exists theme_changes_this_month int default 0;
alter table public.learners add column if not exists theme_change_month text default '';
