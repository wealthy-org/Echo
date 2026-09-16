"use client";

import { useState } from "react";
import { MAX_COMPANION_NAME_LENGTH } from "../../lib/companion/constants";
import { useCompanion } from "./use-companion";

// ponytail: 1 kartu popover untuk FR-08/09/10 — profil + rename inline +
// reset two-click confirm. Ikut token echo-* seperti chat.

function shortWallet(addr: string) {
  return addr.length > 10 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

function knownSince(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function CompanionPanel() {
  const { profile, isLoading, rename, reset } = useCompanion();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);

  if (isLoading || !profile) {
    return <p className="animate-pulse text-sm text-echo-muted/60">Loading…</p>;
  }

  const error = rename.error ?? reset.error;
  const busy = rename.isPending || reset.isPending;

  function startEdit() {
    setDraft(profile!.companion_name);
    setEditing(true);
  }

  function save() {
    const name = draft.trim();
    if (!name || name.length > MAX_COMPANION_NAME_LENGTH || rename.isPending) return;
    rename.mutate(name, { onSuccess: () => setEditing(false) });
  }

  return (
    <div className="w-80 rounded-3xl border border-white/10 bg-echo-card p-5 text-white shadow-2xl shadow-black/60">
      {editing ? (
        <div className="flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") setEditing(false);
            }}
            maxLength={MAX_COMPANION_NAME_LENGTH + 10}
            aria-label="Companion name"
            autoFocus
            className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-black/40 px-4 py-2 text-sm font-semibold focus:border-white/40 focus:outline-none"
          />
          <button
            onClick={save}
            disabled={busy}
            className="gradient-button rounded-2xl px-4 py-2 text-sm font-medium disabled:opacity-40"
          >
            <span>Save</span>
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-lg font-semibold tracking-[-0.02em]">
            {profile.companion_name}
          </p>
          <button
            onClick={startEdit}
            disabled={busy}
            className="shrink-0 rounded-full border border-white/10 px-4 py-1.5 text-xs text-echo-muted transition hover:border-white/30 hover:text-white disabled:opacity-40"
          >
            Rename
          </button>
        </div>
      )}

      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-echo-muted/60">Since</dt>
          <dd>{knownSince(profile.created_at)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-echo-muted/60">Messages</dt>
          <dd>{profile.total_message_count}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-echo-muted/60">Wallet</dt>
          <dd className="font-mono text-xs">{shortWallet(profile.wallet_address)}</dd>
        </div>
      </dl>

      {error && (
        <p className="mt-3 text-xs text-echo-peach">
          {(error as Error).message}
        </p>
      )}

      <div className="mt-4 border-t border-white/10 pt-4">
        {confirmReset ? (
          <div>
            <p className="text-xs leading-5 text-echo-muted/60">
              Delete all messages and memory? Name and known-since stay.
            </p>
            <div className="mt-2 flex gap-2">
              <button
                onClick={() =>
                  reset.mutate(undefined, {
                    // ponytail: history baru saja dihapus — reload cara paling
                    // jujur mengosongkan state chat lokal.
                    onSuccess: () => window.location.reload(),
                  })
                }
                disabled={busy}
                className="flex-1 rounded-2xl bg-red-500/80 px-4 py-2 text-sm font-medium transition hover:bg-red-500 disabled:opacity-40"
              >
                {reset.isPending ? "Resetting…" : "Confirm reset"}
              </button>
              <button
                onClick={() => setConfirmReset(false)}
                disabled={busy}
                className="rounded-2xl border border-white/10 px-4 py-2 text-sm text-echo-muted transition hover:border-white/30 hover:text-white disabled:opacity-40"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setConfirmReset(true)}
            disabled={busy}
            className="w-full rounded-2xl border border-white/10 px-4 py-2 text-sm text-echo-muted transition hover:border-red-400/50 hover:text-red-300 disabled:opacity-40"
          >
            Reset companion
          </button>
        )}
      </div>
    </div>
  );
}
