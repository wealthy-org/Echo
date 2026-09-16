// Server-only — jangan import dari client component.
// Prompt ikut PRD §27: system + memory + recent + current.

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
  currentMessage: string
): PromptMessage[] {
  const messages: PromptMessage[] = [{ role: "system", content: SYSTEM_PROMPT }];

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
