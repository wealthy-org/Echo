"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "../../components/wallet/use-session";
import { ConnectButton } from "../../components/wallet/connect-button";
import { ChatWindow } from "../../components/chat/chat-window";

// ponytail: shell dulu, UI chat penuh Phase 6. Guard di client karena session
// hidup di httpOnly cookie — server component butuh getSession sendiri (boros),
// 1 fetch via useSession cukup.

export default function ChatPage() {
  const router = useRouter();
  const { session, isLoading } = useSession();

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
          <span className="font-semibold tracking-[-0.02em]">
            Echo
          </span>
          <ConnectButton />
        </div>
      </header>
      <section className="flex min-h-0 flex-1 flex-col">
        <ChatWindow />
      </section>
    </main>
  );
}
