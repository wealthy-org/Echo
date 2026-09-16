// Client-safe. Max panjang nama companion (FR-09) — route + panel sama-sama import.
export const MAX_COMPANION_NAME_LENGTH = 50;

// Sentinel nama bawaan DB (db/schema default 'Companion'). Connect route pakai
// ini untuk tahu mana companion yang belum pernah di-rename.
export const DEFAULT_COMPANION_NAME = "Companion";

// ponytail: Phase 2 personality — client-safe (panel butuh daftar + deskripsi).
// personality di DB = slug preset ATAU teks custom user (bukan slug).
export const DEFAULT_PERSONALITY = "balanced";
export const MAX_CUSTOM_TONE_LENGTH = 300;

export const PERSONALITY_PRESETS = [
  {
    id: "balanced",
    name: "Balanced",
    description: "Natural and reflective, the default companion.",
    instruction:
      "Communicate naturally and warmly. Balance reflection with helpfulness.",
  },
  {
    id: "calm",
    name: "Calm",
    description: "Quiet, brief, grounding.",
    instruction:
      "Stay calm and grounding. Keep replies short and soothing. Avoid excitement or urgency.",
  },
  {
    id: "deep",
    name: "Deep Thinker",
    description: "Analytical, probing, reflective.",
    instruction:
      "Think deeply and analytically. Ask probing questions, explore root causes, and reflect at length.",
  },
  {
    id: "playful",
    name: "Playful",
    description: "Relaxed, lightly humorous, warm.",
    instruction:
      "Be relaxed and warm with light humor. Keep things fun but never dismissive.",
  },
] as const;

export type PersonalityPresetId =
  (typeof PERSONALITY_PRESETS)[number]["id"];

export function isPresetId(value: string): value is PersonalityPresetId {
  return PERSONALITY_PRESETS.some((p) => p.id === value);
}
