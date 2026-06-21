"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { supabase } from "@/lib/supabase";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { tagHappiness } from "@/lib/tagging";
import { transcribeVoiceNote } from "@/lib/transcription";
import { MAX_CONTENT_LENGTH } from "@/lib/types";
import { buildCelebrationPayload } from "@/lib/celebration";
import { announceToSignal } from "@/lib/signal";

export type SubmitResult =
  | { ok: true }
  | { ok: false; error: string };

export async function submitHappiness(formData: FormData): Promise<SubmitResult> {
  const content = String(formData.get("content") ?? "").trim();
  const rawName = String(formData.get("name") ?? "").trim();
  const isAnonymous = formData.get("is_anonymous") === "true";
  const photo = formData.get("photo");
  const voiceNote = formData.get("voice_note");

  const hasContent = content.length > 0;
  const hasVoice = voiceNote instanceof File && voiceNote.size > 0;

  if (!hasContent && !hasVoice) {
    return { ok: false, error: "Share a moment in text or with a voice note." };
  }
  if (content.length > MAX_CONTENT_LENGTH) {
    return { ok: false, error: `Keep it under ${MAX_CONTENT_LENGTH} characters.` };
  }
  if (!isAnonymous && !rawName) {
    return { ok: false, error: "Add a name, or check 'submit anonymously'." };
  }

  let photo_url: string | null = null;
  if (photo instanceof File && photo.size > 0) {
    if (!photo.type.startsWith("image/")) {
      return { ok: false, error: "Photo must be an image." };
    }
    if (photo.size > 10 * 1024 * 1024) {
      return { ok: false, error: "Photo must be under 10 MB." };
    }
    const ext = (photo.name.split(".").pop() || "jpg").toLowerCase();
    const path = `${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("happiness-photos")
      .upload(path, photo, { contentType: photo.type, upsert: false });
    if (uploadError) {
      console.error("photo upload failed", uploadError);
      return { ok: false, error: "Couldn't upload your photo. Try again?" };
    }
    photo_url = supabase.storage.from("happiness-photos").getPublicUrl(path).data.publicUrl;
  }

  let voice_note_url: string | null = null;
  if (hasVoice) {
    const audio = voiceNote as File;
    if (!audio.type.startsWith("audio/")) {
      return { ok: false, error: "Voice note must be an audio file." };
    }
    if (audio.size > 5 * 1024 * 1024) {
      return { ok: false, error: "Voice note is too large." };
    }
    const ext = (audio.name.split(".").pop() || "webm").toLowerCase();
    const path = `${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from("happiness-voice-notes")
      .upload(path, audio, { contentType: audio.type, upsert: false });
    if (uploadError) {
      console.error("voice upload failed", uploadError);
      return { ok: false, error: "Couldn't upload your voice note. Try again?" };
    }
    voice_note_url = supabase.storage
      .from("happiness-voice-notes")
      .getPublicUrl(path).data.publicUrl;
  }

  const contributorName = isAnonymous ? null : rawName;
  const insertContent: string | null = hasContent ? content : null;

  const { data: inserted, error: insertError } = await supabase
    .from("happinesses")
    .insert({
      content: insertContent,
      contributor_name: contributorName,
      is_anonymous: isAnonymous,
      photo_url,
      voice_note_url,
      source: "web",
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    console.error("insert failed", insertError);
    return { ok: false, error: "Couldn't save your moment. Try again?" };
  }

  const insertedId = inserted.id;
  after(async () => {
    console.log("[after] starting for", insertedId, {
      hasVoice: !!voice_note_url,
      hasContent: !!insertContent,
    });
    let finalContent = insertContent;

    if (voice_note_url && !insertContent) {
      const transcript = await transcribeVoiceNote(voice_note_url);
      if (transcript) {
        finalContent = transcript.slice(0, MAX_CONTENT_LENGTH);
        const { error: tErr } = await supabaseAdmin
          .from("happinesses")
          .update({ content: finalContent, transcribed: true })
          .eq("id", insertedId);
        if (tErr) console.error("[transcription] update failed", tErr);
        else console.log("[transcription] saved content");
      } else {
        console.log("[transcription] returned null — skipping content update");
      }
    }

    if (!finalContent) {
      console.log("[after] no final content, skipping tagging");
      return;
    }
    const tags = await tagHappiness({ content: finalContent, contributorName });
    if (!tags) {
      console.log("[tagging] returned null — skipping update");
      return;
    }
    const { error: updateError } = await supabaseAdmin
      .from("happinesses")
      .update(tags)
      .eq("id", insertedId);
    if (updateError) {
      console.error("[tagging] update failed", updateError);
      return;
    }
    console.log("[tagging] saved", tags.theme, tags.subtheme);

    // Celebrate the freshly-tagged moment to the Signal group.
    const payload = await buildCelebrationPayload(insertedId);
    if (payload) await announceToSignal(payload);
  });

  revalidatePath("/");
  return { ok: true };
}
