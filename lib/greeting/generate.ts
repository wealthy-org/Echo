import { eq } from "drizzle-orm";
import { companions } from "../../db/schema";
import { db } from "../db";
import { buildGreetingPrompt } from "../llm/prompt";
import { completeChat } from "../llm/openrouter";

// ponytail: §4.4 — sapaan proaktif 1x per jendela >24 jam, dari memory
// terakhir. NULL = baris lama: lewati sekali, langsung set now.
// Gagal LLM = null, chat tidak terganggu.

export const GREETING_AFTER_MS = 24 * 60 * 60 * 1000;

// ponytail: murni (tanpa DB) agar bisa di-self-check.
export function isGreetingDue(
  lastSeenAt: Date | null,
  now: Date = new Date()
): boolean {
  return (
    lastSeenAt !== null && now.getTime() - lastSeenAt.getTime() >= GREETING_AFTER_MS
  );
}

export async function maybeGreet(companionId: string): Promise<string | null> {
  const rows = await db
    .select({
      memorySummary: companions.memorySummary,
      lastSeenAt: companions.lastSeenAt,
    })
    .from(companions)
    .where(eq(companions.id, companionId));
  const companion = rows[0];
  if (!companion) return null;

  const now = new Date();
  async function touch() {
    await db
      .update(companions)
      .set({ lastSeenAt: now })
      .where(eq(companions.id, companionId));
  }

  if (!companion.lastSeenAt || !isGreetingDue(companion.lastSeenAt, now)) {
    await touch();
    return null;
  }
  if (!companion.memorySummary.trim()) {
    await touch();
    return null;
  }

  try {
    const greeting = (
      await completeChat(buildGreetingPrompt(companion.memorySummary))
    ).trim();
    await touch();
    return greeting || null;
  } catch (e) {
    console.error("greeting generation failed:", e);
    await touch();
    return null;
  }
}
