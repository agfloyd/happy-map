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
  | { ok: true; id: string }
  | { ok: false; error: string };

// Basic shape guards for the avatar fields coming from the client.
function cleanAvatarId(v: FormDataEntryValue | null): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return /^peep-[a-z0-9-]+$/i.test(s) ? s : null;
}
function cleanAvatarColor(v: FormDataEntryValue | null): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return /^#[0-9a-f]{6}$/i.test(s) ? s : null;
}

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
  const avatar_id = cleanAvatarId(formData.get("avatar_id"));
  const avatar_color = cleanAvatarColor(formData.get("avatar_color"));

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

  // Best-effort: persist the avatar separately so a missing avatar column
  // (pre-migration 003) never blocks a submission. Falls back to defaults.
  if (avatar_id && avatar_color) {
    const { error: avatarErr } = await supabaseAdmin
      .from("happinesses")
      .update({ avatar_id, avatar_color })
      .eq("id", insertedId);
    if (avatarErr) console.warn("[avatar] save skipped (run migration 003?)", avatarErr.message);
  }
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
  return { ok: true, id: insertedId };
}

export type SetAvatarResult = { ok: boolean };

/**
 * Update a moment's avatar (pose + colour) after submission, and — for a named
 * contributor — apply the same choice to all of their moments so the map stays
 * consistent. Anonymous picks only touch the one row.
 */
export async function setHappinessAvatar(
  happinessId: string,
  avatarId: string,
  avatarColor: string,
): Promise<SetAvatarResult> {
  if (!/^[0-9a-f-]{36}$/i.test(happinessId)) return { ok: false };
  if (!/^peep-[a-z0-9-]+$/i.test(avatarId)) return { ok: false };
  if (!/^#[0-9a-f]{6}$/i.test(avatarColor)) return { ok: false };

  const { data: row, error: lookupErr } = await supabaseAdmin
    .from("happinesses")
    .select("contributor_name, is_anonymous")
    .eq("id", happinessId)
    .maybeSingle<{ contributor_name: string | null; is_anonymous: boolean }>();
  if (lookupErr || !row) return { ok: false };

  const update = { avatar_id: avatarId, avatar_color: avatarColor };

  let query = supabaseAdmin.from("happinesses").update(update);
  if (!row.is_anonymous && row.contributor_name) {
    query = query.eq("contributor_name", row.contributor_name);
  } else {
    query = query.eq("id", happinessId);
  }
  const { error: updateErr } = await query;
  if (updateErr) {
    console.error("[setHappinessAvatar] update failed", updateErr);
    return { ok: false };
  }

  revalidatePath("/");
  return { ok: true };
}
