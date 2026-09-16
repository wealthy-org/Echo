// Server-safe — dipakai client (untuk sign) dan server (rebuild + cek freshness).
// Format deterministik: server merekonstruksi pesan dari (address, timestamp),
// jadi tidak perlu parsing. Sejiwa SIWE/EIP-4361 tapi minimal untuk MVP.

export const AUTH_MESSAGE_TTL_MS = 5 * 60 * 1000;

export function buildAuthMessage(walletAddress: string, timestamp: string) {
  return `Sign in to Echo\n\nWallet: ${walletAddress.toLowerCase()}\nTime: ${timestamp}`;
}

export function isFreshTimestamp(timestamp: string, now = Date.now()) {
  const t = Date.parse(timestamp);
  if (Number.isNaN(t)) return false;
  const age = Math.abs(now - t);
  return age <= AUTH_MESSAGE_TTL_MS;
}
