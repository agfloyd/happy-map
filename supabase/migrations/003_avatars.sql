-- Happy Map — per-person avatar choice
-- Run this in the Supabase SQL editor.
--
-- Lets a contributor pick an OpenPeeps figure (pose) + ink colour for how they
-- appear on the map. Nullable: rows without a choice fall back to a deterministic
-- default derived from the contributor name (see src/lib/avatars.ts).

alter table happinesses
  add column if not exists avatar_id text,      -- e.g. 'peep-standing-12'
  add column if not exists avatar_color text;   -- hex, e.g. '#1e3a8a'

-- Optional: remember a contributor's latest pick so future submissions reuse it
-- server-side too (the browser also remembers via localStorage).
alter table contributors
  add column if not exists avatar_id text,
  add column if not exists avatar_color text;
