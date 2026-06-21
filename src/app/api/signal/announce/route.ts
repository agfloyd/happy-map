import { buildCelebrationPayload } from "@/lib/celebration";
import { announceToSignal } from "@/lib/signal";

// POST /api/signal/announce
//
// Triggers (or retries) a Signal group announcement for a single happiness.
// Body: { happinessId: string }
//
// Guarded by a shared secret: the caller must send header
//   x-announce-secret: <ANNOUNCE_SECRET>
// matching process.env.ANNOUNCE_SECRET, else 401.
//
// This route exists so announcements can be triggered/retried independently of
// the submission flow; the main app also calls announceToSignal() directly from
// server code, so this is the manual / out-of-band path.

// Always run at request time — we read headers and the request body.
export const dynamic = "force-dynamic";

const LOG_PREFIX = "[signal/announce]";

export async function POST(req: Request): Promise<Response> {
  const expectedSecret = process.env.ANNOUNCE_SECRET;

  // If no secret is configured, refuse rather than running unauthenticated.
  if (!expectedSecret) {
    console.error(`${LOG_PREFIX} ANNOUNCE_SECRET not set; refusing`);
    return Response.json({ ok: false }, { status: 401 });
  }

  const provided = req.headers.get("x-announce-secret");
  if (provided !== expectedSecret) {
    return Response.json({ ok: false }, { status: 401 });
  }

  let happinessId: unknown;
  try {
    const body = (await req.json()) as { happinessId?: unknown };
    happinessId = body?.happinessId;
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }

  if (typeof happinessId !== "string" || happinessId.length === 0) {
    return Response.json({ ok: false }, { status: 400 });
  }

  let ok = false;
  try {
    const payload = await buildCelebrationPayload(happinessId);
    if (!payload) {
      // No such happiness (or not yet ready to celebrate). Not an error per se,
      // but nothing was announced.
      return Response.json({ ok: false }, { status: 404 });
    }
    ok = await announceToSignal(payload);
  } catch (err) {
    // announceToSignal never throws, but buildCelebrationPayload might.
    console.error(`${LOG_PREFIX} failed for ${happinessId}`, err);
    return Response.json({ ok: false }, { status: 500 });
  }

  return Response.json({ ok });
}
