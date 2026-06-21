"use client";

import { useEffect, useRef, useState } from "react";
import type { Happiness } from "@/lib/types";

function displayName(h: Happiness | null): string {
  if (!h) return "someone";
  if (h.is_anonymous) return "someone";
  return h.contributor_name?.trim() || "someone";
}

// Small connector words stay lowercase (unless first), matching the map's
// existing label style ("Hobbies and Creation", not "Hobbies And Creation").
const MINOR_WORDS = new Set(["and", "or", "of", "the", "a", "an"]);

function islandLabel(theme: string | null): string {
  if (!theme || !theme.trim()) return "the map";
  const words = theme.trim().split(/\s+/);
  const titled = words
    .map((w, i) => {
      const lower = w.toLowerCase();
      if (i > 0 && MINOR_WORDS.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
  return `${titled} Island`;
}

/**
 * Slim celebratory bar showing total moments + the newest landing.
 *
 * Initial data comes from the same `items` array HomeView already holds
 * (server-fetched in page.tsx), so there's no flash and no extra query.
 * `newest` is whatever HomeView considers the most recent row; `count` is
 * the running total. On each new value we briefly pulse to draw the eye.
 */
export function ActivityTicker({
  count,
  newest,
}: {
  count: number;
  newest: Happiness | null;
}) {
  const [pulsing, setPulsing] = useState(false);
  const prevId = useRef<string | null>(newest?.id ?? null);
  const pulseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const id = newest?.id ?? null;
    if (id && id !== prevId.current) {
      prevId.current = id;
      setPulsing(true);
      if (pulseTimer.current) clearTimeout(pulseTimer.current);
      pulseTimer.current = setTimeout(() => setPulsing(false), 1600);
    }
  }, [newest?.id]);

  useEffect(() => {
    return () => {
      if (pulseTimer.current) clearTimeout(pulseTimer.current);
    };
  }, []);

  if (count === 0) return null;

  const name = displayName(newest);
  const island = islandLabel(newest?.theme ?? null);

  return (
    <div
      role="status"
      aria-live="polite"
      className={`inline-flex max-w-full items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm shadow-sm transition-all duration-500 ${
        pulsing
          ? "border-amber-300 bg-amber-50 ring-2 ring-amber-200 dark:border-amber-500/60 dark:bg-amber-500/10 dark:ring-amber-500/30 scale-[1.02]"
          : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950 scale-100"
      }`}
      style={{ fontFamily: "var(--font-fredoka)" }}
    >
      <span
        aria-hidden
        className={`text-base leading-none ${pulsing ? "animate-bounce" : ""}`}
      >
        🎉
      </span>
      <span className="truncate text-zinc-700 dark:text-zinc-300">
        <span className="font-semibold text-zinc-900 dark:text-zinc-100">
          {count}
        </span>{" "}
        {count === 1 ? "moment" : "moments"} mapped
        <span className="mx-1.5 text-zinc-300 dark:text-zinc-600">·</span>
        <span className="text-zinc-500 dark:text-zinc-400">newest: </span>
        <span className="font-semibold text-zinc-900 dark:text-zinc-100">
          {name}
        </span>{" "}
        just landed on{" "}
        <span className="font-semibold text-zinc-900 dark:text-zinc-100">
          {island}
        </span>
      </span>
    </div>
  );
}
