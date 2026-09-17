"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import {
  Check,
  Compass,
  Copy,
  Mic,
  Pencil,
  RotateCcw,
  Scale,
  SendHorizontal,
  Square,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { MAX_MESSAGE_LENGTH } from "../../lib/chat/constants";
import { CompanionContent } from "./message-content";

// ponytail: 1 file untuk list + input + send + loading/error (PRD Phase 6).
// ponytail: TTS — belah per kalimat (sembuhnya bug penggal Chrome),
// potongan >200 char belah lagi di spasi terdekat.
function chunkSentences(text: string): string[] {
  const out: string[] = [];
  for (const s of text.split(/(?<=[.!?…\n])\s+/)) {
    let rest = s.trim();
    while (rest.length > 200) {
      const cut = rest.lastIndexOf(" ", 200);
      const at = cut > 80 ? cut : 200;
      out.push(rest.slice(0, at).trim());
      rest = rest.slice(at).trim();
    }
    if (rest) out.push(rest);
  }
  return out.filter(Boolean).slice(0, 50);
}

// ponytail: baca preferensi autoplay (SSR-safe, storage bisa dilempar).
function readAutoplay(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem("echo-autoplay") === "1";
  } catch {
    return false;
  }
}
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

// ponytail: Fase 2 voice — Web Speech API browser, tanpa API tambahan.
// TTS baca teks polos: markdown dilucuti seadanya agar tak dibaca simbolnya.
function stripForSpeech(md: string) {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#>*_`~|-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ponytail: tipe minimal Web Speech API (tak ada di lib.dom TS ini).
interface SpeechAlternative {
  transcript?: unknown;
}
interface SpeechResult {
  0?: SpeechAlternative;
  isFinal?: boolean;
}
interface SpeechResultList {
  length: number;
  [index: number]: SpeechResult | undefined;
}
interface SpeechEvent {
  results?: SpeechResultList;
  resultIndex?: number;
}
interface SpeechRecognizer {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: SpeechEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

// ponytail: jumlah dot waveform dictation — dipakai render + loop meter.
const DOT_COUNT = 24;

// ponytail: webkitSpeechRecognition tak ada di lib.dom — ambil dgn guard.
function getSpeechRecognition(): (new () => SpeechRecognizer) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognizer;
    webkitSpeechRecognition?: new () => SpeechRecognizer;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
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

  // ponytail: klik toggle council saat OFF + belum pernah lihat = modal dulu.
  async function handleCouncilToggle() {
    if (council) {
      setCouncil(false);
      return;
    }
    if (window.localStorage.getItem("echo-council-seen")) {
      setDecision(false);
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
    setDecision(false);
    setCouncil(true);
  }
  // ponytail: FR-11 — mode bantu keputusan, hasil TETAP masuk history.
  // Saling lepas dengan council (prompt berbeda, council tak tersimpan).
  const [decision, setDecision] = useState(false);
  const [decisionInfoOpen, setDecisionInfoOpen] = useState(false);
  const [decisionDontShow, setDecisionDontShow] = useState(false);

  function handleDecisionToggle() {
    if (decision) {
      setDecision(false);
      return;
    }
    if (window.localStorage.getItem("echo-decision-seen")) {
      setCouncil(false);
      setDecision(true);
      return;
    }
    setDecisionDontShow(false);
    setDecisionInfoOpen(true);
  }

  function confirmDecisionInfo() {
    if (decisionDontShow) {
      window.localStorage.setItem("echo-decision-seen", "1");
    }
    setDecisionInfoOpen(false);
    setCouncil(false);
    setDecision(true);
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
  // ponytail: id balasan terakhir (khusus tombol try-again).
  const lastCompanionId =
    messages.length > 0 && messages[messages.length - 1]?.role === "companion"
      ? (messages[messages.length - 1]?.id ?? null)
      : null;
  const greetedRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // ponytail: aksi per pesan — copy (feedback Check 1,5 dtk), edit inline user.
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  // ponytail: voice — STT guard sekali (Firefox desktop tak support),
  // TTS id bubble yg sedang dibacakan (null = diam).
  // Dictation ala ChatGPT: overlay pill, X buang / ✓ append ke draft.
  const [dictating, setDictating] = useState(false);
  const [dictation, setDictation] = useState("");
  const finalRef = useRef("");
  // ponytail: meter level suara — tulis tinggi dot langsung via ref,
  // tanpa setState (tanpa re-render 60fps).
  const dotRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const audioRef = useRef<{
    ctx: AudioContext;
    stream: MediaStream;
    raf: number;
  } | null>(null);

  function stopLevelMeter() {
    const a = audioRef.current;
    audioRef.current = null;
    if (!a) return;
    cancelAnimationFrame(a.raf);
    a.stream.getTracks().forEach((t) => t.stop());
    a.ctx.close().catch(() => {});
  }

  function startLevelMeter() {
    stopLevelMeter();
    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      return;
    }
    void navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        const AC =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        if (!AC) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const ctx = new AC();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        ctx.createMediaStreamSource(stream).connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
          if (!audioRef.current) return;
          analyser.getByteTimeDomainData(data);
          let peak = 0;
          for (let i = 0; i < data.length; i++) {
            const v = Math.abs((data[i] ?? 128) - 128) / 128;
            if (v > peak) peak = v;
          }
          const lvl = Math.min(1, peak * 1.6);
          const now = Date.now() / 180;
          for (let i = 0; i < DOT_COUNT; i++) {
            const el = dotRefs.current[i];
            if (!el) continue;
            const wave = 0.55 + 0.45 * Math.sin(now + i * 0.7);
            el.style.height = `${(4 + lvl * 22 * wave).toFixed(1)}px`;
            el.style.opacity = String(0.35 + lvl * 0.65);
          }
          if (audioRef.current) {
            audioRef.current.raf = requestAnimationFrame(tick);
          }
        };
        audioRef.current = { ctx, stream, raf: requestAnimationFrame(tick) };
      })
      .catch(() => {
        // ponytail: izin meter ditolak — STT tetap jalan, dot statis.
      });
  }
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const recogRef = useRef<SpeechRecognizer | null>(null);
  const sttSupported = getSpeechRecognition() !== null;
  const ttsSupported =
    typeof window !== "undefined" && "speechSynthesis" in window;
  // ponytail: autoplay TTS tiap balasan baru (default mati, ingat pilihan).
  const [autoplay, setAutoplay] = useState(readAutoplay);

  async function handleCopy(id: string, content: string) {
    try {
      await navigator.clipboard.writeText(content);
    } catch {
      setError("Copy failed. Please try again.");
      return;
    }
    setCopiedId(id);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopiedId(null), 1500);
  }

  // ponytail: try-again hanya balasan TERAKHIR — ganti pair di server,
  // kirim ulang sebagai regenerate agar history tak duplikat.
  function handleTryAgain() {
    if (sending || cooling || messages.length < 2) return;
    const last = messages[messages.length - 1];
    const prev = messages[messages.length - 2];
    if (!last || !prev || last.role !== "companion" || prev.role !== "user") return;
    void handleSend(prev.content, { regenerate: true });
  }
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

  // ponytail: mic buka overlay dictation — final terakumulasi di ref,
  // interim tampil live. X = buang, ✓ = append ke draft (tak auto-send).
  // Hening lama = recog mati sendiri -> start ulang selama overlay buka.
  function handleMic() {
    if (dictating) return;
    const SR = getSpeechRecognition();
    if (!SR) {
      setError("Voice input is not supported in this browser.");
      return;
    }
    finalRef.current = "";
    setDictation("");
    const startRecog = () => {
      const recog = new SR();
      recog.lang = "id-ID";
      recog.continuous = true;
      recog.interimResults = true;
      recog.maxAlternatives = 1;
      recogRef.current = recog;
      recog.onresult = (e: SpeechEvent) => {
        const list = e.results;
        if (!list) return;
        let interim = "";
        for (let i = e.resultIndex ?? 0; i < list.length; i++) {
          const raw = list[i]?.[0]?.transcript;
          const text = typeof raw === "string" ? raw.trim() : "";
          if (!text) continue;
          if (list[i]?.isFinal) {
            finalRef.current = `${finalRef.current} ${text}`.trim();
          } else {
            interim = `${interim} ${text}`.trim();
          }
        }
        setDictation(`${finalRef.current} ${interim}`.trim());
      };
      recog.onerror = () => {
        if (!recogRef.current) return; // abort() saat cancel — abaikan.
        recogRef.current = null;
        stopLevelMeter();
        finalRef.current = "";
        setDictation("");
        setDictating(false);
        setError("Voice input failed. Check microphone permission and try again.");
      };
      recog.onend = () => {
        if (!recogRef.current) return; // stop()/abort() disengaja — abaikan.
        startRecog(); // hening lama: sambung lagi, teks lama aman di ref.
      };
      try {
        recog.start();
      } catch {
        recogRef.current = null;
        stopLevelMeter();
        setError("Voice input failed. Please try again.");
      }
    };
    startRecog();
    startLevelMeter();
    setDictating(true);
  }

  function cancelDictation() {
    const recog = recogRef.current;
    recogRef.current = null;
    recog?.abort();
    stopLevelMeter();
    finalRef.current = "";
    setDictation("");
    setDictating(false);
  }

  function confirmDictation() {
    const text = finalRef.current.trim();
    const recog = recogRef.current;
    recogRef.current = null;
    recog?.stop();
    stopLevelMeter();
    if (text) {
      setDraft((d) => {
        const next = d.trim() ? `${d.trim()} ${text}` : text;
        return next.slice(0, MAX_MESSAGE_LENGTH);
      });
      requestAnimationFrame(autoresize);
    }
    finalRef.current = "";
    setDictation("");
    setDictating(false);
  }

  // ponytail: speaker per bubble — antre per kalimat via onend.
  // Klik lagi = stop. Unmount/kirim baru = diam.
  function speakChunks(id: string, content: string) {
    if (!ttsSupported) return;
    window.speechSynthesis.cancel();
    const chunks = chunkSentences(stripForSpeech(content));
    if (chunks.length === 0) return;
    setSpeakingId(id);
    let i = 0;
    const next = () => {
      const text = chunks[i];
      if (text === undefined) {
        setSpeakingId(null);
        return;
      }
      i++;
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = "id-ID";
      utter.onend = next;
      utter.onerror = () => setSpeakingId(null);
      window.speechSynthesis.speak(utter);
    };
    next();
  }

  function handleSpeak(id: string, content: string) {
    if (!ttsSupported) return;
    if (speakingId === id) {
      window.speechSynthesis.cancel();
      setSpeakingId(null);
      return;
    }
    speakChunks(id, content);
  }

  function toggleAutoplay() {
    const next = !autoplay;
    try {
      window.localStorage.setItem("echo-autoplay", next ? "1" : "0");
    } catch {
      // storage penuh/diblokir — pilihan sesi ini saja.
    }
    setAutoplay(next);
  }

  useEffect(() => {
    return () => {
      recogRef.current?.abort();
      stopLevelMeter();
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

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

  async function handleSend(
    textOverride?: string,
    opts?: { regenerate?: boolean }
  ) {
    const message = (textOverride ?? draft).trim();
    if (!message || sending) return;
    // ponytail: kirim baru = suara lama berhenti (tak menumpuk).
    if (ttsSupported) window.speechSynthesis.cancel();
    setSpeakingId(null);
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
    const regenerate = opts?.regenerate === true;
    // ponytail: try-again optimistik — potong pair terakhir lokal; gagal = rollback.
    const snapshot = regenerate ? messages : null;
    if (snapshot)
      setMessages((m) => [
        ...m.slice(0, -2),
        // ponytail: bubble user langsung dikembalikan sinkron — selama AI
        // typing yang hilang hanya balasan companion, bukan pesan user.
        { id: crypto.randomUUID(), role: "user", content: message },
      ]);
    setDraft("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    setError(null);
    setStreamed(false);
    if (!regenerate) {
      setMessages((m) => [
        ...m,
        { id: crypto.randomUUID(), role: "user", content: message },
      ]);
    }
    setSending(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        // ponytail: FR-11 — decision ikut alur chat biasa, beda prompt saja.
        body: JSON.stringify({
          message,
          ...(decision ? { mode: "decision" } : {}),
          ...(regenerate ? { regenerate: true } : {}),
        }),
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
          if (snapshot) setMessages(snapshot);
          return;
        }
        const data = await res.json().catch(() => null);
        throw new Error(data?.error?.message ?? "Send failed.");
      }
      // Bubble companion dibuat kosong duluan — delta pertama tinggal isi.
      // ponytail: regenerate — bubble user sudah dikembalikan sinkron di atas,
      // di sini tinggal bubble companion kosong untuk stream.
      // server menyimpan ulang pair user+companion sehingga tampilan = DB.
      const companionId = crypto.randomUUID();
      setMessages((m) => [
        ...m,
        { id: companionId, role: "companion", content: "" },
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
        // ponytail: stream selesai tanpa isi = kembalikan snapshot (regenerate)
        // atau buang bubble kosong (kirim biasa), gagalkan sekalian.
        if (snapshot) setMessages(snapshot);
        else setMessages((m) => m.slice(0, -1));
        throw new Error("Companion returned an empty response.");
      }
      // ponytail: autoplay — balasan lengkap dibacakan sendiri.
      if (window.localStorage.getItem("echo-autoplay") === "1") {
        speakChunks(companionId, reply);
      }
    } catch (e) {
      if (snapshot) setMessages(snapshot);
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
              <div className="group flex max-w-[80%] flex-col items-end">
                {editingId === m.id ? (
                  <div className="w-full min-w-64">
                    <textarea
                      value={editDraft}
                      onChange={(e) => setEditDraft(e.target.value)}
                      rows={3}
                      aria-label="Edit message"
                      className="w-full resize-y rounded-3xl border border-echo-cyan/60 bg-echo-card px-5 py-3 text-sm leading-6 text-white focus:outline-none"
                    />
                    <div className="mt-1 flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(null);
                        }}
                        aria-label="Cancel edit"
                        className="rounded-full p-1.5 text-white/50 transition hover:bg-white/5 hover:text-white"
                      >
                        <X size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const text = editDraft.trim();
                          setEditingId(null);
                          if (text && text !== m.content) {
                            void handleSend(text);
                          }
                        }}
                        aria-label="Save and resend"
                        title="Save and resend as new message"
                        className="rounded-full p-1.5 text-white/50 transition hover:bg-white/5 hover:text-white"
                      >
                        <Check size={14} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="whitespace-pre-wrap rounded-3xl bg-echo-blue px-5 py-3 text-sm leading-6 text-white">
                      {m.content}
                    </p>
                    <div className="mt-1 flex gap-1 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
                      <button
                        type="button"
                        onClick={() => void handleCopy(m.id, m.content)}
                        aria-label="Copy message"
                        title="Copy"
                        className="rounded-full p-1.5 text-white/40 transition hover:bg-white/5 hover:text-white"
                      >
                        {copiedId === m.id ? <Check size={14} /> : <Copy size={14} />}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditDraft(m.content);
                          setEditingId(m.id);
                        }}
                        aria-label="Edit message"
                        title="Edit and resend as new"
                        disabled={sending}
                        className="rounded-full p-1.5 text-white/40 transition hover:bg-white/5 hover:text-white disabled:opacity-40"
                      >
                        <Pencil size={14} />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="group flex max-w-[80%] flex-col items-start">
                <div className="rounded-3xl border border-white/10 bg-echo-card px-5 py-3 text-sm leading-6 text-white">
                  <CompanionContent content={m.content} />
                </div>
                {m.content.trim() && (
                  <div className="mt-1 flex gap-1 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
                    <button
                      type="button"
                      onClick={() => void handleCopy(m.id, m.content)}
                      aria-label="Copy response"
                      title="Copy"
                      className="rounded-full p-1.5 text-white/40 transition hover:bg-white/5 hover:text-white"
                    >
                      {copiedId === m.id ? <Check size={14} /> : <Copy size={14} />}
                    </button>
                    {ttsSupported && (
                      <button
                        type="button"
                        onClick={() => handleSpeak(m.id, m.content)}
                        aria-label={speakingId === m.id ? "Stop reading aloud" : "Read aloud"}
                        title={speakingId === m.id ? "Stop" : "Read aloud"}
                        className="rounded-full p-1.5 text-white/40 transition hover:bg-white/5 hover:text-white"
                      >
                        {speakingId === m.id ? <Square size={14} /> : <Volume2 size={14} />}
                      </button>
                    )}
                    {m.id === lastCompanionId && (
                      <button
                        type="button"
                        onClick={handleTryAgain}
                        aria-label="Regenerate response"
                        title="Try again (replaces this reply)"
                        disabled={sending || cooling}
                        className="rounded-full p-1.5 text-white/40 transition hover:bg-white/5 hover:text-white disabled:opacity-40"
                      >
                        <RotateCcw size={14} />
                      </button>
                    )}
                  </div>
                )}
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
                  className="rounded-full p-1 text-echo-muted transition hover:text-white"
                >
                  <X size={14} />
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
        {/* ponytail: overlay dictation ala ChatGPT gantikan bar input. */}
        {dictating ? (
          <div
            role="status"
            aria-label="Dictating"
            className="mx-auto flex w-full max-w-[68rem] items-center px-5 py-3"
          >
            <div className="flex min-w-0 flex-1 items-center gap-3 rounded-full bg-white/10 px-5 py-3">
              <div className="flex shrink-0 items-center gap-1" aria-hidden="true">
                {Array.from({ length: DOT_COUNT }).map((_, i) => (
                  <span
                    key={i}
                    ref={(el) => {
                      dotRefs.current[i] = el;
                    }}
                    style={{ height: 6 }}
                    className="w-1.5 rounded-full bg-white/70"
                  />
                ))}
              </div>
              <p className="min-w-0 flex-1 truncate text-sm text-white/80">
                {dictation || "Listening…"}
              </p>
              <button
                type="button"
                onClick={cancelDictation}
                aria-label="Cancel dictation"
                title="Cancel"
                className="shrink-0 rounded-full p-1.5 text-white/70 transition hover:bg-white/10 hover:text-white"
              >
                <X size={18} />
              </button>
              <button
                type="button"
                onClick={confirmDictation}
                aria-label="Use dictation"
                title="Use dictation"
                className="shrink-0 rounded-full p-1.5 text-white/70 transition hover:bg-white/10 hover:text-white"
              >
                <Check size={20} />
              </button>
            </div>
          </div>
        ) : (
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
          {sttSupported && (
            <button
              type="button"
              onClick={handleMic}
              disabled={sending || cooling}
              title="Voice input"
              className="shrink-0 rounded-full border border-white/10 px-4 py-3 text-sm text-white/50 transition hover:border-white/30 hover:text-white disabled:opacity-40"
            >
              <span className="flex items-center gap-1.5"><Mic size={16} /></span>
            </button>
          )}
          {/* ponytail: autoplay TTS tiap balasan baru — ingat pilihan. */}
          {ttsSupported && (
            <button
              type="button"
              onClick={toggleAutoplay}
              disabled={sending}
              aria-pressed={autoplay}
              title={autoplay ? "Autoplay replies: on" : "Autoplay replies: off"}
              className={`shrink-0 rounded-full border px-4 py-3 text-sm transition disabled:opacity-40 ${
                autoplay
                  ? "border-echo-cyan/60 text-echo-cyan"
                  : "border-white/10 text-white/50 hover:border-white/30 hover:text-white"
              }`}
            >
              <span className="flex items-center gap-1.5">
                {autoplay ? <Volume2 size={16} /> : <VolumeX size={16} />}
              </span>
            </button>
          )}
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
            <span className="flex items-center gap-1.5"><Scale size={16} /></span>
          </button>
          {/* ponytail: FR-11 — toggle decision helper (§25), saling lepas dgn council. */}
          <button
            type="button"
            onClick={handleDecisionToggle}
            disabled={sending}
            aria-pressed={decision}
            title="Decision helper (saved to history)"
            className={`shrink-0 rounded-full border px-4 py-3 text-sm transition disabled:opacity-40 ${
              decision
                ? "border-echo-cyan/60 text-echo-cyan"
                : "border-white/10 text-white/50 hover:border-white/30 hover:text-white"
            }`}
          >
            <span className="flex items-center gap-1.5"><Compass size={16} /></span>
          </button>
          <button
            type="submit"
            disabled={!draft.trim() || sending || tooLong || cooling}
            onMouseMove={trackCursor}
            className="gradient-button shrink-0 rounded-full px-6 py-3 text-sm font-medium text-white disabled:opacity-40"
          >
            <span className="flex items-center gap-1.5">Send <SendHorizontal size={15} /></span>
          </button>
        </form>
        )}
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
              <h2 className="flex items-center gap-2 text-base font-semibold text-white">
                <Scale size={16} /> Council
              </h2>
              <button
                type="button"
                onClick={() => setCouncilInfoOpen(false)}
                aria-label="Close"
                className="rounded-full p-1 text-white/50 hover:text-white"
              >
                <X size={16} />
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
      {/* ponytail: FR-11 — modal penjelasan decision helper, pola council. */}
      {decisionInfoOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setDecisionInfoOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="About Decision Helper"
            className="w-full max-w-md rounded-2xl border border-white/10 bg-echo-card p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-base font-semibold text-white">
                <Compass size={16} /> Decision Helper
              </h2>
              <button
                type="button"
                onClick={() => setDecisionInfoOpen(false)}
                aria-label="Close"
                className="rounded-full p-1 text-white/50 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>
            <p className="text-sm leading-6 text-white/70">
              Decision Helper memecah keputusanmu menjadi opsi-opsi dengan
              pro dan kontra tiap opsi, ditutup pertanyaan klarifikasi.
              Tidak mengambil keputusan untukmu. Hasilnya tersimpan ke
              history seperti chat biasa.
            </p>
            <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-white/70">
              <input
                type="checkbox"
                checked={decisionDontShow}
                onChange={(e) => setDecisionDontShow(e.target.checked)}
                className="accent-cyan-400"
              />
              Jangan tampilkan lagi
            </label>
            <button
              type="button"
              onClick={confirmDecisionInfo}
              className="gradient-button mt-4 w-full rounded-full px-6 py-3 text-sm font-medium text-white"
            >
              <span>Mengerti, aktifkan Decision Helper</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
