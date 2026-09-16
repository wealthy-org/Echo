import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { companions } from "../../../db/schema";
import { db } from "../../../lib/db";
import { getSession } from "../../../lib/auth/session";
import {
  DEFAULT_PERSONALITY,
  MAX_COMPANION_NAME_LENGTH,
  MAX_CUSTOM_TONE_LENGTH,
  isPresetId,
} from "../../../lib/companion/constants";

// ponytail: kolom DB message_count di-map ke total_message_count agar API ikut PRD FR-08
// tanpa rename kolom. created_at ikut terserialisasi ISO otomatis.
// PATCH + reset di file ini/ini — guard session dipakai ulang (bukan wallet dari body).

type CompanionRow = typeof companions.$inferSelect;

function toProfile(c: CompanionRow) {
  return {
    companion_name: c.companionName,
    wallet_address: c.walletAddress,
    created_at: c.createdAt,
    total_message_count: c.messageCount,
    // ponytail: ?? default untuk baris sebelum migrasi personality.
    personality: c.personality ?? DEFAULT_PERSONALITY,
  };
}

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

async function requireCompanion() {
  const session = await getSession();
  if (!session.walletAddress || !session.companionId) {
    return { error: err("UNAUTHENTICATED", "Sign in required.", 401) };
  }
  const [companion] = await db
    .select()
    .from(companions)
    .where(eq(companions.id, session.companionId))
    .limit(1);
  if (!companion) {
    return { error: err("NOT_FOUND", "Companion not found.", 404) };
  }
  return { companion };
}

export async function GET() {
  const result = await requireCompanion();
  if ("error" in result) return result.error;
  return NextResponse.json(toProfile(result.companion));
}

export async function PATCH(request: Request) {
  const result = await requireCompanion();
  if ("error" in result) return result.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return err("VALIDATION_ERROR", "Invalid JSON body.", 400);
  }
  const { name, personality } = (body ?? {}) as {
    name?: unknown;
    personality?: unknown;
  };

  // ponytail: name & personality independen — boleh salah satu atau keduanya.
  const set: { companionName?: string; personality?: string } = {};

  if (name !== undefined) {
    const trimmed = typeof name === "string" ? name.trim() : "";
    if (!trimmed) {
      return err("VALIDATION_ERROR", "Companion name must not be empty.", 400);
    }
    if (trimmed.length > MAX_COMPANION_NAME_LENGTH) {
      return err(
        "VALIDATION_ERROR",
        `Companion name must be at most ${MAX_COMPANION_NAME_LENGTH} characters.`,
        400
      );
    }
    set.companionName = trimmed;
  }

  if (personality !== undefined) {
    const trimmed =
      typeof personality === "string" ? personality.trim() : "";
    // ponytail: slug preset dikenal ATAU teks custom (≤300). Selain itu 400.
    if (!trimmed) {
      return err("VALIDATION_ERROR", "Personality must not be empty.", 400);
    }
    if (!isPresetId(trimmed) && trimmed.length > MAX_CUSTOM_TONE_LENGTH) {
      return err(
        "VALIDATION_ERROR",
        `Custom tone must be at most ${MAX_CUSTOM_TONE_LENGTH} characters.`,
        400
      );
    }
    set.personality = trimmed;
  }

  if (Object.keys(set).length === 0) {
    return err("VALIDATION_ERROR", "Nothing to update.", 400);
  }

  await db
    .update(companions)
    .set(set)
    .where(eq(companions.id, result.companion.id));
  return NextResponse.json(
    toProfile({ ...result.companion, ...set })
  );
}
