import { ImageResponse } from "next/og";
import { createElement as h, type CSSProperties } from "react";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  THEME_COLORS,
  OCEAN_COLOR,
  personColor,
  titleCase,
  cardDisplayName,
} from "@/lib/figure-style";
import type { Happiness } from "@/lib/types";

// Shareable PNG "card" for a single happy moment: its figure, the island/theme
// label, and 1-2 faint nearest neighbours on an ocean-tinted background.
//
// GET /api/figure-image?id=<happinessId>
//
// Renders with next/og's ImageResponse (Satori). Satori only supports flexbox
// and a subset of CSS — no grid — so the layout below is all flexbox +
// absolute positioning, and the person silhouettes are built from plain divs
// (head circle + tapered body) rather than SVG. This file is a `.ts` Route
// Handler per the project convention, so the element tree is built with
// React.createElement rather than JSX.

const WIDTH = 800;
const HEIGHT = 600;

// Columns we read for the main row. Explicit so we don't pull large unused
// fields needlessly.
const COLUMNS =
  "id, content, contributor_name, contributor_id, photo_url, theme, subtheme, agency_score, time_score, summary, source, is_anonymous, created_at, voice_note_url, transcribed";

type NeighborRow = Pick<
  Happiness,
  | "id"
  | "contributor_name"
  | "contributor_id"
  | "is_anonymous"
  | "theme"
  | "agency_score"
  | "time_score"
>;

// Euclidean distance in (time_score, agency_score) space. Rows missing either
// score are excluded before this runs.
function scoreDist(a: NeighborRow, main: Happiness): number {
  const dx = (a.time_score ?? 0) - (main.time_score ?? 0);
  const dy = (a.agency_score ?? 0) - (main.agency_score ?? 0);
  return Math.sqrt(dx * dx + dy * dy);
}

// Mix a hex color toward white by `amt` (0..1).
function lighten(hex: string, amt: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amt);
  const hx = (c: number) => mix(c).toString(16).padStart(2, "0");
  return `#${hx(r)}${hx(g)}${hx(b)}`;
}

// Simple person silhouette: head circle above a tapered body. Built from divs
// so it survives Satori's CSS subset.
function personFigure(color: string, scale: number, opacity = 1) {
  const head = 44 * scale;
  const bodyW = 64 * scale;
  const bodyH = 88 * scale;
  return h(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        opacity,
      } as CSSProperties,
    },
    h("div", {
      style: {
        width: head,
        height: head,
        borderRadius: head,
        background: color,
      } as CSSProperties,
    }),
    h("div", {
      style: {
        marginTop: 6 * scale,
        width: bodyW,
        height: bodyH,
        background: color,
        // Rounded shoulders tapering to feet — soft and hand-drawn.
        borderTopLeftRadius: bodyW,
        borderTopRightRadius: bodyW,
        borderBottomLeftRadius: 10 * scale,
        borderBottomRightRadius: 10 * scale,
      } as CSSProperties,
    })
  );
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return new Response("Missing ?id", { status: 400 });
  }

  // Load the main happiness.
  const { data: main, error } = await supabaseAdmin
    .from("happinesses")
    .select(COLUMNS)
    .eq("id", id)
    .maybeSingle<Happiness>();

  if (error) {
    return new Response("Lookup failed", { status: 500 });
  }
  if (!main) {
    return new Response("Not found", { status: 404 });
  }

  // Nearest neighbours: closest in (agency, time) space within the SAME theme,
  // skipping the row itself and rows with no position. If the theme has no
  // other placed rows, fall back to any theme.
  let neighbors: NeighborRow[] = [];
  if (main.agency_score !== null && main.time_score !== null) {
    const neighborCols =
      "id, contributor_name, contributor_id, is_anonymous, theme, agency_score, time_score";

    const fetchCandidates = async (
      sameTheme: boolean
    ): Promise<NeighborRow[]> => {
      let q = supabaseAdmin
        .from("happinesses")
        .select(neighborCols)
        .neq("id", main.id)
        .not("agency_score", "is", null)
        .not("time_score", "is", null);
      if (sameTheme && main.theme) q = q.eq("theme", main.theme);
      const { data } = await q.returns<NeighborRow[]>();
      return data ?? [];
    };

    let candidates = main.theme ? await fetchCandidates(true) : [];
    if (candidates.length === 0) {
      candidates = await fetchCandidates(false);
    }

    neighbors = candidates
      .map((c) => ({ c, d: scoreDist(c, main) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 2)
      .map((x) => x.c);
  }

  const theme = main.theme ?? "serendipity";
  const continentColor = THEME_COLORS[theme] ?? OCEAN_COLOR;
  const oceanTint = lighten(OCEAN_COLOR, 0.12);
  const islandLabel = `${titleCase(theme)} Island`;
  const mainColor = personColor(main);
  const name = cardDisplayName(main);

  // Two neighbour slots flanking the main figure. If only one exists it sits
  // on the right.
  const left = neighbors[1];
  const right = neighbors[0];

  const slot = (n: NeighborRow | undefined) =>
    h(
      "div",
      {
        style: {
          display: "flex",
          width: 150,
          justifyContent: "center",
          alignItems: "flex-end",
        } as CSSProperties,
      },
      n ? personFigure(personColor(n), 0.55, 0.4) : null
    );

  const tree = h(
    "div",
    {
      style: {
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        // Soft vertical ocean gradient tinted by the theme color up top — warm
        // and hand-made, not a flat clinical fill.
        background: `linear-gradient(180deg, ${lighten(
          continentColor,
          0.45
        )} 0%, ${oceanTint} 55%, ${OCEAN_COLOR} 100%)`,
        fontFamily: "sans-serif",
      } as CSSProperties,
    },
    // Island label, top.
    h(
      "div",
      {
        style: {
          position: "absolute",
          top: 54,
          display: "flex",
          fontSize: 52,
          fontWeight: 700,
          color: "#ffffff",
          letterSpacing: 1,
          textShadow: "0 2px 6px rgba(0,0,0,0.35)",
        } as CSSProperties,
      },
      islandLabel
    ),
    // Figure row.
    h(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
          marginTop: 40,
        } as CSSProperties,
      },
      slot(left),
      h(
        "div",
        {
          style: {
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            marginLeft: 8,
            marginRight: 8,
          } as CSSProperties,
        },
        personFigure(mainColor, 1.5),
        h(
          "div",
          {
            style: {
              display: "flex",
              marginTop: 20,
              fontSize: 30,
              fontWeight: 600,
              color: "#27384a",
              textShadow: "0 1px 2px rgba(255,255,255,0.5)",
            } as CSSProperties,
          },
          name
        )
      ),
      slot(right)
    )
  );

  return new ImageResponse(tree, {
    width: WIDTH,
    height: HEIGHT,
    headers: {
      // The card for a given id is stable, so cache aggressively at the CDN.
      "Cache-Control":
        "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
    },
  });
}
