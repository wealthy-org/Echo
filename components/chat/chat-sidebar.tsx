"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { MessageSquare, NotebookPen, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import {
  PERSONALITY_PRESETS,
  isPresetId,
} from "../../lib/companion/constants";
import { useCompanion } from "../companion/use-companion";
import { CompanionPanel } from "../companion/companion-panel";

// ponytail: sidebar ala ChatGPT — open w-64, collapse jadi rail w-16.
// Mobile: overlay + backdrop. 1 komponen dipakai /chat + /journal.

interface ChatSidebarProps {
  open: boolean;
  onToggle: () => void;
  active: "chat" | "journal";
}

// ponytail: inisial 2 kata pertama, mis. "Ahita Bisma" -> "AB".
function initials(name: string) {
  const parts = name.split(/\s+/).filter(Boolean).slice(0, 2);
  const s = parts.map((w) => w[0]!.toUpperCase()).join("");
  return s || "E";
}

const NAV = [
  { href: "/chat", label: "Chat", icon: MessageSquare, key: "chat" },
  { href: "/journal", label: "Journal", icon: NotebookPen, key: "journal" },
] as const;

export function ChatSidebar({ open, onToggle, active }: ChatSidebarProps) {
  const { profile } = useCompanion();
  const [profileOpen, setProfileOpen] = useState(false);
  const name = profile?.companion_name ?? "Echo";
  const tone =
    profile && isPresetId(profile.personality)
      ? PERSONALITY_PRESETS.find((p) => p.id === profile.personality)!.name
      : "Custom";

  // ponytail: link hanya bisa diklik saat sidebar terbuka/overlay,
  // jadi onToggle di sini selalu berarti "tutup" tampilan mobile.
  function handleNav() {
    if (typeof window !== "undefined" && window.innerWidth < 768) onToggle();
  }

  return (
    <>
      {open && (
        <button
          aria-label="Close menu"
          onClick={onToggle}
          className="fixed inset-0 z-30 cursor-default bg-black/60 md:hidden"
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-white/10 bg-black/90 backdrop-blur-xl transition-all duration-200 md:static md:z-auto md:shrink-0 md:translate-x-0 md:bg-black/60 ${
          open ? "translate-x-0 md:w-64" : "-translate-x-full md:w-16"
        } ${open ? "" : "md:border-r-0 md:overflow-hidden"}`}
      >
        {open ? (
          <>
            <div className="flex h-[72px] shrink-0 items-center justify-between px-4">
              <Link
                href="/"
                onClick={handleNav}
                aria-label="Back to home"
                className="flex items-center gap-2 rounded-lg transition hover:opacity-80"
              >
                <Image
                  src="/echo-no-bg.png"
                  alt=""
                  width={24}
                  height={24}
                  className="h-6 w-6"
                />
                <span className="font-semibold tracking-[-0.02em]">Echo</span>
              </Link>
              <button
                onClick={onToggle}
                aria-label="Collapse sidebar"
                className="rounded-full p-2 text-echo-muted transition hover:bg-white/5 hover:text-white"
              >
                <PanelLeftClose size={18} />
              </button>
            </div>
            <nav className="flex flex-1 flex-col gap-1 px-3">
              {NAV.map((item) => (
                <Link
                  key={item.key}
                  href={item.href}
                  onClick={handleNav}
                  className={`flex items-center gap-3 rounded-2xl px-4 py-2.5 text-sm transition ${
                    active === item.key
                      ? "bg-white/10 font-semibold text-white"
                      : "text-echo-muted hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <item.icon size={17} aria-hidden /> {item.label}
                </Link>
              ))}
            </nav>
            <div className="shrink-0 p-3">
              <button
                onClick={() => setProfileOpen(true)}
                aria-haspopup="dialog"
                aria-label="Open companion profile"
                className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition hover:bg-white/5"
              >
                <span
                  aria-hidden
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-600 text-xs font-bold text-white"
                >
                  {initials(name)}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-white">
                    {name}
                  </span>
                  <span className="block truncate text-xs text-echo-muted">
                    {tone}
                  </span>
                </span>
              </button>
            </div>
          </>
        ) : (
          <div className="hidden h-full flex-col items-center md:flex">
            <div className="flex h-[72px] shrink-0 items-center">
                <button
                onClick={onToggle}
                aria-label="Expand sidebar"
                className="rounded-full p-2 text-echo-muted transition hover:bg-white/5 hover:text-white"
              >
                <PanelLeftOpen size={18} />
              </button>
            </div>
            <nav className="flex flex-1 flex-col items-center gap-1">
              {NAV.map((item) => (
                <Link
                  key={item.key}
                  href={item.href}
                  title={item.label}
                  aria-label={item.label}
                  onClick={handleNav}
                  className={`rounded-2xl p-2.5 transition ${
                    active === item.key
                      ? "bg-white/10 text-white"
                      : "text-echo-muted hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <item.icon size={19} aria-hidden />
                </Link>
              ))}
            </nav>
            <div className="shrink-0 p-3">
              <button
                onClick={() => setProfileOpen(true)}
                title={name}
                aria-haspopup="dialog"
                aria-label="Open companion profile"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-600 text-xs font-bold text-white transition hover:brightness-110"
              >
                {initials(name)}
              </button>
            </div>
          </div>
        )}
      </aside>
      {profileOpen && (
        <CompanionPanel onClose={() => setProfileOpen(false)} />
      )}
    </>
  );
}
