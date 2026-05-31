#!/usr/bin/env node
/**
 * Second seed-augment pass: populate the two new themes added on 2026-05-31
 * (serendipity, children) so all 13 continents are visible on the map.
 *
 * Run with:
 *   node --env-file=.env.local scripts/seed-augment-v2.mjs
 *
 * Pre-tagged inserts (no LLM call), marked `summary='[seed] ...'` so they
 * wipe with the same cleanup query as the other seed rows.
 */
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("Missing env. Run with --env-file=.env.local");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const rows = [
  // serendipity — pure happenstance, low agency, mostly low time
  { name: "Maya", content: "Found a twenty in an old coat pocket. The universe winking at me.", subtheme: "lucky find", agency: 0.05, time: 0.05, summary: "twenty in coat pocket", source: "web", theme: "serendipity" },
  { name: "Marcus", content: "Stranger paid for my coffee before I could swipe my card. Faith restored, briefly.", subtheme: "kindness from strangers", agency: 0.05, time: 0.05, summary: "stranger paid for coffee", source: "whatsapp", theme: "serendipity" },
  { name: "Sophie Chen", content: "Spotted a double rainbow on the drive home. Pulled over just to watch.", subtheme: "double rainbow", agency: 0.1, time: 0.05, summary: "double rainbow", source: "web", theme: "serendipity" },
  { name: "James", content: "The library book I was reading had a handwritten note from 1987 inside. Tiny mystery.", subtheme: "found note", agency: 0.05, time: 0.05, summary: "library note from 1987", source: "signal", theme: "serendipity" },
  { name: "Aisha", content: "Got upgraded to first class for no apparent reason. Best three hours of my month.", subtheme: "free upgrade", agency: 0.05, time: 0.1, summary: "first class upgrade", source: "web", theme: "serendipity" },
  { name: "Tom", content: "Bumped into an old friend at the bus stop after years. Like no time had passed.", subtheme: "chance reunion", agency: 0.05, time: 0.1, summary: "ran into old friend", source: "whatsapp", theme: "serendipity" },
  { name: "Nora", content: "Walked past a porch with cats sunbathing in a row. Pure cinematic joy.", subtheme: "cat sighting", agency: 0.1, time: 0.05, summary: "porch cats in a row", source: "web", theme: "serendipity" },
  { name: "Jamie", content: "Shuffle played exactly the song I needed. The algorithm gods smiling on me.", subtheme: "perfect song", agency: 0.1, time: 0.05, summary: "perfect shuffle song", source: "web", theme: "serendipity" },
  { name: "Elena", content: "Found the receipt for my grandmother's wedding ring tucked in an old book. Cried a little.", subtheme: "heirloom find", agency: 0.05, time: 0.05, summary: "grandmother's receipt", source: "signal", theme: "serendipity" },

  // children — kid is the focal point of the moment
  { name: "Marcus", content: "My nephew called me 'big buddy' for the first time. I have never been more honored.", subtheme: "nephew nickname", agency: 0.1, time: 0.05, summary: "nephew called me big buddy", source: "whatsapp", theme: "children" },
  { name: "Elena", content: "Watched my toddler take three real steps before falling over giggling.", subtheme: "first steps", agency: 0.2, time: 0.1, summary: "toddler's first steps", source: "web", theme: "children" },
  { name: "Priya", content: "Niece insisted on reading me a bedtime story. She is three. It was mostly made up.", subtheme: "niece time", agency: 0.3, time: 0.1, summary: "niece's bedtime story", source: "signal", theme: "children" },
  { name: "Leo", content: "Drew with sidewalk chalk with the neighbor kid for an hour. My back is wrecked but I am beaming.", subtheme: "sidewalk chalk", agency: 0.7, time: 0.2, summary: "chalk with neighbor kid", source: "web", theme: "children" },
  { name: "David", content: "Built an entire Lego city with my little cousin. He named every building.", subtheme: "lego city", agency: 0.7, time: 0.4, summary: "lego city with cousin", source: "whatsapp", theme: "children" },
  { name: "Zara", content: "Kid at the park taught me how to do a cartwheel. I am still not good at it.", subtheme: "park lesson", agency: 0.5, time: 0.1, summary: "cartwheel lesson from a kid", source: "web", theme: "children" },
  { name: "Aisha", content: "My godson sent a voice note singing happy birthday. I played it twelve times.", subtheme: "godson voice note", agency: 0.1, time: 0.05, summary: "godson birthday song", source: "signal", theme: "children" },
  { name: "Maya", content: "Snuck the five-year-old up to see the moon through the telescope. Her face was priceless.", subtheme: "telescope moment", agency: 0.85, time: 0.3, summary: "moon through telescope", source: "web", theme: "children" },
  { name: "Nora", content: "Cousin's daughter handed me a dandelion 'because you look sad'. I was not sad until then.", subtheme: "dandelion gift", agency: 0.05, time: 0.05, summary: "kid handed me a dandelion", source: "whatsapp", theme: "children" },
];

const cleaned = rows.map((r) => ({
  content: r.content,
  contributor_name: r.name,
  is_anonymous: false,
  theme: r.theme,
  subtheme: r.subtheme,
  agency_score: Math.max(0, Math.min(1, r.agency)),
  time_score: Math.max(0, Math.min(1, r.time)),
  summary: `[seed] ${r.summary}`.slice(0, 80),
  source: r.source,
}));

console.log(`Inserting ${cleaned.length} rows...`);
const CHUNK = 25;
let inserted = 0;
for (let i = 0; i < cleaned.length; i += CHUNK) {
  const batch = cleaned.slice(i, i + CHUNK);
  const { data, error } = await supabase
    .from("happinesses")
    .insert(batch)
    .select("id");
  if (error) {
    console.error("Insert failed:", error);
    process.exit(1);
  }
  inserted += data?.length ?? 0;
  console.log(`  → ${inserted}/${cleaned.length}`);
}
console.log(`\n✓ Augmented with ${inserted} seed rows.`);
