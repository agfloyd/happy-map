"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Happiness } from "@/lib/types";
import { ClusterMap, type HoverMode } from "@/components/ClusterMap";
import { Feed } from "@/components/Feed";
import { HappinessForm } from "@/components/HappinessForm";
import { ThemeToggle } from "@/components/ThemeToggle";

function MouseIcon({ className }: { className?: string }) {
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
      <rect x="6" y="3" width="12" height="18" rx="6" />
      <line x1="12" y1="7" x2="12" y2="11" />
    </svg>
  );
}

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
      className="group inline-flex items-center rounded-full border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 h-8 overflow-hidden transition-all"
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center text-zinc-600 dark:text-zinc-300">
        <MouseIcon className="h-4 w-4" />
      </div>
      <div
        className="flex items-center gap-1 max-w-0 group-hover:max-w-[320px] focus-within:max-w-[320px] overflow-hidden transition-[max-width,padding] duration-300 ease-out pr-0 group-hover:pr-1 focus-within:pr-1"
        aria-hidden="false"
      >
        <span className="pl-1 pr-0.5 text-[11px] text-zinc-500 dark:text-zinc-500 whitespace-nowrap">
          On hover:
        </span>
        <button
          type="button"
          role="radio"
          aria-checked={mode === "full"}
          onClick={() => onChange("full")}
          className={`rounded-full px-2.5 py-1 text-[11px] whitespace-nowrap transition-colors ${
            mode === "full"
              ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
              : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
          }`}
        >
          happinesses
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={mode === "name"}
          onClick={() => onChange("name")}
          className={`rounded-full px-2.5 py-1 text-[11px] whitespace-nowrap transition-colors ${
            mode === "name"
              ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
              : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
          }`}
        >
          just names
        </button>
      </div>
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
    // Highlight the matching feed card if it's visible, but don't scroll —
    // the map is the main view, the page should stay put.
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
        {/* feed-toggle caret pinned to the top-right corner of the map so it
            stays visible regardless of scroll position or feed state */}
        <button
          type="button"
          onClick={() => setFeedHidden((v) => !v)}
          aria-label={feedHidden ? "Show feed" : "Hide feed"}
          title={feedHidden ? "Show feed" : "Hide feed"}
          className="hidden lg:flex absolute top-3 right-3 h-8 w-8 items-center justify-center rounded-full border border-zinc-300 dark:border-zinc-700 bg-white/95 dark:bg-zinc-900/95 text-zinc-700 dark:text-zinc-200 shadow-md hover:bg-white dark:hover:bg-zinc-800 z-30 backdrop-blur"
        >
          {feedHidden ? (
            <ChevronLeft className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>
        <div className="mt-3 flex justify-center items-center gap-2">
          <HoverModeToggle mode={hoverMode} onChange={setHoverMode} />
          <ThemeToggle />
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
