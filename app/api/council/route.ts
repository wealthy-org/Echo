import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { chatMessages, companions } from "../../../db/schema";
import { db } from "../../../lib/db";
import { getSession } from "../../../lib/auth/session";
import { buildChatPrompt } from "../../../lib/llm/prompt";
import {
  completeChat,
  getChatModel,
  getCouncilModel,
  upstreamStatus,
} from "../../../lib/llm/openrouter";
import {
  restorePlaceholders,
  type PiiMap,
} from "../../../lib/pii/redact";
import { MAX_MESSAGE_LENGTH } from "../../../lib/chat/constants";

// ponytail: FR-09/§4.3 council — 1 prompt sama ke 2 model :free, non-streaming.
// Eksploratif: tanpa tulis DB (history/memory/journal/rate-limit tak tersentuh).
// Gagal satu = gagal semua (keputusan user): Promise.all, 500 konsisten.

const RECENT_LIMIT = 20;

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

// ponytail: info nama model untuk modal penjelasan — tanpa kirim pesan.
export async function GET() {
  const session = await getSession();
  if (!session.walletAddress || !session.companionId) {
    return err("UNAUTHENTICATED", "Sign in required.", 401);
  }
  return NextResponse.json({
    modelA: getChatModel(),
    modelB: getCouncilModel(),
  });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session.walletAddress || !session.companionId) {
    return err("UNAUTHENTICATED", "Sign in required.", 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return err("VALIDATION_ERROR", "Invalid JSON body.", 400);
  }
  const { message } = (body ?? {}) as { message?: unknown };
  if (typeof message !== "string" || !message.trim()) {
    return err("VALIDATION_ERROR", "Message must not be empty.", 400);
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return err(
      "VALIDATION_ERROR",
      `Message must be at most ${MAX_MESSAGE_LENGTH} characters.`,
      400
    );
  }

  const [companion] = await db
    .select()
    .from(companions)
    .where(eq(companions.id, session.companionId))
    .limit(1);
  if (!companion) {
    return err("NOT_FOUND", "Companion not found.", 404);
  }

  const recentDesc = await db
    .select({ role: chatMessages.role, content: chatMessages.content })
    .from(chatMessages)
    .where(eq(chatMessages.companionId, companion.id))
    .orderBy(desc(chatMessages.seq))
    .limit(RECENT_LIMIT);
  const recent = recentDesc.reverse().map((m) => ({
    role: m.role as "user" | "companion",
    content: m.content,
  }));

  const trimmed = message.trim();
  // ponytail: satu map untuk kedua model — placeholder konsisten, restore sama.
  const piiMap: PiiMap = new Map();
  const prompt = buildChatPrompt(
    companion.memorySummary,
    recent,
    trimmed,
    companion.personality,
    piiMap
  );
  const modelA = getChatModel();
  const modelB = getCouncilModel();

  try {
    const [rawA, rawB] = await Promise.all([
      completeChat(prompt, modelA),
      completeChat(prompt, modelB),
    ]);
    return NextResponse.json({
      a: { model: modelA, content: restorePlaceholders(rawA, piiMap) },
      b: { model: modelB, content: restorePlaceholders(rawB, piiMap) },
    });
  } catch (e) {
    console.error("council failed:", e);
    // ponytail: teruskan 429 agar klien tahu ini kuota, bukan bug.
    // Detail mentah di log saja; pesan klien tetap generik.
    if (upstreamStatus(e) === 429) {
      return NextResponse.json(
        {
          error: {
            code: "RATE_LIMITED",
            message: "Free model quota exceeded. Please wait and try again.",
          },
        },
        { status: 429, headers: { "retry-after": "60" } }
      );
    }
    return err(
      "INTERNAL_ERROR",
      "Comparison unavailable right now. Please try again.",
      500
    );
  }
}
