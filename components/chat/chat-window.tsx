"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { MAX_MESSAGE_LENGTH } from "../../lib/chat/constants";
import { CompanionContent } from "./message-content";

// ponytail: 1 file untuk list + input + send + loading/error (PRD Phase 6).
// Visual ikut sistem docs/reference (token echo-*, kartu #19191b, gradient-button).
// Kontrak Phase 8: POST /api/chat { message } -> SSE `data: <delta-json>`, tutup `[DONE]`.
// Phase 9 tinggal hook memory regen setelah stream selesai — bubble tak berubah.

interface ChatMessage {
  role: "user" | "companion";
  content: string;
}

export function ChatWindow() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [streamed, setStreamed] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const tooLong = draft.length > MAX_MESSAGE_LENGTH;

  // ponytail: auto-grow 1–5 baris (±160px), selebihnya scroll dalam textarea.
  function autoresize() {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  // ponytail: history dimuat sekali saat mount (Phase 7). Gagal = empty state,
  // bukan error fatal — user tetap bisa kirim pesan baru.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/chat/history", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : { messages: [] }))
      .then((data) => {
        if (!cancelled && Array.isArray(data.messages)) {
          setMessages(
            data.messages.filter(
              (m: ChatMessage) => m.role === "user" || m.role === "companion"
            )
          );
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingHistory(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
    // ponytail: validasi panjang di client dulu — error muncul sebelum request.
    if (message.length > MAX_MESSAGE_LENGTH) {
      setError(`Message too long (max ${MAX_MESSAGE_LENGTH} characters).`);
      return;
    }
    setDraft("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    setError(null);
    setStreamed(false);
    setMessages((m) => [...m, { role: "user", content: message }]);
    setSending(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message }),
      });
      // ponytail: error validasi (400/401/404) tetap JSON — hanya 200 yang SSE.
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error?.message ?? "Send failed.");
      }
      // Bubble companion dibuat kosong duluan — delta pertama tinggal isi.
      setMessages((m) => [...m, { role: "companion", content: "" }]);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let reply = "";
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            const text = line.trim();
            if (!text.startsWith("data:")) continue;
            const payload = text.slice(5).trim();
            if (payload === "[DONE]") continue;
            const parsed: unknown = JSON.parse(payload);
            if (typeof parsed === "string") {
              reply += parsed;
              const snapshot = reply;
              setStreamed(true);
              setMessages((m) => {
                const next = [...m];
                next[next.length - 1] = { role: "companion", content: snapshot };
                return next;
              });
            } else {
              throw new Error(
                (parsed as { error?: string })?.error ?? "Send failed."
              );
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
      if (!reply.trim()) {
        // ponytail: stream selesai tanpa isi = buang bubble kosong, gagalkan sekalian.
        setMessages((m) => m.slice(0, -1));
        throw new Error("Companion returned an empty response.");
      }
    } catch (e) {
      setError((e as Error)?.message ?? "Send failed. Please try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-[68rem] flex-1 flex-col space-y-4 overflow-y-auto px-5 py-6">
        {loadingHistory && (
          <p className="animate-pulse pt-16 text-center text-sm text-echo-muted/60">
            Loading history…
          </p>
        )}
        {!loadingHistory && messages.length === 0 && !sending && (
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
            {m.role === "user" ? (
              <p className="max-w-[80%] whitespace-pre-wrap rounded-3xl bg-echo-blue px-5 py-3 text-sm leading-6 text-white">
                {m.content}
              </p>
            ) : (
              <div className="max-w-[80%] rounded-3xl border border-white/10 bg-echo-card px-5 py-3 text-sm leading-6 text-white">
                <CompanionContent content={m.content} />
              </div>
            )}
          </div>
        ))}
        {sending && !streamed && (
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
        <div className="mx-auto flex w-full max-w-[68rem] items-center justify-between px-5 pt-2 text-xs">
          <span className="text-echo-peach">
            {tooLong
              ? `Message too long (max ${MAX_MESSAGE_LENGTH} characters).`
              : ""}
          </span>
          <span className={tooLong ? "text-echo-peach" : "text-white/30"}>
            {draft.length}/{MAX_MESSAGE_LENGTH}
          </span>
        </div>
        <form
          className="mx-auto flex w-full max-w-[68rem] items-end gap-2 px-5 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            void handleSend();
          }}
        >
          <textarea
            ref={inputRef}
            rows={1}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              autoresize();
            }}
            onKeyDown={handleKeyDown}
            placeholder="Message… (Enter kirim, Shift+Enter baris baru)"
            aria-label="Chat message"
            className="max-h-40 min-w-0 flex-1 resize-none overflow-y-auto rounded-3xl border border-white/10 bg-echo-card px-5 py-3 text-sm leading-6 text-white placeholder:text-white/30 focus:border-white/40 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!draft.trim() || sending || tooLong}
            onMouseMove={trackCursor}
            className="gradient-button shrink-0 rounded-full px-6 py-3 text-sm font-medium text-white disabled:opacity-40"
          >
            <span>Send</span>
          </button>
        </form>
      </div>
    </div>
  );
}
