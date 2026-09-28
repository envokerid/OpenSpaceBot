import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { StoreProvider, type Bot } from "@/state/store";
import { MASCOT_BODY_IDS, MASCOT_BODIES } from "../../shared/mascot-bodies";
import { BotProfileAvatarCard } from "./BotProfileAvatarCard";

function makeBot(overrides: Partial<Bot> = {}): Bot {
  return {
    id: "bot-1",
    threadId: "thread-1",
    name: "Maus",
    title: "Maus",
    description: "",
    notifications: false,
    color: "green",
    unread: false,
    modelSelection: { instanceId: "local", model: "test-model" },
    messages: [],
    ...overrides,
  };
}

function renderCard(bot: Bot) {
  return renderToStaticMarkup(
    createElement(
      StoreProvider,
      null,
      createElement(BotProfileAvatarCard, {
        bot,
        activeState: "idle",
        mascotMotion: null,
        onPatch: vi.fn(),
      }),
    ),
  );
}

describe("BotProfileAvatarCard body picker", () => {
  it("offers white and marks it selected for a white bot", () => {
    const markup = renderCard(makeBot({ color: "white" }));
    expect(markup).toMatch(/aria-pressed="true"[^>]*style="background-color:#FFFFFF"[^>]*title="white" aria-label="Use white mascot color"/);
  });

  it("renders one option per body catalog entry, labeled by name", () => {
    const markup = renderCard(makeBot());

    expect(markup).toContain(">Body<");
    for (const id of MASCOT_BODY_IDS) {
      expect(markup).toContain(`aria-label="Use the ${id === "cursor" ? "Orb" : MASCOT_BODIES[id].name} body"`);
    }
  });

  it("marks the current body pressed and the rest unpressed, defaulting to cursor", () => {
    const markup = renderCard(makeBot());

    expect(markup).toContain(`aria-pressed="true" aria-label="Use the Orb body"`);
    expect(markup).toContain(`aria-pressed="false" aria-label="Use the ${MASCOT_BODIES.star.name} body"`);
  });

  it("reflects an explicitly chosen body", () => {
    const markup = renderCard(makeBot({ mascotBody: "star" }));

    expect(markup).toContain(`aria-pressed="true" aria-label="Use the ${MASCOT_BODIES.star.name} body"`);
    expect(markup).toContain(`aria-pressed="false" aria-label="Use the Orb body"`);
  });

  it("hides the body picker for flat crops that have no mascot to wear one", () => {
    const markup = renderCard(makeBot({ avatarCrop: "circle" }));

    expect(markup).not.toContain(">Body<");
    expect(markup).not.toContain(`aria-label="Use the Orb body"`);
  });

  it("hides the body picker for every flat crop, not just circle", () => {
    for (const crop of ["rounded", "square"] as const) {
      const markup = renderCard(makeBot({ avatarCrop: crop }));

      expect(markup).not.toContain(">Body<");
    }
  });
});
