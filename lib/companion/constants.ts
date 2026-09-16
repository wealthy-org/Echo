// Client-safe. Max panjang nama companion (FR-09) — route + panel sama-sama import.
export const MAX_COMPANION_NAME_LENGTH = 50;

// Sentinel nama bawaan DB (db/schema default 'Companion'). Connect route pakai
// ini untuk tahu mana companion yang belum pernah di-rename.
export const DEFAULT_COMPANION_NAME = "Companion";
