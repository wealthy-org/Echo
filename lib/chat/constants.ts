// Client-safe — tidak ada import server. Satu sumber kebenaran untuk batas
// panjang pesan (dipakai route POST /api/chat + ChatWindow).

export const MAX_MESSAGE_LENGTH = 4000;

// ponytail: Phase 9 — regen memorySummary tiap 20 pesan user (PRD §15).
export const MEMORY_REGEN_THRESHOLD = 20;

// ponytail: Phase 11 — maks 20 pesan user / 10 menit per companion (FR-11).
// Tanpa dep baru: dihitung dari chat_messages via index yang sudah ada.
export const CHAT_RATE_LIMIT_COUNT = 20;
export const CHAT_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
