"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { MAX_MESSAGE_LENGTH } from "../../lib/chat/constants";
import { CompanionContent } from "./message-content";

// ponytail: 1 file untuk list + input + send + loading/error (PRD Phase 6).
// Visual ikut sistem docs/reference (token echo-*, kartu #19191b, gradient-button).
// Kontrak Phase 8: POST /api/chat { message } -> SSE `data: <delta-json>`, tutup `[DONE]`.
// Phase 9 tinggal hook memory regen setelah stream selesai — bubble tak berubah.

interface ChatMessage {
  id: string;
  role: "user" | "companion";
  content: string;
}

interface HistoryRow {
  id?: unknown;
  role?: unknown;
  content?: unknown;
}

// ponytail: FR-09 council — hasil eksploratif, tidak masuk history.
interface CouncilSide {
  model?: unknown;
  content?: unknown;
}

interface CouncilResult {
  a: CouncilSide;
  b: CouncilSide;
}

interface CouncilQA {
  question: string;
  result: {
    a: { model: string; content: string };
    b: { model: string; content: string };
  };
}

function toCouncilSide(s: CouncilSide): { model: string; content: string } | null {
  if (typeof s.model !== "string" || typeof s.content !== "string") return null;
  return { model: s.model, content: s.content };
}

// ponytail: baris history valid = id string + role dikenal + content string.
function toChatMessage(m: HistoryRow): ChatMessage | null {
  if (typeof m.id !== "string") return null;
  if (m.role !== "user" && m.role !== "companion") return null;
  if (typeof m.content !== "string") return null;
  return { id: m.id, role: m.role, content: m.content };
}

// ponytail: FR-11 — detik -> M:SS (<1 jam) atau J:MM:SS (limit harian).
function formatCooldown(total: number) {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
}

export function ChatWindow() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [streamed, setStreamed] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [council, setCouncil] = useState(false);
  const [councilQA, setCouncilQA] = useState<CouncilQA | null>(null);
  // ponytail: FR-09 — modal penjelasan sekali-lihat sebelum council pertama.
  const [councilInfoOpen, setCouncilInfoOpen] = useState(false);
  const [councilDontShow, setCouncilDontShow] = useState(false);
  const [councilModels, setCouncilModels] = useState<{
    modelA: string;
    modelB: string;
  } | null>(null);

  // ponytail: klik ⚖️ saat OFF + belum pernah lihat = modal dulu, bukan langsung ON.
  async function handleCouncilToggle() {
    if (council) {
      setCouncil(false);
      return;
    }
    if (window.localStorage.getItem("echo-council-seen")) {
      setCouncil(true);
      return;
    }
    // ponytail: nama model best-effort — gagal fetch = label generik.
    try {
      const res = await fetch("/api/council");
      const data = (await res.json().catch(() => null)) as {
        modelA?: unknown;
        modelB?: unknown;
      } | null;
      if (typeof data?.modelA === "string" && typeof data?.modelB === "string") {
        setCouncilModels({ modelA: data.modelA, modelB: data.modelB });
      }
    } catch {
      /* abaikan — modal tetap tampil */
    }
    setCouncilDontShow(false);
    setCouncilInfoOpen(true);
  }

  function confirmCouncilInfo() {
    if (councilDontShow) {
      window.localStorage.setItem("echo-council-seen", "1");
    }
    setCouncilInfoOpen(false);
    setCouncil(true);
  }
  // ponytail: §4.4 — sapaan efemeral, tak masuk history/DB.
  const [greeting, setGreeting] = useState<string | null>(null);
  // ponytail: FR-11 — cooldown dari header retry-after 429; selama aktif
  // input dikunci + banner countdown. 0 = tidak cooldown.
  // ponytail: persist ke localStorage agar countdown selamat dari refresh.
  const [cooldownUntil, setCooldownUntil] = useState(() => {
    if (typeof window === "undefined") return 0;
    const saved = Number(window.localStorage.getItem("echo-cooldown-until"));
    if (!Number.isFinite(saved) || saved <= Date.now()) {
      window.localStorage.removeItem("echo-cooldown-until");
      return 0;
    }
    return saved;
  });
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!cooldownUntil) return;
    const ms = cooldownUntil - Date.now();
    // ponytail: ms <= 0 (clock skew) = timeout jalan langsung, tanpa setState sinkron.
    const t1 = setTimeout(() => {
      setCooldownUntil(0);
      window.localStorage.removeItem("echo-cooldown-until");
    }, Math.max(0, ms));
    const t2 = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearTimeout(t1);
      clearInterval(t2);
    };
  }, [cooldownUntil]);
  const cooling = cooldownUntil > 0;
  const cooldownLeft = Math.max(
    0,
    Math.ceil((cooldownUntil - now) / 1000)
  );
  const greetedRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // ponytail: Phase 2 infinite scroll — cursor di ref (baca fresh di observer),
  // cermin state untuk render. stick = user di dekat bawah → auto-scroll aman.
  const listRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<string | null>(null);
  const loadingRef = useRef(false);
  const stickRef = useRef(true);

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

  // ponytail: halaman pertama (50 terbaru) saat mount. Gagal = empty state,
  // bukan error fatal — user tetap bisa kirim pesan baru.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/chat/history", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : { messages: [] }))
      .then((data) => {
        if (cancelled) return;
        if (Array.isArray(data.messages)) {
          const rows = (data.messages as HistoryRow[])
            .map(toChatMessage)
            .filter((m): m is ChatMessage => m !== null);
          setMessages(rows);
        }
        const cursor =
          typeof data.nextCursor === "string" ? data.nextCursor : null;
        cursorRef.current = cursor;
        setHasMoreHistory(cursor !== null);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingHistory(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ponytail: §4.4 — 1x setelah history pertama. Gagal = diam, bukan error.
  useEffect(() => {
    if (loadingHistory || greetedRef.current) return;
    greetedRef.current = true;
    fetch("/api/greeting", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : { greeting: null }))
      .then((data) => {
        if (typeof data.greeting === "string" && data.greeting.trim()) {
          setGreeting(data.greeting);
        }
      })
      .catch(() => {});
  }, [loadingHistory]);

  // ponytail: halaman lama prepend di atas. Kunci anti-lompat: selisih
  // scrollHeight dikembalikan setelah render via rAF.
  const loadOlder = useCallback(async () => {
    if (loadingRef.current || cursorRef.current == null) return;
    loadingRef.current = true;
    setLoadingMore(true);
    try {
      const el = listRef.current;
      const prevH = el ? el.scrollHeight : 0;
      const res = await fetch(
        `/api/chat/history?cursor=${encodeURIComponent(cursorRef.current)}`,
        { cache: "no-store" }
      );
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.messages)) {
        const incoming = (data.messages as HistoryRow[])
          .map(toChatMessage)
          .filter((m): m is ChatMessage => m !== null);
        if (incoming.length > 0) {
          setMessages((m) => {
            const seen = new Set(m.map((x) => x.id));
            return [...incoming.filter((x) => !seen.has(x.id)), ...m];
          });
        }
      }
      const cursor =
        typeof data.nextCursor === "string" ? data.nextCursor : null;
      cursorRef.current = cursor;
      setHasMoreHistory(cursor !== null);
      requestAnimationFrame(() => {
        if (el) el.scrollTop += el.scrollHeight - prevH;
      });
    } catch {
      // ponytail: gagal muat halaman lama = diam, sentinel coba lagi
      // saat terlihat berikutnya. Bukan error fatal.
    } finally {
      loadingRef.current = false;
      setLoadingMore(false);
    }
  }, []);

  // ponytail: sentinel di atas list — terlihat = muat halaman lama.
  // Konten lebih pendek dari viewport = otomatis terisi sampai penuh/habis.
  useEffect(() => {
    if (loadingHistory) return;
    const sentinel = topRef.current;
    const root = listRef.current;
    if (!sentinel || !root) return;
    const ob = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) void loadOlder();
      },
      { root }
    );
    ob.observe(sentinel);
    return () => ob.disconnect();
  }, [loadingHistory, loadOlder]);

  // ponytail: pola yang sama dengan GradientLink landing — glow ikuti kursor.
  const trackCursor = useCallback((e: MouseEvent<HTMLElement>) => {
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${e.clientX - rect.left}px`);
    el.style.setProperty("--my", `${e.clientY - rect.top}px`);
  }, []);

  // ponytail: auto-scroll hanya saat user menempel di bawah (stick).
  // Prepend history di atas tidak boleh menyentak viewport ke bawah.
  function handleListScroll() {
    const el = listRef.current;
    if (!el) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  useEffect(() => {
    if (stickRef.current) bottomRef.current?.scrollIntoView();
  }, [messages, sending, councilQA, greeting]);

  // ponytail: FR-09 — non-streaming, satu blok terbaru saja (eksploratif).
  async function handleCouncilSend(message: string) {
    setDraft("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    setError(null);
    setCouncilQA(null);
    setSending(true);
    try {
      const res = await fetch("/api/council", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error?.message ?? "Comparison failed.");
      }
      const a = toCouncilSide((data as CouncilResult)?.a ?? {});
      const b = toCouncilSide((data as CouncilResult)?.b ?? {});
      if (!a || !b) throw new Error("Comparison returned an invalid response.");
      setCouncilQA({ question: message, result: { a, b } });
    } catch (e) {
      setError((e as Error)?.message ?? "Comparison failed. Please try again.");
    } finally {
      setSending(false);
    }
  }

  async function handleSend() {
    const message = draft.trim();
    if (!message || sending) return;
    // ponytail: FR-11 — kirim dibuang selama cooldown (input sudah dikunci,
    // ini jaring pengaman Enter/keyboard).
    if (cooldownUntil > Date.now()) return;
    // ponytail: validasi panjang di client dulu — error muncul sebelum request.
    if (message.length > MAX_MESSAGE_LENGTH) {
      setError(`Message too long (max ${MAX_MESSAGE_LENGTH} characters).`);
      return;
    }
    // ponytail: FR-09 — council terpisah dari alur chat utama (tanpa simpan).
    if (council) {
      await handleCouncilSend(message);
      return;
    }
    setDraft("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    setError(null);
    setStreamed(false);
    setMessages((m) => [
      ...m,
      { id: crypto.randomUUID(), role: "user", content: message },
    ]);
    setSending(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message }),
      });
      // ponytail: error validasi (400/401/404) tetap JSON — hanya 200 yang SSE.
      // ponytail: FR-11 — 429 tidak jadi error teks; header retry-after jadi
      // countdown + kunci input. Default 60 dtk bila header hilang/rusak.
      if (!res.ok || !res.body) {
        if (res.status === 429) {
          const retryAfter = Number(res.headers.get("retry-after") ?? "60");
          const secs =
            Number.isFinite(retryAfter) && retryAfter > 0
              ? Math.ceil(retryAfter)
              : 60;
          setError(null);
          setNow(Date.now());
          const until = Date.now() + secs * 1000;
          window.localStorage.setItem("echo-cooldown-until", String(until));
          setCooldownUntil(until);
          return;
        }
        const data = await res.json().catch(() => null);
        throw new Error(data?.error?.message ?? "Send failed.");
      }
      // Bubble companion dibuat kosong duluan — delta pertama tinggal isi.
      setMessages((m) => [
        ...m,
        { id: crypto.randomUUID(), role: "companion", content: "" },
      ]);
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
                const prev = next[next.length - 1];
                next[next.length - 1] = {
                  id: prev?.id ?? crypto.randomUUID(),
                  role: "companion",
                  content: snapshot,
                };
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
      <div
        ref={listRef}
        onScroll={handleListScroll}
        className="mx-auto flex w-full max-w-[68rem] flex-1 flex-col space-y-4 overflow-y-auto px-5 py-6"
      >
        <div ref={topRef} aria-hidden />
        {loadingMore && (
          <p className="animate-pulse text-center text-xs text-echo-muted/60">
            Loading older messages…
          </p>
        )}
        {!loadingHistory && !hasMoreHistory && messages.length > 0 && (
          <p className="text-center text-xs text-echo-muted/40">
            Beginning of conversation
          </p>
        )}
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
              Start chatting with your companion.
            </p>
            <p className="mt-3 max-w-sm text-sm leading-6 text-echo-muted/60">
              One wallet, one personal companion that remembers your context.
            </p>
          </div>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
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
              {council ? "Comparing models…" : "Echo is typing…"}
            </p>
          </div>
        )}
        {greeting && (
          <div className="flex justify-start">
            <div className="max-w-[80%] rounded-3xl border border-echo-cyan/20 bg-echo-card px-5 py-3 text-sm leading-6 text-white">
              <div className="mb-1 flex items-center justify-between gap-4">
                <p className="text-xs uppercase tracking-[0.2em] text-echo-cyan">
                  Welcome back
                </p>
                <button
                  onClick={() => setGreeting(null)}
                  aria-label="Dismiss greeting"
                  className="rounded-full px-1 text-base leading-none text-echo-muted transition hover:text-white"
                >
                  ×
                </button>
              </div>
              <CompanionContent content={greeting} />
            </div>
          </div>
        )}
        {councilQA && (
          <div className="rounded-3xl border border-echo-cyan/20 bg-black/30 p-4">
            <p className="mb-1 text-xs uppercase tracking-[0.2em] text-echo-cyan">
              Council
            </p>
            <p className="mb-3 whitespace-pre-wrap text-sm leading-6 text-white/80">
              {councilQA.question}
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              {[councilQA.result.a, councilQA.result.b].map((side) => (
                <div
                  key={side.model}
                  className="rounded-2xl border border-white/10 bg-echo-card px-4 py-3 text-sm leading-6 text-white"
                >
                  <p className="mb-2 truncate text-xs text-echo-muted/60">
                    {side.model}
                  </p>
                  <CompanionContent content={side.content} />
                </div>
              ))}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      {cooling ? (
        <p className="px-4 pb-1 text-center text-sm text-echo-peach">
          Too many messages. Try again in {formatCooldown(cooldownLeft)}.
        </p>
      ) : (
        error && (
          <p className="px-4 pb-1 text-center text-sm text-echo-peach">
            {error}
          </p>
        )
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
            placeholder={
              cooling
                ? `Wait ${formatCooldown(cooldownLeft)}…`
                : "Message…"
            }
            aria-label="Chat message"
            disabled={sending || cooling}
            className="max-h-40 min-w-0 flex-1 resize-none overflow-y-auto rounded-3xl border border-white/10 bg-echo-card px-5 py-3 text-sm leading-6 text-white placeholder:text-white/30 focus:border-white/40 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => void handleCouncilToggle()}
            disabled={sending}
            aria-pressed={council}
            title="Compare two models side by side (not saved)"
            className={`shrink-0 rounded-full border px-4 py-3 text-sm transition disabled:opacity-40 ${
              council
                ? "border-echo-cyan/60 text-echo-cyan"
                : "border-white/10 text-white/50 hover:border-white/30 hover:text-white"
            }`}
          >
            <span>⚖</span>
          </button>
          <button
            type="submit"
            disabled={!draft.trim() || sending || tooLong || cooling}
            onMouseMove={trackCursor}
            className="gradient-button shrink-0 rounded-full px-6 py-3 text-sm font-medium text-white disabled:opacity-40"
          >
            <span>Send</span>
          </button>
        </form>
      </div>
      {/* ponytail: FR-09 — modal penjelasan council, pola sama seperti modal Profile. */}
      {councilInfoOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setCouncilInfoOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="About Council"
            className="w-full max-w-md rounded-2xl border border-white/10 bg-echo-card p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold text-white">
                ⚖ Council
              </h2>
              <button
                type="button"
                onClick={() => setCouncilInfoOpen(false)}
                aria-label="Close"
                className="rounded-full px-2 py-1 text-white/50 hover:text-white"
              >
                ×
              </button>
            </div>
            <p className="text-sm leading-6 text-white/70">
              Council mengirim pertanyaanmu ke dua model sekaligus dan
              menampilkan kedua jawaban berdampingan — cocok untuk
              membandingkan sudut pandang. Hasilnya tidak disimpan ke
              history.
            </p>
            <div className="mt-3 rounded-xl border border-white/10 bg-black/30 p-3 text-xs leading-5 text-white/60">
              <div>
                Model A:{" "}
                <span className="text-white/90">
                  {councilModels?.modelA ?? "Model A"}
                </span>
              </div>
              <div>
                Model B:{" "}
                <span className="text-white/90">
                  {councilModels?.modelB ?? "Model B"}
                </span>
              </div>
            </div>
            <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-white/70">
              <input
                type="checkbox"
                checked={councilDontShow}
                onChange={(e) => setCouncilDontShow(e.target.checked)}
                className="accent-cyan-400"
              />
              Jangan tampilkan lagi
            </label>
            <button
              type="button"
              onClick={confirmCouncilInfo}
              className="gradient-button mt-4 w-full rounded-full px-6 py-3 text-sm font-medium text-white"
            >
              <span>Mengerti, aktifkan Council</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
