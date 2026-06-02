"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Delaunay } from "d3-delaunay";
import type { Happiness } from "@/lib/types";

const WIDTH = 600;
const HEIGHT = 400;
const ATOM_COUNT = 1500;
// Per-figure influence radius for the land-claim score. Each figure
// contributes (R − d)² to its theme's score at every atom inside R. The
// theme with the highest summed score claims the atom. Bigger = larger
// continents that bridge across loosely-packed members.
// Max distance from an atom to any of its claimed theme's members. Beyond
// this, no theme can claim the atom — it becomes ocean. Sets the overall
// reach of each continent past its figure cluster.
const REGION_REACH = 95;
const FIGURE_HEIGHT = 14;
const HIT_RADIUS = 14;
const MARGIN_X = 60;
const MARGIN_Y = 48;
const EDGE_OCEAN_BAND = 28;
// Waterway pass: an atom claimed by theme T becomes ocean if at least
// MIN_DIFFERENT_NEIGHBOURS of its Voronoi neighbours are claimed by some
// OTHER theme. Higher = continents touch more directly with less water;
// lower = wider water strips between continents.
const MIN_DIFFERENT_NEIGHBOURS = 2;
// When a figure's raw (agency, time) position lands inside another theme's
// continent (or on a waterway), snap it to the nearest atom of its OWN
// theme — within this max displacement. Outliers beyond this stay put.
const MAX_SNAP_DIST = 120;

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 1.5;

// Zoom thresholds for label visibility
const CONTINENT_FADE_START = 1.7;
const CONTINENT_FADE_END = 2.4;
const SUBTHEME_FADE_START = 1.4;
const SUBTHEME_FADE_END = 2.0;

const THEME_COLORS: Record<string, string> = {
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

const OCEAN_COLOR = "#94c1de";

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

const CONTINENT_LABEL_COLOR = "#ffffff";
const SUBTHEME_LABEL_COLOR = "#fde68a"; // soft yellow

export type HoverMode = "full" | "name";

function personColor(h: {
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

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function jitterHex(hex: string, delta: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const factor = 1 + delta * 0.16;
  const clip = (v: number) => Math.max(0, Math.min(255, Math.round(v * factor)));
  return `#${clip(r).toString(16).padStart(2, "0")}${clip(g)
    .toString(16)
    .padStart(2, "0")}${clip(b).toString(16).padStart(2, "0")}`;
}

function idJitter(id: string): [number, number] {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const a = ((h >>> 0) % 1000) / 1000;
  const b = (((h >>> 10) >>> 0) % 1000) / 1000;
  return [(a - 0.5) * 8, (b - 0.5) * 8];
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function clampPan(x: number, y: number, z: number) {
  const maxX = WIDTH - WIDTH / z;
  const maxY = HEIGHT - HEIGHT / z;
  return {
    x: clamp(x, 0, Math.max(0, maxX)),
    y: clamp(y, 0, Math.max(0, maxY)),
  };
}

type Placed = {
  h: Happiness;
  x: number;
  y: number;
};

function Figure({
  placed,
  highlighted,
  figureScale,
  onEnter,
  onLeave,
  onSelect,
}: {
  placed: Placed;
  highlighted: boolean;
  figureScale: number;
  onEnter: () => void;
  onLeave: () => void;
  onSelect: (e: React.MouseEvent) => void;
}) {
  const { x, y } = placed;
  const baseFill = personColor(placed.h);
  const fill = highlighted ? jitterHex(baseFill, -0.45) : baseFill;
  const headR = highlighted ? 3.0 : 2.6;
  // Scale around the figure's feet (which sit at SVG coord y). This makes
  // figures grow sub-linearly with zoom — they get bigger as you zoom in,
  // but more slowly than the viewBox does, so more land shows vs people.
  return (
    <g
      transform={`translate(${x},${y}) scale(${figureScale}) translate(0,${-FIGURE_HEIGHT})`}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onClick={onSelect}
      style={{ cursor: "pointer" }}
    >
      <circle cx={0} cy={7} r={HIT_RADIUS} fill="transparent" />
      <ellipse cx={0} cy={FIGURE_HEIGHT + 0.5} rx={3.2} ry={0.9} fill="rgba(0,0,0,0.18)" />
      <circle cx={0} cy={2.5} r={headR} fill={fill} />
      <path
        d={`M -3 5 L 3 5 L 2.2 ${FIGURE_HEIGHT} L -2.2 ${FIGURE_HEIGHT} Z`}
        fill={fill}
      />
    </g>
  );
}

function displayName(h: Happiness): string {
  return h.is_anonymous ? "Anonymous" : h.contributor_name || "Anonymous";
}

function PopoverCard({ h, variant }: { h: Happiness; variant: "full" | "name" }) {
  if (variant === "name") {
    return (
      <div className="rounded-md bg-zinc-900/95 text-white px-2.5 py-1 text-[11px] shadow-lg">
        {displayName(h)}
      </div>
    );
  }
  const contentText =
    h.content ??
    (h.voice_note_url
      ? h.transcribed === false
        ? "Transcribing voice note…"
        : "voice note"
      : "moment");
  return (
    <div className="rounded-md bg-zinc-900/95 text-white shadow-lg w-[280px] overflow-hidden">
      {h.photo_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={h.photo_url}
          alt=""
          loading="lazy"
          className="block w-full h-auto"
        />
      )}
      <div className="px-2.5 py-1.5 text-[12px] leading-snug whitespace-normal break-words">
        <div className={h.transcribed ? "italic" : undefined}>
          {h.transcribed && <span className="not-italic mr-1">🎙️</span>}
          {contentText}
        </div>
        <div className="mt-1 text-[10px] text-zinc-300">
          {displayName(h)}
          {h.theme ? ` · ${h.theme}` : ""}
        </div>
      </div>
    </div>
  );
}

function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function ChevronPlus() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" className="h-4 w-4" aria-hidden>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function ChevronMinus() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" className="h-4 w-4" aria-hidden>
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

export function ClusterMap({
  items,
  onSelect,
  highlightedId,
  hoverMode = "full",
}: {
  items: Happiness[];
  onSelect?: (id: string) => void;
  highlightedId?: string | null;
  hoverMode?: HoverMode;
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    panX: number;
    panY: number;
    moved: boolean;
  } | null>(null);
  const animRef = useRef<number | null>(null);

  // Cancel any in-flight zoom animation on unmount.
  useEffect(() => {
    return () => {
      if (animRef.current !== null) cancelAnimationFrame(animRef.current);
    };
  }, []);

  const placed: Placed[] = useMemo(
    () =>
      items
        .filter(
          (h) =>
            !!h.theme &&
            h.time_score !== null &&
            h.agency_score !== null
        )
        .map((h) => {
          const [jx, jy] = idJitter(h.id);
          const innerW = WIDTH - 2 * MARGIN_X;
          const innerH = HEIGHT - 2 * MARGIN_Y;
          const rawX = MARGIN_X + (h.time_score as number) * innerW + jx;
          const rawY =
            MARGIN_Y + (1 - (h.agency_score as number)) * innerH + jy;
          return {
            h,
            x: clamp(rawX, MARGIN_X, WIDTH - MARGIN_X),
            y: clamp(rawY, MARGIN_Y, HEIGHT - MARGIN_Y),
          };
        }),
    [items]
  );

  const atoms = useMemo(() => {
    const rand = mulberry32(12345);
    const pts: [number, number][] = [];
    for (let i = 0; i < ATOM_COUNT; i++) {
      pts.push([rand() * WIDTH, rand() * HEIGHT]);
    }
    return pts;
  }, []);

  const { cellPaths, atomThemes } = useMemo(() => {
    const delaunay = Delaunay.from(atoms);
    const voronoi = delaunay.voronoi([0, 0, WIDTH, HEIGHT]);
    const rand = mulberry32(54321);
    const REACH2 = REGION_REACH * REGION_REACH;

    // Group members by theme.
    const themeMembers = new Map<string, Placed[]>();
    for (const p of placed) {
      const t = p.h.theme as string;
      if (!themeMembers.has(t)) themeMembers.set(t, []);
      themeMembers.get(t)!.push(p);
    }
    const themeKeys = Array.from(themeMembers.keys()).sort();

    // For each member, find the atom it sits inside (nearest atom). Used to
    // check whether a member has been "reached" by its theme's region.
    const memberAtomIdx = new Map<string, number>();
    for (const p of placed) {
      let bestIdx = 0;
      let bestD2 = Infinity;
      for (let i = 0; i < atoms.length; i++) {
        const dx = atoms[i][0] - p.x;
        const dy = atoms[i][1] - p.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestD2) {
          bestD2 = d2;
          bestIdx = i;
        }
      }
      memberAtomIdx.set(p.h.id, bestIdx);
    }

    const inEdgeBand = (ax: number, ay: number) =>
      ax < EDGE_OCEAN_BAND ||
      ax > WIDTH - EDGE_OCEAN_BAND ||
      ay < EDGE_OCEAN_BAND ||
      ay > HEIGHT - EDGE_OCEAN_BAND;

    // Seed each theme at the atom containing its most-central member (the
    // member closest to the theme centroid). Seeding at a member atom
    // guarantees the seed is within REGION_REACH of itself, even when the
    // theme's members are spread across the map.
    const atomTheme: (string | null)[] = new Array(atoms.length).fill(null);
    const frontiers = new Map<string, Set<number>>();
    for (const t of themeKeys) frontiers.set(t, new Set<number>());

    for (const t of themeKeys) {
      const members = themeMembers.get(t)!;
      const cx = members.reduce((s, m) => s + m.x, 0) / members.length;
      const cy = members.reduce((s, m) => s + m.y, 0) / members.length;
      let centralMember = members[0];
      let bestMemberD2 = Infinity;
      for (const m of members) {
        const dx = m.x - cx;
        const dy = m.y - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestMemberD2) {
          bestMemberD2 = d2;
          centralMember = m;
        }
      }
      const seedIdx = memberAtomIdx.get(centralMember.h.id)!;
      atomTheme[seedIdx] = t;
      for (const n of voronoi.neighbors(seedIdx)) {
        if (atomTheme[n] === null && !inEdgeBand(atoms[n][0], atoms[n][1])) {
          frontiers.get(t)!.add(n);
        }
      }
    }

    // Region-growing main loop with PROPORTIONAL scheduling. At each step
    // we pick the theme whose atoms-per-member ratio is currently smallest
    // (i.e. the theme that's most behind in growth relative to its size),
    // then expand IT by one atom — claiming the frontier atom closest to
    // any of its members. This stops tightly-clustered or spread-out big
    // themes from monopolising the grow phase and starving the small ones.
    const claimedCount = new Map<string, number>();
    for (const t of themeKeys) claimedCount.set(t, 1); // each seed atom

    while (true) {
      // Pick the theme that's most behind on growth.
      let scheduledTheme: string | null = null;
      let lowestRatio = Infinity;
      for (const t of themeKeys) {
        if (frontiers.get(t)!.size === 0) continue;
        const ratio = claimedCount.get(t)! / themeMembers.get(t)!.length;
        if (ratio < lowestRatio) {
          lowestRatio = ratio;
          scheduledTheme = t;
        }
      }
      if (scheduledTheme === null) break;

      // Pick the best frontier atom for this theme (closest to any member,
      // skipping atoms beyond REGION_REACH).
      const members = themeMembers.get(scheduledTheme)!;
      let bestAtom = -1;
      let bestNearestD2 = Infinity;
      for (const candidate of frontiers.get(scheduledTheme)!) {
        if (atomTheme[candidate] !== null) continue;
        const [ax, ay] = atoms[candidate];
        let nearestD2 = Infinity;
        for (const m of members) {
          const dx = m.x - ax;
          const dy = m.y - ay;
          const d2 = dx * dx + dy * dy;
          if (d2 < nearestD2) nearestD2 = d2;
        }
        if (nearestD2 > REACH2) continue;
        if (nearestD2 < bestNearestD2) {
          bestNearestD2 = nearestD2;
          bestAtom = candidate;
        }
      }
      if (bestAtom < 0) {
        // This theme has no claimable atoms in its frontier — drop its
        // frontier so the scheduler moves on. (Frontier atoms that are out
        // of reach will never become claimable for this theme.)
        frontiers.get(scheduledTheme)!.clear();
        continue;
      }

      atomTheme[bestAtom] = scheduledTheme;
      claimedCount.set(scheduledTheme, claimedCount.get(scheduledTheme)! + 1);
      for (const t of themeKeys) frontiers.get(t)!.delete(bestAtom);
      for (const n of voronoi.neighbors(bestAtom)) {
        if (
          atomTheme[n] === null &&
          !inEdgeBand(atoms[n][0], atoms[n][1])
        ) {
          frontiers.get(scheduledTheme)!.add(n);
        }
      }
    }

    // Waterway pass: any atom whose Voronoi cell touches at least
    // MIN_DIFFERENT_NEIGHBOURS cells of a different theme becomes ocean.
    // This carves the blue strips between continents that make Alvin's map
    // legible at a glance. Members are protected — the atom holding a
    // figure can't be turned into water, so figures never end up under
    // the boundary stripe.
    const memberAtomSet = new Set<number>(memberAtomIdx.values());
    const finalThemes: (string | null)[] = atomTheme.slice();
    for (let i = 0; i < atoms.length; i++) {
      const t = atomTheme[i];
      if (t === null) continue;
      if (memberAtomSet.has(i)) continue;
      let differentCount = 0;
      for (const n of voronoi.neighbors(i)) {
        const tn = atomTheme[n];
        if (tn !== null && tn !== t) differentCount++;
      }
      if (differentCount >= MIN_DIFFERENT_NEIGHBOURS) {
        finalThemes[i] = null;
      }
    }

    const paths: { d: string; color: string }[] = [];
    const themes: (string | null)[] = [];
    for (let i = 0; i < atoms.length; i++) {
      const polygon = voronoi.cellPolygon(i);
      if (!polygon) {
        themes.push(null);
        continue;
      }
      const themeKey = finalThemes[i];
      themes.push(themeKey);
      const baseColor = themeKey
        ? THEME_COLORS[themeKey] ?? OCEAN_COLOR
        : OCEAN_COLOR;
      const delta = (rand() - 0.5) * 2;
      const color = jitterHex(baseColor, themeKey ? delta : delta * 0.25);
      const path =
        polygon
          .map((p, idx) =>
            idx === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`
          )
          .join(" ") + "Z";
      paths.push({ d: path, color });
    }
    return { cellPaths: paths, atomThemes: themes };
  }, [atoms, placed]);

  // Snap each figure onto its own theme's land. Pure falloff above produces
  // clean continents, but a figure's raw (agency, time) position may land
  // inside a neighbouring theme's continent — especially in contested
  // regions. We pull each such figure to the nearest atom of its OWN theme,
  // capped at MAX_SNAP_DIST so distant outliers still read honestly.
  const placedSnapped: Placed[] = useMemo(() => {
    if (atomThemes.length === 0 || atoms.length === 0 || placed.length === 0) {
      return placed;
    }
    const MAX_SNAP_D2 = MAX_SNAP_DIST * MAX_SNAP_DIST;
    return placed.map((p) => {
      // First, which atom does this figure currently sit inside?
      let nearestAtomIdx = 0;
      let nearestD2 = Infinity;
      for (let i = 0; i < atoms.length; i++) {
        const dx = atoms[i][0] - p.x;
        const dy = atoms[i][1] - p.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < nearestD2) {
          nearestD2 = d2;
          nearestAtomIdx = i;
        }
      }
      // Already on its own theme's land? Leave it.
      if (atomThemes[nearestAtomIdx] === p.h.theme) {
        return p;
      }
      // Find the nearest atom that IS on this figure's theme, within reach.
      let bestIdx = -1;
      let bestD2 = MAX_SNAP_D2;
      for (let i = 0; i < atoms.length; i++) {
        if (atomThemes[i] !== p.h.theme) continue;
        const dx = atoms[i][0] - p.x;
        const dy = atoms[i][1] - p.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestD2) {
          bestD2 = d2;
          bestIdx = i;
        }
      }
      // No same-theme atom within MAX_SNAP_DIST → leave the outlier put.
      if (bestIdx < 0) return p;
      // Snap to the atom, with a small id-jitter so co-located snaps don't
      // pile exactly on top of each other.
      const [jx, jy] = idJitter(p.h.id);
      return {
        ...p,
        x: atoms[bestIdx][0] + jx * 0.4,
        y: atoms[bestIdx][1] + jy * 0.4,
      };
    });
  }, [placed, atoms, atomThemes]);

  // Continent labels — positioned at the ATOM centroid of each theme's
  // claimed land, not the figure centroid. This puts the label inside the
  // continent the user actually sees, even when the continent stretches far
  // from its members' raw (agency,time) positions.
  const continentLabels = useMemo(() => {
    type G = { sumX: number; sumY: number; atomCount: number; figureCount: number };
    const groups = new Map<string, G>();
    const ensure = (k: string): G => {
      let g = groups.get(k);
      if (!g) {
        g = { sumX: 0, sumY: 0, atomCount: 0, figureCount: 0 };
        groups.set(k, g);
      }
      return g;
    };
    for (let i = 0; i < atoms.length; i++) {
      const t = atomThemes[i];
      if (!t) continue;
      const [ax, ay] = atoms[i];
      const g = ensure(t);
      g.sumX += ax;
      g.sumY += ay;
      g.atomCount++;
    }
    for (const p of placed) {
      ensure(p.h.theme as string).figureCount++;
    }
    const raw: { key: string; label: string; x: number; y: number; count: number }[] = [];
    // Every theme with figures should be labeled — nearest-figure Voronoi
    // guarantees each one some land. Still skip themes whose continent is
    // so small that a label would be larger than the land it sits on.
    const MIN_ATOMS_FOR_LABEL = 5;
    for (const [t, g] of groups) {
      if (g.atomCount < MIN_ATOMS_FOR_LABEL) continue;
      raw.push({
        key: t,
        label: t.toUpperCase(),
        x: g.sumX / g.atomCount,
        y: g.sumY / g.atomCount,
        count: g.figureCount,
      });
    }
    // Collision avoidance: sort by figure count desc (priority) with an
    // alphabetical tiebreak so the same labels survive across refreshes.
    // For each label try the centroid first, then small vertical nudges in
    // each direction. If none fit, drop the label rather than stacking it.
    // MIN_X covers the rendered width of the longest labels ("MATERIAL
    // ACQUISITION", "HOBBIES AND CREATION") in SVG units so two long
    // neighbours never sit on the same row.
    const MIN_X = 140;
    const MIN_Y = 22;
    const Y_MIN = 16;
    const Y_MAX = HEIGHT - 16;
    // Keep labels horizontally inside the map; a label centroid that falls
    // right at the edge would clip half the text. ~90 SVG units covers the
    // half-width of the widest label ("MATERIAL ACQUISITION" etc.) at the
    // map's natural render scale.
    const X_PAD = 90;
    const sorted = [...raw].sort(
      (a, b) => b.count - a.count || a.key.localeCompare(b.key)
    );
    const out: typeof raw = [];
    for (const l of sorted) {
      const candidates: number[] = [l.y];
      for (let k = 1; k <= 6; k++) {
        candidates.push(l.y + k * MIN_Y, l.y - k * MIN_Y);
      }
      const x = clamp(l.x, X_PAD, WIDTH - X_PAD);
      let placedY: number | null = null;
      for (const cy of candidates) {
        if (cy < Y_MIN || cy > Y_MAX) continue;
        const collides = out.some(
          (p) => Math.abs(p.x - x) < MIN_X && Math.abs(p.y - cy) < MIN_Y
        );
        if (!collides) {
          placedY = cy;
          break;
        }
      }
      if (placedY !== null) {
        out.push({ ...l, x, y: placedY });
      }
    }
    return out;
  }, [atoms, atomThemes, placed]);

  const subthemeLabels = useMemo(() => {
    // Use SNAPPED positions so subtheme labels sit on the same continent as
    // the figures the user actually sees.
    const groups = new Map<string, Placed[]>();
    for (const p of placedSnapped) {
      if (!p.h.subtheme) continue;
      const k = `${p.h.theme}::${p.h.subtheme}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(p);
    }
    const out: { key: string; label: string; x: number; y: number; count: number }[] = [];
    for (const [k, ps] of groups) {
      // Only show subtheme labels with ≥2 happinesses, to avoid label spam
      if (ps.length < 2) continue;
      const sx = ps.reduce((a, p) => a + p.x, 0) / ps.length;
      const sy = ps.reduce((a, p) => a + p.y, 0) / ps.length;
      const subthemeText = (ps[0].h.subtheme || "").trim();
      out.push({
        key: k,
        label: titleCase(subthemeText),
        x: sx,
        y: sy,
        count: ps.length,
      });
    }
    return out;
  }, [placedSnapped]);

  const continentOpacity = clamp(
    (CONTINENT_FADE_END - zoom) / (CONTINENT_FADE_END - CONTINENT_FADE_START),
    0,
    1
  );
  const subthemeOpacity = clamp(
    (zoom - SUBTHEME_FADE_START) / (SUBTHEME_FADE_END - SUBTHEME_FADE_START),
    0,
    1
  );

  // Escape clears pin
  useEffect(() => {
    if (!pinnedId) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setPinnedId(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pinnedId]);

  const shownId = pinnedId ?? hoveredId;
  const shownPlaced = shownId ? placedSnapped.find((p) => p.h.id === shownId) : null;
  const popoverVariant: "full" | "name" =
    pinnedId === shownId ? "full" : hoverMode === "name" ? "name" : "full";

  // Translate an SVG-space point to overlay percentage (relative to container).
  function svgToScreenPct(x: number, y: number) {
    const viewW = WIDTH / zoom;
    const viewH = HEIGHT / zoom;
    return {
      xPct: ((x - pan.x) / viewW) * 100,
      yPct: ((y - pan.y) / viewH) * 100,
    };
  }

  // Animate zoom + pan smoothly from current state to a target. The
  // useMemo'd cells/labels don't recompute per frame; we just re-render
  // the SVG viewBox + overlay positions, which is cheap.
  function animateView(
    targetZoom: number,
    targetPan: { x: number; y: number },
    durationMs = 500
  ) {
    if (animRef.current !== null) cancelAnimationFrame(animRef.current);
    const startZoom = zoom;
    const startPan = { ...pan };
    const startTime = performance.now();

    function step(now: number) {
      const t = Math.min(1, (now - startTime) / durationMs);
      // ease-out cubic
      const e = 1 - Math.pow(1 - t, 3);
      const newZoom = startZoom + (targetZoom - startZoom) * e;
      const newPan = {
        x: startPan.x + (targetPan.x - startPan.x) * e,
        y: startPan.y + (targetPan.y - startPan.y) * e,
      };
      setZoom(newZoom);
      setPan(clampPan(newPan.x, newPan.y, newZoom));
      if (t < 1) {
        animRef.current = requestAnimationFrame(step);
      } else {
        animRef.current = null;
      }
    }
    animRef.current = requestAnimationFrame(step);
  }

  // Zoom centered on a focal SVG point (or map center if not provided).
  function zoomTo(newZoom: number, focalSvg?: { x: number; y: number }) {
    const clamped = clamp(newZoom, MIN_ZOOM, MAX_ZOOM);
    if (Math.abs(clamped - zoom) < 0.001) return;
    const fx = focalSvg?.x ?? pan.x + WIDTH / zoom / 2;
    const fy = focalSvg?.y ?? pan.y + HEIGHT / zoom / 2;
    const relX = (fx - pan.x) / (WIDTH / zoom);
    const relY = (fy - pan.y) / (HEIGHT / zoom);
    const targetPan = clampPan(
      fx - relX * (WIDTH / clamped),
      fy - relY * (HEIGHT / clamped),
      clamped
    );
    animateView(clamped, targetPan);
  }

  function resetView() {
    animateView(1, { x: 0, y: 0 });
  }

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    if (e.button !== 0) return;
    // If a zoom animation is in flight, cut it short so dragging feels instant.
    if (animRef.current !== null) {
      cancelAnimationFrame(animRef.current);
      animRef.current = null;
    }
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      panX: pan.x,
      panY: pan.y,
      moved: false,
    };
    (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!dragRef.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    if (!dragRef.current.moved && Math.hypot(dx, dy) > 3) {
      dragRef.current.moved = true;
    }
    if (!dragRef.current.moved) return;
    const svgDx = (dx / rect.width) * (WIDTH / zoom);
    const svgDy = (dy / rect.height) * (HEIGHT / zoom);
    setPan(
      clampPan(
        dragRef.current.panX - svgDx,
        dragRef.current.panY - svgDy,
        zoom
      )
    );
  }
  function onPointerUp(e: React.PointerEvent<SVGSVGElement>) {
    try {
      (e.currentTarget as SVGSVGElement).releasePointerCapture(e.pointerId);
    } catch {}
    dragRef.current = null;
  }

  function consumedClickFromDrag(): boolean {
    // If the user just dragged, suppress the click that fires on pointer-up.
    // dragRef is already cleared by onPointerUp; we rely on a brief flag.
    return false;
  }

  const viewBox = `${pan.x} ${pan.y} ${WIDTH / zoom} ${HEIGHT / zoom}`;
  // Figures grow as ~zoom^0.5 in screen px (instead of the zoom^1 the viewBox
  // implies). The counter-scale applied in SVG coords is therefore zoom^-0.5.
  const figureScale = Math.pow(1 / zoom, 0.5);
  // Effective figure height in SVG coords at the current zoom — used to
  // place the popover just above the head.
  const effectiveFigureHeight = FIGURE_HEIGHT * figureScale;

  // Selected place's screen position
  const popoverPos = shownPlaced
    ? svgToScreenPct(shownPlaced.x, shownPlaced.y)
    : null;
  const flipBelow = popoverPos ? popoverPos.yPct < 45 : false;
  const xAlign: "left" | "center" | "right" = popoverPos
    ? popoverPos.xPct < 22
      ? "left"
      : popoverPos.xPct > 78
      ? "right"
      : "center"
    : "center";
  const xTranslate =
    xAlign === "left" ? "0" : xAlign === "right" ? "-100%" : "-50%";

  return (
    <div
      ref={containerRef}
      className="relative w-full rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 shadow-sm"
      style={{ aspectRatio: `${WIDTH} / ${HEIGHT}` }}
    >
      <svg
        viewBox={viewBox}
        preserveAspectRatio="xMidYMid slice"
        className="block w-full h-full select-none"
        style={{
          background: OCEAN_COLOR,
          touchAction: "none",
          cursor: dragRef.current?.moved ? "grabbing" : "grab",
        }}
        onClick={() => {
          if (dragRef.current?.moved) return;
          setPinnedId(null);
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <defs>
          <filter id="paper-grain" x="0" y="0" width="100%" height="100%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.9"
              numOctaves="2"
              seed="7"
            />
            <feColorMatrix
              values="0 0 0 0 0
                      0 0 0 0 0
                      0 0 0 0 0
                      0 0 0 0.09 0"
            />
          </filter>
        </defs>
        {cellPaths.map((c, i) => (
          <path
            key={i}
            d={c.d}
            fill={c.color}
            stroke={c.color}
            strokeWidth={0.4}
          />
        ))}
        <rect
          x={0}
          y={0}
          width={WIDTH}
          height={HEIGHT}
          filter="url(#paper-grain)"
          pointerEvents="none"
        />
        {placedSnapped.map((p) => (
          <Figure
            key={p.h.id}
            placed={p}
            figureScale={figureScale}
            highlighted={
              hoveredId === p.h.id ||
              pinnedId === p.h.id ||
              highlightedId === p.h.id
            }
            onEnter={() => setHoveredId(p.h.id)}
            onLeave={() =>
              setHoveredId((cur) => (cur === p.h.id ? null : cur))
            }
            onSelect={(e) => {
              if (dragRef.current?.moved) return;
              e.stopPropagation();
              setPinnedId((cur) => (cur === p.h.id ? null : p.h.id));
              onSelect?.(p.h.id);
            }}
          />
        ))}
      </svg>

      {/* Continent labels (white caps, fade out on zoom-in) */}
      {continentOpacity > 0.01 && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {continentLabels.map((l) => {
            const { xPct, yPct } = svgToScreenPct(l.x, l.y);
            if (xPct < -10 || xPct > 110 || yPct < -10 || yPct > 110) return null;
            return (
              <div
                key={l.key}
                className="absolute -translate-x-1/2 -translate-y-1/2 text-[13px] sm:text-[15px] font-extrabold tracking-wider uppercase"
                style={{
                  left: `${xPct}%`,
                  top: `${yPct}%`,
                  color: CONTINENT_LABEL_COLOR,
                  opacity: continentOpacity,
                  textShadow:
                    "0 1px 2px rgba(0,0,0,0.7), -1px -1px 0 rgba(0,0,0,0.55), 1px -1px 0 rgba(0,0,0,0.55), -1px 1px 0 rgba(0,0,0,0.55), 1px 1px 0 rgba(0,0,0,0.55)",
                  transition: "opacity 200ms",
                }}
              >
                {l.label}
              </div>
            );
          })}
        </div>
      )}

      {/* Subtheme labels (yellow, fade in on zoom-in) */}
      {subthemeOpacity > 0.01 && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {subthemeLabels.map((l) => {
            const { xPct, yPct } = svgToScreenPct(l.x, l.y);
            if (xPct < -10 || xPct > 110 || yPct < -10 || yPct > 110) return null;
            return (
              <div
                key={l.key}
                className="absolute -translate-x-1/2 -translate-y-1/2 text-[11px] sm:text-[12px] font-semibold italic"
                style={{
                  left: `${xPct}%`,
                  top: `${yPct}%`,
                  color: SUBTHEME_LABEL_COLOR,
                  opacity: subthemeOpacity,
                  textShadow:
                    "0 1px 2px rgba(0,0,0,0.8), -1px -1px 0 rgba(40,30,0,0.7), 1px -1px 0 rgba(40,30,0,0.7), -1px 1px 0 rgba(40,30,0,0.7), 1px 1px 0 rgba(40,30,0,0.7)",
                  transition: "opacity 200ms",
                }}
              >
                {l.label}
              </div>
            );
          })}
        </div>
      )}

      {/* Popover */}
      {shownPlaced && popoverPos && (
        <div
          className="pointer-events-none absolute z-10"
          style={{
            left: `${popoverPos.xPct}%`,
            top: flipBelow
              ? `calc(${popoverPos.yPct}% + 8px)`
              : `calc(${popoverPos.yPct}% - ${(effectiveFigureHeight / (HEIGHT / zoom)) * 100}% - 6px)`,
            transform: `translateX(${xTranslate}) translateY(${
              flipBelow ? "0%" : "-100%"
            })`,
          }}
        >
          <PopoverCard h={shownPlaced.h} variant={popoverVariant} />
        </div>
      )}

      {/* Zoom controls — bottom-left */}
      <div className="absolute bottom-3 left-3 flex flex-col gap-1.5 z-20">
        <button
          type="button"
          onClick={() => zoomTo(zoom * ZOOM_STEP)}
          disabled={zoom >= MAX_ZOOM - 0.01}
          aria-label="Zoom in"
          title="Zoom in"
          className="h-8 w-8 rounded-full border border-zinc-300 dark:border-zinc-700 bg-white/95 dark:bg-zinc-900/95 text-zinc-700 dark:text-zinc-200 shadow-md hover:bg-white dark:hover:bg-zinc-800 backdrop-blur flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronPlus />
        </button>
        <button
          type="button"
          onClick={() => zoomTo(zoom / ZOOM_STEP)}
          disabled={zoom <= MIN_ZOOM + 0.01}
          aria-label="Zoom out"
          title="Zoom out"
          className="h-8 w-8 rounded-full border border-zinc-300 dark:border-zinc-700 bg-white/95 dark:bg-zinc-900/95 text-zinc-700 dark:text-zinc-200 shadow-md hover:bg-white dark:hover:bg-zinc-800 backdrop-blur flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronMinus />
        </button>
        {/* Reset is always rendered so + and − never shift; fades when not needed */}
        <button
          type="button"
          onClick={resetView}
          aria-label="Reset view"
          title="Reset view"
          aria-hidden={zoom <= 1.01}
          tabIndex={zoom <= 1.01 ? -1 : 0}
          className={`h-7 px-2 rounded-full border border-zinc-300 dark:border-zinc-700 bg-white/95 dark:bg-zinc-900/95 text-[10px] font-medium text-zinc-700 dark:text-zinc-200 shadow-md hover:bg-white dark:hover:bg-zinc-800 backdrop-blur transition-opacity duration-200 ${
            zoom <= 1.01
              ? "opacity-0 pointer-events-none"
              : "opacity-100"
          }`}
        >
          Reset
        </button>
      </div>

      {/* Compass — bottom-right */}
      <Compass placed={placed} pan={pan} zoom={zoom} />

      {placed.length === 0 && (
        <p className="text-center text-xs text-zinc-500 dark:text-zinc-400 py-2 italic absolute bottom-0 inset-x-0 bg-white/70 dark:bg-zinc-900/70">
          The map fills in as moments are tagged.
        </p>
      )}
    </div>
  );
}

function Compass({
  placed,
  pan,
  zoom,
}: {
  placed: Placed[];
  pan: { x: number; y: number };
  zoom: number;
}) {
  // Compass is a square — it represents the conceptual score space
  // (agency × time), which is square even though the rendered map is 3:2.
  const W = 138;
  const H = 138;
  const PAD = 15; // inner padding so axis lines / dots stay inside the box

  // Map a point in SVG-space (the actual map's coordinate system) to a
  // point in compass-space. The inner score range [0,1]×[0,1] is mapped
  // to the compass's inner box, so a happiness with (time=0, agency=1)
  // sits at the top-left of the dots area.
  function svgToCompass(sx: number, sy: number): [number, number] {
    const innerMapW = WIDTH - 2 * MARGIN_X;
    const innerMapH = HEIGHT - 2 * MARGIN_Y;
    const tx = (sx - MARGIN_X) / innerMapW;
    const ty = (sy - MARGIN_Y) / innerMapH;
    const innerCompass = W - 2 * PAD;
    return [PAD + tx * innerCompass, PAD + ty * innerCompass];
  }

  // Viewport rectangle in compass coords. The map's viewBox extends into
  // the margin area, so values can go slightly outside [PAD, W-PAD].
  // Clamp visually but keep the rectangle's aspect ratio honest.
  const [vx1, vy1] = svgToCompass(pan.x, pan.y);
  const [vx2, vy2] = svgToCompass(
    pan.x + WIDTH / zoom,
    pan.y + HEIGHT / zoom
  );
  const rx1 = Math.max(2, vx1);
  const ry1 = Math.max(2, vy1);
  const rx2 = Math.min(W - 2, vx2);
  const ry2 = Math.min(H - 2, vy2);

  return (
    <div
      className="pointer-events-none absolute bottom-3 right-3 z-20"
      style={{ width: W, height: H }}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        className="rounded-md shadow-lg border border-zinc-300/70 dark:border-zinc-700/70 bg-white/85 dark:bg-zinc-900/85 backdrop-blur"
      >
        {/* axis lines */}
        <line
          x1={PAD}
          y1={H / 2}
          x2={W - PAD}
          y2={H / 2}
          className="stroke-zinc-700/60 dark:stroke-zinc-300/50"
          strokeWidth={0.6}
        />
        <line
          x1={W / 2}
          y1={PAD}
          x2={W / 2}
          y2={H - PAD}
          className="stroke-zinc-700/60 dark:stroke-zinc-300/50"
          strokeWidth={0.6}
        />
        {/* dots */}
        {placed.map((p) => {
          const [cx, cy] = svgToCompass(p.x, p.y);
          return (
            <circle
              key={p.h.id}
              cx={cx}
              cy={cy}
              r={1.4}
              fill="#e89bb1"
              opacity={0.6}
            />
          );
        })}
        {/* viewport rectangle */}
        <rect
          x={rx1}
          y={ry1}
          width={Math.max(0, rx2 - rx1)}
          height={Math.max(0, ry2 - ry1)}
          fill="none"
          stroke="#ef4444"
          strokeWidth={1.2}
          rx={1}
        />
      </svg>
      {/* axis labels — HTML overlay so we get full Tailwind/font control */}
      <div
        className="absolute inset-0 text-[10px] font-bold tracking-wide text-zinc-800 dark:text-zinc-100 [text-shadow:0_0_3px_rgba(255,255,255,0.95),0_0_3px_rgba(255,255,255,0.95),0_0_3px_rgba(255,255,255,0.95)] dark:[text-shadow:0_0_3px_rgba(0,0,0,0.9),0_0_3px_rgba(0,0,0,0.9),0_0_3px_rgba(0,0,0,0.9)]"
      >
        <span className="absolute top-1 left-1/2 -translate-x-1/2 whitespace-nowrap leading-none">
          More agency
        </span>
        <span className="absolute bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap leading-none">
          Less agency
        </span>
        {/* Immediate / Long-term sit just above the horizontal axis instead
            of straddling it, so the axis line stays visible. */}
        <span className="absolute left-1 top-[45%] -translate-y-1/2 whitespace-nowrap leading-none">
          Immediate
        </span>
        <span className="absolute right-1 top-[45%] -translate-y-1/2 whitespace-nowrap leading-none">
          Long-term
        </span>
      </div>
    </div>
  );
}
