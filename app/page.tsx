// ponytail: landing statis + 1 pulau client (interactive.tsx). CTA connect via ConnectButton (Phase 3).
import { GradientLink, MobileMenu } from "../components/landing/interactive";
import { DesktopNav, SectionHeading, StepCard } from "../components/landing/section";
import { ConnectButton } from "../components/wallet/connect-button";

const STEPS = [
  {
    title: "Connect Phantom",
    description: "Connect your Phantom wallet — no account, no username/password.",
  },
  {
    title: "Sign message",
    description: "Sign one message to prove this wallet is yours.",
  },
  {
    title: "Chat",
    description: "Chat with a companion that remembers your conversation context.",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-black text-[#c3c6cd]">
      <div className="site-background" aria-hidden />

      {/* Header */}
      <header className="sticky top-0 z-50 bg-black/75 backdrop-blur-xl border-b border-white/10">
        <div className="relative mx-auto flex h-[72px] max-w-[68rem] items-center justify-between px-5 lg:px-0">
          <a href="#" className="flex items-center gap-2 text-white">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#0038ff] text-sm font-bold">
              E
            </span>
            <span className="font-semibold tracking-tight">Echo</span>
          </a>
          <DesktopNav />
          <MobileMenu />
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute left-1/2 top-1/4 z-[1] h-[34rem] w-[34rem] -translate-x-1/2 rounded-full bg-[#0038ff]/25 blur-3xl" />
        <div className="relative z-10 mx-auto max-w-[68rem] px-5 pb-24 pt-24 lg:px-0 lg:pb-32 lg:pt-32">
          <div className="max-w-5xl">
            <div className="mb-6 flex items-center gap-3 text-xs uppercase tracking-[0.2em] text-white/50">
              <span className="h-1.5 w-1.5 rounded-full bg-[#77e7ff]" />
              Wallet AI Companion
            </div>
            <h1 className="max-w-5xl text-5xl font-semibold leading-[1.02] tracking-[-0.045em] text-white sm:text-6xl md:text-7xl lg:text-8xl">
              One wallet, one personal{" "}
              <span className="bg-gradient-to-r from-[#f1b29e] via-[#b354fe] to-[#77e7ff] bg-clip-text text-transparent">
                companion.
              </span>
            </h1>
            <p className="mt-8 max-w-2xl text-base leading-7 text-[#c3c6cd]/70 sm:text-lg">
              Connect your Phantom wallet and your companion is ready. Chat
              with no new account — it remembers what matters from past
              conversations.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <ConnectButton
                connectLabel="Sign in →"
                className="flex items-center gap-2 rounded-full px-6 py-3.5 text-sm font-medium text-white"
              />
              <GradientLink
                href="#concept"
                className="flex items-center gap-2 rounded-full px-6 py-3.5 text-sm"
              >
                <span>Explore Echo</span>
              </GradientLink>
            </div>
            <p className="mt-5 text-xs text-white/40">
              Phantom EVM · Robinhood Testnet (46630) · no username / password
            </p>
          </div>
        </div>
      </section>

      {/* Concept */}
      <section
        id="concept"
        className="mx-auto max-w-[68rem] scroll-mt-24 px-5 py-24 lg:px-0 lg:py-32"
      >
        <SectionHeading
          eyebrow="Concept"
          accent="text-[#77e7ff]"
          title="Not a public chatbot."
          muted="Owned by your wallet."
          description="Your wallet is your identity. Each wallet gets one companion that keeps history and builds memory, so it feels like it knows you."
        />
      </section>

      {/* How it works */}
      <section id="how" className="scroll-mt-24 border-y border-white/10 bg-black/30">
        <div className="mx-auto max-w-[68rem] px-5 py-24 lg:px-0 lg:py-32">
          <div className="mb-12 flex flex-col justify-between gap-8 lg:flex-row lg:items-end">
            <div className="max-w-xl">
              <div className="mb-4 text-xs uppercase tracking-[0.2em] text-[#b354fe]">
                How it works
              </div>
              <h2 className="text-4xl font-semibold tracking-[-0.035em] text-white sm:text-5xl">
                Connect. <span className="text-white/40">Sign. Chat.</span>
              </h2>
            </div>
            <p className="max-w-sm text-sm leading-6 text-[#c3c6cd]/50">
              Fast onboarding with no account. Signature verification keeps
              your companion yours.
            </p>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            {STEPS.map((s, i) => (
              <StepCard key={s.title} index={i} title={s.title} description={s.description} />
            ))}
          </div>
        </div>
      </section>

      {/* CTA / footer */}
      <footer id="contact" className="relative overflow-hidden border-t border-white/10">
        <div className="relative z-10 mx-auto max-w-[68rem] px-5 py-24 lg:px-0 lg:py-32">
          <div className="max-w-4xl">
            <div className="mb-5 text-xs uppercase tracking-[0.2em] text-[#77e7ff]">
              Ready?
            </div>
            <h2 className="text-5xl font-semibold leading-[1.02] tracking-[-0.045em] text-white sm:text-6xl lg:text-7xl">
              Meet your{" "}
              <span className="bg-gradient-to-r from-[#f1b29e] via-[#b354fe] to-[#77e7ff] bg-clip-text text-transparent">
                companion.
              </span>
            </h2>
            <p className="mt-7 max-w-xl text-base leading-7 text-[#c3c6cd]/60">
              Connect your wallet and start your first conversation. A companion
              is created automatically for new wallets.
            </p>
            <ConnectButton
              connectLabel="Sign in to chat →"
              className="mt-8 inline-flex items-center gap-2 rounded-full px-7 py-4 text-sm font-medium text-white"
            />
          </div>
          <div className="mt-24 flex flex-col justify-between gap-4 border-t border-white/10 pt-7 text-xs text-white/35 sm:flex-row">
            <span>© 2026 Echo — Wallet AI Companion</span>
            <div className="flex gap-6">
              <a
                href="https://x.com"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-white"
              >
                X
              </a>
              <span>Contract: —</span>
              <span>Testnet 46630</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
