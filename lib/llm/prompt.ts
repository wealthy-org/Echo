// Server-only — jangan import dari client component.
// Prompt ikut PRD §27: system + personality + memory + recent + current.

import {
  DEFAULT_PERSONALITY,
  PERSONALITY_PRESETS,
} from "../companion/constants";

export interface PromptMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

const SYSTEM_PROMPT = `You are the user's personal AI companion.

Your role is to:
- remember relevant context;
- communicate naturally;
- help the user reflect;
- maintain conversational continuity.

You are not a financial advisor.
Do not present speculative financial information as certainty.`;

export function buildChatPrompt(
  memorySummary: string,
  recent: { role: "user" | "companion"; content: string }[],
  currentMessage: string,
  // ponytail: Phase 2 — slug preset ATAU teks custom user. Undefined (kolom
  // belum migrasi) = default. Custom disuntik mentah, sudah divalidasi di PATCH.
  personality?: string | null
): PromptMessage[] {
  const messages: PromptMessage[] = [{ role: "system", content: SYSTEM_PROMPT }];

  const raw = (personality ?? DEFAULT_PERSONALITY).trim() || DEFAULT_PERSONALITY;
  const preset = PERSONALITY_PRESETS.find((p) => p.id === raw);
  messages.push({
    role: "system",
    content: `TONE\n${preset ? preset.instruction : raw}`,
  });

  if (memorySummary.trim()) {
    messages.push({
      role: "system",
      content: `MEMORY\n${memorySummary}`,
    });
  }

  for (const m of recent) {
    messages.push({
      role: m.role === "user" ? "user" : "assistant",
      content: m.content,
    });
  }

  messages.push({ role: "user", content: currentMessage });
  return messages;
}

// ponytail: Phase 9 — prompt ringkas terpisah (PRD §15/§27). Ambil recent yang
// SAMA dengan chat prompt agar summary konsisten dengan konteks yang dilihat user.
export function buildSummaryPrompt(
  previousSummary: string,
  recent: { role: "user" | "companion"; content: string }[]
): PromptMessage[] {
  const convo = recent
    .map((m) => `${m.role === "user" ? "User" : "Companion"}: ${m.content}`)
    .join("\n");
  const previous = previousSummary.trim()
    ? `Previous summary:\n${previousSummary}\n\n`
    : "No previous summary — this is the first one.\n\n";
  return [
    {
      role: "system",
      content:
        "Summarize the conversation below into a concise memory for a personal AI companion. " +
        "Keep durable facts, preferences, and open threads; drop greetings and small talk. " +
        "Reply with the summary text only, no preamble.",
    },
    {
      role: "user",
      content: `${previous}Recent conversation:\n${convo}`,
    },
  ];
}
