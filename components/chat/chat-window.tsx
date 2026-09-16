"use client";

import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";

// ponytail: 1 file untuk list + input + send + loading/error (PRD Phase 6).
// Visual ikut sistem docs/reference (token echo-*, kartu #19191b, gradient-button).
// Kontrak yg diasumsikan ke Phase 7: POST /api/chat { message } -> { content }.
// Streaming (Phase 8) tinggal ganti fetch ini dengan reader — bentuk bubble tak berubah.

interface ChatMessage {
  role: "user" | "companion";
  content: string;
}

export function ChatWindow() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // ponytail: pola yang sama dengan GradientLink landing — glow ikuti kursor.
  const trackCursor = useCallback((e: MouseEvent<HTMLElement>) => {
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${e.clientX - rect.left}px`);
    el.style.setProperty("--my", `${e.clientY - rect.top}px`);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  async function handleSend() {
    const message = draft.trim();
    if (!message || sending) return;
    setDraft("");
    setError(null);
    setMessages((m) => [...m, { role: "user", content: message }]);
    setSending(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? "Send failed.");
      setMessages((m) => [...m, { role: "companion", content: data.content }]);
    } catch (e) {
      setError((e as Error)?.message ?? "Send failed. Please try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-[68rem] flex-1 flex-col space-y-4 overflow-y-auto px-5 py-6">
        {messages.length === 0 && !sending && (
          <div className="flex flex-col items-center pt-16 text-center">
            <div className="mb-4 flex items-center gap-3 text-xs uppercase tracking-[0.2em] text-echo-cyan">
              <span className="h-1.5 w-1.5 rounded-full bg-echo-cyan"></span>
              Companion online
            </div>
            <p className="max-w-md text-2xl font-semibold tracking-[-0.02em] text-white">
              Mulai ngobrol dengan companion-mu.
            </p>
            <p className="mt-3 max-w-sm text-sm leading-6 text-echo-muted/60">
              Satu wallet, satu companion pribadi yang mengingat konteksmu.
            </p>
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <p
              className={`max-w-[80%] whitespace-pre-wrap rounded-3xl px-5 py-3 text-sm leading-6 ${
                m.role === "user"
                  ? "bg-echo-blue text-white"
                  : "border border-white/10 bg-echo-card text-white"
              }`}
            >
              {m.content}
            </p>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <p className="animate-pulse rounded-3xl border border-white/10 bg-echo-card px-5 py-3 text-sm text-echo-muted/60">
              Echo mengetik…
            </p>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      {error && (
        <p className="px-4 pb-1 text-center text-sm text-echo-peach">{error}</p>
      )}
      <div className="border-t border-white/10 bg-black/30">
        <form
          className="mx-auto flex w-full max-w-[68rem] gap-2 px-5 py-4"
          onSubmit={(e) => {
            e.preventDefault();
            void handleSend();
          }}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Message…"
            aria-label="Chat message"
            className="min-w-0 flex-1 rounded-full border border-white/10 bg-echo-card px-5 py-3 text-sm text-white placeholder:text-white/30 focus:border-white/40 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!draft.trim() || sending}
            onMouseMove={trackCursor}
            className="gradient-button rounded-full px-6 py-3 text-sm font-medium text-white disabled:opacity-40"
          >
            <span>Send</span>
          </button>
        </form>
      </div>
    </div>
  );
}
