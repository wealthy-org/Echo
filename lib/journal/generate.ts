// Server-only — jangan import dari client component.
// ponytail: FR-07 journal (PRD §18). Idempoten via UNIQUE(companion_id,
// entry_date) + onConflictDoNothing. Gagal = log saja, request utama jalan terus.

import { and, asc, eq, sql } from "drizzle-orm";
import { chatMessages, companions, journalEntries } from "../../db/schema";
import { db } from "../db";
import { buildJournalPrompt } from "../llm/prompt";
import { completeChat } from "../llm/openrouter";
import { utcToday } from "./dates";

// ponytail: cap pesan per hari agar prompt tetap ringan (batas function hosting).
const JOURNAL_DAY_LIMIT = 50;

export async function ensureJournalUpToDate(
  companionId: string
): Promise<void> {
  try {
    const [companion] = await db
      .select({ lastActiveDate: companions.lastActiveDate })
      .from(companions)
      .where(eq(companions.id, companionId))
      .limit(1);
    if (!companion) return;

    const today = utcToday();
    const prev = companion.lastActiveDate;
    // ponytail: baris lama (NULL) = set hari ini tanpa backfill.
    if (!prev) {
      await db
        .update(companions)
        .set({ lastActiveDate: today })
        .where(eq(companions.id, companionId));
      return;
    }
    if (prev === today) return;

    // ponytail: ::date ikut timezone sesi DB (default UTC di Neon).
    // Samakan dengan utcToday di atas; geser ke tz user kalau diminta.
    const dayMessages = await db
      .select({ role: chatMessages.role, content: chatMessages.content })
      .from(chatMessages)
      .where(
        and(
          eq(chatMessages.companionId, companionId),
          sql`${chatMessages.createdAt}::date = ${prev}::date`
        )
      )
      .orderBy(asc(chatMessages.seq))
      .limit(JOURNAL_DAY_LIMIT);

    // ponytail: kemarin kosong = tidak ada entri kosong (§18), tanggal tetap maju.
    if (dayMessages.length === 0) {
      await db
        .update(companions)
        .set({ lastActiveDate: today })
        .where(eq(companions.id, companionId));
      return;
    }

    const highlights = await completeChat(
      buildJournalPrompt(
        prev,
        dayMessages.map((m) => ({
          role: m.role as "user" | "companion",
          content: m.content,
        }))
      )
    );
    await db
      .insert(journalEntries)
      .values({ companionId, entryDate: prev, highlights })
      .onConflictDoNothing();
    await db
      .update(companions)
      .set({ lastActiveDate: today })
      .where(eq(companions.id, companionId));
  } catch (e) {
    console.error("journal generation failed:", e);
  }
}
