import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { chatMessages, companions } from "../../../db/schema";
import { db } from "../../../lib/db";
import { getSession } from "../../../lib/auth/session";
import { buildChatPrompt } from "../../../lib/llm/prompt";
import { completeChat } from "../../../lib/llm/openrouter";
import { MAX_MESSAGE_LENGTH } from "../../../lib/chat/constants";

// ponytail: non-streaming dulu (Phase 8). Balasan { content } sesuai kontrak Phase 6.
// Batas panjang single-source dari lib/chat/constants (client memvalidasi duluan) —
// rate limit beneran Phase 11 (FR-11).

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

  const recentDesc = await db
    .select({ role: chatMessages.role, content: chatMessages.content })
    .from(chatMessages)
    .where(eq(chatMessages.companionId, companion.id))
    .orderBy(desc(chatMessages.createdAt))
    .limit(RECENT_LIMIT);
  const recent = recentDesc.reverse().map((m) => ({
    role: m.role as "user" | "companion",
    content: m.content,
  }));

  const trimmed = message.trim();
  let reply: string;
  try {
    reply = await completeChat(
      buildChatPrompt(companion.memorySummary, recent, trimmed)
    );
  } catch (e) {
    console.error("chat completion failed:", e);
    return err(
      "LLM_ERROR",
      "Companion is unavailable right now. Please try again.",
      500
    );
  }

  // ponytail: transaksi beneran (driver pooled) — gagal di mana pun =
  // tidak ada yang tersimpan, counter tidak pernah drift.
  try {
    await db.transaction(async (tx) => {
      await tx.insert(chatMessages).values([
        { companionId: companion.id, role: "user", content: trimmed },
        { companionId: companion.id, role: "companion", content: reply },
      ]);
      await tx
        .update(companions)
        .set({ messageCount: companion.messageCount + 2 })
        .where(eq(companions.id, companion.id));
    });
  } catch (e) {
    console.error("chat persist failed:", e);
    return err(
      "INTERNAL_ERROR",
      "Something went wrong. Please try again.",
      500
    );
  }

  return NextResponse.json({ content: reply });
}
