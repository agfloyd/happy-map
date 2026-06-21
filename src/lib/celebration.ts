import { supabaseAdmin } from "@/lib/supabase-admin";
import { titleCase } from "@/lib/figure-style";

/**
 * Celebration payload — the shared "social proof" data computed for a single
 * happy moment, consumed by the WhatsApp reply, the Signal group announcer,
 * and the figure-image card.
 *
 * One source of truth so the message wording stays identical across channels.
 */

export type CelebrationNeighbor = {
  /** null => render as "an anonymous person" */
  name: string | null;
  /** short gist, e.g. "an encounter with a cat"; may be null */
  summary: string | null;
  /** whole days since the neighbour's moment */
  daysAgo: number;
};

export type CelebrationPayload = {
  happinessId: string;
  /** null when anonymous */
  contributorName: string | null;
  isAnonymous: boolean;
  /** raw theme, e.g. "serendipity" */
  theme: string | null;
  /** e.g. "Serendipity Island" */
  islandName: string | null;
  subtheme: string | null;
  summary: string | null;
  /** 1-based: nth distinct person to land on this theme */
  themeOrdinal: number;
  /** rows sharing this subtheme (incl. this one) */
  subthemeMentionCount: number;
  nearest: CelebrationNeighbor | null;
  /** ink colour for this contributor's figure (matches the map) */
  figureColorHex: string;
  /** PNG card URL for this moment */
  figureImageUrl?: string;
};

// ---------------------------------------------------------------------------
// Figure colour — kept in lockstep with personColor() in ClusterMap.tsx so a
// person's celebration colour matches their figure on the map.
// ---------------------------------------------------------------------------

const PERSON_COLORS = [
  "#2d3748",
  "#7c2d2d",
  "#1e3a8a",
  "#3f6212",
  "#581c87",
  "#7c2d12",
  "#134e4a",
  "#3f3f46",
  "#831843",
  "#1e4258",
  "#854d0e",
  "#4c1d95",
];
const ANONYMOUS_COLOR = "#52525b";

export function figureColor(h: {
  contributor_name: string | null;
  is_anonymous: boolean;
  contributor_id: string | null;
}): string {
  if (h.is_anonymous) return ANONYMOUS_COLOR;
  const key = (h.contributor_name || h.contributor_id || "").trim().toLowerCase();
  if (!key) return ANONYMOUS_COLOR;
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return PERSON_COLORS[(hash >>> 0) % PERSON_COLORS.length];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function siteBase(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/+$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "https://happy-map-psi.vercel.app";
}

export function islandNameForTheme(theme: string | null): string | null {
  if (!theme) return null;
  return `${titleCase(theme)} Island`;
}

function ordinalSuffix(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/** A stable identity key for de-duping a person across rows. */
function contributorKey(h: {
  contributor_id: string | null;
  contributor_name: string | null;
  is_anonymous: boolean;
  id: string;
}): string {
  if (h.contributor_id) return `id:${h.contributor_id}`;
  if (!h.is_anonymous && h.contributor_name) {
    return `name:${h.contributor_name.trim().toLowerCase()}`;
  }
  // Anonymous / nameless rows each count as their own person.
  return `row:${h.id}`;
}

function daysBetween(fromIso: string, to = Date.now()): number {
  return Math.max(0, Math.floor((to - new Date(fromIso).getTime()) / 86_400_000));
}

type Row = {
  id: string;
  content: string | null;
  contributor_id: string | null;
  contributor_name: string | null;
  is_anonymous: boolean;
  theme: string | null;
  subtheme: string | null;
  summary: string | null;
  agency_score: number | null;
  time_score: number | null;
  created_at: string;
};

const ROW_COLS =
  "id, content, contributor_id, contributor_name, is_anonymous, theme, subtheme, summary, agency_score, time_score, created_at";

/**
 * Build the celebration payload for a freshly-tagged happiness. Returns null if
 * the row can't be found. Safe to call before tagging completes — fields that
 * depend on the theme just come back null/0 in that case (caller should run
 * this after tagging for the rich version).
 */
export async function buildCelebrationPayload(
  happinessId: string,
): Promise<CelebrationPayload | null> {
  const { data: me, error } = await supabaseAdmin
    .from("happinesses")
    .select(ROW_COLS)
    .eq("id", happinessId)
    .maybeSingle<Row>();

  if (error) console.error("[celebration] lookup failed", error);
  if (!me) return null;

  const isAnonymous = me.is_anonymous;
  const contributorName = isAnonymous ? null : me.contributor_name;

  let themeOrdinal = 1;
  let subthemeMentionCount = 1;
  let nearest: CelebrationNeighbor | null = null;

  if (me.theme) {
    // Pull every row on this island; the dataset is small enough to scan.
    const { data: islandRows } = await supabaseAdmin
      .from("happinesses")
      .select(ROW_COLS)
      .eq("theme", me.theme)
      .order("created_at", { ascending: true })
      .returns<Row[]>();

    const rows = islandRows ?? [me];

    // themeOrdinal: how many distinct people had landed here up to & incl. me.
    const meCreated = new Date(me.created_at).getTime();
    const seen = new Set<string>();
    const myKey = contributorKey(me);
    for (const r of rows) {
      if (new Date(r.created_at).getTime() > meCreated) continue;
      seen.add(contributorKey(r));
    }
    seen.add(myKey);
    themeOrdinal = seen.size;

    // subthemeMentionCount: rows sharing my subtheme (incl. me).
    if (me.subtheme) {
      const sub = me.subtheme.trim().toLowerCase();
      subthemeMentionCount = rows.filter(
        (r) => (r.subtheme || "").trim().toLowerCase() === sub,
      ).length;
      if (subthemeMentionCount < 1) subthemeMentionCount = 1;
    }

    // nearest neighbour on the island by (agency, time) distance, excl. me.
    nearest = pickNearest(me, rows.filter((r) => r.id !== me.id));
  }

  return {
    happinessId: me.id,
    contributorName,
    isAnonymous,
    theme: me.theme,
    islandName: islandNameForTheme(me.theme),
    subtheme: me.subtheme,
    summary: me.summary,
    themeOrdinal,
    subthemeMentionCount,
    nearest,
    figureColorHex: figureColor(me),
    figureImageUrl: `${siteBase()}/api/figure-image?id=${encodeURIComponent(me.id)}`,
  };
}

function pickNearest(me: Row, others: Row[]): CelebrationNeighbor | null {
  if (me.agency_score == null || me.time_score == null) {
    // No coordinates yet — fall back to the most recent islandmate.
    const recent = others
      .filter((r) => r.created_at < me.created_at)
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];
    return recent ? toNeighbor(recent) : null;
  }
  let best: Row | null = null;
  let bestD = Infinity;
  for (const r of others) {
    if (r.agency_score == null || r.time_score == null) continue;
    const da = r.agency_score - me.agency_score;
    const dt = r.time_score - me.time_score;
    const d = da * da + dt * dt;
    if (d < bestD) {
      bestD = d;
      best = r;
    }
  }
  return best ? toNeighbor(best) : null;
}

function toNeighbor(r: Row): CelebrationNeighbor {
  const name = r.is_anonymous ? null : r.contributor_name;
  return {
    name,
    summary: r.summary || r.content,
    daysAgo: daysBetween(r.created_at),
  };
}

// ---------------------------------------------------------------------------
// Message text — one wording, used by every channel.
// ---------------------------------------------------------------------------

function whenPhrase(daysAgo: number): string {
  if (daysAgo <= 0) return "earlier today";
  if (daysAgo === 1) return "yesterday";
  return `${daysAgo} days ago`;
}

function neighborPhrase(n: CelebrationNeighbor): string {
  // Summaries are short verb/noun phrases ("made strawberry lemonade") — quote
  // them so they read cleanly without forcing a possessive.
  const who = n.name ? n.name : "an anonymous person";
  const when = whenPhrase(n.daysAgo);
  return n.summary ? `${who}, ${when} — “${n.summary}”` : `${who}, ${when}`;
}

/**
 * The celebratory message announced to the group / replied to the contributor.
 * Channel-agnostic plain text (works for WhatsApp and Signal).
 */
export function renderCelebrationText(p: CelebrationPayload): string {
  const island = p.islandName || "the map";
  const ord = ordinalSuffix(p.themeOrdinal);

  const lines: string[] = [];

  if (p.contributorName) {
    if (p.themeOrdinal <= 1) {
      lines.push(`✨ ${p.contributorName} just planted the first flag on ${island}!`);
    } else {
      lines.push(
        `✨ Lovely, ${p.contributorName} — you're the ${ord} person to land on ${island}.`,
      );
    }
  } else {
    if (p.themeOrdinal <= 1) {
      lines.push(`✨ Someone just planted the first flag on ${island}!`);
    } else {
      lines.push(`✨ Someone just landed on ${island} — the ${ord} person there.`);
    }
  }

  if (p.subtheme && p.subthemeMentionCount > 1) {
    lines.push(
      `That's ${p.subthemeMentionCount} of us who've felt the joy of ${p.subtheme} 💛`,
    );
  }

  if (p.nearest) {
    lines.push(`Your closest neighbour there: ${neighborPhrase(p.nearest)}.`);
  }

  return lines.join("\n");
}
