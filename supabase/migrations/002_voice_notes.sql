-- Happy Map — voice notes (Phase 4)
-- Run this in the Supabase SQL editor for your project.

-- ============================================================================
-- Schema changes on happinesses
-- ============================================================================

-- Allow content to be null while a voice note is being transcribed.
-- The length cap stays at 280 chars for the typed/transcribed text.
alter table happinesses alter column content drop not null;
alter table happinesses drop constraint if exists happinesses_content_check;
alter table happinesses add constraint happinesses_content_check
  check (content is null or char_length(content) between 1 and 280);

-- Voice note URL (public link into the new storage bucket) and a flag
-- indicating that the current `content` was filled in by transcription
-- rather than typed by the contributor.
alter table happinesses add column if not exists voice_note_url text;
alter table happinesses add column if not exists transcribed boolean not null default false;

-- ============================================================================
-- Storage — public bucket for voice notes
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('happiness-voice-notes', 'happiness-voice-notes', true)
on conflict (id) do nothing;

create policy "anyone can upload voice notes"
  on storage.objects for insert
  with check (bucket_id = 'happiness-voice-notes');

create policy "anyone can view voice notes"
  on storage.objects for select
  using (bucket_id = 'happiness-voice-notes');
