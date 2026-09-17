// ponytail: FR-08/§4.2 PII redaction — mapping in-memory per request, tidak
// disimpan. Wallet = regex andal. Nama = heuristik ≥2 kata kapital
// (langit-langit: nama tempat/judul ikut kena; restore menutupinya di tampilan).

const EVM_ADDRESS = /0x[a-fA-F0-9]{40}/g;
// ponytail: min 2 kata kapital berurutan — 1 kata (awal kalimat) sengaja lolos.
const NAME_LIKE = /\b([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})+)\b/g;

// ponytail: placeholder terpanjang yang ditahan di ekor chunk streaming.
export const PLACEHOLDER_TAIL = 12;

export type PiiMap = Map<string, string>;

function nextToken(map: PiiMap, prefix: string, value: string): string {
  for (const [token, v] of map) {
    if (v === value && token.startsWith(prefix)) return token;
  }
  let n = 1;
  while (map.has(`${prefix}${n}]`)) n++;
  const token = `${prefix}${n}]`;
  map.set(token, value);
  return token;
}

// ponytail: wallet dulu, lalu nama — agar alamat tak termakan pola nama.
export function redactWithMap(text: string, map: PiiMap): string {
  const wallets = text.replace(EVM_ADDRESS, (m) => nextToken(map, "[WALLET_", m));
  return wallets.replace(NAME_LIKE, (m) => nextToken(map, "[NAME_", m));
}

// ponytail: hanya token yang ada di map; asing dibiarkan; idempoten.
export function restorePlaceholders(text: string, map: PiiMap): string {
  if (map.size === 0) return text;
  const tokens = [...map.keys()].sort((a, b) => b.length - a.length);
  const pattern = new RegExp(
    tokens.map((t) => t.replace(/[[\]]/g, "\\$&")).join("|"),
    "g"
  );
  return text.replace(pattern, (m) => map.get(m) ?? m);
}

// ponytail: konteks tanpa restore (summary/journal tersimpan) — map sekali pakai.
export function redactPII(text: string): string {
  return redactWithMap(text, new Map());
}
