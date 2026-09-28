import { describe, expect, it } from "vitest";

import { stateForBot } from "./mascot";

describe("stateForBot", () => {
  it("still alerts on a failed tool call when a digest receipt follows it", () => {
    // Phase 0 writes a digest row after every turn, so the failed chip is
    // no longer the last row; the mood must read past the receipt.
    expect(stateForBot({
      name: "Atlas",
      messages: [
        { kind: "activity", tool: { ok: false } },
        { kind: "digest" },
      ],
    })).toBe("alerting");
  });

  it("keeps reading a pending card as curious behind a receipt", () => {
    expect(stateForBot({ name: "Atlas", messages: [{ kind: "options" }, { kind: "digest" }] })).toBe("curious");
  });
});


describe("live mascot activity", () => {
  it("listens while waiting for approval and alerts when the agent is unavailable", () => {
    expect(stateForBot({ name: "Maus", busy: true, activity: "waiting-on-you" })).toBe("listening");
    expect(stateForBot({ name: "Maus", activity: "dead" })).toBe("alerting");
    expect(stateForBot({ name: "Maus", activity: "working" })).toBe("working");
    expect(stateForBot({ name: "Maus", mascotExpression: "happy", activity: "working" })).toBe("happy");
  });
});
