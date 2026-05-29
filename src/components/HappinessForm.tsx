"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { submitHappiness } from "@/app/actions";
import { MAX_CONTENT_LENGTH } from "@/lib/types";
import {
  VoiceRecorder,
  type VoiceRecorderHandle,
  type Status as VoiceStatus,
} from "@/components/VoiceRecorder";

async function downscaleImage(
  file: File,
  maxDim = 1600,
  quality = 0.85
): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  if (file.size < 500 * 1024) return file;

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

function CameraIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M4 8h3l1.6-2h6.8L17 8h3v11H4z" />
      <circle cx="12" cy="13.5" r="3.5" />
    </svg>
  );
}

function MicIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0" />
      <line x1="12" y1="18" x2="12" y2="21" />
      <line x1="9" y1="21" x2="15" y2="21" />
    </svg>
  );
}

function IconButton({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={active}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
        active
          ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
          : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
      }`}
    >
      {children}
    </button>
  );
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
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>("idle");
  const [voiceKey, setVoiceKey] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSubmitted, setJustSubmitted] = useState(false);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const voiceRef = useRef<VoiceRecorderHandle | null>(null);

  const charsLeft = MAX_CONTENT_LENGTH - content.length;
  const overLimit = charsLeft < 0;
  const hasInput =
    content.trim().length > 0 ||
    !!photoFile ||
    !!voiceFile ||
    name.length > 0 ||
    voiceStatus === "recording";
  const isExpanded = expanded || hasInput;

  // Click outside the form collapses it (only when empty + not busy).
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (!formRef.current) return;
      if (formRef.current.contains(e.target as Node)) return;
      if (hasInput || photoProcessing || voiceRecording) return;
      setExpanded(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [hasInput, photoProcessing, voiceRecording]);

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

  function onCameraClick() {
    if (photoFile) {
      clearPhoto();
      return;
    }
    setExpanded(true);
    fileRef.current?.click();
  }

  function onMicClick() {
    setExpanded(true);
    const status = voiceRef.current?.getStatus();
    if (status === "recording") {
      voiceRef.current?.stop();
    } else if (status === "recorded") {
      voiceRef.current?.clear();
    } else {
      voiceRef.current?.start();
    }
  }

  function resetAll() {
    setContent("");
    setName("");
    setIsAnonymous(false);
    clearPhoto();
    setVoiceFile(null);
    setVoiceKey((k) => k + 1);
    setExpanded(false);
    formRef.current?.reset();
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
        resetAll();
        setJustSubmitted(true);
      } else {
        setError(result.error);
      }
    });
  }

  const canSubmit =
    !pending &&
    !photoProcessing &&
    !voiceRecording &&
    !overLimit &&
    (content.trim().length > 0 || !!voiceFile) &&
    (isAnonymous || name.trim().length > 0);

  const micActive = voiceStatus === "recording" || voiceStatus === "recorded";

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className="w-full rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-3 shadow-sm"
    >
      <textarea
        id="content"
        name="content"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onFocus={() => setExpanded(true)}
        placeholder="A small moment of happiness…"
        rows={isExpanded ? 3 : 1}
        maxLength={MAX_CONTENT_LENGTH + 20}
        className="w-full resize-none rounded-lg bg-transparent px-1 py-1 text-sm placeholder:text-zinc-400 focus:outline-none"
      />

      {/* hidden file input — opened via the camera icon button */}
      <input
        ref={fileRef}
        type="file"
        name="photo"
        accept="image/*"
        onChange={onPhotoChange}
        className="hidden"
      />

      {photoPreview && (
        <div className="mt-2">
          {photoProcessing && (
            <span className="text-xs text-zinc-500">preparing…</span>
          )}
          <div className="relative inline-block">
            <img
              src={photoPreview}
              alt="Preview"
              className="max-h-40 rounded-lg border border-zinc-200 dark:border-zinc-800"
            />
            <button
              type="button"
              onClick={clearPhoto}
              className="absolute top-1.5 right-1.5 rounded-full bg-black/70 text-white px-2 py-0.5 text-[11px] hover:bg-black/90"
            >
              Remove
            </button>
          </div>
        </div>
      )}

      <div className="mt-2">
        <VoiceRecorder
          ref={voiceRef}
          key={voiceKey}
          hideIdleButton
          onChange={setVoiceFile}
          onRecordingChange={setVoiceRecording}
          onStatusChange={setVoiceStatus}
        />
      </div>

      {isExpanded && (
        <div className="mt-3 flex items-center gap-2">
          <input
            type="text"
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            disabled={isAnonymous}
            className="flex-1 min-w-0 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 px-2.5 py-1.5 text-xs placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:focus:ring-zinc-700 disabled:opacity-50"
          />
          <label className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400 whitespace-nowrap cursor-pointer">
            <input
              type="checkbox"
              checked={isAnonymous}
              onChange={(e) => setIsAnonymous(e.target.checked)}
              className="rounded"
            />
            Anonymous
          </label>
        </div>
      )}

      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <IconButton
            active={!!photoFile}
            onClick={onCameraClick}
            title={photoFile ? "Remove photo" : "Attach a photo"}
          >
            <CameraIcon className="h-4 w-4" />
          </IconButton>
          <IconButton
            active={micActive}
            onClick={onMicClick}
            title={
              voiceStatus === "recording"
                ? "Stop recording"
                : voiceStatus === "recorded"
                ? "Remove voice note"
                : "Record a voice note"
            }
          >
            <MicIcon className="h-4 w-4" />
          </IconButton>
          {isExpanded && (
            <span
              className={`ml-1 text-[11px] ${
                overLimit ? "text-red-600" : "text-zinc-400"
              }`}
            >
              {charsLeft}
            </span>
          )}
        </div>
        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-3.5 py-1.5 text-xs font-medium disabled:opacity-40 hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors"
        >
          {pending ? "Sharing…" : "Share"}
        </button>
      </div>

      {(error || justSubmitted) && (
        <div className="mt-2 text-xs">
          {error && <p className="text-red-600">{error}</p>}
          {justSubmitted && !error && (
            <p className="text-emerald-600 dark:text-emerald-500">
              Thanks for sharing ✨
            </p>
          )}
        </div>
      )}
    </form>
  );
}
