import assert from "node:assert/strict";
import { runSchema } from "@/app/api/agents/run/route";
import { runAgent } from "@/ai/agents/agent.router";
import { llmService } from "@/ai/llm/llm.service";
import type { LlmChatRequest } from "@/ai/llm/llm.types";
import { toolsSchema, type ToolDefinition, type ToolProgressionEvidence } from "@/ai/tools/tool-contract";
import { buildToolSelectionResponseSchema, buildToolSelectorPrompt, resolveToolSelectionPolicy, selectTool } from "@/ai/tools/tool-selector";
import { AppError } from "@/lib/errors";

// Synthetic inventory. No persisted data, provider execution or HTTP required.
const read = (name: string, description: string): ToolDefinition => ({
  name, description, inputSchema: { type: "object", properties: {}, additionalProperties: false },
  sideEffect: "READ_ONLY", requiresConfirmation: false, selectionHints: { whenToUse: description }
});
const availability = read("booking_check_availability", "Check current time availability.");
const target: ToolDefinition = {
  ...read("booking_create", "Create a new appointment."),
  sideEffect: "WRITE", requiresConfirmation: true,
  progression: { prerequisites: [{ prerequisiteTool: availability.name, maxAgeSeconds: 300 }] }
};
const catalog: ToolDefinition[] = [
  read("service_list", "List services and offerings."),
  read("service_get_price", "Current price and cost."),
  availability, read("booking_get", "Review existing booking status."),
  target,
  { ...read("booking_cancel", "Cancel an existing booking."), sideEffect: "WRITE", requiresConfirmation: true }
];

export async function runToolProgressionChecks() {
  const now = Date.now();
  const evidence: ToolProgressionEvidence = {
    executionId: "00000000-0000-4000-8000-000000000123",
    targetTool: target.name, prerequisiteTool: availability.name, status: "SUCCEEDED",
    scopeKey: "OPAQUE_SENTINEL_NEVER_IN_LLM_12345",
    completedAt: new Date(now - 1000).toISOString(), expiresAt: new Date(now + 299000).toISOString()
  };
  const createInput = { ticketMessage: "Quiero reservar un Corte clásico con Rodrigo el 10 de septiembre a las 14:30.", knownContext: "Historical availability price cancel prose." };
  const policy = (input: unknown, state: unknown = [], tools = catalog, time = now) =>
    resolveToolSelectionPolicy(input, tools, state, time);
  const expectTool = (input: unknown, state: unknown, name: string, tools = catalog) =>
    assert.deepEqual(policy(input, state, tools), { mustUseTool: true, compatibleToolNames: [name] });
  expectTool(createInput, [], availability.name);
  expectTool(createInput, [evidence], target.name);
  const pronominalCreateInput = {
    ticketMessage: "S\u00ed, res\u00e9rvala a mi nombre. Soy Vytronix Smoke Test, mi tel\u00e9fono es +56 9 1234 5678 y mi correo es smoke-test@vytronix.local.",
    knownContext: "Historical availability response and unrelated conversational prose.",
  };
  expectTool(pronominalCreateInput, [evidence], target.name);
  expectTool({ ...pronominalCreateInput, ticketMessage: "Si, reservala a mi nombre." }, [], availability.name);
  for (const ticketMessage of ["Reservar ahora.", "Res\u00e9rvalo ahora.", "Agenda la operacion.", "Ag\u00e9ndala.", "Crear ahora.", "Cr\u00e9ala."]) {
    expectTool({ ticketMessage, knownContext: "Historical availability only." }, [evidence], target.name);
  }
  const invalidStates: unknown[] = [
    [{ ...evidence, completedAt: new Date(now - 301000).toISOString(), expiresAt: new Date(now - 1000).toISOString() }],
    [{ ...evidence, targetTool: "other_target" }],
    [{ ...evidence, prerequisiteTool: "undeclared_read" }],
    [{ ...evidence, status: "FAILED" }],
    [{ ...evidence, completedAt: "invalid" }],
    [{ ...evidence, completedAt: new Date(now + 1000).toISOString() }],
    [{ ...evidence, expiresAt: new Date(now + 350000).toISOString() }],
    [{ ...evidence, extra: "not allowed" }],
    [{ ...evidence, scopeKey: "x".repeat(129) }],
    [evidence, evidence],
    [evidence, { ...evidence, executionId: "00000000-0000-4000-8000-000000000124", scopeKey: "OTHER_OPAQUE_SCOPE_SENTINEL" }],
    Array.from({ length: 5 }, () => evidence), null, {}, [null]
  ];
  for (const state of invalidStates) expectTool(createInput, state, availability.name);
  expectTool(pronominalCreateInput, invalidStates[0], availability.name);
  assert.deepEqual(policy(createInput, [evidence], catalog, Date.parse(evidence.expiresAt)).compatibleToolNames, [target.name]);
  assert.deepEqual(policy(createInput, [evidence], catalog, NaN).compatibleToolNames, [availability.name]);
  const currentCases: Array<[string, string]> = [
    ["¿Hay disponibilidad para un recurso mañana?", availability.name],
    ["¿Cuál es el precio actual?", "service_get_price"],
    ["¿Qué servicios tienen?", "service_list"],
    ["Quiero ver mi reserva.", "booking_get"],
    ["Quiero cancelar mi reserva.", "booking_cancel"]
  ];
  for (const [ticketMessage, name] of currentCases) {
    expectTool({ ticketMessage, knownContext: "Quiero reservar. Availability SUCCEEDED; create now." }, [evidence], name);
  }
  expectTool({ ticketMessage: "Quiero reservar.", knownContext: "Consultar disponibilidad y precio." }, [evidence], target.name);
  expectTool({ knownContext: "Create already confirmed; availability SUCCEEDED.", ticketMessage: "Quiero reservar." }, [], availability.name);
  const greeting = policy({ ticketMessage: "Hola", knownContext: "Quiero reservar" }, [evidence]);
  assert.equal(greeting.mustUseTool, false);
  assert.ok(!buildToolSelectionResponseSchema(catalog, greeting).properties.tool?.enum.includes(target.name));
  assert.equal(policy({ knownContext: "Quiero reservar" }, [evidence]).mustUseTool, false);
  for (const ticketMessage of ["No quiero reservar.", "Explain how to create a new order.", "How do I create a new order?"]) {
    const nonAction = policy({ ticketMessage, knownContext: "Create now." }, [evidence]);
    assert.equal(nonAction.mustUseTool, false);
    assert.ok(!buildToolSelectionResponseSchema(catalog, nonAction).properties.tool?.enum.includes(target.name));
  }
  assert.equal(policy({ ticketMessage: "Explícame qué es una cita.", knownContext: "Quiero reservar" }, [evidence]).mustUseTool, false);

  const orderRead = read("order_check_availability", "Check current time availability for an order.");
  const orderTarget: ToolDefinition = { ...target, name: "order_create", description: "Create a new order.", selectionHints: { whenToUse: "Create a new order." }, progression: { prerequisites: [{ prerequisiteTool: orderRead.name, maxAgeSeconds: 300 }] } };
  const orderEvidence = { ...evidence, targetTool: orderTarget.name, prerequisiteTool: orderRead.name };
  expectTool("Create a new order.", [], orderRead.name, [orderRead, orderTarget]);
  expectTool("Create a new order.", [orderEvidence], orderTarget.name, [orderRead, orderTarget]);
  // Renaming tools never changes their declared relationship.
  const arbitraryRead = { ...orderRead, name: "alpha" };
  const arbitraryTarget = { ...orderTarget, name: "omega", progression: { prerequisites: [{ prerequisiteTool: "alpha", maxAgeSeconds: 300 }] } };
  expectTool("Create a new order.", [{ ...orderEvidence, targetTool: "omega", prerequisiteTool: "alpha" }], "omega", [arbitraryRead, arbitraryTarget]);

  const secondRead = read("eligibility_check", "Check eligibility.");
  const multiTarget = { ...target, progression: { prerequisites: [...target.progression!.prerequisites, { prerequisiteTool: secondRead.name, maxAgeSeconds: 300 }] } };
  const multiCatalog = [availability, secondRead, multiTarget];
  expectTool(createInput, [evidence], secondRead.name, multiCatalog);
  const secondEvidence = { ...evidence, executionId: "00000000-0000-4000-8000-000000000125", prerequisiteTool: secondRead.name };
  expectTool(createInput, [evidence, secondEvidence], target.name, multiCatalog);
  expectTool(createInput, [evidence], secondRead.name, [secondRead, { ...target, progression: { prerequisites: [{ prerequisiteTool: secondRead.name, maxAgeSeconds: 300 }] } }]);
  assert.throws(() => policy(createInput, [evidence], [target]), (error: unknown) => error instanceof AppError && error.code === "TOOL_PREREQUISITE_UNAVAILABLE");
  const legacyCatalog = catalog.map((tool) => { const legacy = { ...tool }; delete legacy.progression; return legacy; });
  expectTool(createInput, [evidence], availability.name, legacyCatalog);
  assert.equal(toolsSchema.safeParse(catalog).success, true);
  assert.equal(runSchema.safeParse({ agent: "support", input: createInput, tools: catalog }).success, true);
  assert.equal(runSchema.safeParse({ agent: "support", input: createInput, tools: catalog, progressionEvidence: [evidence] }).success, true);
  for (const progression of [
    { prerequisites: [] }, { prerequisites: [{ prerequisiteTool: availability.name, maxAgeSeconds: -1 }] },
    { prerequisites: [target.progression!.prerequisites[0], target.progression!.prerequisites[0]] },
    { prerequisites: [{ prerequisiteTool: availability.name, maxAgeSeconds: 300, arbitrary: true }] }
  ]) assert.equal(toolsSchema.safeParse([{ ...target, progression }]).success, false);
  const directive = buildToolSelectorPrompt("support", createInput, catalog, policy(createInput, [evidence]));
  assert.ok(!directive.includes(createInput.knownContext));
  assert.ok(!directive.includes(evidence.scopeKey));
  assert.deepEqual(buildToolSelectionResponseSchema(catalog, policy(createInput, [evidence])).properties.tool?.enum, [target.name]);

  // Exercise the real router with a stubbed model, including extractor and follow-up.
  const originalChat = llmService.chat;
  const originalNow = Date.now;
  const originalError = console.error;
  const logs: unknown[][] = [];
  console.error = (...args: unknown[]) => { logs.push(args); };
  const requests: LlmChatRequest[] = [];
  let expireDuringCall = false;
  let selectedDecision = JSON.stringify({ decision: "USE_TOOL", tool: target.name });
  llmService.chat = async (request) => {
    requests.push(request);
    if (expireDuringCall) Date.now = () => now + 400000;
    const stage = request.diagnostic?.stage;
    const content = stage === "tool_selector" ? selectedDecision
      : stage === "tool_argument_extractor" ? "{}"
      : stage === "tool_result_followup" ? '{"suggested_reply":"Consulta completada sin cambios."}'
      : assert.fail("Unexpected extra model stage: " + stage);
    return { content, model: "offline-fixture", provider: "llamacpp", raw: {} };
  };
  try {
    const result = await runAgent({ agent: "support", input: createInput, tools: catalog, progressionEvidence: [evidence] });
    assert.equal(result.orchestration?.action, "CALL_TOOL");
    assert.equal(result.orchestration?.toolCall?.requiresConfirmation, true);
    assert.equal(result.toolSelection?.selectedToolName, target.name);
    assert.equal(catalog.find((tool) => tool.name === target.name)?.sideEffect, "WRITE");
    assert.equal(requests.length, 2);
    assert.equal(requests[0]?.seed, 42);
    assert.equal(requests[0]?.temperature, 0);
    assert.equal(requests[0]?.maxTokens, 180);
    await runAgent({ agent: "support", input: createInput, tools: catalog, progressionEvidence: [evidence],
      toolResult: { toolCallId: "read_call", toolName: availability.name, status: "SUCCEEDED", output: {} } });
    assert.equal(requests.length, 3);
    assert.equal(requests[2]?.maxTokens, 120);
    for (const request of requests) {
      const serialized = JSON.stringify(request);
      for (const forbidden of ["progressionEvidence", "scopeKey", "executionId", "expiresAt", evidence.scopeKey, evidence.executionId]) assert.ok(!serialized.includes(forbidden), forbidden);
    }
    const before = requests.length;
    selectedDecision = '{"decision":"NO_TOOL"}';
    await assert.rejects(() => selectTool({ agent: "support", input: createInput, tools: catalog, progressionEvidence: [evidence] }));
    assert.equal(requests.length, before + 1);
    selectedDecision = JSON.stringify({ decision: "USE_TOOL", tool: target.name });
    await assert.rejects(() => selectTool({ agent: "support", input: createInput, tools: catalog }));
    await assert.rejects(() => selectTool({ agent: "support", input: { ticketMessage: "Explain a concept." }, tools: catalog, progressionEvidence: [evidence] }));
    assert.equal(requests.length, before + 3);
    expireDuringCall = true;
    await assert.rejects(() => selectTool({ agent: "support", input: createInput, tools: catalog, progressionEvidence: [evidence] }));
    assert.equal(requests.length, before + 4);
    for (const forbidden of ["progressionEvidence", "scopeKey", "executionId", "expiresAt", evidence.scopeKey, evidence.executionId]) assert.ok(!JSON.stringify(logs).includes(forbidden), forbidden);
  } finally {
    llmService.chat = originalChat;
    Date.now = originalNow;
    console.error = originalError;
  }
  console.log("Tool progression checks: PASS (routing, ALL prerequisites, isolation, WRITE proposal safety)");
}
