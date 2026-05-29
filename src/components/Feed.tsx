"use client";

import type { Happiness } from "@/lib/types";

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

function TagChip({ theme, subtheme }: { theme: string; subtheme: string | null }) {
  return (
    <span className="inline-flex items-center rounded-full bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium text-zinc-700 dark:text-zinc-300">
      {theme}
      {subtheme && (
        <>
          <span className="mx-1 text-zinc-400 dark:text-zinc-500">·</span>
          <span className="text-zinc-500 dark:text-zinc-400">{subtheme}</span>
        </>
      )}
    </span>
  );
}

function ContentBlock({ h }: { h: Happiness }) {
  if (!h.content && h.voice_note_url) {
    return (
      <p className="text-sm leading-snug text-zinc-500 dark:text-zinc-400 italic">
        <span aria-hidden className="mr-1">🎙️</span>
        Transcribing voice note…
      </p>
    );
  }
  if (h.transcribed && h.content) {
    return (
      <p className="text-sm leading-snug text-zinc-800 dark:text-zinc-200 italic whitespace-pre-wrap break-words">
        <span aria-hidden className="mr-1 not-italic">🎙️</span>
        {h.content}
      </p>
    );
  }
  return (
    <p className="text-sm leading-snug text-zinc-900 dark:text-zinc-100 whitespace-pre-wrap break-words">
      {h.content}
    </p>
  );
}

function HappinessCard({
  h,
  highlighted,
}: {
  h: Happiness;
  highlighted: boolean;
}) {
  const displayName = h.is_anonymous ? "Anonymous" : h.contributor_name || "Anonymous";

  return (
    <article
      className={`rounded-xl border bg-white dark:bg-zinc-950 p-3 shadow-sm transition-shadow ${
        highlighted
          ? "border-zinc-400 dark:border-zinc-500 ring-2 ring-zinc-300 dark:ring-zinc-600"
          : "border-zinc-200 dark:border-zinc-800"
      }`}
    >
      <ContentBlock h={h} />
      {h.voice_note_url && (
        <audio
          src={h.voice_note_url}
          controls
          preload="metadata"
          className="mt-2 h-8 w-full"
        />
      )}
      {h.photo_url && (
        <img
          src={h.photo_url}
          alt=""
          className="mt-2 rounded-lg max-h-48 w-auto border border-zinc-100 dark:border-zinc-900"
        />
      )}
      <div className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-zinc-500 dark:text-zinc-400">
        <span className="font-medium text-zinc-700 dark:text-zinc-300">{displayName}</span>
        <span>·</span>
        <span>{timeAgo(h.created_at)}</span>
        {h.theme && (
          <>
            <span>·</span>
            <TagChip theme={h.theme} subtheme={h.subtheme} />
          </>
        )}
      </div>
    </article>
  );
}

export function Feed({
  items,
  highlightedId,
}: {
  items: Happiness[];
  highlightedId?: string | null;
}) {
  if (items.length === 0) {
    return (
      <p className="text-center text-xs text-zinc-500 dark:text-zinc-500 py-6">
        No moments yet — be the first to share one.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {items.map((h) => (
        <li key={h.id} id={`feed-${h.id}`} className="scroll-mt-4">
          <HappinessCard h={h} highlighted={highlightedId === h.id} />
        </li>
      ))}
    </ul>
  );
}
