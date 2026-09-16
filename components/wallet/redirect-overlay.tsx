"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

// ponytail: overlay global 1 instance (di layout) — didorong event agar selamat
// dari unmount (klik dari mobile menu menutup menu + instance tombolnya).
// ConnectButton dispatch "echo:redirecting" sebelum push /chat,
// "echo:redirect-done" di semua jalur gagal.
// Hilang via 3 jalan (mana yang duluan): ganti pathname (utama — layout tidak
// remount saat push, jadi state harus dibersihkan manual), event done, timeout.

export const REDIRECTING_EVENT = "echo:redirecting";
export const REDIRECT_DONE_EVENT = "echo:redirect-done";

export function RedirectOverlay() {
  const [visible, setVisible] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const show = () => setVisible(true);
    const hide = () => setVisible(false);
    window.addEventListener(REDIRECTING_EVENT, show);
    window.addEventListener(REDIRECT_DONE_EVENT, hide);
    return () => {
      window.removeEventListener(REDIRECTING_EVENT, show);
      window.removeEventListener(REDIRECT_DONE_EVENT, hide);
    };
  }, []);

  useEffect(() => {
    setVisible(false);
  }, [pathname]);

  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => setVisible(false), 10_000);
    return () => clearTimeout(t);
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-label="Opening your companion"
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-black/70 backdrop-blur-sm"
    >
      <span className="flex h-12 w-12 animate-pulse items-center justify-center rounded-2xl bg-[#0038ff] text-xl font-bold text-white">
        E
      </span>
      <p className="text-sm text-white/80">Opening your companion…</p>
    </div>
  );
}
