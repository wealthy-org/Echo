import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { companions } from "../../../db/schema";
import { db } from "../../../lib/db";
import { getSession } from "../../../lib/auth/session";

// ponytail: kolom DB message_count di-map ke total_message_count agar API ikut PRD FR-08
// tanpa rename kolom. created_at ikut terserialisasi ISO otomatis.

export async function GET() {
  const session = await getSession();
  if (!session.walletAddress || !session.companionId) {
    return NextResponse.json(
      { error: { code: "UNAUTHENTICATED", message: "Sign in required." } },
      { status: 401 }
    );
  }

  const [companion] = await db
    .select()
    .from(companions)
    .where(eq(companions.id, session.companionId))
    .limit(1);

  if (!companion) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Companion not found." } },
      { status: 404 }
    );
  }

  return NextResponse.json({
    companion_name: companion.companionName,
    wallet_address: companion.walletAddress,
    created_at: companion.createdAt,
    total_message_count: companion.messageCount,
  });
}
