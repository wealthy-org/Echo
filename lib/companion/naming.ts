import { MAX_COMPANION_NAME_LENGTH } from "./constants";

// ponytail: nama default acak Sifat + Hewan (12x12 = 144 kombinasi).
// Sync, tanpa network, tanpa dependensi — pengganti lookup ENS yang dibatalkan.
// Kembar antar user tidak masalah: identitas tetap wallet address.

const ADJECTIVES = [
  "Brave",
  "Calm",
  "Bright",
  "Swift",
  "Quiet",
  "Loyal",
  "Curious",
  "Bold",
  "Gentle",
  "Witty",
  "Stellar",
  "Nimble",
];

const ANIMALS = [
  "Fox",
  "Owl",
  "Wolf",
  "Bear",
  "Falcon",
  "Tiger",
  "Otter",
  "Raven",
  "Lynx",
  "Badger",
  "Heron",
  "Mantis",
];

function pick<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

export function getDefaultCompanionName(): string {
  return `${pick(ADJECTIVES)} ${pick(ANIMALS)}`.slice(
    0,
    MAX_COMPANION_NAME_LENGTH
  );
}
