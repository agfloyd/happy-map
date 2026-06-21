"use client";

// Runtime loader for the tintable peep SVGs. The processed files live in
// public/peeps/ (~27KB each), so we fetch the inner markup on demand and cache
// it module-wide — shared by the avatar picker, the feed, and the map, so each
// pose is fetched at most once per session.

import { useEffect, useState } from "react";
import { peepUrl } from "@/lib/avatars";

// Re-export so callers can get dimensions without another import.
export { peepMeta } from "@/lib/peeps.generated";

const cache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();

function extractInner(svg: string): string {
  const m = svg.match(/<svg\b[^>]*>([\s\S]*)<\/svg>/i);
  return m ? m[1] : "";
}

export async function loadPeepInner(avatarId: string): Promise<string> {
  const hit = cache.get(avatarId);
  if (hit !== undefined) return hit;
  const pending = inflight.get(avatarId);
  if (pending) return pending;

  const p = fetch(peepUrl(avatarId))
    .then((r) => (r.ok ? r.text() : ""))
    .then((text) => {
      const inner = extractInner(text);
      cache.set(avatarId, inner);
      inflight.delete(avatarId);
      return inner;
    })
    .catch(() => {
      cache.set(avatarId, "");
      inflight.delete(avatarId);
      return "";
    });
  inflight.set(avatarId, p);
  return p;
}

/** Hook: returns the inner SVG markup for a peep (or null until loaded). */
export function usePeepInner(avatarId: string | null | undefined): string | null {
  const [inner, setInner] = useState<string | null>(
    avatarId ? cache.get(avatarId) ?? null : null,
  );
  useEffect(() => {
    if (!avatarId) {
      setInner(null);
      return;
    }
    const hit = cache.get(avatarId);
    if (hit !== undefined) {
      setInner(hit);
      return;
    }
    let active = true;
    loadPeepInner(avatarId).then((v) => {
      if (active) setInner(v);
    });
    return () => {
      active = false;
    };
  }, [avatarId]);
  return inner;
}
