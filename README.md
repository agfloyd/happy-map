# Happy Map

A collective map of small joys. Friends contribute brief moments of happiness — a sip of coffee, an evening walk, a song stuck in their head — and the app weaves them into a fantasy-cartography map where geography itself encodes the *kind* of happiness (immediate vs. lasting, given vs. received, etc.).

Heavily inspired by [Alvin Chang's *Happy Map*](https://pudding.cool/2026/02/happy-map/) at The Pudding.

## Tech stack

- **Next.js 16** — App Router, TypeScript, Tailwind v4
- **Supabase** — Postgres, Storage, Realtime
- **Google Gemini Flash-lite** — auto-tagging each moment with a theme and agency/time scores
- **d3** — voronoi + force layout for the cluster map
- **Twilio** — WhatsApp ingest (planned)
- **Vercel** — hosting

## Local development

```bash
git clone https://github.com/agfloyd/happy-map.git
cd happy-map
npm install
cp .env.example .env.local   # then fill in your keys
npm run dev
```

Open http://localhost:3000.

### Supabase setup

1. Create a project at [supabase.com](https://supabase.com).
2. From the SQL editor, run the contents of `supabase/migrations/001_initial.sql`.
3. Copy the project URL and the `anon` key from **Settings → API** into `.env.local`.

## License

MIT — see [LICENSE](LICENSE).
