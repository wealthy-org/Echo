// Client-safe — tidak ada import server. Satu sumber kebenaran untuk batas
// panjang pesan (dipakai route POST /api/chat + ChatWindow).

export const MAX_MESSAGE_LENGTH = 4000;

// ponytail: Phase 9 — regen memorySummary tiap 20 pesan user (PRD §15).
export const MEMORY_REGEN_THRESHOLD = 20;

// ponytail: Phase 11 / FR-11 — 10 pesan user/menit + 100/hari per companion.
// Tanpa dep baru: dihitung dari chat_messages via index yang sudah ada.
export const CHAT_RATE_LIMIT_COUNT = 10;
export const CHAT_RATE_LIMIT_WINDOW_MS = 60 * 1000;
export const CHAT_RATE_LIMIT_DAILY_COUNT = 100;
export const CHAT_RATE_LIMIT_DAY_MS = 24 * 60 * 60 * 1000;
