import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { tagHappiness } from "@/lib/tagging";
import { transcribeVoiceNote } from "@/lib/transcription";
import { MAX_CONTENT_LENGTH } from "@/lib/types";
import {
  verifyTwilioSignature,
  downloadTwilioMedia,
  extFromContentType,
  twiml,
} from "@/lib/twilio";

// Twilio's webhook is form-encoded; default body size limit is fine here.
export const dynamic = "force-dynamic";

function twimlResponse(text?: string, status = 200): Response {
  return new Response(twiml(text), {
    status,
    headers: { "content-type": "text/xml; charset=utf-8" },
  });
}

export async function POST(req: Request) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const accountSid = process.env.TWILIO_ACCOUNT_SID;

  // Read body once as form data
  let form: FormData;
  try {
    form = await req.formData();
  } catch (err) {
    console.error("[whatsapp] failed to parse formData", err);
    return twimlResponse(undefined, 400);
  }

  const params: Record<string, string> = {};
  for (const [k, v] of form.entries()) {
    if (typeof v === "string") params[k] = v;
  }

  // Verify the signature unless we're explicitly in skip mode (local dev).
  const skipVerify = process.env.TWILIO_SKIP_VERIFY === "1";
  if (!skipVerify) {
    if (!authToken) {
      console.error("[whatsapp] TWILIO_AUTH_TOKEN missing; refusing");
      return twimlResponse(undefined, 401);
    }
    const signature = req.headers.get("x-twilio-signature") || "";
    // The signing URL must match what Twilio configured. Prefer an
    // explicit override; fall back to deriving from the request.
    const configuredUrl =
      process.env.TWILIO_WEBHOOK_URL ||
      (() => {
        const fwdProto = req.headers.get("x-forwarded-proto") || "https";
        const host = req.headers.get("host") || "";
        const u = new URL(req.url);
        return `${fwdProto}://${host}${u.pathname}${u.search}`;
      })();
    const ok = verifyTwilioSignature({
      authToken,
      signature,
      url: configuredUrl,
      params,
    });
    if (!ok) {
      console.error("[whatsapp] signature verification failed", {
        configuredUrl,
        haveSig: !!signature,
      });
      return twimlResponse(undefined, 403);
    }
  }

  const from = params.From || "";
  const body = (params.Body || "").trim();
  const profileName = (params.ProfileName || "").trim() || null;
  const numMedia = parseInt(params.NumMedia || "0", 10) || 0;

  // From is shaped like "whatsapp:+14155551234"
  const phone = from.startsWith("whatsapp:") ? from.slice("whatsapp:".length) : from;
  if (!phone) {
    return twimlResponse("We couldn't read that — try again?");
  }

  // Find or create the contributor.
  let contributorId: string | null = null;
  let contributorDisplayName: string | null = profileName;
  {
    const { data: existing, error: selectErr } = await supabaseAdmin
      .from("contributors")
      .select("id, display_name")
      .eq("phone_e164", phone)
      .maybeSingle();
    if (selectErr) console.error("[whatsapp] contributor lookup failed", selectErr);

    if (existing) {
      contributorId = existing.id as string;
      contributorDisplayName =
        (existing.display_name as string | null) || profileName;
      // If we now know a profile name and didn't before, fill it in.
      if (!existing.display_name && profileName) {
        await supabaseAdmin
          .from("contributors")
          .update({ display_name: profileName })
          .eq("id", existing.id);
      }
    } else {
      const { data: created, error: insertErr } = await supabaseAdmin
        .from("contributors")
        .insert({
          phone_e164: phone,
          display_name: profileName,
        })
        .select("id")
        .single();
      if (insertErr) {
        console.error("[whatsapp] contributor create failed", insertErr);
      } else if (created) {
        contributorId = created.id as string;
      }
    }
  }

  // Handle media: download the first usable image or audio. We only handle
  // one attachment per message in MVP — if both are present, audio wins
  // (matches the form's "voice OR photo" affordance).
  let photo_url: string | null = null;
  let voice_note_url: string | null = null;

  if (numMedia > 0) {
    if (!accountSid || !authToken) {
      console.error("[whatsapp] Twilio creds missing; cannot fetch media");
    } else {
      // Walk media indices 0..numMedia-1, pick first audio else first image
      const candidates: { url: string; ct: string; kind: "audio" | "image" }[] = [];
      for (let i = 0; i < numMedia; i++) {
        const url = params[`MediaUrl${i}`];
        const ct = (params[`MediaContentType${i}`] || "").toLowerCase();
        if (!url || !ct) continue;
        if (ct.startsWith("audio/")) candidates.push({ url, ct, kind: "audio" });
        else if (ct.startsWith("image/")) candidates.push({ url, ct, kind: "image" });
      }
      const pick =
        candidates.find((c) => c.kind === "audio") ||
        candidates.find((c) => c.kind === "image");

      if (pick) {
        const media = await downloadTwilioMedia({
          url: pick.url,
          accountSid,
          authToken,
        });
        if (media) {
          const ext = extFromContentType(media.contentType || pick.ct);
          const bucket =
            pick.kind === "audio" ? "happiness-voice-notes" : "happiness-photos";
          const path = `${crypto.randomUUID()}.${ext}`;
          const { error: uploadErr } = await supabaseAdmin.storage
            .from(bucket)
            .upload(path, media.bytes, {
              contentType: media.contentType || pick.ct,
              upsert: false,
            });
          if (uploadErr) {
            console.error("[whatsapp] media upload failed", uploadErr);
          } else {
            const publicUrl = supabaseAdmin.storage
              .from(bucket)
              .getPublicUrl(path).data.publicUrl;
            if (pick.kind === "audio") voice_note_url = publicUrl;
            else photo_url = publicUrl;
          }
        }
      }
    }
  }

  const hasText = body.length > 0;
  const hasVoice = !!voice_note_url;

  if (!hasText && !hasVoice && !photo_url) {
    return twimlResponse(
      "Send a quick text, photo, or voice note to log a happy moment ✨"
    );
  }

  // Clip overly long messages to the column limit.
  const insertContent: string | null = hasText
    ? body.slice(0, MAX_CONTENT_LENGTH)
    : null;

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from("happinesses")
    .insert({
      content: insertContent,
      contributor_name: contributorDisplayName,
      contributor_id: contributorId,
      is_anonymous: false,
      photo_url,
      voice_note_url,
      source: "whatsapp",
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    console.error("[whatsapp] insert failed", insertError);
    return twimlResponse("Hmm, something broke on our end. Try again?");
  }

  const insertedId = inserted.id;
  after(async () => {
    let finalContent = insertContent;

    if (voice_note_url && !insertContent) {
      const transcript = await transcribeVoiceNote(voice_note_url);
      if (transcript) {
        finalContent = transcript.slice(0, MAX_CONTENT_LENGTH);
        const { error: tErr } = await supabaseAdmin
          .from("happinesses")
          .update({ content: finalContent, transcribed: true })
          .eq("id", insertedId);
        if (tErr) console.error("[whatsapp/transcription] update failed", tErr);
      }
    }

    if (!finalContent) return;
    const tags = await tagHappiness({
      content: finalContent,
      contributorName: contributorDisplayName,
    });
    if (!tags) return;
    const { error: updateError } = await supabaseAdmin
      .from("happinesses")
      .update(tags)
      .eq("id", insertedId);
    if (updateError) console.error("[whatsapp/tagging] update failed", updateError);
  });

  revalidatePath("/");

  return twimlResponse("Got it ✨");
}

// Twilio always POSTs. Reject everything else clearly.
export async function GET() {
  return new Response("This endpoint accepts Twilio webhooks (POST).", {
    status: 405,
  });
}
