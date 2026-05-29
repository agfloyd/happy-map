"use client";

import { useRef, useState, useTransition } from "react";
import { submitHappiness } from "@/app/actions";
import { MAX_CONTENT_LENGTH } from "@/lib/types";
import { VoiceRecorder } from "@/components/VoiceRecorder";

/**
 * Resize an image File so its longest side is at most `maxDim` pixels and
 * re-encode as JPEG at the given quality. Returns the original file if it's
 * already small, not an image, or if we can't decode it (e.g. HEIC on some
 * browsers).
 */
async function downscaleImage(
  file: File,
  maxDim = 1600,
  quality = 0.85
): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  if (file.size < 500 * 1024) return file; // <500KB — leave alone

  let img: HTMLImageElement;
  try {
    img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = URL.createObjectURL(file);
    });
  } catch {
    return file;
  }

  const longest = Math.max(img.width, img.height);
  if (longest <= maxDim) {
    URL.revokeObjectURL(img.src);
    return file;
  }

  const scale = maxDim / longest;
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    URL.revokeObjectURL(img.src);
    return file;
  }
  ctx.drawImage(img, 0, 0, w, h);
  URL.revokeObjectURL(img.src);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((b) => resolve(b), "image/jpeg", quality);
  });
  if (!blob) return file;

  const baseName = file.name.replace(/\.[^.]+$/, "") || "photo";
  return new File([blob], `${baseName}.jpg`, {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}

export function HappinessForm() {
  const [content, setContent] = useState("");
  const [name, setName] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoProcessing, setPhotoProcessing] = useState(false);
  const [voiceFile, setVoiceFile] = useState<File | null>(null);
  const [voiceRecording, setVoiceRecording] = useState(false);
  const [voiceKey, setVoiceKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [justSubmitted, setJustSubmitted] = useState(false);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const charsLeft = MAX_CONTENT_LENGTH - content.length;
  const overLimit = charsLeft < 0;

  async function onPhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const original = e.target.files?.[0];
    if (!original) {
      setPhotoFile(null);
      setPhotoPreview(null);
      return;
    }
    setPhotoProcessing(true);
    try {
      const file = await downscaleImage(original);
      setPhotoFile(file);
      const reader = new FileReader();
      reader.onload = () => setPhotoPreview(reader.result as string);
      reader.readAsDataURL(file);
    } finally {
      setPhotoProcessing(false);
    }
  }

  function clearPhoto() {
    setPhotoFile(null);
    setPhotoPreview(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setJustSubmitted(false);
    const fd = new FormData(e.currentTarget);
    fd.set("is_anonymous", isAnonymous ? "true" : "false");
    if (photoFile) {
      fd.set("photo", photoFile);
    } else {
      fd.delete("photo");
    }
    if (voiceFile) {
      fd.set("voice_note", voiceFile);
    } else {
      fd.delete("voice_note");
    }

    startTransition(async () => {
      const result = await submitHappiness(fd);
      if (result.ok) {
        setContent("");
        setName("");
        setIsAnonymous(false);
        clearPhoto();
        setVoiceFile(null);
        setVoiceKey((k) => k + 1);
        formRef.current?.reset();
        setJustSubmitted(true);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className="w-full max-w-xl mx-auto rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-6 shadow-sm"
    >
      <label htmlFor="content" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
        What&apos;s a small moment of happiness?
      </label>
      <textarea
        id="content"
        name="content"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="e.g. Made strawberry lemonade and the first sip was perfect."
        rows={3}
        maxLength={MAX_CONTENT_LENGTH + 20}
        className="w-full resize-none rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 px-3 py-2 text-base placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:focus:ring-zinc-700"
      />
      <div className={`mt-1 text-xs ${overLimit ? "text-red-600" : "text-zinc-500"}`}>
        {charsLeft} characters left
      </div>

      <div className="mt-4 flex items-center gap-3">
        <input
          type="text"
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          disabled={isAnonymous}
          className="flex-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 px-3 py-2 text-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:focus:ring-zinc-700 disabled:opacity-50"
        />
        <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400 whitespace-nowrap cursor-pointer">
          <input
            type="checkbox"
            checked={isAnonymous}
            onChange={(e) => setIsAnonymous(e.target.checked)}
            className="rounded"
          />
          Anonymous
        </label>
      </div>

      <div className="mt-4">
        <label className="block text-sm text-zinc-600 dark:text-zinc-400 mb-2">
          Add a photo (optional)
          {photoProcessing && (
            <span className="ml-2 text-xs text-zinc-500">preparing…</span>
          )}
        </label>
        {photoPreview ? (
          <div className="relative inline-block">
            <img
              src={photoPreview}
              alt="Preview"
              className="max-h-48 rounded-lg border border-zinc-200 dark:border-zinc-800"
            />
            <button
              type="button"
              onClick={clearPhoto}
              className="absolute top-2 right-2 rounded-full bg-black/70 text-white px-2 py-1 text-xs hover:bg-black/90"
            >
              Remove
            </button>
          </div>
        ) : (
          <input
            ref={fileRef}
            type="file"
            name="photo"
            accept="image/*"
            onChange={onPhotoChange}
            className="block w-full text-sm text-zinc-600 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-100 dark:file:bg-zinc-800 file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-zinc-200 dark:hover:file:bg-zinc-700"
          />
        )}
      </div>

      <div className="mt-4">
        <label className="block text-sm text-zinc-600 dark:text-zinc-400 mb-2">
          Or record a voice note (optional, 15s)
        </label>
        <VoiceRecorder
          key={voiceKey}
          onChange={setVoiceFile}
          onRecordingChange={setVoiceRecording}
        />
      </div>

      <div className="mt-6 flex items-center justify-between">
        <div className="text-sm">
          {error && <p className="text-red-600">{error}</p>}
          {justSubmitted && !error && (
            <p className="text-emerald-600 dark:text-emerald-500">Thanks for sharing ✨</p>
          )}
        </div>
        <button
          type="submit"
          disabled={
            pending ||
            photoProcessing ||
            voiceRecording ||
            overLimit ||
            (!content.trim() && !voiceFile) ||
            (!isAnonymous && !name.trim())
          }
          className="rounded-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-5 py-2 text-sm font-medium disabled:opacity-40 hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors"
        >
          {pending ? "Sharing…" : "Share"}
        </button>
      </div>
    </form>
  );
}
