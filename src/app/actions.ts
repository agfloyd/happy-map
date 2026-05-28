"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { supabase } from "@/lib/supabase";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { tagHappiness } from "@/lib/tagging";
import { MAX_CONTENT_LENGTH } from "@/lib/types";

export type SubmitResult =
  | { ok: true }
  | { ok: false; error: string };

export async function submitHappiness(formData: FormData): Promise<SubmitResult> {
  const content = String(formData.get("content") ?? "").trim();
  const rawName = String(formData.get("name") ?? "").trim();
  const isAnonymous = formData.get("is_anonymous") === "true";
  const photo = formData.get("photo");

  if (!content) {
    return { ok: false, error: "Please share a moment." };
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

  const contributorName = isAnonymous ? null : rawName;

  const { data: inserted, error: insertError } = await supabase
    .from("happinesses")
    .insert({
      content,
      contributor_name: contributorName,
      is_anonymous: isAnonymous,
      photo_url,
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
    const tags = await tagHappiness({ content, contributorName });
    if (!tags) return;
    const { error: updateError } = await supabaseAdmin
      .from("happinesses")
      .update(tags)
      .eq("id", insertedId);
    if (updateError) {
      console.error("[tagging] update failed", updateError);
    }
  });

  revalidatePath("/");
  return { ok: true };
}
