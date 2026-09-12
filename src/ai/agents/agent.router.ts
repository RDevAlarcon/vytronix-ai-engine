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
import { buildSelectionDirective, resolveCurrentMutationIntent, selectTool } from "@/ai/tools/tool-selector";
import { resolveToolRoutingStrategy } from "@/ai/tools/tool-routing";
import { extractToolArguments } from "@/ai/tools/tool-argument-extractor";
import { groundToolArguments } from "@/ai/tools/tool-argument-grounding";
import { currentTurnText } from "@/ai/tools/tool-argument-grounding";
import { refersToSelection, selectedContinuation, continuationArgumentTool, safeContinuationTurn } from "@/ai/tools/tool-continuation";
import { logDateGroundingDiagnostic } from "@/ai/tools/tool-date-diagnostic";
import { resolveCurrentDate, temporalContextSchema } from "@/ai/tools/tool-temporal-context";
import { groundAuthoritativeToolResult, informationalResponseAuthority, responseAuthorityFromToolResult, safeToolResultFallback } from "@/ai/tools/tool-result-grounding";
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
  buildToolResultFollowUpSystemPrompt,
  progressionEvidenceSchema,
  toolResultSchema,
  toolsSchema,
  validateToolCall,
  type ToolAwareOutput,
  type ToolDefinition
} from "@/ai/tools/tool-contract";

const runRequestSchema = z.object({
  agent: z.enum(["lead", "landing", "proposal", "support"]),
  input: z.unknown(),
  mode: z.enum(["standard", "fast"]).default("standard"),
  ragContext: ragContextSchema.optional(),
  tools: toolsSchema.optional(),
  toolResult: toolResultSchema.optional(),
  progressionEvidence: progressionEvidenceSchema.optional(),
  temporalContext: temporalContextSchema.optional(),
  diagnosticCorrelationId: z.string().uuid().optional()
}).strict();

const agentRegistry = {
  lead: leadAgent,
  landing: landingAgent,
  proposal: proposalAgent,
  support: supportAgent
} as const;

export const getAgentDefinition = (name: AgentName) => agentRegistry[name];
const FAST_ENABLED_AGENTS = new Set<AgentName>(["lead"]);
export const TOOL_RESULT_FOLLOW_UP_MAX_TOKENS = 120;
export const TOOL_RESULT_FOLLOW_UP_MAX_REPLY_CHARS = 200;

const isPureGreeting = (value: unknown): boolean => {
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLocaleLowerCase().replace(/[!?.,;:]+$/g, "").replace(/\s+/g, " ");
  return ["hola", "holi", "buenas", "buenos días", "buenas tardes", "buenas noches", "hey", "hello", "hi"].includes(normalized);
};

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

export const resolveToolResultFollowUpMaxTokens = (configuredMaxTokens: number | undefined): number =>
  configuredMaxTokens === undefined
    ? TOOL_RESULT_FOLLOW_UP_MAX_TOKENS
    : Math.min(configuredMaxTokens, TOOL_RESULT_FOLLOW_UP_MAX_TOKENS);

export const supportToolResultFollowUpSchema = z.object({
  suggested_reply: z.string().min(1).max(TOOL_RESULT_FOLLOW_UP_MAX_REPLY_CHARS)
}).strict();

type SupportToolResultFollowUpOutput = z.infer<typeof supportToolResultFollowUpSchema>;

export type SupportToolResultFollowUpShape = {
  responseCharCount: number;
  trimmedCharCount: number;
  isEmpty: boolean;
  startsWithOpenBrace: boolean;
  endsWithCloseBrace: boolean;
  containsOpenBrace: boolean;
  containsCloseBrace: boolean;
  firstOpenBraceIndex: number;
  lastCloseBraceIndex: number;
  containsCodeFence: boolean;
  containsNewline: boolean;
  containsControlChars: boolean;
  plainTextFallbackEligible: boolean;
  plainTextFallbackRejectedReason: "NONE" | "EMPTY" | "TOO_LONG" | "CONTAINS_BRACE" | "CONTAINS_CODE_FENCE" | "CONTAINS_UNSAFE_CONTROL" | "JSON_CANDIDATE_FOUND";
  jsonExtractionResult: "STRICT_JSON_CANDIDATE" | "EMBEDDED_JSON_CANDIDATE" | "PARTIAL_JSON_CANDIDATE" | "NO_JSON_CANDIDATE";
  jsonParseResult: "PASS" | "FAIL" | "NOT_ATTEMPTED";
  schemaValidationResult: "PASS" | "FAIL" | "NOT_ATTEMPTED";
  finalFailureCode: "LLM_JSON_NOT_FOUND" | "LLM_INVALID_JSON" | "AGENT_OUTPUT_INVALID" | null;
};

export const inspectSupportToolResultFollowUpShape = (content: string): SupportToolResultFollowUpShape => {
  const text = content.trim();
  const firstOpenBraceIndex = text.indexOf("{");
  const lastCloseBraceIndex = text.lastIndexOf("}");
  const containsOpenBrace = firstOpenBraceIndex >= 0;
  const containsCloseBrace = lastCloseBraceIndex >= 0;
  const completeCandidate = containsOpenBrace && containsCloseBrace && lastCloseBraceIndex > firstOpenBraceIndex;
  const strictCandidate = text.startsWith("{") && text.endsWith("}");
  const containsCodeFence = /```/.test(text);
  const containsControlChars = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(text);
  const jsonExtractionResult = strictCandidate
    ? "STRICT_JSON_CANDIDATE" as const
    : completeCandidate
      ? "EMBEDDED_JSON_CANDIDATE" as const
      : containsOpenBrace || containsCloseBrace
        ? "PARTIAL_JSON_CANDIDATE" as const
        : "NO_JSON_CANDIDATE" as const;
  let jsonParseResult: SupportToolResultFollowUpShape["jsonParseResult"] = "NOT_ATTEMPTED";
  let schemaValidationResult: SupportToolResultFollowUpShape["schemaValidationResult"] = "NOT_ATTEMPTED";
  if (completeCandidate) {
    try {
      const parsed = JSON.parse(text.slice(firstOpenBraceIndex, lastCloseBraceIndex + 1)) as unknown;
      jsonParseResult = "PASS";
      schemaValidationResult = supportToolResultFollowUpSchema.safeParse(parsed).success ? "PASS" : "FAIL";
    } catch {
      jsonParseResult = "FAIL";
    }
  }
  const plainTextFallbackRejectedReason: SupportToolResultFollowUpShape["plainTextFallbackRejectedReason"] = !text
    ? "EMPTY"
    : text.length > TOOL_RESULT_FOLLOW_UP_MAX_REPLY_CHARS
      ? "TOO_LONG"
      : completeCandidate
        ? "JSON_CANDIDATE_FOUND"
        : containsOpenBrace || containsCloseBrace
          ? "CONTAINS_BRACE"
          : containsCodeFence
            ? "CONTAINS_CODE_FENCE"
            : containsControlChars
              ? "CONTAINS_UNSAFE_CONTROL"
              : "NONE";
  const finalFailureCode = plainTextFallbackRejectedReason === "NONE" || schemaValidationResult === "PASS"
    ? null
    : !completeCandidate
      ? "LLM_JSON_NOT_FOUND" as const
      : jsonParseResult === "FAIL"
        ? "LLM_INVALID_JSON" as const
        : "AGENT_OUTPUT_INVALID" as const;
  return {
    responseCharCount: content.length,
    trimmedCharCount: text.length,
    isEmpty: !text,
    startsWithOpenBrace: text.startsWith("{"),
    endsWithCloseBrace: text.endsWith("}"),
    containsOpenBrace,
    containsCloseBrace,
    firstOpenBraceIndex,
    lastCloseBraceIndex,
    containsCodeFence,
    containsNewline: /[\r\n]/.test(text),
    containsControlChars,
    plainTextFallbackEligible: plainTextFallbackRejectedReason === "NONE",
    plainTextFallbackRejectedReason,
    jsonExtractionResult,
    jsonParseResult,
    schemaValidationResult,
    finalFailureCode
  };
};

export const normalizeSupportToolResultFollowUpContent = (content: string): string => {
  const shape = inspectSupportToolResultFollowUpShape(content);
  if (!shape.plainTextFallbackEligible) return content;
  const text = content.trim();
  // JSON (including fenced/embedded JSON) stays on the normal strict parser path.
  // Braces or code fences without recoverable JSON are treated as malformed and
  // remain on the strict parser path, which fails closed for this one-attempt stage.
  return JSON.stringify({ suggested_reply: text });
};

export const assembleSupportToolResultOutput = (output: SupportToolResultFollowUpOutput) => supportAgent.outputSchema.parse({
  category: "general",
  priority: "low",
  summary: "Respuesta final basada en resultado de herramienta.",
  suggested_reply: output.suggested_reply,
  escalate_to_human: false,
  is_in_scope: true,
  out_of_scope_reason: null,
  safe_reply: output.suggested_reply
});

const UNIVERSAL_ARGUMENT_LABELS: Record<string, string> = {
  date: "fecha",
  time: "hora",
  email: "correo electrónico",
  phone: "teléfono",
  name: "nombre",
  address: "dirección"
};

const ARGUMENT_ARTICLES: Record<string, string> = {
  dirección: "la",
  fecha: "la",
  hora: "la"
};

export const humanizeToolArgumentName = (field: string): string => {
  const normalized = field.trim();
  const normalizedKey = normalized
    .replace(/([a-z0-9])([A-Z])/gu, "$1_$2")
    .replace(/[-\s]+/gu, "_")
    .toLocaleLowerCase("es");
  const withoutIdSuffix = normalizedKey.replace(/_?id$/u, "");
  if (UNIVERSAL_ARGUMENT_LABELS[withoutIdSuffix]) return UNIVERSAL_ARGUMENT_LABELS[withoutIdSuffix];
  return withoutIdSuffix
    .replace(/_/gu, " ")
    .replace(/([a-z0-9])([A-Z])/gu, "$1 $2")
    .trim()
    .toLocaleLowerCase("es");
};

const compactSchemaDescriptionLabel = (description: string): string | null => {
  const firstSentence = description.replace(/\s+/gu, " ").trim().split(/[.!?]/u)[0]?.trim();
  if (!firstSentence || firstSentence.length > 80) return null;
  return firstSentence;
};

export const resolveToolArgumentLabel = (tool: ToolDefinition, field: string): string => {
  const property = tool.inputSchema.properties?.[field] as { title?: unknown; description?: unknown } | undefined;
  if (typeof property?.title === "string" && property.title.trim()) return property.title.trim();
  if (typeof property?.description === "string" && property.description.trim()) {
    const label = compactSchemaDescriptionLabel(property.description);
    if (label) return label;
  }
  return humanizeToolArgumentName(field);
};

const formatMissingToolArguments = (labels: string[]): string => {
  const withArticles = labels.map((label) => `${ARGUMENT_ARTICLES[label] ?? "el"} ${label}`);
  if (withArticles.length === 0) return "el dato faltante";
  if (withArticles.length === 1) return withArticles[0] ?? "el dato faltante";
  return `${withArticles.slice(0, -1).join(", ")} y ${withArticles.at(-1)}`;
};

const assembleSupportToolClarificationOutput = (tool: ToolDefinition, fields: string[]) => {
  const uniqueFields = [...new Set(fields)].filter(Boolean);
  const labels = uniqueFields.map((field) => resolveToolArgumentLabel(tool, field));
  const requestedFields = formatMissingToolArguments(labels);
  const suggestedReply = `Para continuar necesito que me indiques ${requestedFields}.`;

  return supportAgent.outputSchema.parse({
    category: "general",
    priority: "low",
    summary: "Faltan datos para continuar con la solicitud.",
    suggested_reply: suggestedReply,
    escalate_to_human: false,
    is_in_scope: true,
    out_of_scope_reason: null,
    safe_reply: suggestedReply
  });
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

const buildAuthoritativeToolResultOutput = (agent: AgentName, userFacingSummary: string): unknown => {
  if (agent === "lead") {
    return { summary: userFacingSummary, detected_service: "unknown", lead_temperature: "cold", missing_information: [], suggested_next_action: userFacingSummary, reply_to_client: userFacingSummary, is_in_scope: true, out_of_scope_reason: null, safe_reply: userFacingSummary };
  }
  if (agent === "landing") {
    return { project_summary: userFacingSummary, recommended_template: "not_applicable", primary_cta: "not_applicable", secondary_cta: "not_applicable", suggested_sections: ["N/A"], missing_information: [], brief_markdown: userFacingSummary, is_in_scope: true, out_of_scope_reason: null, safe_reply: userFacingSummary };
  }
  if (agent === "proposal") {
    return { proposal_title: "Resultado de operacion", executive_summary: userFacingSummary, scope: ["N/A"], deliverables: ["N/A"], assumptions: [], next_steps: [userFacingSummary], is_in_scope: true, out_of_scope_reason: null, safe_reply: userFacingSummary };
  }
  return { category: "general", priority: "low", summary: userFacingSummary, suggested_reply: userFacingSummary, escalate_to_human: false, is_in_scope: true, out_of_scope_reason: null, safe_reply: userFacingSummary };
};

export const UNAUTHORIZED_MUTATION_REPLY = "La accion solicitada todavia no se realizo. Debe ejecutarse y, cuando corresponda, confirmarse antes de considerarla completada.";

export const groundModelGeneratedPublicOutput = (params: {
  agent: AgentName;
  input: unknown;
  output: unknown;
}): { output: unknown; replaced: boolean } => {
  if (!resolveCurrentMutationIntent(params.input)) return { output: params.output, replaced: false };
  return {
    output: getAgentDefinition(params.agent).outputSchema.parse(
      buildAuthoritativeToolResultOutput(params.agent, UNAUTHORIZED_MUTATION_REPLY),
    ),
    replaced: true,
  };
};

export const runAgent = async (request: AgentRunRequest): Promise<AgentRunResult> => {
  const parsedRequest = runRequestSchema.parse(request);
  const temporalContext = { currentDate: resolveCurrentDate(parsedRequest.temporalContext) };
  const agentDefinition = getAgentDefinition(parsedRequest.agent) as AgentDefinition<unknown, unknown>;
  const effectiveMode: AgentExecutionMode =
    parsedRequest.mode === "fast" && FAST_ENABLED_AGENTS.has(parsedRequest.agent) ? "fast" : "standard";

  const rawInput = parsedRequest.input as Record<string, unknown>;
  const greeting = parsedRequest.agent === "support" && !parsedRequest.ragContext && !parsedRequest.toolResult && isPureGreeting(rawInput?.ticketMessage);
  if (greeting) {
    const output = agentDefinition.outputSchema.parse({ category: "general", priority: "low", summary: "Saludo inicial.", suggested_reply: "Hola, ¿en qué puedo ayudarte?", escalate_to_human: false, is_in_scope: true, out_of_scope_reason: null, safe_reply: "Hola, ¿en qué puedo ayudarte?" });
    return { agent: parsedRequest.agent, mode: effectiveMode, parsedOutput: output, rawOutput: JSON.stringify(output), model: "deterministic-greeting", provider: "internal", attemptCount: 0, durationMs: 0, responseAuthority: informationalResponseAuthority() };
  }

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
      durationMs: 1,
      responseAuthority: informationalResponseAuthority()
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
  const authoritativeTool = parsedRequest.toolResult
    ? availableTools.find((tool) => tool.name === parsedRequest.toolResult?.toolName)
    : undefined;
  const authoritativeGrounding = parsedRequest.toolResult && authoritativeTool
    ? groundAuthoritativeToolResult(authoritativeTool, parsedRequest.toolResult)
    : null;
  if (authoritativeGrounding && authoritativeTool && parsedRequest.toolResult) {
    const parsedOutput = agentDefinition.outputSchema.parse(buildAuthoritativeToolResultOutput(parsedRequest.agent, authoritativeGrounding.userFacingSummary));
    const durationMs = Date.now() - startedAt;
    return {
      agent: parsedRequest.agent,
      mode: effectiveMode,
      parsedOutput,
      rawOutput: JSON.stringify(parsedOutput),
      model: "deterministic-tool-result",
      provider: "internal",
      attemptCount: 0,
      durationMs,
      responseAuthority: responseAuthorityFromToolResult(authoritativeTool, parsedRequest.toolResult, authoritativeGrounding),
      totalDurationMs: durationMs,
      agentDurationMs: 0,
      toolDiagnostics: { finalAction: "RESPOND", enforcementPassed: authoritativeGrounding.validationPassed, argumentsPresent: false, argumentsValid: false, argumentIssueCount: authoritativeGrounding.validationPassed ? 0 : 1 },
      structuredOutputRequested: false,
      structuredOutputProviderSupported: llmService.supportsStructuredOutput,
      structuredOutputMode: "TEXT_FALLBACK",
      toolRoutingStrategy: "TOOL_RESULT_RESPOND",
      nativePathUsed: false,
      selectorPathUsed: false,
      structuredOutputUsed: false,
    };
  }
  const routingStrategy = resolveToolRoutingStrategy({ tools: availableTools, ragContext: parsedRequest.ragContext, toolResult: parsedRequest.toolResult, supportsNativeToolCalling: llmService.supportsNativeToolCalling });
  const separatedToolDecision = availableTools.length > 0 && !parsedRequest.toolResult;
  const nativeToolCalling = routingStrategy === "NATIVE" && !separatedToolDecision;
  const toolSelection = (routingStrategy === "SELECTOR" || separatedToolDecision) ? await selectTool({ agent: parsedRequest.agent, input: parsedInput.data, tools: availableTools, toolResult: parsedRequest.toolResult, correlationId: parsedRequest.diagnosticCorrelationId, progressionEvidence: parsedRequest.progressionEvidence }) : null;
  const continuation = toolSelection?.selectedTool && refersToSelection(currentTurnText(parsedInput.data))
    ? selectedContinuation(toolSelection.selectedTool, availableTools, parsedRequest.progressionEvidence) : undefined;
  const argumentTool = toolSelection?.selectedTool && continuation ? continuationArgumentTool(toolSelection.selectedTool) : toolSelection?.selectedTool;
  const argumentInput = continuation ? { ticketMessage: currentTurnText(parsedInput.data) } : parsedInput.data;
  const argumentExtraction = toolSelection?.decision.decision === "USE_TOOL" && argumentTool
    ? await extractToolArguments({ input: argumentInput, tool: argumentTool, correlationId: parsedRequest.diagnosticCorrelationId, currentDate: temporalContext.currentDate })
    : undefined;
  const groundedArguments = argumentExtraction?.status === "SUCCESS" && toolSelection?.selectedTool
    ? groundToolArguments(argumentInput, argumentTool!, argumentExtraction.arguments ?? {}, temporalContext)
    : undefined;
  const logDateDecision = (routerDecision: "CALL_TOOL" | "CLARIFICATION" | "OTHER", finalValidationRan = false) => {
    if (toolSelection?.selectedTool && argumentExtraction) logDateGroundingDiagnostic({
      correlationId: parsedRequest.diagnosticCorrelationId,
      tool: toolSelection.selectedTool,
      input: parsedInput.data,
      temporalContext: parsedRequest.temporalContext,
      extractedArguments: argumentExtraction.arguments,
      grounding: groundedArguments,
      finalValidationRan,
      routerDecision
    });
  };
  if (groundedArguments?.status === "READY" && toolSelection?.selectedTool && argumentExtraction) {
    const totalDurationMs = Date.now() - startedAt;
    let assembledCall: ReturnType<typeof assembleToolCall>;
    try {
      if (continuation && (!safeContinuationTurn(currentTurnText(parsedInput.data), groundedArguments.arguments) ||
        selectedContinuation(toolSelection.selectedTool, availableTools, parsedRequest.progressionEvidence)?.continuationKey !== continuation.continuationKey)) {
        throw new AppError("Continuation requires an unambiguous current selection", { code: "TOOL_CONTINUATION_INVALID", status: 422 });
      }
      // Partial validation applies ONLY to the explicit continuation proposal.
      // The original execution schema remains mandatory in the orchestrator.
      assembledCall = assembleToolCall(argumentTool!, groundedArguments.arguments);
    } catch (error) {
      logDateDecision("OTHER", true);
      throw error;
    }
    logDateDecision("CALL_TOOL", true);
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
      responseAuthority: informationalResponseAuthority(),
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
      orchestration: { ...assembledCall, toolCall: { ...assembledCall.toolCall, toolCallId: randomUUID(),
        ...(continuation ? { continuation: { executionId: continuation.executionId, bindingKey: continuation.continuationKey! } } : {}) } }
    };
  }
  if (toolSelection?.decision.decision === "USE_TOOL" && toolSelection.selectedTool && argumentExtraction && parsedRequest.agent === "support") {
    const missingArguments = argumentExtraction.status === "MISSING_INFORMATION"
      ? argumentExtraction.missing ?? []
      : groundedArguments && groundedArguments.status !== "READY"
      ? [...groundedArguments.missing, ...groundedArguments.ungrounded]
      : [];
    if (missingArguments.length > 0) {
      const totalDurationMs = Date.now() - startedAt;
      const output = assembleSupportToolClarificationOutput(toolSelection.selectedTool, missingArguments);
      logDateDecision("CLARIFICATION");
      return {
        agent: parsedRequest.agent,
        mode: effectiveMode,
        parsedOutput: output,
        rawOutput: JSON.stringify(output),
        model: process.env.LLAMACPP_MODEL ?? process.env.OLLAMA_MODEL ?? process.env.LM_STUDIO_MODEL ?? "configured-model",
        provider: process.env.LLM_PROVIDER ?? "configured-provider",
        attemptCount: argumentExtraction.attempts,
        repairAttempt: argumentExtraction.repairAttempt,
        durationMs: totalDurationMs,
        responseAuthority: informationalResponseAuthority(),
        totalDurationMs,
        agentDurationMs: 0,
        toolSelection: { selectorUsed: true, selectorSkipped: false, selectorDecision: "USE_TOOL", selectedToolName: toolSelection.selectedTool.name, selectorAttempts: toolSelection.attempts, selectorRepair: toolSelection.repairAttempt, selectorValid: true, selectorDurationMs: toolSelection.durationMs, diagnostics: toolSelection.diagnostics },
        toolDiagnostics: { finalAction: "RESPOND", enforcementPassed: true, argumentsPresent: false, argumentsValid: false, argumentIssueCount: missingArguments.length },
        structuredOutputRequested: true,
        structuredOutputProviderSupported: llmService.supportsStructuredOutput,
        structuredOutputMode: llmService.supportsStructuredOutput ? "NATIVE_SCHEMA" : "TEXT_FALLBACK",
        toolRoutingStrategy: routingStrategy,
        nativePathUsed: false,
        selectorPathUsed: true,
        structuredOutputUsed: llmService.supportsStructuredOutput
      };
    }
  }
  // Failed extraction/grounding must not fall through to a legacy generation
  // using the original schema, which can still contain canonical ID properties.
  if (argumentExtraction && groundedArguments?.status !== "READY") {
    logDateDecision("OTHER");
    throw new AppError("Tool arguments could not be grounded", { code: "TOOL_ARGUMENTS_INVALID", status: 422 });
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
  const supportToolResultFollowUp = parsedRequest.agent === "support" && Boolean(parsedRequest.toolResult);
  const noToolNormalResponse = !nativeToolCalling && !parsedRequest.toolResult && enforcedToolSelection?.decision.decision === "NO_TOOL";
  const toolResultFollowUpPromptSchema = supportToolResultFollowUp ? z.toJSONSchema(supportToolResultFollowUpSchema) : z.toJSONSchema(agentDefinition.outputSchema);
  const messagesWithKnowledge = [
    ...(noToolNormalResponse
      ? baseMessages.map((message) => message.role === "system"
        ? {
            ...message,
            content: [
              message.content,
              "Tool selection already determined no tool is required. Produce the normal domain output only; do not call or mention tools."
            ].join("\n\n")
          }
        : message)
      : usesToolContract
      ? baseMessages.map((message) => message.role === "system"
        ? {
            ...message,
            content: parsedRequest.toolResult
              ? buildToolResultFollowUpSystemPrompt(message.content, parsedRequest.toolResult, toolResultFollowUpPromptSchema)
              : buildToolAwareSystemPrompt(message.content, availableTools, undefined, z.toJSONSchema(agentDefinition.outputSchema), selectionDirective)
          }
        : message)
      : baseMessages),
    ...buildRetrievedKnowledgeMessage(parsedRequest.ragContext),
    ...(!parsedRequest.toolResult && !noToolNormalResponse ? buildToolContext(availableTools) : []),
    ...(parsedRequest.toolResult ? buildToolResultMessage(parsedRequest.toolResult) : [])
  ];
  const outputSchema = domainOnlyResponse
    ? supportToolResultFollowUp ? supportToolResultFollowUpSchema : agentDefinition.outputSchema
    : usesToolContract
    ? (nativeToolCalling
      ? buildToolAwareSchema(agentDefinition.outputSchema)
      : enforcedToolSelection?.decision.decision === "USE_TOOL" && enforcedToolSelection.selectedTool
      ? buildCallToolOnlySchema(enforcedToolSelection.selectedTool)
      : buildRespondOnlySchema(agentDefinition.outputSchema))
    : agentDefinition.outputSchema;
  let validatedToolCall: ReturnType<typeof validateToolCall> | undefined;
  const maxTokens = resolveMaxTokens(effectiveMode, agentDefinition.llmOptions);
  const effectiveMaxTokens = parsedRequest.toolResult ? resolveToolResultFollowUpMaxTokens(maxTokens) : maxTokens;
  const temperature = resolveTemperature(effectiveMode, agentDefinition.llmOptions);
  const effectiveTemperature = supportToolResultFollowUp ? 0 : temperature;
  const agentStartedAt = Date.now();
  const execution = await executeStructuredOutput({
    baseMessages: messagesWithKnowledge,
    schema: outputSchema,
    schemaDescription: z.toJSONSchema(outputSchema),
    generate: async (messages) => {
      const response = await llmService.chat({
        messages,
        temperature: effectiveTemperature,
        maxTokens: effectiveMaxTokens,
        nativeTools: nativeToolCalling ? availableTools.map((tool) => ({ name: tool.name, description: tool.description, parameters: tool.inputSchema })) : undefined,
        responseSchema: llmService.supportsStructuredOutput && !nativeToolCalling && usesToolContract
        ? (enforcedToolSelection?.decision.decision === "USE_TOOL" && enforcedToolSelection.selectedTool
          ? buildCallToolResponseSchema(enforcedToolSelection.selectedTool)
          : z.toJSONSchema(outputSchema))
        : undefined,
        diagnostic: {
          stage: supportToolResultFollowUp
            ? (messages.length > messagesWithKnowledge.length ? "tool_result_followup_repair" : "tool_result_followup")
            : (messages.length > messagesWithKnowledge.length ? "normal_response_repair" : "normal_response"),
          correlationId: parsedRequest.diagnosticCorrelationId,
          agent: parsedRequest.agent,
          toolName: enforcedToolSelection?.selectedTool?.name ?? parsedRequest.toolResult?.toolName
        }
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
          responseSchema: z.toJSONSchema(agentDefinition.outputSchema),
          diagnostic: { stage: "native_no_tool_fallback", correlationId: parsedRequest.diagnosticCorrelationId, agent: parsedRequest.agent }
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
        const grounded = groundToolArguments(parsedInput.data, tool, call.arguments, temporalContext);
        if (grounded.status !== "READY") {
          return llmService.chat({
            messages: [...messages, { role: "system", content: `The selected tool cannot be requested yet. Ask the user only for these missing fields: ${grounded.missing.join(", ")}. Do not claim execution.` }],
            temperature,
            maxTokens,
            responseSchema: z.toJSONSchema(buildRespondOnlySchema(agentDefinition.outputSchema)),
            diagnostic: { stage: "native_missing_arguments_response", correlationId: parsedRequest.diagnosticCorrelationId, agent: parsedRequest.agent, toolName: tool.name }
          });
        }
        return { ...response, content: JSON.stringify({ action: "CALL_TOOL", toolCall: { name: call.name, arguments: grounded.arguments, requiresConfirmation: tool.requiresConfirmation } }) };
      }
      if (supportToolResultFollowUp) {
        const shape = inspectSupportToolResultFollowUpShape(response.content);
        console.error(JSON.stringify({
          event: "tool_result_followup_output_shape",
          stage: "tool_result_followup",
          correlationId: parsedRequest.diagnosticCorrelationId,
          toolName: parsedRequest.toolResult?.toolName,
          ...shape
        }));
        return { ...response, content: normalizeSupportToolResultFollowUpContent(response.content) };
      }
      return response;
    },
    captureRawOutput: process.env.BENCHMARK_CAPTURE_RAW_OUTPUT === "true" || process.env.TOOL_DIAGNOSTICS_CAPTURE_RAW_OUTPUT === "true",
    maxAttempts: supportToolResultFollowUp ? 1 : 2,
    diagnosticContext: parsedRequest.toolResult ? {
      toolResultPresent: true,
      toolResultStatus: parsedRequest.toolResult.status,
      expectedBehavior: "RESPOND"
    } : undefined,
    repairInstructions: usesToolContract
      ? parsedRequest.toolResult
        ? supportToolResultFollowUp
          ? "A ToolResult is already available. Return only JSON with suggested_reply. Do not return CALL_TOOL, action, toolCall, markdown, or explanations."
          : "A ToolResult is already available. Return only the final domain JSON object matching the agent output schema. Do not return CALL_TOOL, action, toolCall, markdown, or explanations."
        : buildToolOrchestrationInstructions(availableTools, undefined, z.toJSONSchema(agentDefinition.outputSchema), selectionDirective)
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
  const legacyToolResultFallback = parsedRequest.toolResult
    ? safeToolResultFallback(availableTools.find((tool) => tool.name === parsedRequest.toolResult?.toolName), parsedRequest.toolResult.status)
    : undefined;
  const parsedOutput = legacyToolResultFallback
    ? agentDefinition.outputSchema.parse(buildAuthoritativeToolResultOutput(parsedRequest.agent, legacyToolResultFallback))
    : supportToolResultFollowUp
      ? assembleSupportToolResultOutput(execution.parsedOutput as SupportToolResultFollowUpOutput)
      : execution.parsedOutput;
  const assembledResponse = domainOnlyResponse ? assembleRespond(parsedOutput) : output;
  const orchestration = assembledResponse.action === "CALL_TOOL" && validatedToolCall
    ? { action: "CALL_TOOL" as const, toolCall: validatedToolCall }
    : undefined;
  if (parsedRequest.toolResult && assembledResponse.action !== "RESPOND") {
    throw new AppError("Tool result did not produce a final response", { code: "TOOL_RESULT_INVALID", status: 502 });
  }
  const publicOutput = domainOnlyResponse
    ? parsedOutput
    : usesToolContract
      ? (output.action === "CALL_TOOL" ? null : output.result)
      : execution.parsedOutput;
  const responseIsPublic = !usesToolContract || assembledResponse.action === "RESPOND";
  const groundedPublicOutput = !parsedRequest.toolResult && responseIsPublic && publicOutput !== null
    ? groundModelGeneratedPublicOutput({ agent: parsedRequest.agent, input: parsedInput.data, output: publicOutput })
    : { output: publicOutput, replaced: false };
  const totalDurationMs = Date.now() - startedAt;
  return {
        agent: parsedRequest.agent,
        mode: effectiveMode,
        parsedOutput: groundedPublicOutput.output,
        rawOutput: groundedPublicOutput.replaced ? JSON.stringify(groundedPublicOutput.output) : execution.rawOutput,
        model: execution.response.model,
        provider: execution.response.provider,
        usage: execution.response.usage,
        attemptCount: execution.attemptCount,
        repairAttempt: execution.repairAttempt,
        diagnostics: execution.diagnostics,
        durationMs: totalDurationMs,
        responseAuthority: informationalResponseAuthority(),
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
