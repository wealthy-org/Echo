// Server-only — API key tidak boleh masuk client bundle.
import type { PromptMessage } from "./prompt";

// ponytail: fetch langsung, tanpa SDK. completeChat (non-streaming) dipakai
// Phase 9 memory generation; chat user pakai completeChatStream (Phase 8).
// Model via env agar gampang ganti tanpa deploy ulang; default ikut PRD (router free).

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export function getChatModel(): string {
  return process.env.OPENROUTER_MODEL || "openrouter/free";
}

function requireKey(): string {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY must be set");
  }
  return apiKey;
}

function buildHeaders(apiKey: string) {
  return {
    "content-type": "application/json",
    authorization: `Bearer ${apiKey}`,
    "http-referer": "https://echo-companion.app",
    // ponytail: ASCII hyphen — undici menolak non-latin1 di header (em dash).
    "x-title": "Echo - Wallet AI Companion",
  };
}

export async function completeChat(messages: PromptMessage[]): Promise<string> {
  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: buildHeaders(requireKey()),
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

// ponytail: yield delta mentah; framing SSE (data:/[DONE]) jadi urusan route.
// Event OpenRouter satu baris data: per event — cukup split "\n", tanpa parser SSE.
export async function* completeChatStream(
  messages: PromptMessage[]
): AsyncGenerator<string> {
  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: buildHeaders(requireKey()),
    body: JSON.stringify({ model: getChatModel(), messages, stream: true }),
  });
  if (!res.ok || !res.body) {
    throw new Error(`OpenRouter request failed with status ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        const text = line.trim();
        if (!text.startsWith("data:")) continue;
        const payload = text.slice(5).trim();
        if (payload === "[DONE]") return;
        // ponytail: payload rusak = stream korup, gagalkan sekalian
        // daripada user membaca balasan setengah-palsu.
        const event = JSON.parse(payload) as {
          choices?: { delta?: { content?: unknown } }[];
        };
        const delta = event.choices?.[0]?.delta?.content;
        if (typeof delta === "string" && delta) yield delta;
      }
    }
  } finally {
    reader.releaseLock();
  }
}
