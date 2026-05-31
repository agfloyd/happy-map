#!/usr/bin/env node
/**
 * Re-tag every row in `happinesses` using the current tagging prompt + enum.
 *
 * Run with:
 *   node --env-file=.env.local scripts/retag.mjs
 *
 * Flags:
 *   --dry          don't write to Supabase, just print what would change
 *   --only-seed    only re-tag rows whose summary starts with "[seed] "
 *   --only-old     only re-tag rows still on the old theme enum
 *   --limit N      cap at N rows (useful when iterating)
 *   --delay MS     ms to sleep between calls (default 4500; tune for quota)
 *
 * Re-runs Gemini against each row's `content` and updates theme / subtheme /
 * agency_score / time_score / summary. Skips rows with no content (typically
 * voice notes that haven't been transcribed yet).
 */
import { createClient } from "@supabase/supabase-js";
import { google } from "@ai-sdk/google";
import { generateObject } from "ai";
import { z } from "zod";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Run with --env-file=.env.local"
  );
  process.exit(1);
}

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const ONLY_SEED = args.includes("--only-seed");
const ONLY_OLD = args.includes("--only-old");
const limitArg = args.indexOf("--limit");
const LIMIT =
  limitArg >= 0 && args[limitArg + 1] ? parseInt(args[limitArg + 1], 10) : null;
const delayArg = args.indexOf("--delay");
const DELAY_MS =
  delayArg >= 0 && args[delayArg + 1] ? parseInt(args[delayArg + 1], 10) : 4500;

const OLD_THEMES = [
  "food",
  "nature",
  "movement",
  "creative",
  "connection",
  "rest",
  "play",
  "discovery",
  "achievement",
  "ritual",
  "everyday",
];

const THEMES = [
  "family",
  "friends and social",
  "love",
  "children",
  "personal growth",
  "career and work",
  "education",
  "hobbies and creation",
  "leisure",
  "sensory pleasure",
  "domestic maintenance",
  "material acquisition",
  "serendipity",
];

const MODEL_ID = "gemini-3.1-flash-lite-preview";

const tagsSchema = z.object({
  summary: z.string().min(1).max(80),
  theme: z.enum(THEMES),
  subtheme: z.string().min(1).max(40),
  agency_score: z.number().min(0).max(1),
  time_score: z.number().min(0).max(1),
});

function buildPrompt(content, contributorName) {
  const author = contributorName ? `\nAuthor: ${contributorName}` : "";
  return `You are tagging a small moment of happiness for a personal "happy map" inspired by Alvin Chang's research at The Pudding.

Score the moment on two axes:
- agency_score (0.0–1.0): how much agency the person had over the moment. 0.0 = entirely passive, it happened to them; 1.0 = entirely their own initiative.
- time_score (0.0–1.0): how much time was invested. 0.0 = a fleeting instant; 1.0 = the result of long-term effort or buildup.

Pick exactly one theme from this closed list. The list is taken from Alvin Chang's three-level happiness taxonomy and is meant to be exhaustive — every happy moment should fit somewhere. Pick the BEST single fit even if more than one applies; lean toward the relationship/role-based category when the moment is fundamentally about a person (e.g. "playing legos with my niece" → family, not leisure).

Themes (each line: theme — short meaning):
- family — moments centered on parents, siblings, extended family, family rituals, family milestones (NOT specifically about a child as the focal point — use children for that)
- friends and social — time with friends, social gatherings, parties, casual chats
- love — romantic partner, dating, intimacy, anniversaries, partner-only moments
- children — moments centered on a child (your own kid, niece/nephew, godchild, neighbor kid). Use when the child is the focal point: kid said something, kid did something, kid hit a milestone, kid being a kid. If the family unit is the focal point, prefer family.
- personal growth — self-reflection, healing, therapy, gratitude, becoming-a-better-person moments
- career and work — job, projects, work milestones, recognition, coworker moments
- education — school, classes, studying, learning a skill in a structured way, graduation
- hobbies and creation — making things: cooking a new dish, painting, writing, gardening, DIY, music-making
- leisure — passive enjoyment: TV, movies, video games, books, scrolling, lounging, vacations
- sensory pleasure — fleeting bodily delight: a warm shower, a great bite of food, a breeze, a sunset, a hug, a good smell
- domestic maintenance — cleaning, organizing, errands, cooking-as-chore, taking the dog out, fixing things at home
- material acquisition — buying or receiving things: a new gadget, clothes, a gift received
- serendipity — pure happenstance: a lucky find, a coincidence that brightened the day, a small windfall, bumping into someone unexpectedly, a stranger's kindness you didn't initiate. Hint: agency_score should be very low (≤0.2) for these.

Then give a 1-3 word subtheme that's more specific than the theme (e.g. "sibling time", "anniversary dinner", "kitchen experiment", "warm shower"). Use noun-phrase form, lowercase.

Finally, write a short noun-phrase summary (under 80 characters) capturing the gist.

Moment: ${content}${author}`;
}

async function tagOne(content, contributorName) {
  const { object } = await generateObject({
    model: google(MODEL_ID),
    schema: tagsSchema,
    schemaName: "HappinessTags",
    prompt: buildPrompt(content, contributorName),
    temperature: 0.3,
  });
  return object;
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let query = supabase
  .from("happinesses")
  .select("id, content, contributor_name, summary, theme, source")
  .order("created_at", { ascending: false });

if (ONLY_SEED) query = query.like("summary", "[seed]%");
if (ONLY_OLD) query = query.in("theme", OLD_THEMES);
if (LIMIT) query = query.limit(LIMIT);

const { data: rows, error } = await query;
if (error) {
  console.error("Failed to load rows:", error);
  process.exit(1);
}

console.log(
  `Loaded ${rows.length} rows${ONLY_SEED ? " (seed-only)" : ""}${
    LIMIT ? ` (limit ${LIMIT})` : ""
  }${DRY ? " — DRY RUN" : ""}.`
);

let updated = 0;
let skipped = 0;
let failed = 0;

for (let i = 0; i < rows.length; i++) {
  const r = rows[i];
  if (!r.content || !r.content.trim()) {
    skipped++;
    continue;
  }
  try {
    const tags = await tagOne(r.content, r.contributor_name);
    const isSeed = (r.summary ?? "").startsWith("[seed] ");
    const summary = isSeed
      ? `[seed] ${tags.summary}`.slice(0, 80)
      : tags.summary.slice(0, 80);
    if (DRY) {
      console.log(
        `[${i + 1}/${rows.length}] ${r.id.slice(0, 8)}  ${r.theme || "—"} → ${
          tags.theme
        } / ${tags.subtheme}  (a=${tags.agency_score.toFixed(
          2
        )} t=${tags.time_score.toFixed(2)})`
      );
    } else {
      const { error: upErr } = await supabase
        .from("happinesses")
        .update({
          theme: tags.theme,
          subtheme: tags.subtheme,
          agency_score: tags.agency_score,
          time_score: tags.time_score,
          summary,
        })
        .eq("id", r.id);
      if (upErr) throw upErr;
      console.log(
        `[${i + 1}/${rows.length}] ${r.id.slice(0, 8)}  ${r.theme || "—"} → ${
          tags.theme
        } / ${tags.subtheme}`
      );
    }
    updated++;
  } catch (err) {
    failed++;
    console.error(
      `[${i + 1}/${rows.length}] ${r.id.slice(0, 8)} FAILED:`,
      err?.message ?? err
    );
  }
  if (DELAY_MS > 0 && i < rows.length - 1) {
    await new Promise((res) => setTimeout(res, DELAY_MS));
  }
}

console.log(
  `\nDone. updated=${updated} skipped=${skipped} failed=${failed}${
    DRY ? " (dry run — nothing written)" : ""
  }`
);
