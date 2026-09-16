"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// ponytail: ikut pola use-session — 1 cache ["companion"] untuk header + panel.

export interface CompanionProfile {
  companion_name: string;
  wallet_address: string;
  created_at: string;
  total_message_count: number;
  personality: string;
}

async function fetchCompanion(): Promise<CompanionProfile> {
  const res = await fetch("/api/companion", { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load companion.");
  return (await res.json()) as CompanionProfile;
}

async function renameCompanion(name: string): Promise<CompanionProfile> {
  const res = await fetch("/api/companion", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error?.message ?? "Rename failed.");
  return data as CompanionProfile;
}

async function updatePersonality(
  personality: string
): Promise<CompanionProfile> {
  const res = await fetch("/api/companion", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ personality }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error?.message ?? "Update failed.");
  return data as CompanionProfile;
}

async function resetCompanion(): Promise<void> {
  const res = await fetch("/api/companion/reset", { method: "POST" });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error?.message ?? "Reset failed.");
  }
}

export function useCompanion() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["companion"],
    queryFn: fetchCompanion,
    staleTime: 30_000,
    retry: false,
  });
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["companion"] });

  const rename = useMutation({ mutationFn: renameCompanion, onSuccess: invalidate });
  const reset = useMutation({ mutationFn: resetCompanion, onSuccess: invalidate });
  const personality = useMutation({
    mutationFn: updatePersonality,
    onSuccess: invalidate,
  });

  return {
    profile: query.data ?? null,
    isLoading: query.isLoading,
    rename,
    reset,
    personality,
  };
}
