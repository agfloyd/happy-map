"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Happiness } from "@/lib/types";
import { ClusterMap } from "@/components/ClusterMap";
import { Feed } from "@/components/Feed";
import { HappinessForm } from "@/components/HappinessForm";

export function HomeView({ initial }: { initial: Happiness[] }) {
  const [items, setItems] = useState<Happiness[]>(initial);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
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
    const el = document.getElementById(`feed-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
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
    <div className="grid gap-4 lg:gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0">
        <ClusterMap
          items={items}
          onSelect={handleSelect}
          highlightedId={highlightedId}
        />
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
  );
}
