#!/usr/bin/env node
/**
 * Top up the seed data with rows targeting under-represented themes so all 11
 * continents are visible on the map. Inserts pre-tagged rows directly (no LLM
 * call) — much faster than the retag script and avoids Gemini's free-tier
 * rate limit.
 *
 * Run with:
 *   node --env-file=.env.local scripts/seed-augment.mjs
 *
 * Inserted rows are marked `summary='[seed] ...'` so they're wiped by the same
 * cleanup query as the originals.
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
  // material acquisition (0 → ~8)
  { name: "Maya", content: "Bought myself the winter coat I'd been eyeing for months. Felt good to actually splurge.", subtheme: "winter coat", agency: 0.85, time: 0.6, summary: "winter coat splurge", source: "web", theme: "material acquisition" },
  { name: "Dev", content: "New noise-canceling headphones finally arrived. Already a game changer at my desk.", subtheme: "new gadget", agency: 0.9, time: 0.5, summary: "new headphones", source: "whatsapp", theme: "material acquisition" },
  { name: "Sophie Chen", content: "My birthday present showed up in the mail. Exactly what I wanted, totally unexpected.", subtheme: "birthday gift", agency: 0.1, time: 0.1, summary: "birthday surprise", source: "web", theme: "material acquisition" },
  { name: "Elena", content: "Found the perfect pair of jeans on sale. They fit like they were made for me.", subtheme: "perfect jeans", agency: 0.7, time: 0.2, summary: "jeans find", source: "web", theme: "material acquisition" },
  { name: "James", content: "Picked up a vintage record at the flea market. I've been hunting for this one for years.", subtheme: "vintage record", agency: 0.9, time: 0.8, summary: "vintage record find", source: "signal" , theme: "material acquisition" },
  { name: "Nora", content: "New cookware set arrived. Already planning what to make first this weekend.", subtheme: "new cookware", agency: 0.85, time: 0.5, summary: "cookware arrival", source: "web", theme: "material acquisition" },
  { name: "Aisha", content: "Thoughtful gift from my partner totally out of the blue. Felt so seen.", subtheme: "surprise gift", agency: 0.1, time: 0.1, summary: "surprise gift", source: "whatsapp", theme: "material acquisition" },
  { name: "Tom", content: "Twelve-dollar leather jacket from the thrift store. The thrill of a lucky find.", subtheme: "thrift find", agency: 0.6, time: 0.2, summary: "thrift leather jacket", source: "web", theme: "material acquisition" },

  // domestic maintenance (2 → ~8)
  { name: "Priya", content: "Finished deep-cleaning the kitchen tonight. The whole apartment feels new.", subtheme: "kitchen clean", agency: 0.9, time: 0.4, summary: "deep clean kitchen", source: "web", theme: "domestic maintenance" },
  { name: "Marcus", content: "Mopped the floors at 11pm because I couldn't sleep. Now the place smells amazing.", subtheme: "late-night cleaning", agency: 0.85, time: 0.2, summary: "late mopping", source: "signal", theme: "domestic maintenance" },
  { name: "Zara", content: "Folded all the laundry while listening to a podcast. Weirdly meditative.", subtheme: "laundry", agency: 0.8, time: 0.3, summary: "laundry meditation", source: "web", theme: "domestic maintenance" },
  { name: "Leo", content: "Organized the junk drawer that has haunted me for years. Deeply satisfying.", subtheme: "decluttering", agency: 0.9, time: 0.4, summary: "junk drawer purge", source: "whatsapp", theme: "domestic maintenance" },
  { name: "Jamie", content: "Trash out, dog walked, dishes done. Small wins stack up.", subtheme: "chore streak", agency: 0.85, time: 0.2, summary: "chore streak", source: "sms", theme: "domestic maintenance" },
  { name: "David", content: "Hung the picture frames that have been sitting in a box for ages. Place feels like home now.", subtheme: "hanging frames", agency: 0.85, time: 0.5, summary: "hung the frames", source: "web", theme: "domestic maintenance" },

  // career and work (3 → ~7)
  { name: "Aisha", content: "Closed the deal I'd been working on for three months. Phone call I'll remember.", subtheme: "closed deal", agency: 0.95, time: 0.95, summary: "deal closed", source: "whatsapp", theme: "career and work" },
  { name: "Marcus", content: "My manager called out my work in the team meeting. Validation hits different.", subtheme: "recognition", agency: 0.4, time: 0.6, summary: "manager shoutout", source: "slack", theme: "career and work" },
  { name: "Dev", content: "Wrapped a brutal sprint with everything shipping on time. Pride and exhaustion in equal measure.", subtheme: "project ship", agency: 0.9, time: 0.85, summary: "sprint shipped", source: "web", theme: "career and work" },
  { name: "Priya", content: "Mentored a junior teammate through a stuck problem. Helping someone level up is the best feeling.", subtheme: "mentoring", agency: 0.9, time: 0.5, summary: "mentoring win", source: "slack", theme: "career and work" },
  { name: "Zara", content: "Quiet morning before everyone's online — got more done in two hours than I did all yesterday.", subtheme: "deep work", agency: 0.85, time: 0.2, summary: "morning deep work", source: "web", theme: "career and work" },

  // education (6 → ~9)
  { name: "Tom", content: "Finally understood the calculus concept that's been eluding me all semester. Click!", subtheme: "concept click", agency: 0.7, time: 0.85, summary: "calculus click", source: "web", theme: "education" },
  { name: "Aisha", content: "Graduation cap on, family in the audience, three years of grinding behind me.", subtheme: "graduation", agency: 0.6, time: 0.98, summary: "graduation day", source: "whatsapp", theme: "education" },
  { name: "Sophie Chen", content: "Aced the language exam I'd been studying months for. Pure relief and pride.", subtheme: "language exam", agency: 0.85, time: 0.9, summary: "language exam aced", source: "web", theme: "education" },

  // love (7 → ~10)
  { name: "Maya", content: "Held hands across the kitchen table while we talked about the future. Small moments are the best ones.", subtheme: "quiet moment", agency: 0.6, time: 0.5, summary: "quiet kitchen talk", source: "web", theme: "love" },
  { name: "David", content: "Anniversary dinner at the place we had our first date. Same booth, same wine, four years later.", subtheme: "anniversary", agency: 0.9, time: 0.95, summary: "anniversary booth", source: "signal", theme: "love" },
  { name: "Nora", content: "Slow morning, no phones, just us and coffee in the sunlight.", subtheme: "slow morning", agency: 0.5, time: 0.3, summary: "slow morning together", source: "web", theme: "love" },

  // family (9 → ~11)
  { name: "Marcus", content: "Sunday dinner at my mom's — everyone showed up. Even the grumpy uncle was laughing.", subtheme: "sunday dinner", agency: 0.5, time: 0.6, summary: "full sunday dinner", source: "whatsapp", theme: "family" },
  { name: "Elena", content: "My niece called just to tell me about her day at school. Made my whole afternoon.", subtheme: "niece call", agency: 0.1, time: 0.1, summary: "niece call", source: "signal", theme: "family" },
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
