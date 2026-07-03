-- AIM Screener — Supabase setup
-- Run this once in Supabase: SQL Editor → New query → paste → Run

-- 1. Profiles: one row per user, holds subscription state
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  status text not null default 'trialing',           -- trialing | active | past_due | cancelled
  trial_ends timestamptz not null default (now() + interval '7 days'),
  razorpay_subscription_id text,
  current_period_end timestamptz,
  created_at timestamptz not null default now()
);

-- 2. Portfolios: per-user, per-market app data (India / USA)
create table if not exists public.portfolios (
  user_id uuid not null references auth.users(id) on delete cascade,
  market text not null check (market in ('india','usa')),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, market)
);

-- 3. Auto-create a profile with 7-day trial on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 4. Row Level Security: users can only see their own data
alter table public.profiles enable row level security;
alter table public.portfolios enable row level security;

drop policy if exists "own profile read" on public.profiles;
create policy "own profile read" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "own portfolio all" on public.portfolios;
create policy "own portfolio all" on public.portfolios
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Note: profiles are WRITTEN only by the server (service role) — no user
-- update policy on purpose, so nobody can grant themselves a subscription.
