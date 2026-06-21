// Shared visual constants for the cluster map AND the server-rendered figure
// card. These values are intentionally a verbatim copy of the constants and
// helpers in `src/components/ClusterMap.tsx` so that a person's card figure
// uses the exact same ink color as their figure on the map, and a theme's
// card background tint matches its continent color. ClusterMap.tsx is a client
// component; duplicating the pure values here keeps this module importable from
// server routes without dragging client-only code along.

// Theme -> continent color (verbatim from ClusterMap.tsx THEME_COLORS).
export const THEME_COLORS: Record<string, string> = {
  family: "#d4a574", // warm tan
  "friends and social": "#f4a261", // peach
  love: "#e89bb1", // rose
  children: "#efb198", // soft coral
  "personal growth": "#8ab87a", // sage green
  "career and work": "#94a3c2", // slate blue
  education: "#b08fc7", // soft purple
  "hobbies and creation": "#f1d57c", // golden yellow
  leisure: "#88c7c3", // teal
  "sensory pleasure": "#c8b6e2", // lilac
  "domestic maintenance": "#c5b9a4", // dusty olive
  "material acquisition": "#7fb8d4", // sky blue
  serendipity: "#d9e08a", // chartreuse (lucky-find color)
};

export const OCEAN_COLOR = "#94c1de";

// Per-person ink palette (verbatim from ClusterMap.tsx PERSON_COLORS).
export const PERSON_COLORS = [
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

export const ANONYMOUS_COLOR = "#52525b";

// Stable per-person color hash. Verbatim from ClusterMap.tsx personColor():
// FNV-1a over the lowercased name (falling back to id), modulo the palette
// length. Keep identical so card and map agree.
export function personColor(h: {
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

// Small joiner words stay lowercase in title-case (verbatim from ClusterMap).
const TITLE_CASE_LOWER = new Set(["and", "or", "of", "the", "a", "an", "to"]);

export function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .map((w, i) => {
      if (!w) return w;
      const lower = w.toLowerCase();
      if (i > 0 && TITLE_CASE_LOWER.has(lower)) return lower;
      return w[0].toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(" ");
}

// Display name fallback. The map shows "Anonymous"; the card prose reads
// "an anonymous person" per the route spec.
export function cardDisplayName(h: {
  contributor_name: string | null;
  is_anonymous: boolean;
}): string {
  if (h.is_anonymous || !h.contributor_name) return "an anonymous person";
  return h.contributor_name;
}
