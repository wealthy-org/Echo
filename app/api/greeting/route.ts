import { NextResponse } from "next/server";
import { getSession } from "../../../lib/auth/session";
import { maybeGreet } from "../../../lib/greeting/generate";

// ponytail: §4.4 — dipanggil client 1x setelah history pertama.
// { greeting: string | null }; null = belum waktunya / tanpa memory / gagal.

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function GET() {
  const session = await getSession();
  if (!session.walletAddress || !session.companionId) {
    return err("UNAUTHENTICATED", "Sign in required.", 401);
  }
  const greeting = await maybeGreet(session.companionId);
  return NextResponse.json({ greeting });
}
