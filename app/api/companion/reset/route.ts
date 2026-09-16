import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { chatMessages, companions } from "../../../../db/schema";
import { db } from "../../../../lib/db";
import { getSession } from "../../../../lib/auth/session";

// ponytail: FR-10 — hapus history + nol-kan memory/counter dalam 1 transaksi.
// companion_name & created_at tidak disentuh (known since tetap).

export async function POST() {
  const session = await getSession();
  if (!session.walletAddress || !session.companionId) {
    return NextResponse.json(
      { error: { code: "UNAUTHENTICATED", message: "Sign in required." } },
      { status: 401 }
    );
  }
  const companionId = session.companionId;

  try {
    await db.transaction(async (tx) => {
      await tx
        .delete(chatMessages)
        .where(eq(chatMessages.companionId, companionId));
      await tx
        .update(companions)
        .set({ memorySummary: "", messageCount: 0, messagesSinceSummary: 0 })
        .where(eq(companions.id, companionId));
    });
  } catch (e) {
    console.error("companion reset failed:", e);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "Something went wrong. Please try again.",
        },
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
