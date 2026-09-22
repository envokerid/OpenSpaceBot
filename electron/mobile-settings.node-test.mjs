import { test } from "node:test";
import assert from "node:assert/strict";
import { createMobileSettingsRegistry } from "./mobile-settings.mjs";

test("mobile settings invoke only registered administration channels, with bounded arguments", async () => {
  const registry = createMobileSettingsRegistry();
  let called = 0;
  registry.register("shell:open", () => {
    called++;
  });
  registry.register("organization:begin", (event, input) => {
    assert.equal(event, undefined);
    called++;
    return { status: "connecting", portalOrigin: input.portalOrigin };
  });
  for (const channel of [
    "shell:open",
    "environments:pair",
    "__proto__",
    "organization:state",
  ]) {
    await assert.rejects(registry.invoke(channel, []), /not available/);
  }
  await assert.rejects(
    registry.invoke("organization:begin", {}),
    /Invalid settings request/,
  );
  await assert.rejects(
    registry.invoke("organization:begin", [1, 2, 3, 4]),
    /Invalid settings request/,
  );
  assert.equal(called, 0);
  assert.deepEqual(
    await registry.invoke("organization:begin", [
      { portalOrigin: "https://fixture.example.test" },
    ]),
    { status: "connecting", portalOrigin: "https://fixture.example.test" },
  );
  assert.equal(called, 1);
});

test("workspace guard and handler failures remain effective through the mobile bridge", async () => {
  const registry = createMobileSettingsRegistry();
  registry.register("company-backups:restore", () => {
    throw new Error("Preview this backup and confirm REPLACE");
  });
  registry.register("organization:state", () => {
    throw new Error("Switch the desktop to its local workspace");
  });
  await assert.rejects(
    registry.invoke("company-backups:restore", [{}]),
    /REPLACE/,
  );
  await assert.rejects(
    registry.invoke("organization:state", []),
    /local workspace/,
  );
});
