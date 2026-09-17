// Server-only — API key tidak boleh masuk client bundle.
import type { PromptMessage } from "./prompt";

// ponytail: fetch langsung, tanpa SDK. completeChat (non-streaming) dipakai
// Phase 9 memory generation; chat user pakai completeChatStream (Phase 8).
// Model via env agar gampang ganti tanpa deploy ulang; default ikut PRD (router free).

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export function getChatModel(): string {
  return process.env.OPENROUTER_MODEL || "openrouter/free";
}

// ponytail: FR-09 council — model B via env, default = ID :free yang hidup
// per 2026-09-17. Roster rotasi; ganti via env tanpa deploy bila 404 lagi.
export function getCouncilModel(): string {
  return process.env.OPENROUTER_MODEL_SECONDARY || "google/gemma-4-31b-it:free";
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

// ponytail: error bawa status upstream agar route bisa teruskan 429/404
// apa adanya (detail mentah tetap di server log, tak ke klien).
export function upstreamStatus(e: unknown): number | undefined {
  const s = (e as { upstreamStatus?: unknown })?.upstreamStatus;
  return typeof s === "number" ? s : undefined;
}

async function upstreamError(res: Response): Promise<Error> {
  let detail = "";
  try {
    const body = (await res.json()) as { error?: { message?: unknown } };
    if (typeof body?.error?.message === "string") detail = body.error.message;
  } catch {
    // ponytail: body bukan JSON = abaikan, status cukup.
  }
  const message = detail
    ? `OpenRouter ${res.status}: ${detail}`
    : `OpenRouter request failed with status ${res.status}`;
  return Object.assign(new Error(message), { upstreamStatus: res.status });
}

export async function completeChat(
  messages: PromptMessage[],
  model?: string
): Promise<string> {
  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: buildHeaders(requireKey()),
    body: JSON.stringify({ model: model ?? getChatModel(), messages }),
  });

  if (!res.ok) {
    throw await upstreamError(res);
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
    throw await upstreamError(res);
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
