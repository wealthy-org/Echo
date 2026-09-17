import { NextResponse } from "next/server";
import { and, desc, eq, lt } from "drizzle-orm";
import { chatMessages } from "../../../../db/schema";
import { db } from "../../../../lib/db";
import { getSession } from "../../../../lib/auth/session";
import { ensureJournalUpToDate } from "../../../../lib/journal/generate";

// ponytail: Phase 2 cursor pagination — keyset seq (urutan total insert).
// createdAt kembar per pasang + id acak tidak bisa jadi tumpuan.
// Cursor = seq integer string; fetch limit+1 untuk tahu nextCursor.

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 50;

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session.walletAddress || !session.companionId) {
    return err("UNAUTHENTICATED", "Sign in required.", 401);
  }

  const { searchParams } = new URL(request.url);
  const parsedLimit = Number.parseInt(searchParams.get("limit") ?? "", 10);
  const limit = Number.isNaN(parsedLimit)
    ? DEFAULT_LIMIT
    : Math.min(Math.max(parsedLimit, 1), MAX_LIMIT);

  const rawCursor = searchParams.get("cursor");
  let cursor: number | null = null;
  if (rawCursor) {
    const parsed = Number.parseInt(rawCursor, 10);
    if (!Number.isSafeInteger(parsed) || parsed < 1) {
      return err("VALIDATION_ERROR", "Invalid cursor.", 400);
    }
    cursor = parsed;
  }

  // ponytail: FR-07 — buka chat di hari berbeda = generate journal kemarin
  // (1x/hari saja yang kena, hari biasa cuma bandingkan tanggal).
  // Gagal generate tidak menggagalkan history.
  await ensureJournalUpToDate(session.companionId);

  const rows = await db
    .select({
      id: chatMessages.id,
      role: chatMessages.role,
      content: chatMessages.content,
      seq: chatMessages.seq,
    })
    .from(chatMessages)
    .where(
      and(
        eq(chatMessages.companionId, session.companionId),
        cursor !== null ? lt(chatMessages.seq, cursor) : undefined
      )
    )
    .orderBy(desc(chatMessages.seq))
    .limit(limit + 1);

  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  const nextCursor =
    rows.length > limit && last ? String(last.seq) : null;

  return NextResponse.json({
    messages: page.reverse().map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
    })),
    nextCursor,
  });
}
