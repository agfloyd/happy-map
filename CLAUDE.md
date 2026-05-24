@AGENTS.md

# Happy Map — project notes for Claude

## Context

A gift-for-fiancée web app inspired by Alvin Chang's *Happy Map*. **The intended recipient must not discover this exists before her birthday** — be discreet in the public repo. No commits or README content that name her or call out the surprise.

## Stack

- Next.js 16 (App Router) + TypeScript + Tailwind v4
- Supabase (Postgres + Storage + Realtime)
- Google Gemini 3.1 Flash-lite for moment tagging
- d3 (voronoi + force) for the cluster map — **no Mapbox / MapLibre, geographic view was dropped**

## Conventions

- Content character limit: 280 chars (enforced in DB and form).
- Photos are **per-happiness**, not per-user.
- Avatars on the map will eventually come from WhatsApp/Signal profile pics — until then, hand-drawn stock figures.
- Open repo: never commit anything from `_reference/`, never commit `.env*` files.

## Useful local files

- `TODO.md` — running wishlist (gitignored)
- `_reference/` — Pudding screenshots + Alvin Chang's methodology text (gitignored, source material, do not redistribute)
- `supabase/migrations/` — schema; paste into Supabase SQL editor manually
