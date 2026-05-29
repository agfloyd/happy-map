"use client";

import { useEffect, useRef, useState } from "react";

const MAX_SECONDS = 15;

type Props = {
  onChange: (file: File | null) => void;
  onRecordingChange?: (isRecording: boolean) => void;
  disabled?: boolean;
};

type Status = "idle" | "recording" | "recorded" | "denied" | "unsupported";

export function VoiceRecorder({ onChange, onRecordingChange, disabled }: Props) {
  const [status, setStatus] = useState<Status>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<number>(0);

  useEffect(() => {
    if (typeof window !== "undefined" && typeof MediaRecorder === "undefined") {
      setStatus("unsupported");
    }
    return () => {
      stopStream();
      clearTimer();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  function clearTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function pickMimeType(): string {
    const candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
      "audio/ogg;codecs=opus",
    ];
    for (const m of candidates) {
      if (MediaRecorder.isTypeSupported(m)) return m;
    }
    return "";
  }

  async function startRecording() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const rec = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = rec;
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const type = rec.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
        const file = new File([blob], `voice-note.${ext}`, { type });
        const url = URL.createObjectURL(blob);
        setPreviewUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
        setStatus("recorded");
        onRecordingChange?.(false);
        onChange(file);
        stopStream();
      };
      rec.start();
      startedAtRef.current = Date.now();
      setElapsed(0);
      setStatus("recording");
      onRecordingChange?.(true);
      timerRef.current = setInterval(() => {
        const sec = (Date.now() - startedAtRef.current) / 1000;
        setElapsed(sec);
        if (sec >= MAX_SECONDS) stopRecording();
      }, 100);
    } catch (err) {
      console.error("[voice] getUserMedia failed", err);
      const e = err as DOMException;
      if (e?.name === "NotAllowedError" || e?.name === "PermissionDeniedError") {
        setStatus("denied");
        setError("Microphone access was denied. You can still type a moment.");
      } else {
        setError("Couldn't start recording. Is a mic connected?");
      }
    }
  }

  function stopRecording() {
    clearTimer();
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
  }

  function clearRecording() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setStatus("idle");
    setElapsed(0);
    onChange(null);
  }

  if (status === "unsupported") {
    return (
      <p className="text-xs text-zinc-500">
        Voice recording isn&apos;t supported in this browser.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {status === "idle" && (
        <button
          type="button"
          onClick={startRecording}
          disabled={disabled}
          className="inline-flex items-center gap-2 rounded-full border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50"
        >
          <span aria-hidden>🎙️</span>
          Record a voice note
        </button>
      )}

      {status === "recording" && (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={stopRecording}
            className="inline-flex items-center gap-2 rounded-full bg-red-600 text-white px-3 py-1.5 text-sm font-medium hover:bg-red-700"
          >
            <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
            Stop
          </button>
          <span className="text-xs tabular-nums text-zinc-600 dark:text-zinc-400">
            {elapsed.toFixed(1)}s / {MAX_SECONDS}s
          </span>
        </div>
      )}

      {status === "recorded" && previewUrl && (
        <div className="flex items-center gap-3">
          <audio src={previewUrl} controls className="h-9" />
          <button
            type="button"
            onClick={clearRecording}
            className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 underline"
          >
            Remove
          </button>
        </div>
      )}

      {(status === "denied" || error) && (
        <p className="text-xs text-amber-700 dark:text-amber-400">{error}</p>
      )}
    </div>
  );
}
