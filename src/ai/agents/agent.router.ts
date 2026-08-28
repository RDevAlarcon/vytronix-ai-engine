import { z } from "zod";
import { randomUUID } from "node:crypto";
import { leadAgent } from "@/ai/agents/lead.agent";
import { landingAgent } from "@/ai/agents/landing.agent";
import { proposalAgent } from "@/ai/agents/proposal.agent";
import { supportAgent } from "@/ai/agents/support.agent";
import type {
  AgentDefinition,
  AgentExecutionMode,
  AgentName,
  AgentRunRequest,
  AgentRunResult
} from "@/ai/agents/agent.types";
import { classifyAgentScope } from "@/ai/agents/intent.classifier";
import { llmService } from "@/ai/llm/llm.service";
import { AppError } from "@/lib/errors";
import { executeStructuredOutput } from "@/ai/structured-output/structured-output";
import { buildRetrievedKnowledgeMessage, ragContextSchema } from "@/ai/rag/rag-context";
import { buildSelectionDirective, selectTool } from "@/ai/tools/tool-selector";
import { resolveToolRoutingStrategy } from "@/ai/tools/tool-routing";
import { extractToolArguments } from "@/ai/tools/tool-argument-extractor";
import { groundToolArguments } from "@/ai/tools/tool-argument-grounding";
import {
  buildToolAwareSchema,
  buildRespondOnlySchema,
  buildCallToolOnlySchema,
  buildCallToolResponseSchema,
  assembleToolCall,
  assembleRespond,
  buildToolContext,
  buildToolResultMessage,
  buildToolOrchestrationInstructions,
  buildToolAwareSystemPrompt,
  toolResultSchema,
  toolsSchema,
  validateToolCall,
  type ToolAwareOutput
} from "@/ai/tools/tool-contract";

const runRequestSchema = z.object({
  agent: z.enum(["lead", "landing", "proposal", "support"]),
  input: z.unknown(),
  mode: z.enum(["standard", "fast"]).default("standard"),
  ragContext: ragContextSchema.optional(),
  tools: toolsSchema.optional(),
  toolResult: toolResultSchema.optional()
});

const agentRegistry = {
  lead: leadAgent,
  landing: landingAgent,
  proposal: proposalAgent,
  support: supportAgent
} as const;

export const getAgentDefinition = (name: AgentName) => agentRegistry[name];
const FAST_ENABLED_AGENTS = new Set<AgentName>(["lead"]);

const resolveMaxTokens = (
  mode: AgentExecutionMode,
  options: AgentDefinition<unknown, unknown>["llmOptions"]
): number | undefined => {
  if (!options) {
    return undefined;
  }

  if (mode === "fast") {
    return options.fastMaxTokens ?? options.maxTokens;
  }

  return options.maxTokens;
};

const resolveTemperature = (
  mode: AgentExecutionMode,
  options: AgentDefinition<unknown, unknown>["llmOptions"]
): number | undefined => {
  if (mode === "fast") {
    return 0;
  }

  return options?.temperature;
};

const buildOutOfScopeOutput = (agent: AgentName, reason: string): unknown => {
  const safeReply =
    "Este agente solo atiende su dominio asignado. Reformula la consulta dentro de ese alcance.";

  if (agent === "lead") {
    return {
      summary: "Consulta fuera del alcance de calificacion de leads.",
      detected_service: "unknown",
      lead_temperature: "cold",
      missing_information: ["Consulta orientada a leads"],
      suggested_next_action: "Reformular consulta dentro del dominio lead.",
      reply_to_client: safeReply,
      is_in_scope: false,
      out_of_scope_reason: reason,
      safe_reply: safeReply
    };
  }

  if (agent === "landing") {
    return {
      project_summary: "Consulta fuera del alcance de briefing de landing.",
      recommended_template: "not_applicable",
      primary_cta: "not_applicable",
      secondary_cta: "not_applicable",
      suggested_sections: ["N/A"],
      missing_information: ["Requerimiento de landing page"],
      brief_markdown: "Consulta fuera de alcance para Landing Agent.",
      is_in_scope: false,
      out_of_scope_reason: reason,
      safe_reply: safeReply
    };
  }

  if (agent === "proposal") {
    return {
      proposal_title: "Consulta fuera del alcance de propuesta comercial",
      executive_summary: "Este agente solo redacta propuestas comerciales.",
      scope: ["N/A"],
      deliverables: ["N/A"],
      assumptions: ["Consulta fuera de dominio"],
      next_steps: ["Reformular consulta para propuesta comercial"],
      is_in_scope: false,
      out_of_scope_reason: reason,
      safe_reply: safeReply
    };
  }

  return {
    category: "other",
    priority: "low",
    summary: "Consulta fuera del alcance de soporte inicial.",
    suggested_reply: safeReply,
    escalate_to_human: false,
    is_in_scope: false,
    out_of_scope_reason: reason,
    safe_reply: safeReply
  };
};

export const runAgent = async (request: AgentRunRequest): Promise<AgentRunResult> => {
  const parsedRequest = runRequestSchema.parse(request);
  const agentDefinition = getAgentDefinition(parsedRequest.agent) as AgentDefinition<unknown, unknown>;
  const effectiveMode: AgentExecutionMode =
    parsedRequest.mode === "fast" && FAST_ENABLED_AGENTS.has(parsedRequest.agent) ? "fast" : "standard";

  const parsedInput = agentDefinition.inputSchema.safeParse(parsedRequest.input);
  if (!parsedInput.success) {
    throw new AppError("Invalid agent input", {
      code: "AGENT_INPUT_INVALID",
      status: 400,
      details: parsedInput.error.flatten()
    });
  }

  const scope = classifyAgentScope(parsedRequest.agent, parsedInput.data);
  if (!scope.inScope) {
    const guardedOutput = agentDefinition.outputSchema.parse(
      buildOutOfScopeOutput(parsedRequest.agent, `out_of_scope: ${scope.reason}`)
    );
    return {
      agent: parsedRequest.agent,
      mode: effectiveMode,
      parsedOutput: guardedOutput,
      rawOutput: JSON.stringify(guardedOutput),
      model: "policy-guardrail",
      provider: "internal",
      attemptCount: 0,
      durationMs: 1
    };
  }

  const startedAt = Date.now();
  const baseMessages =
    effectiveMode === "fast" && agentDefinition.buildFastMessages
      ? agentDefinition.buildFastMessages(parsedInput.data)
      : agentDefinition.buildMessages(parsedInput.data);
  const availableTools = parsedRequest.tools ?? [];
  if (parsedRequest.toolResult && availableTools.length > 0 && !availableTools.some((tool) => tool.name === parsedRequest.toolResult?.toolName)) {
    throw new AppError("Tool result does not match an available tool", { code: "TOOL_RESULT_INVALID", status: 400 });
  }
  const routingStrategy = resolveToolRoutingStrategy({ tools: availableTools, ragContext: parsedRequest.ragContext, toolResult: parsedRequest.toolResult, supportsNativeToolCalling: llmService.supportsNativeToolCalling });
  const separatedToolDecision = availableTools.length > 0 && !parsedRequest.toolResult;
  const nativeToolCalling = routingStrategy === "NATIVE" && !separatedToolDecision;
  const toolSelection = (routingStrategy === "SELECTOR" || separatedToolDecision) ? await selectTool({ agent: parsedRequest.agent, input: parsedInput.data, tools: availableTools, toolResult: parsedRequest.toolResult }) : null;
  const argumentExtraction = toolSelection?.decision.decision === "USE_TOOL" && toolSelection.selectedTool
    ? await extractToolArguments({ input: parsedInput.data, tool: toolSelection.selectedTool })
    : undefined;
  const groundedArguments = argumentExtraction?.status === "SUCCESS" && toolSelection?.selectedTool
    ? groundToolArguments(parsedInput.data, toolSelection.selectedTool, argumentExtraction.arguments ?? {})
    : undefined;
  if (groundedArguments?.status === "READY" && toolSelection?.selectedTool && argumentExtraction) {
    const totalDurationMs = Date.now() - startedAt;
    const assembledCall = assembleToolCall(toolSelection.selectedTool, groundedArguments.arguments);
    return {
      agent: parsedRequest.agent,
      mode: effectiveMode,
      parsedOutput: null,
      rawOutput: "",
      model: process.env.OLLAMA_MODEL ?? process.env.LM_STUDIO_MODEL ?? "configured-model",
      provider: process.env.LLM_PROVIDER ?? "configured-provider",
      attemptCount: argumentExtraction.attempts,
      repairAttempt: argumentExtraction.repairAttempt,
      durationMs: totalDurationMs,
      totalDurationMs,
      agentDurationMs: 0,
      toolSelection: { selectorUsed: true, selectorSkipped: false, selectorDecision: "USE_TOOL", selectedToolName: toolSelection.selectedTool.name, selectorAttempts: toolSelection.attempts, selectorRepair: toolSelection.repairAttempt, selectorValid: true, selectorDurationMs: toolSelection.durationMs, diagnostics: toolSelection.diagnostics },
      toolDiagnostics: { finalAction: "CALL_TOOL", enforcementPassed: true, argumentsPresent: true, argumentsValid: true, argumentIssueCount: 0 },
      structuredOutputRequested: true,
      structuredOutputProviderSupported: llmService.supportsStructuredOutput,
      structuredOutputMode: llmService.supportsStructuredOutput ? "NATIVE_SCHEMA" : "TEXT_FALLBACK",
      toolRoutingStrategy: routingStrategy,
      nativePathUsed: false,
      selectorPathUsed: true,
      structuredOutputUsed: llmService.supportsStructuredOutput,
      orchestration: { ...assembledCall, toolCall: { ...assembledCall.toolCall, toolCallId: randomUUID() } }
    };
  }
  const enforcedToolSelection = groundedArguments && groundedArguments.status !== "READY" ? null : toolSelection;
  const domainOnlyResponse = !nativeToolCalling && (
    Boolean(parsedRequest.toolResult) ||
    enforcedToolSelection?.decision.decision === "NO_TOOL" ||
    Boolean(groundedArguments && groundedArguments.status !== "READY")
  );
  const selectionDirective = domainOnlyResponse
    ? "ACTION IS RESPOND. Return only the complete domain output object matching the provided agent schema. Do not return an action or orchestration envelope."
    : buildSelectionDirective(enforcedToolSelection, parsedRequest.toolResult);
  const selectorSkipped = nativeToolCalling || availableTools.length === 0 || Boolean(parsedRequest.toolResult);
  const selectorDiagnostics = {
    selectorUsed: !selectorSkipped,
    selectorSkipped,
    selectorDecision: toolSelection?.decision.decision,
    selectedToolName: toolSelection?.selectedTool?.name,
    selectorAttempts: toolSelection?.attempts ?? 0,
    selectorRepair: toolSelection?.repairAttempt ?? false,
    selectorValid: toolSelection?.valid ?? selectorSkipped,
    selectorDurationMs: toolSelection?.durationMs ?? 0,
    diagnostics: toolSelection?.diagnostics
  };
  const usesToolContract = availableTools.length > 0 || Boolean(parsedRequest.toolResult);
  const messagesWithKnowledge = [
    ...(usesToolContract
      ? baseMessages.map((message) => message.role === "system"
        ? { ...message, content: buildToolAwareSystemPrompt(message.content, availableTools, parsedRequest.toolResult, z.toJSONSchema(agentDefinition.outputSchema), selectionDirective) }
        : message)
      : baseMessages),
    ...buildRetrievedKnowledgeMessage(parsedRequest.ragContext),
    ...buildToolContext(availableTools),
    ...(parsedRequest.toolResult ? buildToolResultMessage(parsedRequest.toolResult) : [])
  ];
  const outputSchema = domainOnlyResponse
    ? agentDefinition.outputSchema
    : usesToolContract
    ? (nativeToolCalling
      ? buildToolAwareSchema(agentDefinition.outputSchema)
      : enforcedToolSelection?.decision.decision === "USE_TOOL" && enforcedToolSelection.selectedTool
      ? buildCallToolOnlySchema(enforcedToolSelection.selectedTool)
      : buildRespondOnlySchema(agentDefinition.outputSchema))
    : agentDefinition.outputSchema;
  let validatedToolCall: ReturnType<typeof validateToolCall> | undefined;
  const maxTokens = resolveMaxTokens(effectiveMode, agentDefinition.llmOptions);
  const temperature = resolveTemperature(effectiveMode, agentDefinition.llmOptions);
  const agentStartedAt = Date.now();
  const execution = await executeStructuredOutput({
    baseMessages: messagesWithKnowledge,
    schema: outputSchema,
    schemaDescription: z.toJSONSchema(outputSchema),
    generate: async (messages) => {
      const response = await llmService.chat({
        messages,
        temperature,
        maxTokens,
        nativeTools: nativeToolCalling ? availableTools.map((tool) => ({ name: tool.name, description: tool.description, parameters: tool.inputSchema })) : undefined,
        responseSchema: llmService.supportsStructuredOutput && !nativeToolCalling && usesToolContract
        ? (enforcedToolSelection?.decision.decision === "USE_TOOL" && enforcedToolSelection.selectedTool
          ? buildCallToolResponseSchema(enforcedToolSelection.selectedTool)
          : z.toJSONSchema(outputSchema))
        : undefined
      });
      if (nativeToolCalling && !response.toolCalls?.length && !response.content.trim()) {
        const fallbackResponse = await llmService.chat({
          // The native request decides only whether a tool was requested. Once
          // it decides NO_TOOL, domain generation must use the legacy domain
          // prompt and must not inherit orchestration/tool instructions.
          messages: [
            ...baseMessages,
            ...buildRetrievedKnowledgeMessage(parsedRequest.ragContext)
          ],
          temperature,
          maxTokens,
          responseSchema: z.toJSONSchema(agentDefinition.outputSchema)
        });
        const fallbackJson = JSON.parse(fallbackResponse.content);
        return { ...fallbackResponse, content: JSON.stringify({ action: "RESPOND", result: fallbackJson }) };
      }
      if (nativeToolCalling && response.toolCalls?.length) {
        if (response.toolCalls.length !== 1) throw new AppError("Multiple native tool calls are not supported", { code: "TOOL_CALL_INVALID", status: 422 });
        const call = response.toolCalls[0];
        if (!call) throw new AppError("Native tool call is missing", { code: "TOOL_CALL_INVALID", status: 422 });
        const tool = availableTools.find((candidate) => candidate.name === call.name);
        if (!tool) throw new AppError("Native tool is not available", { code: "TOOL_NOT_AVAILABLE", status: 422 });
        const grounded = groundToolArguments(parsedInput.data, tool, call.arguments);
        if (grounded.status !== "READY") {
          return llmService.chat({
            messages: [...messages, { role: "system", content: `The selected tool cannot be requested yet. Ask the user only for these missing fields: ${grounded.missing.join(", ")}. Do not claim execution.` }],
            temperature,
            maxTokens,
            responseSchema: z.toJSONSchema(buildRespondOnlySchema(agentDefinition.outputSchema))
          });
        }
        return { ...response, content: JSON.stringify({ action: "CALL_TOOL", toolCall: { name: call.name, arguments: grounded.arguments, requiresConfirmation: tool.requiresConfirmation } }) };
      }
      return response;
    },
    captureRawOutput: process.env.BENCHMARK_CAPTURE_RAW_OUTPUT === "true" || process.env.TOOL_DIAGNOSTICS_CAPTURE_RAW_OUTPUT === "true",
    diagnosticContext: parsedRequest.toolResult ? {
      toolResultPresent: true,
      toolResultStatus: parsedRequest.toolResult.status,
      expectedBehavior: "RESPOND"
    } : undefined,
    repairInstructions: usesToolContract
      ? buildToolOrchestrationInstructions(availableTools, parsedRequest.toolResult, z.toJSONSchema(agentDefinition.outputSchema), selectionDirective)
      : undefined,
    inspectParsed: (parsed) => {
      const value = parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
      const toolCall = value.toolCall && typeof value.toolCall === "object" ? value.toolCall as Record<string, unknown> : undefined;
      return {
        orchestrationType: value.action === "RESPOND" || value.action === "CALL_TOOL" ? value.action : "UNKNOWN",
        toolName: typeof toolCall?.name === "string" ? toolCall.name : undefined,
        argumentsPresent: Boolean(toolCall && Object.prototype.hasOwnProperty.call(toolCall, "arguments"))
      };
    },
    validate: (value) => {
      if (domainOnlyResponse) return;
      if (!usesToolContract) return;
      const output = value as ToolAwareOutput<unknown>;
      if (output.action === "CALL_TOOL") {
        if (!availableTools.length) {
          throw new AppError("No tools are available", { code: "TOOL_NOT_AVAILABLE", status: 422 });
        }
        validatedToolCall = validateToolCall(output.toolCall, availableTools);
      }
      if (!parsedRequest.toolResult && enforcedToolSelection?.decision.decision === "NO_TOOL" && output.action === "CALL_TOOL") {
        throw new AppError("Agent contradicted NO_TOOL selection", { code: "TOOL_CALL_INVALID", status: 422 });
      }
      if (!parsedRequest.toolResult && enforcedToolSelection?.decision.decision === "USE_TOOL" && output.action !== "CALL_TOOL") {
        throw new AppError("Agent contradicted USE_TOOL selection", { code: "TOOL_CALL_INVALID", status: 422 });
      }
      if (!parsedRequest.toolResult && enforcedToolSelection?.decision.decision === "USE_TOOL" && output.action === "CALL_TOOL" && output.toolCall.name !== enforcedToolSelection.decision.tool) {
        throw new AppError("Agent selected a different tool", { code: "TOOL_CALL_INVALID", status: 422 });
      }
      if (parsedRequest.toolResult && output.action === "CALL_TOOL") {
        throw new AppError("A tool result must produce a final response", { code: "TOOL_CALL_INVALID", status: 422 });
      }
    }
  });
  const output = execution.parsedOutput as ToolAwareOutput<unknown>;
  const assembledResponse = domainOnlyResponse ? assembleRespond(execution.parsedOutput) : output;
  const orchestration = assembledResponse.action === "CALL_TOOL" && validatedToolCall
    ? { action: "CALL_TOOL" as const, toolCall: validatedToolCall }
    : undefined;
  if (parsedRequest.toolResult && assembledResponse.action !== "RESPOND") {
    throw new AppError("Tool result did not produce a final response", { code: "TOOL_RESULT_INVALID", status: 502 });
  }
  const totalDurationMs = Date.now() - startedAt;
  return {
        agent: parsedRequest.agent,
        mode: effectiveMode,
        parsedOutput: domainOnlyResponse ? execution.parsedOutput : usesToolContract ? (output.action === "CALL_TOOL" ? null : output.result) : execution.parsedOutput,
        rawOutput: execution.rawOutput,
        model: execution.response.model,
        provider: execution.response.provider,
        usage: execution.response.usage,
        attemptCount: execution.attemptCount,
        repairAttempt: execution.repairAttempt,
        diagnostics: execution.diagnostics,
        durationMs: totalDurationMs,
        totalDurationMs,
        agentDurationMs: Date.now() - agentStartedAt,
        toolSelection: selectorDiagnostics,
        toolDiagnostics: {
          finalAction: assembledResponse.action,
          enforcementPassed: true,
          argumentsPresent: assembledResponse.action === "CALL_TOOL",
          argumentsValid: assembledResponse.action === "CALL_TOOL",
          argumentIssueCount: 0
        },
        structuredOutputRequested: usesToolContract,
        structuredOutputProviderSupported: llmService.supportsStructuredOutput,
        structuredOutputMode: llmService.supportsStructuredOutput ? "NATIVE_SCHEMA" : "TEXT_FALLBACK",
        toolRoutingStrategy: routingStrategy,
        nativePathUsed: routingStrategy === "NATIVE",
        selectorPathUsed: Boolean(toolSelection),
        structuredOutputUsed: llmService.supportsStructuredOutput,
        ...(orchestration ? { orchestration } : {})
      };
};
