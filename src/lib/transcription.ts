import { google } from "@ai-sdk/google";
import { generateText } from "ai";

// Audio input requires full Flash (not Flash-lite — the lite variants are
// text-only). gemini-flash-latest tracks the latest stable Flash.
const MODEL_ID = "gemini-flash-latest";

const PROMPT =
  "Transcribe the spoken words in this short voice note (likely under 15 seconds). " +
  "Return only the transcribed text — no commentary, no quotation marks, no 'Transcription:' prefix. " +
  "Keep punctuation natural. If the audio is silent or unintelligible, return an empty string.";

export async function transcribeVoiceNote(
  voiceNoteUrl: string
): Promise<string | null> {
  console.log("[transcription] starting for", voiceNoteUrl);
  try {
    const response = await fetch(voiceNoteUrl);
    if (!response.ok) {
      console.error("[transcription] fetch failed", response.status, voiceNoteUrl);
      return null;
    }
    const mediaType = response.headers.get("content-type") || "audio/webm";
    const bytes = new Uint8Array(await response.arrayBuffer());
    console.log("[transcription] fetched audio", bytes.length, "bytes,", mediaType);

    const { text } = await generateText({
      model: google(MODEL_ID),
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: PROMPT },
            { type: "file", mediaType, data: bytes },
          ],
        },
      ],
      temperature: 0,
    });

    const transcript = text.trim();
    console.log("[transcription] result:", JSON.stringify(transcript));
    return transcript.length > 0 ? transcript : null;
  } catch (err) {
    console.error("[transcription] failed:", err);
    return null;
  }
}
