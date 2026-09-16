"use client";

import { useCallback, useState, type MouseEvent, type ReactNode } from "react";
import { NAV } from "./nav";
import { ConnectButton } from "../wallet/connect-button";

// ponytail: satu-satunya pulau client landing (cursor glow + menu).
// Navigasi statis (DesktopNav) tinggal di section.tsx agar tidak masuk bundle client.

export function GradientLink({
  href,
  className = "",
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  const onMove = useCallback((e: MouseEvent<HTMLAnchorElement>) => {
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${e.clientX - rect.left}px`);
    el.style.setProperty("--my", `${e.clientY - rect.top}px`);
  }, []);

  return (
    <a href={href} onMouseMove={onMove} className={`gradient-button ${className}`}>
      {children}
    </a>
  );
}

export function MobileMenu() {
  const [open, setOpen] = useState(false);

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        className="gradient-button flex h-10 w-10 items-center justify-center rounded-full text-white"
      >
        <span aria-hidden className="text-lg leading-none">
          {open ? "×" : "≡"}
        </span>
      </button>
      {open && (
        <div className="absolute inset-x-0 top-full border-t border-white/10 bg-black/95 px-5 py-6 backdrop-blur-xl">
          <nav className="flex flex-col gap-5 text-sm text-[#c3c6cd]">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} onClick={() => setOpen(false)}>
                {n.label}
              </a>
            ))}
            <ConnectButton
              onAction={() => setOpen(false)}
              className="mt-2 flex items-center justify-center rounded-full px-5 py-3 text-white"
            />
          </nav>
        </div>
      )}
    </div>
  );
}
