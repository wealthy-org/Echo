import type { ReactNode } from "react";
import { NAV } from "./nav";
import { ConnectButton } from "../wallet/connect-button";

// ponytail: pola berulang landing (dipakai 3x+). Sekali pakai (hero/footer) tetap di page.tsx.

export function SectionHeading({
  eyebrow,
  accent,
  title,
  muted,
  description,
}: {
  eyebrow: string;
  accent: string;
  title: ReactNode;
  muted?: ReactNode;
  description: string;
}) {
  return (
    <div className="mb-12 max-w-2xl">
      <div className={`mb-4 text-xs uppercase tracking-[0.2em] ${accent}`}>{eyebrow}</div>
      <h2 className="text-4xl font-semibold tracking-[-0.035em] text-white sm:text-5xl">
        {title} {muted && <span className="text-white/40">{muted}</span>}
      </h2>
      <p className="mt-5 text-sm leading-7 text-[#c3c6cd]/60 sm:text-base">{description}</p>
    </div>
  );
}

export function StepCard({
  index,
  title,
  description,
}: {
  index: number;
  title: string;
  description: string;
}) {
  return (
    <article className="rounded-3xl border border-white/10 bg-[#19191b] p-7">
      <h3 className="text-xl font-semibold text-white">{title}</h3>
      <p className="mt-3 text-sm leading-6 text-[#c3c6cd]/55">{description}</p>
      <div className="mt-8 flex items-center gap-2 text-xs text-white/40">
        <span>0{index + 1}</span>
        <span className="h-px flex-1 bg-white/10" />
        <span>Step</span>
      </div>
    </article>
  );
}

export function DesktopNav() {
  return (
    <nav className="hidden items-center gap-8 text-[13px] text-[#c3c6cd] md:flex">
      {NAV.map((n) => (
        <a key={n.href} href={n.href} className="transition-colors hover:text-white">
          {n.label}
        </a>
      ))}
      <ConnectButton className="rounded-full px-5 py-2.5 text-[13px] text-white" />
    </nav>
  );
}
