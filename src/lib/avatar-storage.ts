"use client";

// Remembers the visitor's name + avatar choice in localStorage so a returning
// contributor keeps the same character (and we can pre-apply it to their next
// submission without an extra step).

import type { Avatar } from "@/lib/avatars";

const KEY = "happymap.identity.v1";

export type RememberedIdentity = {
  name: string | null;
  avatarId: string;
  avatarColor: string;
};

export function rememberAvatar(avatar: Avatar, name: string | null): void {
  if (typeof window === "undefined") return;
  try {
    const payload: RememberedIdentity = {
      name: name?.trim() || null,
      avatarId: avatar.avatarId,
      avatarColor: avatar.avatarColor,
    };
    window.localStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    // ignore quota / privacy-mode errors
  }
}

export function readRememberedIdentity(): RememberedIdentity | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RememberedIdentity>;
    if (
      typeof parsed.avatarId === "string" &&
      /^peep-/.test(parsed.avatarId) &&
      typeof parsed.avatarColor === "string" &&
      /^#[0-9a-f]{6}$/i.test(parsed.avatarColor)
    ) {
      return {
        name: typeof parsed.name === "string" ? parsed.name : null,
        avatarId: parsed.avatarId,
        avatarColor: parsed.avatarColor,
      };
    }
  } catch {
    // ignore
  }
  return null;
}
