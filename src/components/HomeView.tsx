"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Happiness } from "@/lib/types";
import { ClusterMap, type HoverMode } from "@/components/ClusterMap";
import { Feed } from "@/components/Feed";
import { HappinessForm } from "@/components/HappinessForm";

function ChevronRight({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <polyline points="9 6 15 12 9 18" />
    </svg>
  );
}

function ChevronLeft({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <polyline points="15 6 9 12 15 18" />
    </svg>
  );
}

function HoverModeToggle({
  mode,
  onChange,
}: {
  mode: HoverMode;
  onChange: (m: HoverMode) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="What to show on hover"
      className="inline-flex items-center gap-1 rounded-full border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-0.5 text-[11px]"
    >
      <span className="px-2 text-zinc-500 dark:text-zinc-500">Hover:</span>
      <button
        type="button"
        role="radio"
        aria-checked={mode === "full"}
        onClick={() => onChange("full")}
        className={`rounded-full px-2.5 py-1 transition-colors ${
          mode === "full"
            ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
            : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
        }`}
      >
        Full preview
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={mode === "name"}
        onClick={() => onChange("name")}
        className={`rounded-full px-2.5 py-1 transition-colors ${
          mode === "name"
            ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
            : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
        }`}
      >
        Name only
      </button>
    </div>
  );
}

export function HomeView({ initial }: { initial: Happiness[] }) {
  const [items, setItems] = useState<Happiness[]>(initial);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [hoverMode, setHoverMode] = useState<HoverMode>("full");
  const [feedHidden, setFeedHidden] = useState(false);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  function handleSelect(id: string) {
    if (!feedHidden) {
      const el = document.getElementById(`feed-${id}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    setHighlightedId(id);
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => setHighlightedId(null), 1800);
  }

  useEffect(() => {
    return () => {
      if (highlightTimer.current) clearTimeout(highlightTimer.current);
    };
  }, []);

  return (
    <div
      className={`grid gap-4 lg:gap-6 ${
        feedHidden ? "grid-cols-1" : "lg:grid-cols-[minmax(0,1fr)_360px]"
      }`}
    >
      <div className="min-w-0 relative">
        <ClusterMap
          items={items}
          onSelect={handleSelect}
          highlightedId={highlightedId}
          hoverMode={hoverMode}
        />
        {/* feed-toggle caret on the right edge of the map */}
        <button
          type="button"
          onClick={() => setFeedHidden((v) => !v)}
          aria-label={feedHidden ? "Show feed" : "Hide feed"}
          title={feedHidden ? "Show feed" : "Hide feed"}
          className="hidden lg:flex absolute top-1/2 -translate-y-1/2 -right-3 h-12 w-6 items-center justify-center rounded-full border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-zinc-600 dark:text-zinc-300 shadow-sm hover:bg-zinc-50 dark:hover:bg-zinc-900 z-20"
        >
          {feedHidden ? (
            <ChevronLeft className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </button>
        <div className="mt-3 flex justify-center">
          <HoverModeToggle mode={hoverMode} onChange={setHoverMode} />
        </div>
      </div>
      {!feedHidden && (
        <aside className="space-y-4 min-w-0">
          <HappinessForm />
          <section>
            <h2 className="text-[11px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-500 mb-2 px-1">
              Recent moments
            </h2>
            <Feed items={items} highlightedId={highlightedId} />
          </section>
        </aside>
      )}
    </div>
  );
}
