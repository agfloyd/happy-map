import type { CelebrationPayload } from "@/lib/celebration";
import { renderCelebrationText } from "@/lib/celebration";

// Typed HTTP client for a self-hosted bbernhard/signal-cli-rest-api instance
// running in json-rpc mode. The Next app pushes announcements to it over HTTP.
//
// This module is intentionally dormant until configured: if any of the three
// required env vars are missing, announceToSignal() no-ops and returns false.
// Announcements must NEVER break the submission flow, so every network call is
// wrapped in try/catch with a timeout and we always return a boolean — we never
// throw.
//
// Env vars:
//   SIGNAL_CLI_REST_URL  base URL of the signal-cli-rest-api instance,
//                        e.g. "https://signal.example.com" (no trailing slash needed)
//   SIGNAL_NUMBER        the bot's linked phone number in E.164, e.g. "+14155550123"
//   SIGNAL_GROUP_ID      the target group's internal id (the "group.xxxx" base64 id
//                        returned by GET /v1/groups/{number})

const LOG_PREFIX = "[signal]";

// How long to wait on any single network call before giving up.
const REQUEST_TIMEOUT_MS = 10_000;

type SignalConfig = {
  baseUrl: string;
  number: string;
  groupId: string;
};

// The exact /v2/send request body shape, verified against the
// signal-cli-rest-api OpenAPI spec (SendMessageV2 struct):
//   number, recipients[], message, base64_attachments[], mentions[{author,start,length}]
type SignalMention = {
  author: string; // mentioned member's Signal number (E.164) or UUID
  start: number; // UTF-16 code-unit offset of the mention placeholder in `message`
  length: number; // length of the placeholder text in `message`
};

type SendV2Body = {
  number: string;
  recipients: string[];
  message: string;
  base64_attachments?: string[];
  mentions?: SignalMention[];
};

// SendMessageResponse from the API: { "timestamp": "..." }
type SendV2Response = {
  timestamp?: string;
};

/**
 * Read and validate config. Returns null (silently — silence is the desired
 * "dormant" state) when any required var is unset, so the feature is a no-op
 * until an operator configures it.
 */
function readConfig(): SignalConfig | null {
  const baseUrlRaw = process.env.SIGNAL_CLI_REST_URL;
  const number = process.env.SIGNAL_NUMBER;
  const groupId = process.env.SIGNAL_GROUP_ID;

  if (!baseUrlRaw || !number || !groupId) return null;

  // Normalize: strip any trailing slash so we can safely append "/v2/send".
  const baseUrl = baseUrlRaw.replace(/\/+$/, "");
  return { baseUrl, number, groupId };
}

/**
 * fetch() with an AbortController-based timeout. Returns null on any error or
 * timeout (caller treats null as failure). Never throws.
 */
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = REQUEST_TIMEOUT_MS
): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    console.error(`${LOG_PREFIX} request failed: ${url}`, err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch a remote PNG and return it as a base64 string (no data: prefix — the
 * API's base64_attachments accepts raw base64, which is the simplest portable
 * form). Returns null on failure so the caller can fall back to a text-only
 * send.
 */
async function fetchImageAsBase64(imageUrl: string): Promise<string | null> {
  const res = await fetchWithTimeout(imageUrl, { method: "GET" });
  if (!res || !res.ok) {
    if (res) {
      console.error(
        `${LOG_PREFIX} attachment fetch returned ${res.status} for ${imageUrl}`
      );
    }
    return null;
  }
  try {
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.toString("base64");
  } catch (err) {
    console.error(`${LOG_PREFIX} failed to encode attachment`, err);
    return null;
  }
}

/**
 * Best-effort @mention support.
 *
 * signal-cli-rest-api mentions require knowing the mentioned member's Signal
 * number (E.164) or UUID — we cannot mention someone by display name alone.
 * This project does not yet maintain a contributor -> Signal recipient mapping,
 * so mentions are effectively a documented stub: with no mapping available we
 * return undefined, and the contributor's name renders as plain text (it is
 * already present in the message produced by renderCelebrationText).
 *
 * When such a mapping exists, a future implementation would: locate the
 * contributor's name verbatim within `message`, compute its UTF-16 offset, and
 * emit a single mention { author: <recipient id>, start, length }.
 */
function buildMentions(
  _payload: CelebrationPayload,
  _message: string
): SignalMention[] | undefined {
  // No contributor -> Signal recipient mapping available yet. Omit the
  // `mentions` field entirely (intentional best-effort behavior).
  return undefined;
}

/**
 * Post a celebratory announcement to the configured Signal group.
 *
 * Builds the message via renderCelebrationText(), optionally attaches the
 * figure PNG, optionally includes @mentions, and POSTs to
 * {SIGNAL_CLI_REST_URL}/v2/send.
 *
 * Returns true on a 2xx response, false on any failure or when not configured.
 * Never throws.
 */
export async function announceToSignal(
  payload: CelebrationPayload
): Promise<boolean> {
  const config = readConfig();
  if (!config) {
    // Dormant: not configured. Silent no-op.
    return false;
  }

  let message: string;
  try {
    message = renderCelebrationText(payload);
  } catch (err) {
    console.error(`${LOG_PREFIX} renderCelebrationText threw`, err);
    return false;
  }

  const body: SendV2Body = {
    number: config.number,
    recipients: [config.groupId],
    message,
  };

  // Optional image attachment — degrade to text-only on any fetch failure.
  if (payload.figureImageUrl) {
    const base64 = await fetchImageAsBase64(payload.figureImageUrl);
    if (base64) {
      body.base64_attachments = [base64];
    } else {
      console.error(
        `${LOG_PREFIX} could not attach figure image; sending text-only`
      );
    }
  }

  // Optional @mentions (best-effort; currently a documented stub).
  const mentions = buildMentions(payload, message);
  if (mentions && mentions.length > 0) {
    body.mentions = mentions;
  }

  const res = await fetchWithTimeout(`${config.baseUrl}/v2/send`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res) return false; // already logged in fetchWithTimeout

  if (!res.ok) {
    // Try to surface the API's error body for debugging.
    let detail = "";
    try {
      detail = await res.text();
    } catch {
      /* ignore */
    }
    console.error(
      `${LOG_PREFIX} /v2/send returned ${res.status}: ${detail.slice(0, 500)}`
    );
    return false;
  }

  // Success: the API returns { timestamp }. We don't need it, but parse
  // defensively so a malformed body doesn't look like a thrown error.
  try {
    const json = (await res.json()) as SendV2Response;
    if (json?.timestamp) {
      console.log(
        `${LOG_PREFIX} announced happiness ${payload.happinessId} (ts=${json.timestamp})`
      );
    }
  } catch {
    // Body wasn't JSON but status was 2xx — treat as success.
  }

  return true;
}
