"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  useAccount,
  useChainId,
  useConnect,
  useDisconnect,
  useSignMessage,
  useSwitchChain,
} from "wagmi";
import { appChain } from "../../lib/wallet/chains";
import { buildAuthMessage } from "../../lib/auth/message";
import { useSession } from "./use-session";

// ponytail: 1 tombol untuk 6 state (install / connect / switch / sign-in / signed / loading).
// Error cukup tooltip + label "Try again" — UI error beneran di Phase 11 (FR-12).

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
  const { signMessageAsync, isPending: isSigning } = useSignMessage();
  const { session, isLoading: isSessionLoading, refresh } = useSession();
  const router = useRouter();
  const [signError, setSignError] = useState<string | null>(null);

  const base = `gradient-button ${className}`.trim();

  // ponytail: mount gate — SSR/client render pertama harus identik.
  // Deteksi wallet (EIP-6963) + pemulihan koneksi hanya ada di browser;
  // tanpa ini server render "Install" sementara client render "Connect"/address → hydration mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted || status === "reconnecting" || isSessionLoading) {
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

  // ponytail: session milik wallet lain (ganti wallet tanpa disconnect) = belum signed.
  const signedIn =
    !!session?.authenticated &&
    !!address &&
    session.walletAddress === address.toLowerCase();

  async function handleSignIn() {
    // ponytail: pin connector+account eksplisit — signMessageAsync tanpa ini
    // menebak connector aktif dan bisa salah pada percobaan pertama
    // (Phantom menyuntik >1 provider). Guard phantom cegah throw buta.
    if (!address || !phantom) return;
    setSignError(null);
    try {
      const timestamp = new Date().toISOString();
      const signature = await signMessageAsync({
        message: buildAuthMessage(address, timestamp),
        connector: phantom,
        account: address,
      });
      const res = await fetch("/api/wallet/connect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address, timestamp, signature }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSignError(data?.error?.message ?? "Sign in failed.");
        return;
      }
      onAction?.();
      await refresh();
      // ponytail: push gantikan reload — session cookie sudah tersimpan,
      // /chat baca ulang via useSession. Tanpa reload = tanpa flicker wallet reconnect.
      router.push("/chat");
    } catch (e) {
      // ponytail: error asli ke console — tooltip cuma label user-friendly.
      // Kalau sign masih gagal, 1 baris ini vonis finalnya.
      console.error("wallet sign-in failed:", e);
      const msg = (e as Error)?.message ?? "";
      setSignError(
        /reject|denied|cancel/i.test(msg)
          ? "Signature cancelled. Click once more to try again."
          : "Sign in failed. Please try again."
      );
    }
  }

  async function handleDisconnect() {
    onAction?.();
    disconnect();
    await fetch("/api/wallet/disconnect", { method: "POST" });
    await refresh();
  }

  if (!signedIn) {
    return (
      <button
        type="button"
        disabled={isSigning}
        title={signError ?? undefined}
        onClick={() => void handleSignIn()}
        className={base}
      >
        {/* ponytail: label ganti "Try again" saat gagal — penanda tanpa geser layout. */}
        <span>
          {isSigning ? "Signing…" : signError ? "Try again" : "Sign in with Echo"}
        </span>
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
        onClick={() => void handleDisconnect()}
        className="gradient-button flex h-8 w-8 items-center justify-center rounded-full text-white"
      >
        <span aria-hidden className="text-base leading-none">
          ×
        </span>
      </button>
    </span>
  );
}
