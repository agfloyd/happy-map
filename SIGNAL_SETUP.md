# Signal announcement bot — operator setup

This app can post a celebratory message to a Signal group whenever a new moment
is added. It talks to a self-hosted
[`bbernhard/signal-cli-rest-api`](https://github.com/bbernhard/signal-cli-rest-api)
instance over HTTP. The Next app only pushes outbound announcements; it never
reads messages.

The feature is **dormant until configured** — if the env vars below are unset,
the app simply skips announcing. Nothing else changes.

## 1. Run signal-cli-rest-api (Docker, json-rpc mode)

Run it on a small always-on host you control (a VM, Pi, or similar). Use a
**persistent volume** so the linked account and group state survive restarts.

`docker-compose.yml`:

```yaml
services:
  signal-cli-rest-api:
    image: bbernhard/signal-cli-rest-api:latest
    restart: unless-stopped
    environment:
      # json-rpc keeps a long-lived connection to the Signal servers, which is
      # the fastest mode for frequent sends.
      - MODE=json-rpc
    ports:
      - "8080:8080"
    volumes:
      # Holds the registered/linked account + group data. Back this up.
      - ./signal-cli-data:/home/.local/share/signal-cli
```

Start it:

```bash
docker compose up -d
```

The API is now on `http://<host>:8080`.

## 2. Provision the bot's number

Pick **one** of the following.

### Option A — Link an existing number as a secondary device (recommended)

This reuses a phone number you already have on Signal (the bot becomes a linked
device of it, like Signal Desktop).

1. Open the QR link in a browser:
   `http://<host>:8080/v1/qrcodelink?device_name=happymap`
2. On the phone that owns the number: Signal → Settings → Linked Devices → "+"
   and scan the QR.
3. The device is now linked; the API can send as that number.

### Option B — Register a fresh number

Use a number you control that is **not** already on Signal.

1. Request a code (you may be prompted to solve a captcha — follow the API's
   instructions / docs):
   `POST http://<host>:8080/v1/register/{number}`
2. Verify with the SMS/voice code:
   `POST http://<host>:8080/v1/register/{number}/verify/{code}`

In both cases, `{number}` is E.164, e.g. `+14155550123`. That value becomes
`SIGNAL_NUMBER`.

## 3. Find the target group's id

Create (or already have) the group in Signal with the bot number as a member,
then list groups:

```bash
curl http://<host>:8080/v1/groups/{number}
```

Each entry has an internal `id` shaped like `group.aBcD...=` (base64). Copy the
one for your target group — that value becomes `SIGNAL_GROUP_ID`.

## 4. Make the API reachable from the deployed app

The deployed app (e.g. on Vercel) must be able to reach the API host:

- Put it behind a public HTTPS URL (reverse proxy with TLS), **or**
- Expose it through a tunnel (Cloudflare Tunnel, Tailscale Funnel, etc.).

Security notes:

- The `/v2/send` endpoint is **not** authenticated by signal-cli-rest-api
  itself. Do not expose it openly. Restrict it at the proxy layer (allowlist the
  app's egress, add basic auth / mTLS, or keep it on a private network the app
  can reach via tunnel).
- The app's own `/api/signal/announce` route is protected by the
  `ANNOUNCE_SECRET` shared secret (see below). That guards *who can ask the app
  to announce*, not the upstream API — secure both.

## 5. Set env vars

Set these in the Next app — in **Vercel** (Project → Settings → Environment
Variables) for deployments, and in a local **`.env.local`** for development.

| Var                   | Example                          | Meaning                                            |
| --------------------- | -------------------------------- | -------------------------------------------------- |
| `SIGNAL_CLI_REST_URL` | `https://signal.example.com`     | Base URL of the signal-cli-rest-api instance       |
| `SIGNAL_NUMBER`       | `+14155550123`                   | The bot's linked/registered number (E.164)         |
| `SIGNAL_GROUP_ID`     | `group.aBcD...=`                  | Target group's internal id from `GET /v1/groups`   |
| `ANNOUNCE_SECRET`     | `<long random string>`           | Shared secret guarding `POST /api/signal/announce` |

Never commit these — `.env*` files are gitignored.

## 6. Verify

With all four vars set, trigger an announcement for an existing moment:

```bash
curl -X POST https://<your-app>/api/signal/announce \
  -H "content-type: application/json" \
  -H "x-announce-secret: $ANNOUNCE_SECRET" \
  -d '{"happinessId":"<some-existing-id>"}'
```

A `{ "ok": true }` response plus a message in the group means it works.

## Notes / limitations

- **@mentions** require the mentioned member's Signal number or UUID. The app
  does not yet keep a contributor → Signal-recipient mapping, so it currently
  sends names as plain text. Mention support is wired but stubbed; see comments
  in `src/lib/signal.ts`.
- **Image attachment**: if a moment has a generated figure card image, it is
  attached automatically. If the image fetch fails, the app sends text-only.
