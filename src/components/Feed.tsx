"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
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
    <span className="inline-flex items-center rounded-full bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-[11px] font-medium text-zinc-700 dark:text-zinc-300">
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

function HappinessCard({ h }: { h: Happiness }) {
  const displayName = h.is_anonymous ? "Anonymous" : h.contributor_name || "Anonymous";

  return (
    <article className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-5 shadow-sm">
      <p className="text-base leading-relaxed text-zinc-900 dark:text-zinc-100 whitespace-pre-wrap">
        {h.content}
      </p>
      {h.photo_url && (
        <img
          src={h.photo_url}
          alt=""
          className="mt-3 rounded-xl max-h-80 w-auto border border-zinc-100 dark:border-zinc-900"
        />
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
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

export function Feed({ initial }: { initial: Happiness[] }) {
  const [items, setItems] = useState<Happiness[]>(initial);

  useEffect(() => {
    const channel = supabase
      .channel("happinesses-changes")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "happinesses" },
        (payload) => {
          const next = payload.new as Happiness;
          setItems((prev) => {
            if (prev.some((p) => p.id === next.id)) return prev;
            return [next, ...prev];
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "happinesses" },
        (payload) => {
          const next = payload.new as Happiness;
          setItems((prev) =>
            prev.map((p) => (p.id === next.id ? { ...p, ...next } : p))
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  if (items.length === 0) {
    return (
      <p className="text-center text-sm text-zinc-500 dark:text-zinc-500 py-8">
        No moments yet — be the first to share one.
      </p>
    );
  }

  return (
    <ul className="space-y-4">
      {items.map((h) => (
        <li key={h.id}>
          <HappinessCard h={h} />
        </li>
      ))}
    </ul>
  );
}
