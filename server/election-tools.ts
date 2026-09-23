/** A phase-specific MCP surface; the server owns identity and allowed choices. */
export function electionTools(phase: string, candidates: string[]) {
  if (!["proposing", "judging", "summary"].includes(phase)) throw new Error("Unknown room selection phase");
  const proposing = phase === "proposing";
  const summary = phase === "summary";
  return [{
    name: summary ? "submit_summary" : phase === "proposing" ? "submit_proposal" : "select_response",
    description: summary ? "Submit the requested conversation summary, then end this turn."
      : proposing ? "Submit your own ready-to-post message and brief public reason, or task_complete with an empty message. Selected messages post verbatim." : "Select a proposed message or task_complete and give a brief public reason.",
    inputSchema: { type: "object", additionalProperties: false,
      properties: summary ? { summary: { type: "string", maxLength: 2000 } }
        : { candidate: { type: "string", ...(phase === "judging" ? {} : { enum: candidates }) }, reason: { type: "string", minLength: 1, maxLength: 500 }, ...(proposing ? { message: { type: "string", maxLength: 8000 } } : {}) },
      required: summary ? ["summary"] : proposing ? ["candidate", "reason", "message"] : ["candidate", "reason"],
    },
  }];
}
