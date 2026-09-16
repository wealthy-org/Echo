"use client";

import { GradientLink } from "./interactive";
import { ConnectButton } from "../wallet/connect-button";
import { useSession } from "../wallet/use-session";

// ponytail: hero selalu 2 tombol. Signed-in: Open chat + Explore.
// Belum sign-in / loading: Sign in + Explore (Open chat tanpa sesi mental
// di guard /chat — jangan pajang jalan buntu).

const BTN = "flex items-center gap-2 rounded-full px-6 py-3.5 text-sm";

export function HeroActions() {
  const { session, isLoading } = useSession();
  const signedIn = !isLoading && !!session?.authenticated;

  return (
    <div className="mt-9 flex flex-wrap gap-3">
      {signedIn ? (
        <GradientLink href="/chat" className={BTN}>
          <span>Open chat →</span>
        </GradientLink>
      ) : (
        <ConnectButton
          connectLabel="Sign in →"
          showAddress={false}
          className="flex items-center gap-2 rounded-full px-6 py-3.5 text-sm font-medium text-white"
        />
      )}
      <GradientLink href="#concept" className={BTN}>
        <span>Explore Echo</span>
      </GradientLink>
    </div>
  );
}
