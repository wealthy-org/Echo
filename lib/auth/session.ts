import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";

// Server-only — jangan import dari client component.

export interface SessionData {
  walletAddress: string;
  companionId: string;
}

function getSessionOptions(): SessionOptions {
  const password = process.env.SESSION_SECRET;
  if (!password || password.length < 32) {
    throw new Error("SESSION_SECRET must be set with at least 32 characters");
  }
  return {
    cookieName: "echo_session",
    password,
    // ponytail: TTL 7 hari (keputusan user). Stateles: tanpa tabel sessions di DB.
    ttl: 60 * 60 * 24 * 7,
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    },
  };
}

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), getSessionOptions());
}
