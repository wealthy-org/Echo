import { robinhood, robinhoodTestnet } from "viem/chains";

// ponytail: viem sudah menyediakan robinhood (4663) + robinhoodTestnet (46630) — tanpa defineChain manual.
// Default = testnet (dev). Set NEXT_PUBLIC_ROBINHOOD_CHAIN_ID=4663 untuk production.

const CHAIN_ID = Number(
  process.env.NEXT_PUBLIC_ROBINHOOD_CHAIN_ID ?? robinhoodTestnet.id
);

export const appChain =
  CHAIN_ID === robinhood.id ? robinhood : robinhoodTestnet;
