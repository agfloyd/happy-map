"use client";

import { useMemo, useState } from "react";
import { Peep } from "@/components/Peep";
import { setHappinessAvatar } from "@/app/actions";
import {
  avatarDeck,
  avatarKey,
  type Avatar,
} from "@/lib/avatars";
import { rememberAvatar } from "@/lib/avatar-storage";

export function AvatarPicker({
  happinessId,
  name,
  isAnonymous,
  current,
  onClose,
}: {
  happinessId: string;
  name: string | null;
  isAnonymous: boolean;
  current: Avatar;
  onClose: () => void;
}) {
  const key = useMemo(
    () => avatarKey({ contributor_name: name, is_anonymous: isAnonymous }),
    [name, isAnonymous],
  );
  const deck = useMemo(() => avatarDeck(key, current, 20), [key, current]);
  const [selected, setSelected] = useState<Avatar>(current);
  const [saving, setSaving] = useState(false);

  async function choose(a: Avatar) {
    setSelected(a);
    rememberAvatar(a, name);
    setSaving(true);
    try {
      await setHappinessAvatar(happinessId, a.avatarId, a.avatarColor);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
          Pick your character ✨
        </h2>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          This is how you’ll appear on the map. Optional — scroll for more, or
          keep the one on the left.
        </p>

        <div className="mt-4 flex items-end gap-3">
          {/* Current / selected, highlighted */}
          <div className="flex flex-col items-center shrink-0">
            <div className="rounded-xl ring-2 ring-emerald-500 bg-zinc-50 dark:bg-zinc-900 p-1.5">
              <Peep avatarId={selected.avatarId} color={selected.avatarColor} size={64} />
            </div>
            <span className="mt-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-500">
              You
            </span>
          </div>

          {/* Scrollable row of alternatives (finite deck, ~4 visible) */}
          <div className="flex gap-2 overflow-x-auto pb-2 [scrollbar-width:thin] snap-x">
            {deck.map((a, i) => {
              const isSel =
                a.avatarId === selected.avatarId &&
                a.avatarColor === selected.avatarColor;
              return (
                <button
                  key={`${a.avatarId}-${a.avatarColor}-${i}`}
                  type="button"
                  onClick={() => choose(a)}
                  aria-pressed={isSel}
                  className={`snap-start shrink-0 rounded-xl p-1 transition ${
                    isSel
                      ? "ring-2 ring-emerald-500 bg-zinc-50 dark:bg-zinc-900"
                      : "ring-1 ring-transparent hover:ring-zinc-300 dark:hover:ring-zinc-700"
                  }`}
                >
                  <Peep avatarId={a.avatarId} color={a.avatarColor} size={52} />
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-4 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            {saving ? "Saving…" : "Done"}
          </button>
        </div>
      </div>
    </div>
  );
}
