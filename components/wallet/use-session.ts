"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";

// ponytail: react-query sudah ada (dep wagmi) — 4 instance ConnectButton
// berbagi 1 cache session, bukan 4x fetch.

export interface ServerSession {
  authenticated: boolean;
  walletAddress?: string;
  companionId?: string;
}

async function fetchSession(): Promise<ServerSession> {
  try {
    const res = await fetch("/api/session", { cache: "no-store" });
    return (await res.json()) as ServerSession;
  } catch {
    return { authenticated: false };
  }
}

export function useSession() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["session"],
    queryFn: fetchSession,
    staleTime: 30_000,
    retry: false,
  });

  return {
    session: query.data ?? null,
    isLoading: query.isLoading,
    refresh: () =>
      queryClient.invalidateQueries({ queryKey: ["session"] }),
  };
}
