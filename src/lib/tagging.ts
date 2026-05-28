import { google } from "@ai-sdk/google";
import { generateObject } from "ai";
import { z } from "zod";

const MODEL_ID = "gemini-3.1-flash-lite-preview";

export const THEMES = [
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

For the moment below, classify it on two axes:
- agency_score (0.0–1.0): how much agency the person had over the moment. 0.0 = passive, it happened to them; 1.0 = entirely their own initiative.
- time_score (0.0–1.0): how much time was invested in this moment. 0.0 = a fleeting instant; 1.0 = the result of long-term effort or buildup.

Pick exactly one theme from this closed list:
${THEMES.map((t) => `- ${t}`).join("\n")}

Then give a 1-3 word subtheme that's more specific than the theme.

Finally, write a short noun-phrase summary (under 80 characters) capturing the gist.

Moment: ${content}${author}`;
}
