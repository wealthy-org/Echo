// Client-safe — tidak ada import server. Satu sumber kebenaran untuk batas
// panjang pesan (dipakai route POST /api/chat + ChatWindow).

export const MAX_MESSAGE_LENGTH = 4000;

// ponytail: Phase 9 — regen memorySummary tiap 10 pesan user (PRD §15).
// 10 user ≈ 20 total (user+companion); summary siap sebelum pesan lama
// jatuh dari jendela recent-20.
export const MEMORY_REGEN_THRESHOLD = 10;

// ponytail: Phase 11 / FR-11 — 5 pesan user/menit + 50/hari per companion.
// Tanpa dep baru: dihitung dari chat_messages via index yang sudah ada.
export const CHAT_RATE_LIMIT_COUNT = 1;
export const CHAT_RATE_LIMIT_WINDOW_MS = 60 * 1000;
export const CHAT_RATE_LIMIT_DAILY_COUNT = 50;
export const CHAT_RATE_LIMIT_DAY_MS = 24 * 60 * 60 * 1000;
