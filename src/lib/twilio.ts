import crypto from "node:crypto";

/**
 * Twilio webhook signature verification.
 *
 * Twilio signs requests with HMAC-SHA1 over (full URL + sorted-by-key
 * concatenation of form params as "keyvalue"). The signature is base64.
 *
 * Docs: https://www.twilio.com/docs/usage/webhooks/webhooks-security
 */
export function verifyTwilioSignature({
  authToken,
  signature,
  url,
  params,
}: {
  authToken: string;
  signature: string;
  url: string;
  params: Record<string, string>;
}): boolean {
  if (!authToken || !signature) return false;

  const sortedKeys = Object.keys(params).sort();
  let payload = url;
  for (const key of sortedKeys) {
    payload += key + params[key];
  }

  const hmac = crypto.createHmac("sha1", authToken);
  hmac.update(payload);
  const expected = hmac.digest("base64");

  // Constant-time compare
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Download media from a Twilio media URL using HTTP basic auth with the
 * account SID + auth token. Returns the bytes + content type.
 */
export async function downloadTwilioMedia({
  url,
  accountSid,
  authToken,
}: {
  url: string;
  accountSid: string;
  authToken: string;
}): Promise<{ bytes: ArrayBuffer; contentType: string } | null> {
  const basic = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  // Twilio's first hop is a 307 redirect to the actual CDN URL — fetch
  // follows by default. The signed CDN URL doesn't need our auth, but it
  // doesn't hurt to send it on the first hop.
  const res = await fetch(url, {
    headers: { Authorization: `Basic ${basic}` },
    redirect: "follow",
  });
  if (!res.ok) {
    console.error(
      "[twilio] media download failed",
      res.status,
      await res.text().catch(() => "")
    );
    return null;
  }
  const contentType = res.headers.get("content-type") || "application/octet-stream";
  const bytes = await res.arrayBuffer();
  return { bytes, contentType };
}

/**
 * Guess a sensible file extension from a content type.
 */
export function extFromContentType(ct: string): string {
  const t = ct.toLowerCase();
  if (t.includes("jpeg") || t.includes("jpg")) return "jpg";
  if (t.includes("png")) return "png";
  if (t.includes("webp")) return "webp";
  if (t.includes("gif")) return "gif";
  if (t.includes("heic")) return "heic";
  if (t.includes("ogg")) return "ogg";
  if (t.includes("mp4")) return "m4a";
  if (t.includes("mpeg")) return "mp3";
  if (t.includes("webm")) return "webm";
  if (t.includes("amr")) return "amr";
  return "bin";
}

/**
 * Send an outbound WhatsApp message via the Twilio REST API. Used to follow up
 * a submission with the richer "celebration" message once async tagging is done
 * (the synchronous webhook reply can only ack — the theme isn't known yet).
 *
 * Sending is allowed template-free inside the 24h customer-service window, which
 * a fresh inbound submission always opens. Returns true on success.
 */
export async function sendWhatsApp({
  accountSid,
  authToken,
  from,
  to,
  body,
  mediaUrl,
}: {
  accountSid: string;
  authToken: string;
  /** e.g. "whatsapp:+14155238886" (the Twilio WhatsApp sender) */
  from: string;
  /** bare E.164, e.g. "+14155551234"; "whatsapp:" prefix added if missing */
  to: string;
  body: string;
  mediaUrl?: string;
}): Promise<boolean> {
  const toAddr = to.startsWith("whatsapp:") ? to : `whatsapp:${to}`;
  const fromAddr = from.startsWith("whatsapp:") ? from : `whatsapp:${from}`;
  const basic = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

  const form = new URLSearchParams({ From: fromAddr, To: toAddr, Body: body });
  if (mediaUrl) form.set("MediaUrl", mediaUrl);

  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${basic}`,
          "content-type": "application/x-www-form-urlencoded",
        },
        body: form.toString(),
      },
    );
    if (!res.ok) {
      console.error(
        "[twilio] outbound send failed",
        res.status,
        await res.text().catch(() => ""),
      );
      return false;
    }
    return true;
  } catch (err) {
    console.error("[twilio] outbound send threw", err);
    return false;
  }
}

/**
 * Build a minimal TwiML response. Twilio expects valid XML.
 */
export function twiml(replyText?: string): string {
  const body = replyText
    ? `<Message>${escapeXml(replyText)}</Message>`
    : "";
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
