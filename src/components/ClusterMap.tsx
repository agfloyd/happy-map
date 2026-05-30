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
const MARGIN_X = 60;
const MARGIN_Y = 48;
const EDGE_OCEAN_BAND = 28;

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 1.5;

// Zoom thresholds for label visibility
const CONTINENT_FADE_START = 1.7;
const CONTINENT_FADE_END = 2.4;
const SUBTHEME_FADE_START = 1.4;
const SUBTHEME_FADE_END = 2.0;

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

  // Continent + subtheme centroids for labels
  const continentLabels = useMemo(() => {
    const groups = new Map<string, Placed[]>();
    for (const p of placed) {
      const k = p.h.theme as string;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(p);
    }
    const out: { key: string; label: string; x: number; y: number; count: number }[] = [];
    for (const [k, ps] of groups) {
      const sx = ps.reduce((a, p) => a + p.x, 0) / ps.length;
      const sy = ps.reduce((a, p) => a + p.y, 0) / ps.length;
      out.push({ key: k, label: k.toUpperCase(), x: sx, y: sy, count: ps.length });
    }
    return out;
  }, [placed]);

  const subthemeLabels = useMemo(() => {
    const groups = new Map<string, Placed[]>();
    for (const p of placed) {
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
  }, [placed]);

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

  const shownId = pinnedId ?? hoveredId;
  const shownPlaced = shownId ? placed.find((p) => p.h.id === shownId) : null;
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

  // Zoom centered on a focal SVG point (or map center if not provided).
  function zoomTo(newZoom: number, focalSvg?: { x: number; y: number }) {
    const clamped = clamp(newZoom, MIN_ZOOM, MAX_ZOOM);
    if (clamped === zoom) return;
    const fx = focalSvg?.x ?? pan.x + WIDTH / zoom / 2;
    const fy = focalSvg?.y ?? pan.y + HEIGHT / zoom / 2;
    // Keep the focal point at the same screen position after zoom
    const relX = (fx - pan.x) / (WIDTH / zoom);
    const relY = (fy - pan.y) / (HEIGHT / zoom);
    const newPanX = fx - relX * (WIDTH / clamped);
    const newPanY = fy - relY * (HEIGHT / clamped);
    setZoom(clamped);
    setPan(clampPan(newPanX, newPanY, clamped));
  }

  function resetView() {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    if (e.button !== 0) return;
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
              : `calc(${popoverPos.yPct}% - ${(FIGURE_HEIGHT / (HEIGHT / zoom)) * 100}% - 6px)`,
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
        {zoom > 1.01 && (
          <button
            type="button"
            onClick={resetView}
            aria-label="Reset view"
            title="Reset view"
            className="h-7 px-2 rounded-full border border-zinc-300 dark:border-zinc-700 bg-white/95 dark:bg-zinc-900/95 text-[10px] font-medium text-zinc-700 dark:text-zinc-200 shadow-md hover:bg-white dark:hover:bg-zinc-800 backdrop-blur"
          >
            Reset
          </button>
        )}
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
  const W = 90;
  const H = 60;
  // Scale SVG coords → compass coords
  const sx = (x: number) => (x / WIDTH) * W;
  const sy = (y: number) => (y / HEIGHT) * H;

  const viewX = sx(pan.x);
  const viewY = sy(pan.y);
  const viewW = sx(WIDTH / zoom);
  const viewH = sy(HEIGHT / zoom);

  return (
    <div className="pointer-events-none absolute bottom-3 right-3 z-20">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        className="rounded-md shadow-lg border border-zinc-300/70 dark:border-zinc-700/70 bg-white/85 dark:bg-zinc-900/85 backdrop-blur"
      >
        {/* axes */}
        <line x1={0} y1={H / 2} x2={W} y2={H / 2} stroke="rgba(0,0,0,0.12)" strokeWidth={0.5} />
        <line x1={W / 2} y1={0} x2={W / 2} y2={H} stroke="rgba(0,0,0,0.12)" strokeWidth={0.5} />
        {placed.map((p) => (
          <circle
            key={p.h.id}
            cx={sx(p.x)}
            cy={sy(p.y)}
            r={1.4}
            fill="#e89bb1"
            opacity={0.55}
          />
        ))}
        <rect
          x={viewX}
          y={viewY}
          width={viewW}
          height={viewH}
          fill="none"
          stroke="#ef4444"
          strokeWidth={1.2}
          rx={1}
        />
      </svg>
    </div>
  );
}
