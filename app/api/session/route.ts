import { NextResponse } from "next/server";
import { getSession } from "../../../lib/auth/session";

export async function GET() {
  const session = await getSession();

  if (!session.walletAddress || !session.companionId) {
    return NextResponse.json({ authenticated: false });
  }

  return NextResponse.json({
    authenticated: true,
    walletAddress: session.walletAddress,
    companionId: session.companionId,
  });
}
