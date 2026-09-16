"use client";

import { useEffect, useState } from "react";
import {
  useAccount,
  useChainId,
  useConnect,
  useDisconnect,
  useSwitchChain,
} from "wagmi";
import { appChain } from "../../lib/wallet/chains";

// ponytail: 1 tombol untuk 4 state (install / connect / switch / connected).
// Error cukup tooltip — UI error beneran di Phase 11 (FR-12).

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function ConnectButton({
  className = "",
  connectLabel = "Connect Wallet",
  onAction,
}: {
  className?: string;
  connectLabel?: string;
  onAction?: () => void;
}) {
  const { address, isConnected, status } = useAccount();
  const chainId = useChainId();
  const {
    connectors,
    connect,
    isPending: isConnecting,
    error: connectError,
  } = useConnect();
  const { disconnect } = useDisconnect();
  const {
    switchChain,
    isPending: isSwitching,
    error: switchError,
  } = useSwitchChain();

  const base = `gradient-button ${className}`.trim();

  // ponytail: mount gate — SSR/client render pertama harus identik.
  // Deteksi wallet (EIP-6963) + pemulihan koneksi hanya ada di browser;
  // tanpa ini server render "Install" sementara client render "Connect"/address → hydration mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted || status === "reconnecting") {
    return (
      <button type="button" disabled className={base}>
        <span>{connectLabel}</span>
      </button>
    );
  }

  // ponytail: preferensi Phantom via EIP-6963 rdns/nama; fallback connector pertama bila user cuma punya 1 wallet.
  const phantom = connectors.find((c) => /phantom/i.test(`${c.id} ${c.name}`));

  if (!phantom) {
    return (
      <a
        href="https://phantom.app/download"
        target="_blank"
        rel="noopener noreferrer"
        onClick={onAction}
        className={base}
      >
        <span>Install Phantom</span>
      </a>
    );
  }

  if (!isConnected) {
    return (
      <button
        type="button"
        disabled={isConnecting}
        title={connectError?.message}
        onClick={() => {
          onAction?.();
          connect({ connector: phantom, chainId: appChain.id });
        }}
        className={base}
      >
        <span>{isConnecting ? "Connecting…" : connectLabel}</span>
      </button>
    );
  }

  if (chainId !== appChain.id) {
    return (
      <button
        type="button"
        disabled={isSwitching}
        title={switchError?.message}
        onClick={() => {
          onAction?.();
          switchChain({ chainId: appChain.id });
        }}
        className={base}
      >
        <span>{isSwitching ? "Switching…" : `Switch to ${appChain.name}`}</span>
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      <span className="rounded-full border border-white/15 px-4 py-2 text-sm text-white">
        {address ? shortAddress(address) : "Connected"}
      </span>
      <button
        type="button"
        aria-label="Disconnect wallet"
        title="Disconnect"
        onClick={() => {
          onAction?.();
          disconnect();
        }}
        className="gradient-button flex h-8 w-8 items-center justify-center rounded-full text-white"
      >
        <span aria-hidden className="text-base leading-none">
          ×
        </span>
      </button>
    </span>
  );
}
