import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { journalEntries } from "../../../db/schema";
import { db } from "../../../lib/db";
import { getSession } from "../../../lib/auth/session";

// ponytail: FR-07 — daftar entri per tanggal, terbaru dulu. Session-based,
// ikut pola /api/chat/history (bukan ?wallet=, lihat keputusan auth).

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function GET() {
  const session = await getSession();
  if (!session.walletAddress || !session.companionId) {
    return err("UNAUTHENTICATED", "Sign in required.", 401);
  }

  const rows = await db
    .select({
      entryDate: journalEntries.entryDate,
      highlights: journalEntries.highlights,
      createdAt: journalEntries.createdAt,
    })
    .from(journalEntries)
    .where(eq(journalEntries.companionId, session.companionId))
    .orderBy(desc(journalEntries.entryDate));

  return NextResponse.json({ entries: rows });
}
