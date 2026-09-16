// Client-safe — tidak ada import server. Satu sumber kebenaran untuk batas
// panjang pesan (dipakai route POST /api/chat + ChatWindow).

export const MAX_MESSAGE_LENGTH = 4000;

// ponytail: Phase 9 — regen memorySummary tiap 20 pesan user (PRD §15).
export const MEMORY_REGEN_THRESHOLD = 20;
