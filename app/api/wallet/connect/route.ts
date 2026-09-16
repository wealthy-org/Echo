import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { isAddress, isHex, verifyMessage } from "viem";
import { companions } from "../../../../db/schema";
import { db } from "../../../../lib/db";
import { buildAuthMessage, isFreshTimestamp } from "../../../../lib/auth/message";
import { getSession } from "../../../../lib/auth/session";

// ponytail: error ikut format PRD FR-12 { error: { code, message } }.

function badRequest(message: string, status = 400) {
  return NextResponse.json(
    { error: { code: "VALIDATION_ERROR", message } },
    { status }
  );
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body.");
  }

  const { address, timestamp, signature } = (body ?? {}) as {
    address?: unknown;
    timestamp?: unknown;
    signature?: unknown;
  };

  if (typeof address !== "string" || !isAddress(address)) {
    return badRequest("Invalid wallet address.");
  }
  if (typeof timestamp !== "string" || !isFreshTimestamp(timestamp)) {
    return NextResponse.json(
      { error: { code: "EXPIRED_MESSAGE", message: "Signature expired. Please sign again." } },
      { status: 401 }
    );
  }
  if (typeof signature !== "string" || !isHex(signature)) {
    return badRequest("Invalid signature.");
  }

  // ponytail: lowercase cegah duplikat identitas akibat beda casing (PRD Risk 5).
  const normalized = address.toLowerCase() as `0x${string}`;
  const message = buildAuthMessage(normalized, timestamp);

  let valid = false;
  try {
    valid = await verifyMessage({
      address: normalized,
      message,
      signature: signature as `0x${string}`,
    });
  } catch {
    valid = false;
  }
  if (!valid) {
    return NextResponse.json(
      { error: { code: "INVALID_SIGNATURE", message: "Signature verification failed." } },
      { status: 401 }
    );
  }

  try {
    // ponytail: get-or-create — jatah Phase 5 yang bocor ke sini karena flow PRD §7.1
    // menuntut companion tersedia saat login. Profile lengkap tetap Phase 5.
    const [existing] = await db
      .select()
      .from(companions)
      .where(eq(companions.walletAddress, normalized))
      .limit(1);

    let companion = existing;
    if (!companion) {
      const [created] = await db
        .insert(companions)
        .values({ walletAddress: normalized })
        .returning();
      companion = created;
    }

    const session = await getSession();
    session.walletAddress = normalized;
    session.companionId = companion.id;
    await session.save();

    return NextResponse.json({ ok: true, companionId: companion.id });
  } catch (e) {
    console.error("wallet/connect failed:", e);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." } },
      { status: 500 }
    );
  }
}
