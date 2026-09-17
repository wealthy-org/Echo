// Client-safe — helper tanggal UTC untuk FR-07 journal (PRD §18).
// ponytail: UTC, bukan timezone user — jam lokal butuh offset per wallet,
// tambah kalau user minta. 1 hari = 1 string YYYY-MM-DD, bandingkan string.

export function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}
