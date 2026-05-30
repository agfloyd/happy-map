"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Delaunay } from "d3-delaunay";
import type { Happiness } from "@/lib/types";

const WIDTH = 600;
const HEIGHT = 400;
const ATOM_COUNT = 1500;
const LAND_RADIUS = 95;
const FIGURE_HEIGHT = 14;
const HIT_RADIUS = 14;
// Margin from each map edge: keeps figures inward and gives every continent
// breathing room from the rim.
const MARGIN_X = 60; // 10% of WIDTH
const MARGIN_Y = 48; // 12% of HEIGHT
// Atoms within this band of any edge are always ocean — guarantees the
// outermost ring of the map reads as water, never land.
const EDGE_OCEAN_BAND = 28;

const THEME_COLORS: Record<string, string> = {
  food: "#f4a261",
  nature: "#8ab87a",
  movement: "#7fb8d4",
  creative: "#b08fc7",
  connection: "#e89bb1",
  rest: "#c8b6e2",
  play: "#f1d57c",
  discovery: "#88c7c3",
  achievement: "#d4a574",
  ritual: "#94a3c2",
  everyday: "#c5b9a4",
};

const OCEAN_COLOR = "#94c1de";

// Ink-tone palette for figures. Each named contributor gets a stable color
// by hashing their name into this list. Anonymous moments use a default
// gray.
const PERSON_COLORS = [
  "#2d3748", // slate
  "#7c2d2d", // burgundy
  "#1e3a8a", // navy
  "#3f6212", // moss
  "#581c87", // deep purple
  "#7c2d12", // rust
  "#134e4a", // teal-ink
  "#3f3f46", // charcoal
  "#831843", // wine
  "#1e4258", // dark steel
  "#854d0e", // brown gold
  "#4c1d95", // indigo
];
const ANONYMOUS_COLOR = "#52525b"; // zinc-600

export type HoverMode = "full" | "name";

function personColor(h: { contributor_name: string | null; is_anonymous: boolean; contributor_id: string | null }): string {
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

type Placed = {
  h: Happiness;
  x: number;
  y: number;
};

function Figure({
  placed,
  highlighted,
  onEnter,
  onLeave,
  onSelect,
}: {
  placed: Placed;
  highlighted: boolean;
  onEnter: () => void;
  onLeave: () => void;
  onSelect: (e: React.MouseEvent) => void;
}) {
  const { x, y } = placed;
  const baseFill = personColor(placed.h);
  // When highlighted, darken slightly so identity stays visible but the
  // figure pops.
  const fill = highlighted ? jitterHex(baseFill, -0.45) : baseFill;
  const headR = highlighted ? 3.0 : 2.6;
  return (
    <g
      transform={`translate(${x},${y - FIGURE_HEIGHT})`}
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

function PopoverCard({
  h,
  variant,
}: {
  h: Happiness;
  variant: "full" | "name";
}) {
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
          // Map scores into the inner padded region so extreme values don't
          // sit on the map's rim.
          const innerW = WIDTH - 2 * MARGIN_X;
          const innerH = HEIGHT - 2 * MARGIN_Y;
          const rawX = MARGIN_X + (h.time_score as number) * innerW + jx;
          const rawY =
            MARGIN_Y + (1 - (h.agency_score as number)) * innerH + jy;
          return {
            h,
            x: Math.max(MARGIN_X, Math.min(WIDTH - MARGIN_X, rawX)),
            y: Math.max(MARGIN_Y, Math.min(HEIGHT - MARGIN_Y, rawY)),
          };
        }),
    [items]
  );

  // Dismiss pinned popover on Escape
  useEffect(() => {
    if (!pinnedId) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setPinnedId(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pinnedId]);

  const atoms = useMemo(() => {
    const rand = mulberry32(12345);
    const pts: [number, number][] = [];
    for (let i = 0; i < ATOM_COUNT; i++) {
      pts.push([rand() * WIDTH, rand() * HEIGHT]);
    }
    return pts;
  }, []);

  const cells = useMemo(() => {
    const delaunay = Delaunay.from(atoms);
    const voronoi = delaunay.voronoi([0, 0, WIDTH, HEIGHT]);
    const rand = mulberry32(54321);
    const out: { d: string; color: string }[] = [];
    for (let i = 0; i < atoms.length; i++) {
      const polygon = voronoi.cellPolygon(i);
      if (!polygon) continue;
      const [ax, ay] = atoms[i];
      let nearestIdx = -1;
      let nearestDist = Infinity;
      for (let j = 0; j < placed.length; j++) {
        const dx = placed[j].x - ax;
        const dy = placed[j].y - ay;
        const d = dx * dx + dy * dy;
        if (d < nearestDist) {
          nearestDist = d;
          nearestIdx = j;
        }
      }
      // Atoms within the edge band are always ocean — even if a figure is
      // close by, we want a guaranteed water ring around the map.
      const inEdgeBand =
        ax < EDGE_OCEAN_BAND ||
        ax > WIDTH - EDGE_OCEAN_BAND ||
        ay < EDGE_OCEAN_BAND ||
        ay > HEIGHT - EDGE_OCEAN_BAND;
      const isLand =
        !inEdgeBand &&
        nearestIdx >= 0 &&
        nearestDist < LAND_RADIUS * LAND_RADIUS;
      const themeKey =
        isLand && placed[nearestIdx].h.theme
          ? (placed[nearestIdx].h.theme as string)
          : null;
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
      out.push({ d: path, color });
    }
    return out;
  }, [atoms, placed]);

  // The popover currently shown: pinned wins; otherwise hovered.
  const shownId = pinnedId ?? hoveredId;
  const shownPlaced = shownId ? placed.find((p) => p.h.id === shownId) : null;
  // Pinned always shows full; hover obeys hoverMode.
  const popoverVariant: "full" | "name" =
    pinnedId === shownId ? "full" : hoverMode === "name" ? "name" : "full";
  // Flip popover below figure when the figure is near the top.
  const flipBelow = shownPlaced ? shownPlaced.y < HEIGHT * 0.45 : false;
  // Side-align popover when figure is near a horizontal edge so it can't get
  // clipped. Threshold: ~22% from either side.
  const xPct = shownPlaced ? (shownPlaced.x / WIDTH) * 100 : 50;
  const xAlign: "left" | "center" | "right" =
    xPct < 22 ? "left" : xPct > 78 ? "right" : "center";
  const xTranslate =
    xAlign === "left" ? "0" : xAlign === "right" ? "-100%" : "-50%";

  return (
    <div className="relative w-full rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 shadow-sm">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="xMidYMid slice"
        className="block w-full h-auto"
        style={{ background: OCEAN_COLOR, aspectRatio: `${WIDTH} / ${HEIGHT}` }}
        onClick={() => setPinnedId(null)}
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
        {cells.map((c, i) => (
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
        {placed.map((p) => (
          <Figure
            key={p.h.id}
            placed={p}
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
              e.stopPropagation();
              setPinnedId((cur) => (cur === p.h.id ? null : p.h.id));
              onSelect?.(p.h.id);
            }}
          />
        ))}
      </svg>

      {shownPlaced && (
        <div
          className="pointer-events-none absolute z-10"
          style={{
            left: `${(shownPlaced.x / WIDTH) * 100}%`,
            top: flipBelow
              ? `calc(${
                  ((shownPlaced.y + 4) / HEIGHT) * 100
                }% + 4px)`
              : `calc(${
                  ((shownPlaced.y - FIGURE_HEIGHT) / HEIGHT) * 100
                }% - 6px)`,
            transform: `translateX(${xTranslate}) translateY(${
              flipBelow ? "0%" : "-100%"
            })`,
          }}
        >
          <PopoverCard h={shownPlaced.h} variant={popoverVariant} />
        </div>
      )}

      {placed.length === 0 && (
        <p className="text-center text-xs text-zinc-500 dark:text-zinc-400 py-2 italic absolute bottom-0 inset-x-0 bg-white/70 dark:bg-zinc-900/70">
          The map fills in as moments are tagged.
        </p>
      )}
    </div>
  );
}
