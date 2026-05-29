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
2. From the SQL editor, run the contents of `supabase/migrations/001_initial.sql`, then `002_voice_notes.sql`.
3. Copy the project URL and the `anon` key from **Settings → API** into `.env.local`.

### WhatsApp ingest (Twilio Sandbox)

The app accepts inbound WhatsApp messages at `POST /api/whatsapp/inbound`. To wire it up:

1. Sign in at [twilio.com](https://www.twilio.com) and open **Messaging → Try it out → Send a WhatsApp message**.
2. Note your **sandbox number** and **join code** (e.g. `join cat-pillow`). Anyone who wants to contribute texts that code from WhatsApp to the sandbox number.
3. Under the same sandbox settings, set **"When a message comes in"** to `https://<your-vercel-domain>/api/whatsapp/inbound` (POST).
4. Copy your Account SID and Auth Token from the Twilio console and add them to env:
   - `TWILIO_ACCOUNT_SID`
   - `TWILIO_AUTH_TOKEN`
   - `TWILIO_WHATSAPP_FROM` (the sandbox number, like `whatsapp:+14155238886`)
5. In Vercel, set the same vars under **Project → Settings → Environment Variables** for Production.
6. For local testing only: use ngrok to expose `localhost:3000`, set Twilio's webhook to the ngrok URL, and set `TWILIO_WEBHOOK_URL` to that exact URL so signature verification matches. Or set `TWILIO_SKIP_VERIFY=1` and send `curl` requests directly (never set this in production).

Once configured, sending text, an image, or a voice note to the sandbox number creates a happiness with `source='whatsapp'`. The contributor is auto-created from the sender's phone number on first message.

## License

MIT — see [LICENSE](LICENSE).
