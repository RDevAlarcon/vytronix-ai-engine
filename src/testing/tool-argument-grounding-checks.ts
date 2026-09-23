import assert from "node:assert/strict";
import { groundToolArguments } from "@/ai/tools/tool-argument-grounding";
import type { ToolDefinition } from "@/ai/tools/tool-contract";

const optionalReferenceTool: ToolDefinition = {
  name: "check_availability",
  description: "Checks current availability.",
  inputSchema: {
    type: "object",
    properties: {
      date: { type: "string", format: "date" },
      serviceRef: { type: "string" },
      resourceRef: { type: "string" }
    },
    required: ["date"],
    additionalProperties: false
  },
  sideEffect: "READ_ONLY",
  requiresConfirmation: false
};

const currentDate = { currentDate: "2026-09-22" };

export const runToolArgumentGroundingChecks = (): void => {
  const optionalResource = groundToolArguments(
    { ticketMessage: "tienes hora para mañana?" },
    optionalReferenceTool,
    { date: "tomorrow", resourceRef: "unsupported candidate" },
    currentDate
  );
  assert.equal(optionalResource.status, "READY");
  assert.deepEqual(optionalResource.arguments, { date: "2026-09-23" });
  assert.deepEqual(optionalResource.missing, []);
  assert.deepEqual(optionalResource.ungrounded, []);

  const historicalOnlyResource = groundToolArguments(
    { ticketMessage: "tienes hora para mañana?", knownContext: "El profesional anterior era Juan." },
    optionalReferenceTool,
    { date: "tomorrow", resourceRef: "Juan" },
    currentDate
  );
  assert.equal(historicalOnlyResource.status, "READY");
  assert.deepEqual(historicalOnlyResource.arguments, { date: "2026-09-23" });

  const optionalService = groundToolArguments(
    { ticketMessage: "tienes hora para mañana?" },
    optionalReferenceTool,
    { date: "tomorrow", serviceRef: "unsupported candidate" },
    currentDate
  );
  assert.equal(optionalService.status, "READY");
  assert.deepEqual(optionalService.arguments, { date: "2026-09-23" });
  assert.deepEqual(optionalService.missing, []);
  assert.deepEqual(optionalService.ungrounded, []);

  const evidencedResource = groundToolArguments(
    { ticketMessage: "¿Tiene hora Juan mañana?" },
    optionalReferenceTool,
    { date: "tomorrow", resourceRef: "Juan" },
    currentDate
  );
  assert.equal(evidencedResource.status, "READY");
  assert.deepEqual(evidencedResource.arguments, { date: "2026-09-23", resourceRef: "Juan" });

  const requiredReferenceTool: ToolDefinition = {
    ...optionalReferenceTool,
    inputSchema: { ...optionalReferenceTool.inputSchema, required: ["date", "resourceRef"] }
  };
  const requiredUngrounded = groundToolArguments(
    { ticketMessage: "tienes hora para mañana?" },
    requiredReferenceTool,
    { date: "tomorrow", resourceRef: "unsupported candidate" },
    currentDate
  );
  assert.equal(requiredUngrounded.status, "UNGROUNDED");
  assert.deepEqual(requiredUngrounded.missing, []);
  assert.deepEqual(requiredUngrounded.ungrounded, ["resourceRef"]);
  assert.equal(requiredUngrounded.arguments.resourceRef, "unsupported candidate");

  const requiredAbsent = groundToolArguments(
    { ticketMessage: "tienes hora para mañana?" },
    requiredReferenceTool,
    { date: "tomorrow" },
    currentDate
  );
  assert.equal(requiredAbsent.status, "MISSING_INFORMATION");
  assert.deepEqual(requiredAbsent.missing, ["resourceRef"]);

  const optionalNonReferenceTool: ToolDefinition = {
    name: "check_with_notes",
    description: "Checks current availability with optional notes.",
    inputSchema: {
      type: "object",
      properties: { date: { type: "string", format: "date" }, notes: { type: "string" } },
      required: ["date"],
      additionalProperties: false
    },
    sideEffect: "READ_ONLY",
    requiresConfirmation: false
  };
  assert.deepEqual(groundToolArguments(
    { ticketMessage: "tienes hora para mañana?" },
    optionalNonReferenceTool,
    { date: "tomorrow", notes: "unsupported candidate" },
    currentDate
  ).ungrounded, ["notes"]);

  console.log("Tool argument grounding checks: PASS (optional refs, current-turn evidence, required fail-closed)");
};
