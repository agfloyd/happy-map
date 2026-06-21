"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Happiness } from "@/lib/types";
import { ActivityTicker } from "@/components/ActivityTicker";
import { ClusterMap, type HoverMode } from "@/components/ClusterMap";
import { Feed } from "@/components/Feed";
import { HappinessForm } from "@/components/HappinessForm";
import { ThemeToggle } from "@/components/ThemeToggle";

function MouseIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="currentColor"
      strokeWidth={1.2}
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M4 3 L4 19.5 L9 15 L11.6 21 L14 20 L11.4 14 L17.5 14 Z" />
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

  // `items` is kept newest-first (server query orders desc, realtime inserts
  // unshift), so the head is the newest landing and length is the total.
  const newest = items[0] ?? null;
  const total = items.length;

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


  // Full-bleed mode: the map is the entire viewport, every control floats on
  // top of it. Title overlay top-left, theme/hover/show-feed cluster
  // top-right, zoom controls bottom-left, compass bottom-right (positioned
  // inside ClusterMap with breathing room from the corners).
  if (feedHidden) {
    return (
      <main className="fixed inset-0 z-40 overflow-hidden">
        <ClusterMap
          items={items}
          onSelect={handleSelect}
          highlightedId={highlightedId}
          hoverMode={hoverMode}
          fullBleed
        />
        <div className="pointer-events-none fixed top-5 left-6 z-50 select-none">
          <h1
            className="text-3xl sm:text-4xl font-bold tracking-wide text-white"
            style={{
              fontFamily: "var(--font-fredoka)",
              textShadow:
                "0 1px 2px rgba(0,0,0,0.7), -1px -1px 0 rgba(0,0,0,0.55), 1px -1px 0 rgba(0,0,0,0.55), -1px 1px 0 rgba(0,0,0,0.55), 1px 1px 0 rgba(0,0,0,0.55)",
            }}
          >
            Happy Map
          </h1>
          <p
            className="mt-1 text-sm sm:text-base text-white"
            style={{
              fontFamily: "var(--font-fredoka)",
              textShadow:
                "0 1px 2px rgba(0,0,0,0.7), -1px -1px 0 rgba(0,0,0,0.55), 1px -1px 0 rgba(0,0,0,0.55), -1px 1px 0 rgba(0,0,0,0.55), 1px 1px 0 rgba(0,0,0,0.55)",
            }}
          >
            text <span className="font-bold">join zoo-swam</span> to{" "}
            <a
              href="https://wa.me/14155238886?text=join%20zoo-swam"
              target="_blank"
              rel="noopener noreferrer"
              className="pointer-events-auto underline decoration-white/60 underline-offset-2 hover:decoration-white"
            >
              +1 415 523 8886
            </a>{" "}
            on WhatsApp
          </p>
        </div>
        <div className="pointer-events-none fixed top-5 left-1/2 z-50 -translate-x-1/2 px-4 max-w-[calc(100%-2rem)]">
          <ActivityTicker count={total} newest={newest} />
        </div>
        <div className="fixed top-5 right-6 z-50 flex items-center gap-2">
          <ThemeToggle />
          <HoverModeToggle mode={hoverMode} onChange={setHoverMode} />
          <button
            type="button"
            onClick={() => setFeedHidden(false)}
            aria-label="Show feed"
            title="Show feed"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-zinc-300 dark:border-zinc-700 bg-white/95 dark:bg-zinc-900/95 text-zinc-700 dark:text-zinc-200 shadow-md hover:bg-white dark:hover:bg-zinc-800 backdrop-blur"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="w-full py-6 sm:py-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 mb-6">
        <header>
          <h1
            className="text-3xl sm:text-4xl font-bold tracking-wide"
            style={{ fontFamily: "var(--font-fredoka)" }}
          >
            Happy Map
          </h1>
          <p
            className="mt-1 text-sm text-zinc-600 dark:text-zinc-400"
            style={{ fontFamily: "var(--font-fredoka)" }}
          >
            text <span className="font-bold">join zoo-swam</span> to{" "}
            <a
              href="https://wa.me/14155238886?text=join%20zoo-swam"
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-zinc-400 dark:decoration-zinc-600 underline-offset-2 hover:decoration-zinc-700 dark:hover:decoration-zinc-300"
            >
              +1 415 523 8886
            </a>{" "}
            on WhatsApp
          </p>
        </header>
        <div className="mt-4">
          <ActivityTicker count={total} newest={newest} />
        </div>
      </div>
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="grid gap-4 lg:gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0 relative">
            <ClusterMap
              items={items}
              onSelect={handleSelect}
              highlightedId={highlightedId}
              hoverMode={hoverMode}
            />
            <button
              type="button"
              onClick={() => setFeedHidden(true)}
              aria-label="Hide feed"
              title="Hide feed"
              className="hidden lg:flex absolute top-3 right-3 h-8 w-8 items-center justify-center rounded-full border border-zinc-300 dark:border-zinc-700 bg-white/95 dark:bg-zinc-900/95 text-zinc-700 dark:text-zinc-200 shadow-md hover:bg-white dark:hover:bg-zinc-800 z-30 backdrop-blur"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <div className="mt-3 flex justify-center items-center gap-2">
              <ThemeToggle />
              <HoverModeToggle mode={hoverMode} onChange={setHoverMode} />
            </div>
          </div>
          <aside className="space-y-4 min-w-0">
            <HappinessForm />
            <section>
              <h2 className="text-[11px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-500 mb-2 px-1">
                Recent moments
              </h2>
              <Feed items={items} highlightedId={highlightedId} />
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}
