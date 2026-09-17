// Server-only — jangan import dari client component.
// Prompt ikut PRD §27: system + personality + memory + recent + current.

import {
  DEFAULT_PERSONALITY,
  PERSONALITY_PRESETS,
} from "../companion/constants";
import { redactPII, redactWithMap, type PiiMap } from "../pii/redact";

// ponytail: §4.2 — map per request agar placeholder konsisten; tanpa map =
// sekali pakai (summary/journal tersimpan, tak direstore).
function scrub(content: string, map?: PiiMap): string {
  return map ? redactWithMap(content, map) : redactPII(content);
}

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
Do not present speculative financial information as certainty.

Always reply in English.`;

export function buildChatPrompt(
  memorySummary: string,
  recent: { role: "user" | "companion"; content: string }[],
  currentMessage: string,
  // ponytail: Phase 2 — slug preset ATAU teks custom user. Undefined (kolom
  // belum migrasi) = default. Custom disuntik mentah, sudah divalidasi di PATCH.
  personality?: string | null,
  map?: PiiMap
): PromptMessage[] {
  const messages: PromptMessage[] = [{ role: "system", content: SYSTEM_PROMPT }];

  const raw = (personality ?? DEFAULT_PERSONALITY).trim() || DEFAULT_PERSONALITY;
  const preset = PERSONALITY_PRESETS.find((p) => p.id === raw);
  messages.push({
    role: "system",
    // ponytail: FR-08 — custom user disensor (preset slug tak perlu), memory
    // lama yang telanjur simpan alamat ikut tersensor saat dibaca.
    content: `TONE\n${preset ? preset.instruction : scrub(raw, map)}`,
  });

  if (memorySummary.trim()) {
    messages.push({
      role: "system",
      content: `MEMORY\n${scrub(memorySummary, map)}`,
    });
  }

  for (const m of recent) {
    messages.push({
      role: m.role === "user" ? "user" : "assistant",
      content: scrub(m.content, map),
    });
  }

  messages.push({ role: "user", content: scrub(currentMessage, map) });
  return messages;
}

// ponytail: FR-11 decision helper — prompt sama seperti chat + 1 blok mode.
// Hasil tetap disimpan ke history (bukan efemeral seperti council).
export function buildDecisionPrompt(
  memorySummary: string,
  recent: { role: "user" | "companion"; content: string }[],
  currentMessage: string,
  personality?: string | null,
  map?: PiiMap
): PromptMessage[] {
  const messages = buildChatPrompt(
    memorySummary,
    recent,
    currentMessage,
    personality,
    map
  );
  messages.push({
    role: "system",
    content:
      "DECISION MODE\nThe user wants help thinking through a decision. " +
      "Break it into distinct options; for each option list the key " +
      "pros and cons grounded in the conversation above. " +
      "End with 1-3 short clarifying questions that would make the " +
        "choice clearer. Do not make the decision for the user and do " +
        "not present speculation as certainty. Write in English.",
  });
  return messages;
}

// ponytail: FR-07 journal (PRD §10) — untuk DIBACA user langsung, bukan
// konteks internal seperti memory summary. Poin nyata percakapan hari itu.
export function buildJournalPrompt(
  entryDate: string,
  messages: { role: "user" | "companion"; content: string }[]
): PromptMessage[] {
  const convo = messages
    .map((m) => `${m.role === "user" ? "User" : "Companion"}: ${redactPII(m.content)}`)
    .join("\n");
  return [
    {
      role: "system",
      content:
        "Write a short daily journal entry summarizing the conversation below. " +
        "This is for the user to read back later — capture real highlights " +
        "(topics discussed, decisions, feelings, open threads), not technical " +
        "metadata. Keep it warm and personal, a few short paragraphs or " +
        "bullets. Write in English. " +
        "Reply with the entry text only, no preamble.",
    },
    {
      role: "user",
      content: `Date: ${entryDate}\n\nConversation:\n${convo}`,
    },
  ];
}

// ponytail: Phase 9 — prompt ringkas terpisah (PRD §15/§27). Ambil recent yang
// SAMA dengan chat prompt agar summary konsisten dengan konteks yang dilihat user.
export function buildSummaryPrompt(
  previousSummary: string,
  recent: { role: "user" | "companion"; content: string }[],
  map?: PiiMap
): PromptMessage[] {
  const convo = recent
    .map((m) => `${m.role === "user" ? "User" : "Companion"}: ${scrub(m.content, map)}`)
    .join("\n");
  const previous = previousSummary.trim()
    ? `Previous summary:\n${scrub(previousSummary, map)}\n\n`
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

// ponytail: §4.4 greeting — 1 pertanyaan pembuka dari memory terakhir,
// bukan sapaan generik. Summary di-scrub (isi DB = teks restored);
// placeholder kecil kemungkinan dikutip dalam pertanyaan topik.
export function buildGreetingPrompt(summary: string): PromptMessage[] {
  return [
    {
      role: "system",
      content:
        "Write ONE short opening question for a personal AI companion " +
        "welcoming the user back after a day or more away. Refer to the " +
        "last topic or open thread in the memory below — warm and personal, " +
        "never a generic greeting. Write in English. " +
        "Reply with the single question only, no preamble.",
    },
    {
      role: "user",
      content: `Memory:\n${redactPII(summary)}`,
    },
  ];
}
