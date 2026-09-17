"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Menu } from "lucide-react";
import { useSession } from "../../components/wallet/use-session";
import { ConnectButton } from "../../components/wallet/connect-button";
import { ChatWindow } from "../../components/chat/chat-window";
import { ChatSidebar } from "../../components/chat/chat-sidebar";

// ponytail: shell dulu, UI chat penuh Phase 6. Guard di client karena session
// hidup di httpOnly cookie — server component butuh getSession sendiri (boros),
// 1 fetch via useSession cukup.

export default function ChatPage() {
  const router = useRouter();
  const { session, isLoading } = useSession();
  // ponytail: sidebar terbuka default di desktop, tertutup di mobile
  // (di sana ia jadi overlay). Lazy init, bukan effect (lint set-state-in-effect).
  const [sidebarOpen, setSidebarOpen] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(min-width: 768px)").matches
  );

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
    <main className="flex h-screen text-white">
      <div className="site-background" aria-hidden />
      <ChatSidebar
        open={sidebarOpen}
        onToggle={() => setSidebarOpen((v) => !v)}
        active="chat"
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-white/10 bg-black/75 backdrop-blur-xl">
          <div className="mx-auto flex h-[72px] w-full max-w-[68rem] items-center justify-between px-5">
            <div className="flex items-center">
              {!sidebarOpen && (
                <button
                  onClick={() => setSidebarOpen(true)}
                  aria-label="Open sidebar"
                  className="-ml-3 rounded-full p-2 text-echo-muted transition hover:bg-white/5 hover:text-white md:hidden"
                >
                  <Menu size={18} />
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <ConnectButton showChatLink={false} />
            </div>
          </div>
        </header>
        <section className="flex min-h-0 flex-1 flex-col">
          <ChatWindow />
        </section>
      </div>
    </main>
  );
}
