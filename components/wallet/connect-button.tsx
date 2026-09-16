"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  useAccount,
  useChainId,
  useConnect,
  useDisconnect,
  useSignMessage,
  useSwitchChain,
} from "wagmi";
import { appChain } from "../../lib/wallet/chains";
import { wagmiConfig } from "../../lib/wallet/config";
import { buildAuthMessage } from "../../lib/auth/message";
import { useSession } from "./use-session";
import { useCompanion } from "../companion/use-companion";
import {
  REDIRECTING_EVENT,
  REDIRECT_DONE_EVENT,
} from "./redirect-overlay";

// ponytail: 1 tombol, 1 klik: connect → (switch) → sign → /chat.
// Tanpa copy "Install" — wallet tak terdeteksi = alert (+ deep-link di mobile).
// EIP-6963 announce bisa telat: beri 1x jeda 800ms sebelum vonis hilang.

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function isMobileBrowser() {
  if (typeof navigator === "undefined") return false;
  return /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);
}

function handleMissingWallet() {
  // ponytail: Chrome/Safari mobile tidak punya injected provider walau app
  // Phantom terinstall — normal. Arahkan buka situs di browser Phantom.
  if (isMobileBrowser()) {
    if (
      window.confirm(
        "Phantom wallet not detected in this browser. Open this site inside Phantom's browser?"
      )
    ) {
      window.location.href = `https://phantom.app/ul/browse/${encodeURIComponent(
        window.location.href
      )}`;
    }
    return;
  }
  window.alert(
    "Phantom wallet not detected. Install Phantom (phantom.app/download), then try again."
  );
}

export function ConnectButton({
  className = "",
  connectLabel = "Sign in",
  showChatLink = true,
  // ponytail: landing sembunyikan address (nama companion + Open chat cukup);
  // halaman chat tetap tampil address.
  showAddress = true,
  onAction,
}: {
  className?: string;
  connectLabel?: string;
  showChatLink?: boolean;
  showAddress?: boolean;
  onAction?: () => void;
}) {
  const { address, isConnected, status } = useAccount();
  const chainId = useChainId();
  const {
    connectors,
    connectAsync,
    isPending: isConnecting,
    error: connectError,
  } = useConnect();
  const { disconnect } = useDisconnect();
  const {
    switchChainAsync,
    isPending: isSwitching,
    error: switchError,
  } = useSwitchChain();
  const { signMessageAsync, isPending: isSigning } = useSignMessage();
  const { session, isLoading: isSessionLoading, refresh } = useSession();
  const { profile } = useCompanion();
  const router = useRouter();
  const [flowError, setFlowError] = useState<string | null>(null);

  const base = `gradient-button ${className}`.trim();

  // ponytail: mount gate — SSR/client render pertama harus identik.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted || status === "reconnecting" || isSessionLoading) {
    return (
      <button type="button" disabled className={base}>
        <span>{connectLabel}</span>
      </button>
    );
  }

  // ponytail: session milik wallet lain (ganti wallet tanpa disconnect) = belum signed.
  const signedIn =
    !!session?.authenticated &&
    !!address &&
    session.walletAddress === address.toLowerCase();

  async function resolvePhantom() {
    const match = (c: { id: string; name: string }) =>
      /phantom/i.test(`${c.id} ${c.name}`);
    const found = connectors.find(match);
    if (found) return found;
    await new Promise((r) => setTimeout(r, 800));
    return wagmiConfig.connectors.find(match);
  }

  async function handlePrimary() {
    onAction?.();
    setFlowError(null);
    const phantom = await resolvePhantom();
    if (!phantom) {
      handleMissingWallet();
      return;
    }
    try {
      let account = address;
      let cid: number = chainId;
      if (!isConnected) {
        const res = await connectAsync({
          connector: phantom,
          chainId: appChain.id,
        });
        account = res.accounts[0] ?? account;
        cid = res.chainId;
      }
      if (cid !== appChain.id) {
        await switchChainAsync({ chainId: appChain.id });
      }
      const target = account ?? address;
      if (!target) throw new Error("No account connected");
      const timestamp = new Date().toISOString();
      const signature = await signMessageAsync({
        message: buildAuthMessage(target, timestamp),
        connector: phantom,
        account: target,
      });
      const res = await fetch("/api/wallet/connect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address: target, timestamp, signature }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFlowError(data?.error?.message ?? "Sign in failed.");
        window.dispatchEvent(new Event(REDIRECT_DONE_EVENT));
        return;
      }
      // ponytail: overlay global (bukan state lokal) — selamat dari unmount
      // saat klik berasal dari mobile menu yang langsung menutup.
      window.dispatchEvent(new Event(REDIRECTING_EVENT));
      await refresh();
      // ponytail: push gantikan reload — session cookie sudah tersimpan,
      // /chat baca ulang via useSession. Tanpa reload = tanpa flicker wallet reconnect.
      router.push("/chat");
    } catch (e) {
      // ponytail: error asli ke console — label cukup user-friendly.
      console.error("wallet sign-in failed:", e);
      window.dispatchEvent(new Event(REDIRECT_DONE_EVENT));
      const msg = (e as Error)?.message ?? "";
      setFlowError(
        /reject|denied|cancel/i.test(msg)
          ? "Cancelled. Click once more to try again."
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

  if (signedIn) {
    return (
      <span className="inline-flex items-center gap-2">
        {showChatLink && (
          <Link
            href="/chat"
            onClick={() => onAction?.()}
            className="rounded-full border border-white/15 px-4 py-2 text-sm font-medium text-white transition hover:border-white/40"
          >
            Open chat →
          </Link>
        )}
        {/* <span className="rounded-full border border-white/15 px-4 py-2 text-sm text-white">
          {showAddress || !profile
            ? address
              ? shortAddress(address)
              : "Connected"
            : profile.companion_name}
        </span> */}
        <button
          type="button"
          onClick={() => void handleDisconnect()}
          className="rounded-full border border-white/15 px-4 py-2 text-sm text-white/70 transition hover:border-red-400/60 hover:text-red-300"
        >
          Logout
        </button>
      </span>
    );
  }

  const busy = isConnecting || isSwitching || isSigning;

  return (
    <button
      type="button"
      disabled={busy}
      title={flowError ?? connectError?.message ?? switchError?.message}
      onClick={() => void handlePrimary()}
      className={base}
    >
      {/* ponytail: label ganti "Try again" saat gagal — penanda tanpa geser layout. */}
      <span>
        {busy
          ? isSigning
            ? "Signing…"
            : isSwitching
              ? "Switching…"
              : "Signing in…"
          : flowError
            ? "Try again"
            : connectLabel}
      </span>
    </button>
  );
}
