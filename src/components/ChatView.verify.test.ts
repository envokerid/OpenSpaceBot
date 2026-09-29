import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import type { AppState, Bot, Message } from "@/state/store";
import { t } from "@/lib/i18n";
import type { VerifyCard } from "./VerifyCard";

const fixture = vi.hoisted(() => {
  vi.stubGlobal("window", {});
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {} });
  return {
    dispatch: vi.fn(),
    state: null as Partial<AppState> | null,
    verify: null as ComponentProps<typeof VerifyCard> | null,
  };
});
vi.mock("@/state/store", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/state/store")>();
  return { ...original, useStore: () => ({ state: { ...original.initialState, ...fixture.state }, dispatch: fixture.dispatch }) };
});
// Catch accidental remounting of the old run checklist.
vi.mock("./VerifyCard", async (importOriginal) => {
  const original = await importOriginal<typeof import("./VerifyCard")>();
  return { VerifyCard: (props: ComponentProps<typeof VerifyCard>) => {
    fixture.verify = props;
    return createElement(original.VerifyCard, props);
  } };
});
// The real useCaptionChrome rides along: it only asks this module for the
// window chrome, and these tests render the desktop-neutral layout.
vi.mock("./DesktopCapabilities", async (importOriginal) => ({
  ...await importOriginal<typeof import("./DesktopCapabilities")>(),
  useDesktopCapabilities: () => ({ capabilities: { dictation: { available: false } }, ready: true }),
}));
vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));
// The thread controls read live model lists; they are not what this file tests.
vi.mock("./ModelPicker", () => ({ ModelPicker: () => createElement("span", { "data-test-model-control": true }) }));
vi.mock("./ApprovalModeSelector", () => ({ ApprovalModeSelector: () => createElement("span", { "data-test-approval-control": true }) }));

const { ChatView } = await import("./ChatView");
afterAll(() => vi.unstubAllGlobals());
afterEach(() => {
  fixture.state = null;
  fixture.verify = null;
  vi.clearAllMocks();
});

const bot: Bot = {
  id: "bot", threadId: "t1", name: "Pepper", title: "", description: "", color: "green",
  notifications: true, unread: false, busy: false, messages: [],
  modelSelection: { instanceId: "test", model: "profile-default" },
};
const chip = (id: string, summary: string, ok?: boolean): Message =>
  ({ id, at: 1, role: "bot", kind: "activity", tool: { name: "Bash", summary, ...(ok === undefined ? {} : { ok }) } });
const asked = (id: string, text: string): Message => ({ id, role: "user", kind: "text", at: 1, text });
const run: Message[] = [
  asked("u1", "verify the fixture"),
  chip("c1", "pnpm control:omb doctor --url http://127.0.0.1:8799", true),
  chip("c2", "node --experimental-strip-types scripts/control-omb.ts send --bot x --text hi", false),
  chip("c3", "git status", true),
  chip("c4", "cat scripts/control-omb.ts", true),
];
const render = (messages: Message[], busy = false) => renderToStaticMarkup(createElement(ChatView, { bot: { ...bot, busy, messages } }));

describe("Avatar activity in the chat pane", () => {
  it.each([false, true])("hides tool calls and run checklists even with a saved tool-detail setting (%s)", (showToolCalls) => {
    fixture.state = { config: { features: { showToolCalls, skillAuthoring: true } } as AppState["config"] };
    const markup = render(run);
    expect(markup).toContain("verify the fixture");
    expect(markup).not.toContain(`aria-label="${t("chat.verify.aria")}"`);
    expect(markup).not.toContain("steps ·");
    expect(markup).not.toContain("Bash");
    expect(markup).not.toContain("pnpm control:omb");
    expect(fixture.verify).toBeNull();
  });

  it("shows the working avatar without exposing the current tool or command", () => {
    const markup = render([...run, chip("live", "npm publish")], true);
    expect(markup).toContain("turn-presence");
    expect(markup).toContain('data-state="working"');
    expect(markup).toContain('class="sr-only" role="status"');
    expect(markup).not.toContain("npm publish");
    expect(markup).not.toContain("Running a command");
  });

  it("renders the reply image without the redundant standalone screen", () => {
    const reply: Message = { id: "reply-image", role: "bot", kind: "text", at: 2,
      text: "Here is the screenshot.", turnId: "image-turn",
      attachments: [{ kind: "image", path: "/api/attachments/screenshot.png", mime: "image/png" }] };
    const screen: Message = { id: "screen", role: "bot", kind: "screen", at: 4, png: "standalone-pixels" };
    const markup = render([reply, { id: "digest", role: "bot", kind: "digest", at: 3, turnId: "image-turn" }, screen]);
    expect(markup).toContain("Here is the screenshot.");
    expect(markup).toContain("screenshot.png");
    expect(markup).not.toContain("standalone-pixels");
    expect(render([{ ...reply, attachments: [] }, screen])).toContain("standalone-pixels");
  });

  it("shows only a sender notice for incoming bot messages, including older provenance rows", () => {
    for (const request of [
      { peerAsk: { botId: "chief", name: "Chief" }, text: "INTERNAL_HANDOFF_BODY" },
      { text: "[Delegated by @Chief, another bot in this OpenMausBot workspace — reply directly.]\n\nINTERNAL_HANDOFF_BODY" },
    ]) {
      const markup = render([{ id: "peer", role: "user", kind: "text", at: 1, ...request,
        attachments: [{ kind: "image", path: "/api/attachments/internal.png", mime: "image/png" }] }]);
      expect(markup).toContain("Message from Chief");
      expect(markup).not.toContain("INTERNAL_HANDOFF_BODY");
      expect(markup).not.toContain("internal.png");
      expect(markup).not.toContain("another bot in this OpenMausBot workspace");
    }
  });

  it("shows a sender notice for a room request copied into the receiving bot's chat", () => {
    const markup = render([{ id: "room-request", role: "bot", kind: "text", at: 1,
      roomRequest: { id: "request", phase: "request" },
      from: { botId: "chief", name: "Chief Of Staff", color: "white" }, text: "INTERNAL_ROOM_HANDOFF" }]);
    expect(markup).toContain("Message from Chief Of Staff");
    expect(markup).not.toContain("INTERNAL_ROOM_HANDOFF");
  });

  it("reuses the incoming receipt without a second notice or peer message bubble", () => {
    const markup = render([
      { id: "receipt", role: "bot", kind: "activity", at: 1, tool: { name: "Message from @Chief" },
        comm: { groupId: "pair", withBotId: "chief", withName: "Chief", withColor: "blue" } },
      { id: "peer", role: "user", kind: "text", at: 2, text: "INTERNAL_HANDOFF_BODY", peerAsk: { botId: "chief", name: "Chief" } },
      { id: "answer", role: "bot", kind: "text", at: 3, text: "The task is finished." },
    ]);
    expect(markup.match(/Message from/g)).toHaveLength(1);
    expect(markup).not.toContain("INTERNAL_HANDOFF_BODY");
    expect(markup).toContain("The task is finished.");
  });

  it("keeps completed replies and turn errors visible", () => {
    const markup = render([...run,
      { id: "progress", at: 2, role: "bot", kind: "text", turnId: "finished", text: "Progress narration" },
      { id: "reply", at: 60002, role: "bot", kind: "text", turnId: "finished", turnTerminal: true, text: "Here is the result." },
      { id: "error", at: 3, role: "bot", kind: "activity", tool: { name: "error: Connection lost", ok: false } },
    ]);
    expect(markup).toContain("Here is the result.");
    expect(markup).not.toContain("Worked for");
    expect(markup).not.toContain("Show progress messages");
    expect(markup).not.toContain("Progress narration");
    expect(markup).toContain("Connection lost");
    expect(markup).not.toContain("turn-presence");
  });
});
