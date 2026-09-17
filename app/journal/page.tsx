"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Menu } from "lucide-react";
import { useSession } from "../../components/wallet/use-session";
import { CompanionContent } from "../../components/chat/message-content";
import { ChatSidebar } from "../../components/chat/chat-sidebar";

// ponytail: FR-07 — 1 halaman list entri per tanggal, terbaru dulu.
// Guard + loading ikut pola app/chat/page.tsx.

interface JournalEntry {
  entryDate: string;
  highlights: string;
  createdAt: string;
}

function formatDate(iso: string) {
  return new Date(iso.length <= 10 ? `${iso}T00:00:00Z` : iso).toLocaleDateString(
    "en-US",
    { weekday: "long", month: "long", day: "numeric", year: "numeric" }
  );
}

export default function JournalPage() {
  const router = useRouter();
  const { session, isLoading } = useSession();
  const [entries, setEntries] = useState<JournalEntry[] | null>(null);
  // ponytail: ikut pola app/chat/page.tsx — lazy init, bukan effect.
  const [sidebarOpen, setSidebarOpen] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(min-width: 768px)").matches
  );

  useEffect(() => {
    if (!isLoading && !session?.authenticated) router.replace("/");
  }, [isLoading, session, router]);

  useEffect(() => {
    if (!session?.authenticated) return;
    let cancelled = false;
    fetch("/api/journal", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : { entries: [] }))
      .then((data) => {
        if (!cancelled && Array.isArray(data.entries)) setEntries(data.entries);
      })
      .catch(() => {
        if (!cancelled) setEntries([]);
      });
    return () => {
      cancelled = true;
    };
  }, [session?.authenticated]);

  if (isLoading || !session?.authenticated) {
    return (
      <main className="flex min-h-screen items-center justify-center text-white">
        <div className="site-background" aria-hidden />
        <p className="text-echo-muted/60">Loading journal…</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen text-white">
      <div className="site-background" aria-hidden />
      <ChatSidebar
        open={sidebarOpen}
        onToggle={() => setSidebarOpen((v) => !v)}
        active="journal"
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-white/10 bg-black/75 backdrop-blur-xl">
          <div className="mx-auto flex h-[72px] w-full max-w-[68rem] items-center gap-2 px-5">
            {!sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(true)}
                aria-label="Open sidebar"
                className="-ml-3 rounded-full p-2 text-echo-muted transition hover:bg-white/5 hover:text-white md:hidden"
              >
                <Menu size={18} />
              </button>
            )}
            <h1 className="font-semibold tracking-[-0.02em]">Journal</h1>
          </div>
        </header>
      <section className="mx-auto w-full max-w-[68rem] flex-1 space-y-4 px-5 py-6">
        {entries === null && (
          <p className="animate-pulse pt-16 text-center text-sm text-echo-muted/60">
            Loading entries…
          </p>
        )}
        {entries !== null && entries.length === 0 && (
          <div className="flex flex-col items-center pt-16 text-center">
            <p className="max-w-md text-2xl font-semibold tracking-[-0.02em] text-white">
              No entries yet.
            </p>
            <p className="mt-3 max-w-sm text-sm leading-6 text-echo-muted/60">
              Chat with your companion — a highlight entry appears here the
              next day.
            </p>
          </div>
        )}
        {entries?.map((e) => (
          <article
            key={e.entryDate}
            className="rounded-3xl border border-white/10 bg-echo-card px-5 py-4"
          >
            <p className="text-xs uppercase tracking-[0.2em] text-echo-cyan">
              {formatDate(e.entryDate)}
            </p>
            <div className="mt-2 text-sm leading-6 text-white">
              <CompanionContent content={e.highlights} />
            </div>
          </article>
        ))}
      </section>
      </div>
    </main>
  );
}
