"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "../../components/wallet/use-session";
import { useCompanion } from "../../components/companion/use-companion";
import { ConnectButton } from "../../components/wallet/connect-button";
import { CompanionPanel } from "../../components/companion/companion-panel";
import { ChatWindow } from "../../components/chat/chat-window";

// ponytail: shell dulu, UI chat penuh Phase 6. Guard di client karena session
// hidup di httpOnly cookie — server component butuh getSession sendiri (boros),
// 1 fetch via useSession cukup.

export default function ChatPage() {
  const router = useRouter();
  const { session, isLoading } = useSession();
  const { profile } = useCompanion();
  const [panelOpen, setPanelOpen] = useState(false);

  useEffect(() => {
    if (!isLoading && !session?.authenticated) router.replace("/");
  }, [isLoading, session, router]);

  if (isLoading || !session?.authenticated) {
    return (
      <main className="flex min-h-screen items-center justify-center text-white">
        <div className="site-background" aria-hidden />
        <p className="text-echo-muted/60">Loading companion…</p>
      </main>
    );
  }

  return (
    <main className="flex h-screen flex-col text-white">
      <div className="site-background" aria-hidden />
      <header className="sticky top-0 z-50 border-b border-white/10 bg-black/75 backdrop-blur-xl">
        <div className="mx-auto flex h-[72px] w-full max-w-[68rem] items-center justify-between px-5">
          <div className="relative">
            <button
              onClick={() => setPanelOpen((v) => !v)}
              className="-ml-3 flex items-center gap-2 rounded-full px-3 py-1.5 font-semibold tracking-[-0.02em] transition hover:bg-white/5"
              aria-haspopup="dialog"
              aria-expanded={panelOpen}
              aria-label="Companion profile"
            >
              {profile?.companion_name ?? "Echo"}
              <span
                aria-hidden
                className={`text-xs text-echo-muted transition-transform ${panelOpen ? "rotate-180" : ""}`}
              >
                ▼
              </span>
            </button>
            {panelOpen && (
              <div className="absolute left-0 top-full z-50 mt-3">
                <CompanionPanel />
              </div>
            )}
          </div>
          <ConnectButton showChatLink={false} />
        </div>
      </header>
      <section className="flex min-h-0 flex-1 flex-col">
        <ChatWindow />
      </section>
    </main>
  );
}
