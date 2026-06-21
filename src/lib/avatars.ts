// Avatar logic shared by the picker, the feed, the map, and the server.
//
// An avatar is a (pose, colour) pair: an OpenPeeps figure id from
// peeps.generated.ts + an ink colour from the person palette. Rows without an
// explicit choice fall back to a deterministic default derived from the
// contributor name, so the map looks varied even before anyone picks.

import { PEEP_IDS } from "@/lib/peeps.generated";
import { PERSON_COLORS, ANONYMOUS_COLOR } from "@/lib/figure-style";

export type Avatar = { avatarId: string; avatarColor: string };

// ---- deterministic hashing (FNV-1a, matches the map's personColor) ----------

function hashStr(s: string): number {
  let hash = 2166136261;
  for (let i = 0; i < s.length; i++) {
    hash ^= s.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

// Small seeded PRNG so a person's "deck" is stable per identity but differs
// between people (→ a diverse map overall).
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable identity key for a contributor (name, falling back to id). */
export function avatarKey(h: {
  contributor_name?: string | null;
  contributor_id?: string | null;
  is_anonymous?: boolean | null;
  id?: string;
}): string {
  if (!h.is_anonymous && h.contributor_name) {
    return `name:${h.contributor_name.trim().toLowerCase()}`;
  }
  if (h.contributor_id) return `id:${h.contributor_id}`;
  return `row:${h.id ?? ""}`;
}

/** Deterministic default avatar for an identity key. */
export function defaultAvatar(key: string, isAnonymous = false): Avatar {
  const hash = hashStr(key || "anon");
  const avatarId = PEEP_IDS[hash % PEEP_IDS.length];
  const avatarColor = isAnonymous
    ? ANONYMOUS_COLOR
    : PERSON_COLORS[(hash >>> 8) % PERSON_COLORS.length];
  return { avatarId, avatarColor };
}

/** Resolve a happiness row to the avatar it should render with. */
export function resolveAvatar(h: {
  avatar_id?: string | null;
  avatar_color?: string | null;
  contributor_name?: string | null;
  contributor_id?: string | null;
  is_anonymous?: boolean | null;
  id?: string;
}): Avatar {
  const fallback = defaultAvatar(avatarKey(h), !!h.is_anonymous);
  return {
    avatarId: h.avatar_id || fallback.avatarId,
    avatarColor: h.avatar_color || fallback.avatarColor,
  };
}

/**
 * A finite, shuffled "deck" of distinct (pose, colour) options for one person.
 * The person's current/default avatar is guaranteed first and highlighted;
 * the rest are a seeded sample so different people see different options.
 */
export function avatarDeck(key: string, current: Avatar, size = 20): Avatar[] {
  const rand = mulberry32(hashStr(key) ^ 0x9e3779b9);
  const seen = new Set<string>([`${current.avatarId}|${current.avatarColor}`]);
  const deck: Avatar[] = [{ ...current }];

  let guard = 0;
  while (deck.length < size && guard < size * 50) {
    guard++;
    const avatarId = PEEP_IDS[Math.floor(rand() * PEEP_IDS.length)];
    const avatarColor = PERSON_COLORS[Math.floor(rand() * PERSON_COLORS.length)];
    const k = `${avatarId}|${avatarColor}`;
    if (seen.has(k)) continue;
    seen.add(k);
    deck.push({ avatarId, avatarColor });
  }
  return deck;
}

/** URL for the processed (tintable) peep SVG. */
export function peepUrl(avatarId: string): string {
  return `/peeps/${avatarId}.svg`;
}
