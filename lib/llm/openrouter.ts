// Server-only — API key tidak boleh masuk client bundle.
import type { PromptMessage } from "./prompt";

// ponytail: fetch langsung, tanpa SDK. Non-streaming (Phase 8 yang streaming).
// Model via env agar gampang ganti tanpa deploy ulang; default ikut PRD (router free).

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export function getChatModel(): string {
  return process.env.OPENROUTER_MODEL || "openrouter/free";
}

export async function completeChat(messages: PromptMessage[]): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY must be set");
  }

  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
      "http-referer": "https://echo-companion.app",
      "x-title": "Echo - Wallet AI Companion",
    },
    body: JSON.stringify({ model: getChatModel(), messages }),
  });

  if (!res.ok) {
    throw new Error(`OpenRouter request failed with status ${res.status}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: unknown } }[];
  };
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("OpenRouter returned an empty response");
  }
  return content;
}
