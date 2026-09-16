import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { chatMessages } from "../../../../db/schema";
import { db } from "../../../../lib/db";
import { getSession } from "../../../../lib/auth/session";

// ponytail: 50 pesan terakhir (FR-06 MVP), ascending agar langsung dirender berurutan.

const HISTORY_LIMIT = 50;

export async function GET() {
  const session = await getSession();
  if (!session.walletAddress || !session.companionId) {
    return NextResponse.json(
      { error: { code: "UNAUTHENTICATED", message: "Sign in required." } },
      { status: 401 }
    );
  }

  const rows = await db
    .select({ role: chatMessages.role, content: chatMessages.content })
    .from(chatMessages)
    .where(eq(chatMessages.companionId, session.companionId))
    .orderBy(desc(chatMessages.createdAt))
    .limit(HISTORY_LIMIT);

  return NextResponse.json({
    messages: rows.reverse().map((m) => ({
      role: m.role,
      content: m.content,
    })),
  });
}
