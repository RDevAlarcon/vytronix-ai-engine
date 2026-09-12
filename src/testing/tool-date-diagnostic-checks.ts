import assert from "node:assert/strict";
import { llmService } from "@/ai/llm/llm.service";
import { runAgent } from "@/ai/agents/agent.router";
import { groundToolArguments } from "@/ai/tools/tool-argument-grounding";
import { buildDateGroundingDiagnostic, logDateGroundingDiagnostic } from "@/ai/tools/tool-date-diagnostic";
import type { ToolDefinition } from "@/ai/tools/tool-contract";

export async function runToolDateDiagnosticChecks() {
  const tool: ToolDefinition = {
    name: "booking_check_availability", description: "Check current availability.",
    inputSchema: { type: "object", properties: { date: { type: "string", format: "date" } }, required: ["date"], additionalProperties: false },
    sideEffect: "READ_ONLY", requiresConfirmation: false
  };
  const temporalContext = { currentDate: "2026-09-10", timezone: "America/Santiago" };
  const correlationId = "878c02df-e5a9-4a4b-9b20-9c364d02762b";
  const utterance = "¿Tiene Rodrigo disponible el lunes a las 17:00 para un Corte clásico?";
  const originalChat = llmService.chat;
  const originalError = console.error;
  const logs: string[] = [];
  let args: Record<string, unknown> = {};
  let calls = 0;
  console.error = (...values: unknown[]) => { logs.push(values.join(" ")); };
  llmService.chat = async (request) => {
    calls++;
    const stage = request.diagnostic?.stage;
    assert.ok(stage === "tool_selector" || stage === "tool_argument_extractor", "no repair/followup call");
    return { content: JSON.stringify(stage === "tool_selector" ? { decision: "USE_TOOL", tool: tool.name } : args), model: "offline", provider: "llamacpp", raw: {} };
  };
  try {
    for (const test of [
      { args: {}, message: utterance, presence: "ABSENT", category: "NOT_APPLICABLE", relative: "WEEKDAY", ready: true },
      { args: { date: "lunes" }, message: utterance, presence: "STRING", category: "SUPPORTED_RELATIVE", relative: "WEEKDAY", ready: true },
      { args: { date: "2026-09-14" }, message: utterance, presence: "STRING", category: "ISO_DATE", relative: "WEEKDAY", ready: true },
      { args: {}, message: "Consulta disponibilidad sin especificar fecha.", presence: "ABSENT", category: "NOT_APPLICABLE", relative: "NONE", ready: false },
      { args: { date: "next monday" }, message: "Consulta disponibilidad next monday.", presence: "STRING", category: "OTHER_STRING", relative: "UNSUPPORTED", ready: false }
    ]) {
      args = test.args;
      calls = 0;
      logs.length = 0;
      const result = await runAgent({ agent: "support", input: { ticketMessage: test.message, knownContext: `VISITOR: ${utterance}` },
        tools: [tool], temporalContext, diagnosticCorrelationId: correlationId });
      assert.equal(calls, 2);
      const events = logs.map((line) => JSON.parse(line)).filter((event) => event.event === "tool_date_grounding_diagnostic");
      assert.equal(events.length, 1);
      const event = events[0]!;
      assert.equal(event.dateGroundingDiagnosticVersion, 1);
      assert.equal(event.correlationId, correlationId);
      assert.equal(event.dateFieldDeclared, true);
      assert.equal(event.dateFieldRequired, true);
      assert.equal(event.extractorDatePresence, test.presence);
      assert.equal(event.extractorDateStringCategory, test.category);
      assert.equal(event.currentTurnRelativeDateCategory, test.relative);
      assert.equal(event.knownContextUsedForTemporalGrounding, false);
      assert.equal(event.dateResolverResultCategory, test.ready ? "RESOLVED_ISO" : "UNRESOLVED");
      assert.equal(event.groundingDateStatus, test.ready ? "GROUNDED" : "MISSING_AND_UNGROUNDED");
      assert.equal(event.finalDateSchemaStatus, test.ready ? "PASS" : "NOT_RUN");
      assert.equal(event.routerDecision, test.ready ? "CALL_TOOL" : "CLARIFICATION");
      assert.equal(result.orchestration?.toolCall.arguments.date, test.ready ? "2026-09-14" : undefined);
      for (const key of ["temporalContextPresent", "timezonePresent", "timezoneValid", "currentDatePresent", "currentDateValid"]) assert.equal(event[key], true);
      for (const secret of [utterance, "Rodrigo", "Corte", "lunes", "2026-09-10", "2026-09-14", "America/Santiago", "VISITOR:"]) assert.ok(!JSON.stringify(event).includes(secret));
    }
    const input = { ticketMessage: utterance, knownContext: "HISTORY_SECRET", phone: "+56912345678", email: "private@example.test", progressionEvidence: [{ scopeKey: "SCOPE_SECRET" }] };
    const base = { correlationId, tool, input, temporalContext, extractedArguments: { date: "RAW_ARGUMENT_SECRET" },
      grounding: groundToolArguments(input, tool, { date: "RAW_ARGUMENT_SECRET" }, temporalContext), finalValidationRan: true, routerDecision: "CALL_TOOL" as const };
    const event = buildDateGroundingDiagnostic(base);
    assert.deepEqual(event, buildDateGroundingDiagnostic({ ...base, input: { ticketMessage: utterance, knownContext: utterance } }));
    assert.deepEqual(Object.keys(event).sort(), ["event", "dateGroundingDiagnosticVersion", "correlationId", "toolName", "dateFieldDeclared", "dateFieldRequired",
      "extractorDatePresence", "extractorDateStringCategory", "temporalContextPresent", "timezonePresent", "timezoneValid", "currentDatePresent", "currentDateValid",
      "currentTurnWeekdayMatchCount", "currentTurnRelativeDateCategory", "knownContextUsedForTemporalGrounding", "dateResolverResultCategory", "groundingDateStatus", "finalDateSchemaStatus", "routerDecision"].sort());
    logs.length = 0;
    logDateGroundingDiagnostic(base);
    for (const secret of ["RAW_ARGUMENT_SECRET", "HISTORY_SECRET", "+56912345678", "private@example.test", "SCOPE_SECRET", "progressionEvidence", "2026-09-14"]) assert.ok(!logs.join().includes(secret));
    const absent = buildDateGroundingDiagnostic({ ...base, temporalContext: undefined });
    for (const key of ["temporalContextPresent", "timezonePresent", "timezoneValid", "currentDatePresent", "currentDateValid"] as const) assert.equal(absent[key], false);
    const invalid = buildDateGroundingDiagnostic({ ...base, temporalContext: { currentDate: "bad", timezone: "bad/zone" } });
    assert.equal(invalid.temporalContextPresent, true);
    assert.equal(invalid.timezonePresent, true);
    assert.equal(invalid.timezoneValid, false);
    assert.equal(invalid.currentDatePresent, true);
    assert.equal(invalid.currentDateValid, false);
    await assert.rejects(() => runAgent({ agent: "support", input, tools: [tool], temporalContext: { currentDate: "bad" } }));
    assert.equal(buildDateGroundingDiagnostic({ ...base, input: { ticketMessage: "lunes martes lunes" } }).currentTurnWeekdayMatchCount, 2);
    assert.equal(buildDateGroundingDiagnostic({ ...base, input: { ticketMessage: "lunes martes" } }).currentTurnRelativeDateCategory, "AMBIGUOUS");
    for (const [text, category] of [["hoy", "TODAY"], ["mañana", "TOMORROW"], ["pasado mañana", "DAY_AFTER_TOMORROW"], ["2026-09-14", "ISO_DATE"]]) {
      assert.equal(buildDateGroundingDiagnostic({ ...base, input: { ticketMessage: text } }).currentTurnRelativeDateCategory, category);
    }
    for (const [value, presence] of [["", "EMPTY"], [null, "OTHER"]]) assert.equal(buildDateGroundingDiagnostic({ ...base, extractedArguments: { date: value } }).extractorDatePresence, presence);
    const failedExtraction = buildDateGroundingDiagnostic({ ...base, extractedArguments: undefined, grounding: undefined, finalValidationRan: false, routerDecision: "OTHER" });
    assert.equal(failedExtraction.extractorDatePresence, undefined);
    assert.equal(failedExtraction.dateResolverResultCategory, "NOT_RUN");
    const legacy = { ...tool, inputSchema: { ...tool.inputSchema, properties: { date: { type: "string" as const } } } };
    const legacyEvent = buildDateGroundingDiagnostic({ ...base, tool: legacy, grounding: groundToolArguments(input, legacy, { date: "2026-09-14" }, temporalContext), finalValidationRan: false });
    assert.equal(legacyEvent.dateFieldDeclared, true);
    assert.equal(legacyEvent.dateResolverResultCategory, "NOT_RUN");
    assert.equal(legacyEvent.groundingDateStatus, "UNGROUNDED");
    console.error = () => { throw new Error("logging unavailable"); };
    assert.doesNotThrow(() => logDateGroundingDiagnostic(base));
  } finally {
    llmService.chat = originalChat;
    console.error = originalError;
  }
  console.log("Date pipeline diagnostic checks: PASS (offline router, categories, privacy, invariance)");
}
