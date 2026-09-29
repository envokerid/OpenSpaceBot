import type { Scenario } from "./schema.ts";

export interface TurnEvidence {
  reply: string;
  calls: Array<{ name: string; args: Record<string, unknown> }>;
  availableTools: string[];
  prompt: string;
  memory: string;
}
export interface Verdict { type: string; value?: string; passed: boolean; detail: string }
function containsSubset(actual: unknown, expected: unknown): boolean {
  if (expected && typeof expected === "object" && !Array.isArray(expected)) {
    return !!actual && typeof actual === "object" && Object.entries(expected).every(([key, value]) => containsSubset((actual as Record<string, unknown>)[key], value));
  }
  return JSON.stringify(actual) === JSON.stringify(expected);
}
export function evaluate(assertions: Scenario["turns"][number]["assertions"], evidence: TurnEvidence): Verdict[] {
  return assertions.map(a => {
    const value = a.value ?? "";
    let passed = false;
    switch (a.type) {
      case "replyContains": passed = evidence.reply.includes(value); break;
      case "replyNotContains": passed = !evidence.reply.includes(value); break;
      case "replyEquals": passed = evidence.reply.trim() === value; break;
      case "replyJson": try { JSON.parse(evidence.reply); passed = true; } catch { /* A fenced block is not a JSON-only reply. */ } break;
      case "toolCalled": passed = evidence.calls.some(c => c.name === value && (!a.args || containsSubset(c.args, a.args))); break;
      case "toolNotCalled": passed = !evidence.calls.some(c => c.name === value); break;
      case "toolAvailable": passed = evidence.availableTools.includes(value); break;
      case "toolUnavailable": passed = !evidence.availableTools.includes(value); break;
      case "memoryContains": passed = evidence.memory.includes(value); break;
      case "memoryNotContains": passed = !evidence.memory.includes(value); break;
      case "promptContains": passed = evidence.prompt.includes(value); break;
      case "promptNotContains": passed = !evidence.prompt.includes(value); break;
    }
    return { type: a.type, value: a.value, passed, detail: `${a.type}: ${passed ? "passed" : "failed"}${a.args ? " (including argument match)" : ""}` };
  });
}
