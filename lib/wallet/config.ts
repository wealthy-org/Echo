import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { robinhood, robinhoodTestnet } from "viem/chains";
import { appChain } from "./chains";

// ponytail: injected() saja — Phantom mode EVM terdeteksi otomatis via EIP-6963.
// Tanpa Phantom SDK / modal lib; tambah kalau injected terbukti kurang.

// ponytail: transports wajib mencakup kedua chain ID (syarat type wagmi);
// hanya chain aktif yang dipakai, RPC override untuk chain aktif.
const rpcUrl = process.env.NEXT_PUBLIC_ROBINHOOD_RPC_URL || undefined;

export const wagmiConfig = createConfig({
  chains: [appChain],
  connectors: [injected()],
  transports: {
    [robinhood.id]: http(rpcUrl),
    [robinhoodTestnet.id]: http(rpcUrl),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
