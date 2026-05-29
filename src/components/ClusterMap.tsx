"use client";

import { useMemo, useState } from "react";
import { Delaunay } from "d3-delaunay";
import type { Happiness } from "@/lib/types";

const WIDTH = 600;
const HEIGHT = 400;
const ATOM_COUNT = 1500;
const LAND_RADIUS = 95;
const FIGURE_HEIGHT = 14;
const HIT_RADIUS = 14;

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

// Lighten / darken a hex color by `delta` ∈ [-1, 1] (about ±18%).
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

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
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
  onSelect: () => void;
}) {
  const { x, y } = placed;
  const fill = highlighted ? "#111827" : "#3f3f46";
  const headR = highlighted ? 3.0 : 2.6;
  return (
    <g
      transform={`translate(${x},${y - FIGURE_HEIGHT})`}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onClick={onSelect}
      style={{ cursor: "pointer" }}
    >
      {/* invisible hit target for easier hovering */}
      <circle cx={0} cy={7} r={HIT_RADIUS} fill="transparent" />
      {/* subtle ground shadow */}
      <ellipse cx={0} cy={FIGURE_HEIGHT + 0.5} rx={3.2} ry={0.9} fill="rgba(0,0,0,0.18)" />
      {/* head */}
      <circle cx={0} cy={2.5} r={headR} fill={fill} />
      {/* body (trapezoid) */}
      <path
        d={`M -3 5 L 3 5 L 2.2 ${FIGURE_HEIGHT} L -2.2 ${FIGURE_HEIGHT} Z`}
        fill={fill}
      />
    </g>
  );
}

export function ClusterMap({
  items,
  onSelect,
  highlightedId,
}: {
  items: Happiness[];
  onSelect?: (id: string) => void;
  highlightedId?: string | null;
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

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
          return {
            h,
            x: Math.max(
              FIGURE_HEIGHT,
              Math.min(WIDTH - FIGURE_HEIGHT, (h.time_score as number) * WIDTH + jx)
            ),
            y: Math.max(
              FIGURE_HEIGHT + 2,
              Math.min(
                HEIGHT - 2,
                (1 - (h.agency_score as number)) * HEIGHT + jy
              )
            ),
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
      const isLand =
        nearestIdx >= 0 && nearestDist < LAND_RADIUS * LAND_RADIUS;
      const themeKey =
        isLand && placed[nearestIdx].h.theme
          ? (placed[nearestIdx].h.theme as string)
          : null;
      const baseColor = themeKey
        ? THEME_COLORS[themeKey] ?? OCEAN_COLOR
        : OCEAN_COLOR;
      // per-cell brightness jitter on land for giraffe-fur texture; keep
      // ocean cells calm (light jitter so it still has some painterly variation).
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

  const hovered = hoveredId ? placed.find((p) => p.h.id === hoveredId) : null;
  const tooltipText = hovered
    ? hovered.h.summary ||
      (hovered.h.content
        ? hovered.h.content.length > 80
          ? hovered.h.content.slice(0, 78) + "…"
          : hovered.h.content
        : hovered.h.transcribed
        ? "voice note"
        : "moment")
    : null;
  const tooltipSub = hovered
    ? `${
        hovered.h.is_anonymous
          ? "Anonymous"
          : hovered.h.contributor_name || "Anonymous"
      }${hovered.h.theme ? ` · ${hovered.h.theme}` : ""}`
    : null;

  return (
    <div className="relative w-full rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 shadow-sm">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="xMidYMid slice"
        className="block w-full h-auto"
        style={{ background: OCEAN_COLOR, aspectRatio: `${WIDTH} / ${HEIGHT}` }}
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
        {/* paper-grain overlay across the whole map */}
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
            highlighted={hoveredId === p.h.id || highlightedId === p.h.id}
            onEnter={() => setHoveredId(p.h.id)}
            onLeave={() =>
              setHoveredId((cur) => (cur === p.h.id ? null : cur))
            }
            onSelect={() => onSelect?.(p.h.id)}
          />
        ))}
      </svg>

      {hovered && tooltipText && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full"
          style={{
            left: `${(hovered.x / WIDTH) * 100}%`,
            top: `calc(${((hovered.y - FIGURE_HEIGHT) / HEIGHT) * 100}% - 6px)`,
          }}
        >
          <div className="rounded-md bg-zinc-900/95 text-white px-2.5 py-1.5 text-[11px] leading-snug shadow-lg max-w-[240px] whitespace-normal">
            <div className="font-medium">{tooltipText}</div>
            {tooltipSub && (
              <div className="mt-0.5 text-[10px] text-zinc-300">
                {tooltipSub}
              </div>
            )}
          </div>
          <div className="mx-auto h-0 w-0 border-x-4 border-x-transparent border-t-4 border-t-zinc-900/95" />
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
