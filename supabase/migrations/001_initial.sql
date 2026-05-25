-- Happy Map — initial schema
-- Run this in the Supabase SQL editor for your project.

-- ============================================================================
-- Tables
-- ============================================================================

create table if not exists happinesses (
  id uuid primary key default gen_random_uuid(),

  content text not null check (char_length(content) between 1 and 280),
  contributor_name text,         -- null when anonymous
  contributor_id text,           -- opaque identifier grouping a person's submissions
  photo_url text,                -- public URL into Supabase Storage; nullable

  -- AI-derived tags (filled asynchronously after insert; nullable until tagged)
  theme text,                    -- top-level cluster, "continent"
  subtheme text,                 -- sub-cluster, "country"
  agency_score real check (agency_score is null or (agency_score >= 0 and agency_score <= 1)),
  time_score real check (time_score is null or (time_score >= 0 and time_score <= 1)),
  summary text,

  source text not null default 'web'
    check (source in ('web', 'whatsapp', 'signal', 'slack', 'sms')),
  is_anonymous boolean not null default false,

  created_at timestamptz not null default now()
);

create index if not exists happinesses_created_at_idx on happinesses (created_at desc);
create index if not exists happinesses_theme_idx on happinesses (theme);

-- Contributors — for opt-in reminders and to cache messaging-app profile pics
create table if not exists contributors (
  id uuid primary key default gen_random_uuid(),
  phone_e164 text unique,        -- E.164 format; null for web-only contributors
  display_name text,
  avatar_url text,               -- WhatsApp / Signal profile picture once available
  daily_reminder_opt_in boolean not null default false,
  timezone text,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- Row-Level Security
-- Anyone-with-the-link model: anon can read all and insert, never update/delete.
-- ============================================================================

alter table happinesses enable row level security;

create policy "anyone can read happinesses"
  on happinesses for select
  using (true);

create policy "anyone can insert happinesses"
  on happinesses for insert
  with check (true);

alter table contributors enable row level security;

create policy "anyone can insert contributors"
  on contributors for insert
  with check (true);

-- ============================================================================
-- Storage — public bucket for happiness photos
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('happiness-photos', 'happiness-photos', true)
on conflict (id) do nothing;

create policy "anyone can upload happiness photos"
  on storage.objects for insert
  with check (bucket_id = 'happiness-photos');

create policy "anyone can view happiness photos"
  on storage.objects for select
  using (bucket_id = 'happiness-photos');

-- ============================================================================
-- Realtime — let the feed update live as new moments arrive
-- ============================================================================

alter publication supabase_realtime add table happinesses;
