#!/usr/bin/env node
/**
 * One-shot seed: read scripts/seed-data.json and insert each row into the
 * Supabase `happinesses` table via the service role key.
 *
 * Run with:
 *   node --env-file=.env.local scripts/seed-happinesses.mjs
 *
 * Each inserted row is marked with metadata so we can identify and remove
 * seed data later if needed:
 *   contributor_id = null (real WhatsApp contributors have one; seed rows do not)
 *   summary = "[seed] ..."  (so we can: delete from happinesses where summary like '[seed]%')
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(__dirname, "seed-data.json");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Run with --env-file=.env.local"
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const ALLOWED_THEMES = new Set([
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
]);
const ALLOWED_SOURCES = new Set(["web", "whatsapp", "signal", "slack", "sms"]);

const raw = readFileSync(DATA_PATH, "utf8");
const rows = JSON.parse(raw);

if (!Array.isArray(rows)) {
  console.error("seed-data.json must be a JSON array");
  process.exit(1);
}

console.log(`Loaded ${rows.length} rows from seed-data.json`);

// Validate + shape each row
const cleaned = rows
  .map((r, i) => {
    if (!r.content || typeof r.content !== "string") {
      console.warn(`row ${i}: missing content, skipping`);
      return null;
    }
    if (r.content.length > 280) {
      r.content = r.content.slice(0, 277) + "…";
    }
    if (!ALLOWED_THEMES.has(r.theme)) {
      console.warn(`row ${i}: invalid theme '${r.theme}', skipping`);
      return null;
    }
    const source = ALLOWED_SOURCES.has(r.source) ? r.source : "web";
    return {
      content: r.content,
      contributor_name: r.contributor_name ?? null,
      is_anonymous: false,
      theme: r.theme,
      subtheme: r.subtheme ?? null,
      agency_score:
        typeof r.agency_score === "number"
          ? Math.max(0, Math.min(1, r.agency_score))
          : 0.5,
      time_score:
        typeof r.time_score === "number"
          ? Math.max(0, Math.min(1, r.time_score))
          : 0.5,
      summary: `[seed] ${r.summary ?? ""}`.slice(0, 80),
      source,
    };
  })
  .filter(Boolean);

console.log(`Inserting ${cleaned.length} rows…`);

// Batched insert (chunks of 50 to be polite)
const CHUNK = 50;
let inserted = 0;
for (let i = 0; i < cleaned.length; i += CHUNK) {
  const batch = cleaned.slice(i, i + CHUNK);
  const { data, error } = await supabase
    .from("happinesses")
    .insert(batch)
    .select("id");
  if (error) {
    console.error(`Insert failed at chunk ${i}:`, error);
    process.exit(1);
  }
  inserted += data?.length ?? 0;
  console.log(`  → ${inserted}/${cleaned.length}`);
}

console.log(`\n✓ Seeded ${inserted} happinesses.`);
console.log(
  `\nTo undo: delete from happinesses where summary like '[seed]%';`
);
