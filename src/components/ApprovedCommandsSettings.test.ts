import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ApprovedCommandsSettings } from "./ApprovedCommandsSettings";

describe("Approved commands settings", () => {
  it("renders an accessible MCP tool picker while the bot matrix loads", () => {
    const html = renderToStaticMarkup(createElement(ApprovedCommandsSettings));
    expect(html).toContain("Connector execution requires approval");
    expect(html).toContain('aria-label="Search MCP tools"');
    expect(html).toContain('aria-label="MCP tool name"');
    expect(html).toContain('placeholder="mcp__server__tool"');
    expect(html).toContain('type="submit"');
  });
});
