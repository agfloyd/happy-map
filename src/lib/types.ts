export const MAX_CONTENT_LENGTH = 280;

export type HappinessSource = "web" | "whatsapp" | "signal" | "slack" | "sms";

export type Happiness = {
  id: string;
  content: string | null;
  contributor_name: string | null;
  contributor_id: string | null;
  photo_url: string | null;
  voice_note_url: string | null;
  transcribed: boolean;
  theme: string | null;
  subtheme: string | null;
  agency_score: number | null;
  time_score: number | null;
  summary: string | null;
  source: HappinessSource;
  is_anonymous: boolean;
  created_at: string;
};

export type Contributor = {
  id: string;
  phone_e164: string | null;
  display_name: string | null;
  avatar_url: string | null;
  daily_reminder_opt_in: boolean;
  timezone: string | null;
  created_at: string;
};
