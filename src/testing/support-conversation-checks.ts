import assert from "node:assert/strict";
import { z } from "zod";
import { supportInputSchema, supportOutputSchema } from "@/ai/agents/agent.schemas";
import { runAgent } from "@/ai/agents/agent.router";
import {
  buildSupportFastUserPrompt,
  buildSupportUserPrompt,
  supportFastSystemPrompt,
  supportSystemPrompt,
} from "@/ai/prompts/support.prompt";
import type { ToolDefinition } from "@/ai/tools/tool-contract";

const socialOutput = {
  category: "general" as const,
  priority: "low" as const,
  summary: "The user expressed thanks.",
  suggested_reply: "You're welcome! Let me know if you need anything else.",
  escalate_to_human: false,
  is_in_scope: true,
  out_of_scope_reason: null,
  safe_reply: "You're welcome! Let me know if you need anything else.",
};

const availableReadTool: ToolDefinition = {
  name: "lookup_current_record",
  description: "Looks up a current external record when explicitly requested.",
  inputSchema: {
    type: "object",
    properties: { reference: { type: "string" } },
    required: ["reference"],
    additionalProperties: false,
  },
  sideEffect: "READ_ONLY",
  requiresConfirmation: false,
};

const providerResponse = (content: string): Response => new Response(JSON.stringify({
  model: "test-model",
  choices: [{ message: { content }, finish_reason: "stop" }],
}), { status: 200, headers: { "content-type": "application/json" } });

export const runSupportConversationChecks = async (): Promise<void> => {
  for (const ticketMessage of ["hi", "thanks", "gracias"]) {
    assert.equal(supportInputSchema.safeParse({ ticketMessage }).success, true);
  }
  for (const ticketMessage of ["", "   ", "\n\t"]) {
    assert.equal(supportInputSchema.safeParse({ ticketMessage }).success, false);
  }

  const outputJsonSchema = z.toJSONSchema(supportOutputSchema) as {
    properties?: Record<string, unknown>;
    required?: string[];
  };
  assert.deepEqual(Object.keys(outputJsonSchema.properties ?? {}), [
    "category",
    "priority",
    "summary",
    "suggested_reply",
    "escalate_to_human",
    "is_in_scope",
    "out_of_scope_reason",
    "safe_reply",
  ]);
  assert.deepEqual(outputJsonSchema.required, [
    "category",
    "priority",
    "summary",
    "suggested_reply",
    "escalate_to_human",
    "is_in_scope",
    "out_of_scope_reason",
    "safe_reply",
  ]);
  assert.deepEqual(supportOutputSchema.parse(socialOutput), socialOutput);

  const combinedPrompts = [supportSystemPrompt, supportFastSystemPrompt].join("\n");
  assert.doesNotMatch(combinedPrompts, /support triage|classification and initial support|clasificacion y respuesta inicial de soporte/i);
  assert.match(supportSystemPrompt, /Greetings, thanks, acknowledgements, and brief social conversation are in scope/i);
  assert.match(supportFastSystemPrompt, /Social conversation is in scope/i);
  assert.match(combinedPrompts, /Never invent prices, availability, reservations/i);
  assert.match(combinedPrompts, /knownContext[\s\S]*do not prove current state|knownContext[\s\S]*not proof of current business state/i);
  assert.match(combinedPrompts, /jailbreak|change your role|override these rules/i);
  assert.match(combinedPrompts, /ONLY (?:a )?valid JSON/i);
  assert.doesNotMatch(buildSupportUserPrompt({ ticketMessage: "thanks" }), /Classify and draft a support response from this ticket/i);
  assert.doesNotMatch(buildSupportFastUserPrompt({ ticketMessage: "thanks" }), /FAST support classification/i);

  const requests: Array<Record<string, unknown>> = [];
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (_input, init) => {
      requests.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return providerResponse(requests.length === 1
        ? '{"decision":"NO_TOOL"}'
        : JSON.stringify(socialOutput));
    };

    const result = await runAgent({
      agent: "support",
      input: { ticketMessage: "That was helpful." },
      tools: [availableReadTool],
      responseLanguage: "en",
    });

    assert.equal(requests.length, 2, "NO_TOOL must continue through normal_response without a runtime call in this offline stub");
    assert.equal(result.toolSelection?.selectorDecision, "NO_TOOL");
    assert.equal(result.orchestration, undefined);
    assert.deepEqual(result.parsedOutput, socialOutput);
    const normalResponseMessages = JSON.stringify(requests[1]?.messages ?? []);
    assert.match(normalResponseMessages, /Vytronix General Conversation Agent/);
    assert.doesNotMatch(normalResponseMessages, /support triage|clasificacion y respuesta inicial de soporte/i);
  } finally {
    globalThis.fetch = originalFetch;
  }

  console.log("Support conversation checks: PASS (short social input, prompt contract, NO_TOOL normal response)");
};
