import { NextResponse } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { chatMessages, companions } from "../../../db/schema";
import { db } from "../../../lib/db";
import { getSession } from "../../../lib/auth/session";
import { buildChatPrompt, buildSummaryPrompt } from "../../../lib/llm/prompt";
import { completeChat, completeChatStream } from "../../../lib/llm/openrouter";
import { ensureJournalUpToDate } from "../../../lib/journal/generate";
import {
  PLACEHOLDER_TAIL,
  restorePlaceholders,
  type PiiMap,
} from "../../../lib/pii/redact";
import {
  CHAT_RATE_LIMIT_COUNT,
  CHAT_RATE_LIMIT_DAILY_COUNT,
  CHAT_RATE_LIMIT_DAY_MS,
  CHAT_RATE_LIMIT_WINDOW_MS,
  MAX_MESSAGE_LENGTH,
  MEMORY_REGEN_THRESHOLD,
} from "../../../lib/chat/constants";

// ponytail: SSE Phase 8 — `data: <delta-json>` per chunk, `data: [DONE]` tutup,
// `data: {"error": "..."}` gagal tengah jalan. Simpan ke DB SETELAH stream
// selesai (pair user+companion tetap atomik) — rate limit beneran Phase 11.

const RECENT_LIMIT = 20;

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session.walletAddress || !session.companionId) {
    return err("UNAUTHENTICATED", "Sign in required.", 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return err("VALIDATION_ERROR", "Invalid JSON body.", 400);
  }
  const { message } = (body ?? {}) as { message?: unknown };
  if (typeof message !== "string" || !message.trim()) {
    return err("VALIDATION_ERROR", "Message must not be empty.", 400);
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return err(
      "VALIDATION_ERROR",
      `Message must be at most ${MAX_MESSAGE_LENGTH} characters.`,
      400
    );
  }

  const [companion] = await db
    .select()
    .from(companions)
    .where(eq(companions.id, session.companionId))
    .limit(1);
  if (!companion) {
    return err("NOT_FOUND", "Companion not found.", 404);
  }

  // ponytail: Phase 11 / FR-11 — 10/menit + 100/hari per companion, 1 query
  // dengan 2 agregat FILTER. Cek SEBELUM LLM call agar request ditolak tidak
  // membakar kuota. 429 tidak menyimpan apa pun (counter memory ikut aman).
  const minuteStart = new Date(Date.now() - CHAT_RATE_LIMIT_WINDOW_MS);
  const dayStart = new Date(Date.now() - CHAT_RATE_LIMIT_DAY_MS);
  const [usage] = await db
    .select({
      perMinute: sql<number>`count(*) filter (where ${chatMessages.createdAt} > ${minuteStart})::int`,
      perDay: sql<number>`count(*) filter (where ${chatMessages.createdAt} > ${dayStart})::int`,
      oldestMinute: sql<Date | null>`min(${chatMessages.createdAt}) filter (where ${chatMessages.createdAt} > ${minuteStart})`,
      oldestDay: sql<Date | null>`min(${chatMessages.createdAt}) filter (where ${chatMessages.createdAt} > ${dayStart})`,
    })
    .from(chatMessages)
    .where(
      and(
        eq(chatMessages.companionId, companion.id),
        eq(chatMessages.role, "user")
      )
    );
  const limited =
    usage.perMinute >= CHAT_RATE_LIMIT_COUNT
      ? {
          windowMs: CHAT_RATE_LIMIT_WINDOW_MS,
          oldest: usage.oldestMinute,
          message: "Too many messages. Please wait a minute and try again.",
        }
      : usage.perDay >= CHAT_RATE_LIMIT_DAILY_COUNT
        ? {
            windowMs: CHAT_RATE_LIMIT_DAY_MS,
            oldest: usage.oldestDay,
            message: "Daily message limit reached. Please try again tomorrow.",
          }
        : null;
  if (limited) {
    const retryAfter = limited.oldest
      ? Math.max(
          1,
          Math.ceil(
            (limited.oldest.getTime() + limited.windowMs - Date.now()) / 1000
          )
        )
      : Math.ceil(limited.windowMs / 1000);
    return NextResponse.json(
      {
        error: {
          code: "RATE_LIMITED",
          message: limited.message,
        },
      },
      { status: 429, headers: { "retry-after": String(retryAfter) } }
    );
  }

  const recentDesc = await db
    .select({ role: chatMessages.role, content: chatMessages.content })
    .from(chatMessages)
    .where(eq(chatMessages.companionId, companion.id))
    .orderBy(desc(chatMessages.seq))
    .limit(RECENT_LIMIT);
  const recent = recentDesc.reverse().map((m) => ({
    role: m.role as "user" | "companion",
    content: m.content,
  }));

  const trimmed = message.trim();
  // ponytail: §4.2 — satu map per request agar placeholder konsisten di
  // chat + summary regen; in-memory, tidak disimpan.
  const piiMap: PiiMap = new Map();
  const prompt = buildChatPrompt(
    companion.memorySummary,
    recent,
    trimmed,
    companion.personality,
    piiMap
  );
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: string) =>
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      let full = "";
      let raw = "";
      let emitted = 0;
      try {
        // ponytail: §4.2 restore per chunk dengan carryover — tahan ekor
        // sepanjang placeholder max agar token terbelah antar chunk tetap
        // pulih. Yang disimpan & dikirim = teks sudah direstore.
        for await (const delta of completeChatStream(prompt)) {
          raw += delta;
          const restored = restorePlaceholders(raw, piiMap);
          const emitUpTo = Math.max(emitted, restored.length - PLACEHOLDER_TAIL);
          const chunk = restored.slice(emitted, emitUpTo);
          emitted = emitUpTo;
          if (chunk) {
            full += chunk;
            send(JSON.stringify(chunk));
          }
        }
        const rest = restorePlaceholders(raw, piiMap).slice(emitted);
        if (rest) {
          full += rest;
          send(JSON.stringify(rest));
        }
        // ponytail: persist setelah complete — stream putus = tidak ada yang
        // tersimpan (parsial tidak ditampilkan ulang saat refresh, jujur).
        // ponytail: +1 per turn — hanya pesan user yang dihitung (PRD §15).
        const newSince = companion.messagesSinceSummary + 1;
        await db.transaction(async (tx) => {
          await tx.insert(chatMessages).values([
            { companionId: companion.id, role: "user", content: trimmed },
            { companionId: companion.id, role: "companion", content: full },
          ]);
          await tx
            .update(companions)
            .set({
              messageCount: companion.messageCount + 2,
              messagesSinceSummary: newSince,
            })
            .where(eq(companions.id, companion.id));
        });
        send("[DONE]");
        // ponytail: opsi A — regen setelah [DONE] terkirim (balasan sudah di
        // user), sebelum stream ditutup. Gagal regen tidak menggagalkan chat;
        // counter tetap naik sehingga dicoba lagi di turn berikut.
        if (newSince >= MEMORY_REGEN_THRESHOLD) {
          try {
            const summary = await completeChat(
              buildSummaryPrompt(companion.memorySummary, [
                ...recent,
                { role: "user", content: trimmed },
                { role: "companion", content: full },
              ], piiMap)
            );
            await db
              .update(companions)
              .set({ memorySummary: summary, messagesSinceSummary: 0 })
              .where(eq(companions.id, companion.id));
          } catch (e) {
            console.error("memory regen failed:", e);
          }
        }
        // ponytail: FR-07 fallback — user yang langsung kirim tanpa load
        // history tetap memicu journal. Idempoten, gagal = log saja.
        await ensureJournalUpToDate(companion.id);
      } catch (e) {
        console.error("chat stream failed:", e);
        send(
          JSON.stringify({
            error: full
              ? "Connection interrupted. Please try again."
              : "Companion is unavailable right now. Please try again.",
          })
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    },
  });
}
