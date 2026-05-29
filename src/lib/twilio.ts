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
