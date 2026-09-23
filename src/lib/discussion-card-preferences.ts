import { useSyncExternalStore } from "react";

export const SHOW_DISCUSSION_CARDS_KEY = "omb-show-discussion-cards";

let sessionChoice: boolean | undefined;
const listeners = new Set<() => void>();

function storage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

function showDiscussionCards(): boolean {
  if (sessionChoice !== undefined) return sessionChoice;
  try {
    return storage()?.getItem(SHOW_DISCUSSION_CARDS_KEY) !== "0";
  } catch {
    return true;
  }
}

function notify() {
  for (const listener of listeners) listener();
}

function onStorage(event: StorageEvent) {
  if (event.key !== SHOW_DISCUSSION_CARDS_KEY && event.key !== null) return;
  if (event.storageArea && event.storageArea !== storage()) return;
  sessionChoice = undefined;
  notify();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1 && typeof window !== "undefined") window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && typeof window !== "undefined") window.removeEventListener("storage", onStorage);
  };
}

export function setShowDiscussionCards(enabled: boolean): void {
  sessionChoice = enabled;
  try {
    storage()?.setItem(SHOW_DISCUSSION_CARDS_KEY, enabled ? "1" : "0");
  } catch {
    // Keep the choice active for this session if storage is unavailable.
  }
  notify();
}

export function useShowDiscussionCards(): boolean {
  return useSyncExternalStore(subscribe, showDiscussionCards, () => true);
}
