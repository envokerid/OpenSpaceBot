import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hook = vi.hoisted(() => ({
  subscribe: undefined as undefined | ((listener: () => void) => () => void),
}));

vi.mock("react", () => ({
  useSyncExternalStore: (subscribe: (listener: () => void) => () => void, snapshot: () => boolean) => {
    hook.subscribe = subscribe;
    return snapshot();
  },
}));

const values = new Map<string, string>();
const local = {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => { values.set(key, value); },
};

beforeEach(() => {
  vi.resetModules();
  values.clear();
  vi.stubGlobal("localStorage", local);
  vi.stubGlobal("window", new EventTarget());
});

afterEach(() => vi.unstubAllGlobals());

describe("discussion card visibility", () => {
  it("shows cards by default and persists each choice", async () => {
    let preference = await import("./discussion-card-preferences");
    expect(preference.useShowDiscussionCards()).toBe(true);
    preference.setShowDiscussionCards(false);
    expect(values.get(preference.SHOW_DISCUSSION_CARDS_KEY)).toBe("0");
    vi.resetModules();
    preference = await import("./discussion-card-preferences");
    expect(preference.useShowDiscussionCards()).toBe(false);
    preference.setShowDiscussionCards(true);
    expect(values.get(preference.SHOW_DISCUSSION_CARDS_KEY)).toBe("1");
  });

  it("updates mounted transcripts immediately", async () => {
    const preference = await import("./discussion-card-preferences");
    preference.useShowDiscussionCards();
    const changed = vi.fn();
    const unsubscribe = hook.subscribe!(changed);
    preference.setShowDiscussionCards(false);
    expect(changed).toHaveBeenCalledOnce();
    unsubscribe();
  });
});
