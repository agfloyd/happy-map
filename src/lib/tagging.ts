import { google } from "@ai-sdk/google";
import { generateObject } from "ai";
import { z } from "zod";

const MODEL_ID = "gemini-3.1-flash-lite-preview";

export const THEMES = [
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
] as const;

export type Theme = (typeof THEMES)[number];

const tagsSchema = z.object({
  summary: z
    .string()
    .min(1)
    .max(80)
    .describe(
      "Short noun phrase capturing the gist, e.g. 'made strawberry lemonade'."
    ),
  theme: z.enum(THEMES).describe("Top-level category of the moment."),
  subtheme: z
    .string()
    .min(1)
    .max(40)
    .describe(
      "1-3 word noun phrase more specific than the theme, e.g. 'cooking', 'sunset walk', 'unexpected hug'."
    ),
  agency_score: z
    .number()
    .min(0)
    .max(1)
    .describe(
      "0.0–1.0. How much the person actively chose this vs. it happening to them. 0.0 = pure happenstance; 1.0 = entirely their own initiative."
    ),
  time_score: z
    .number()
    .min(0)
    .max(1)
    .describe(
      "0.0–1.0. How much time was invested. 0.0 = a fleeting instant; 1.0 = the result of long buildup or effort."
    ),
});

export type HappinessTags = z.infer<typeof tagsSchema>;

export async function tagHappiness({
  content,
  contributorName,
}: {
  content: string;
  contributorName?: string | null;
}): Promise<HappinessTags | null> {
  try {
    const { object } = await generateObject({
      model: google(MODEL_ID),
      schema: tagsSchema,
      schemaName: "HappinessTags",
      prompt: buildPrompt({ content, contributorName }),
      temperature: 0.3,
    });
    return object;
  } catch (err) {
    console.error("[tagging] failed to tag happiness:", err);
    return null;
  }
}

function buildPrompt({
  content,
  contributorName,
}: {
  content: string;
  contributorName?: string | null;
}) {
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
