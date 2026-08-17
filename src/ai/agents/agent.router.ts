import { z } from "zod";
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

const runRequestSchema = z.object({
  agent: z.enum(["lead", "landing", "proposal", "support"]),
  input: z.unknown(),
  mode: z.enum(["standard", "fast"]).default("standard"),
  ragContext: ragContextSchema.optional()
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
  const messagesWithKnowledge = [...baseMessages, ...buildRetrievedKnowledgeMessage(parsedRequest.ragContext)];
  const maxTokens = resolveMaxTokens(effectiveMode, agentDefinition.llmOptions);
  const temperature = resolveTemperature(effectiveMode, agentDefinition.llmOptions);
  const execution = await executeStructuredOutput({
    baseMessages: messagesWithKnowledge,
    schema: agentDefinition.outputSchema,
    schemaDescription: z.toJSONSchema(agentDefinition.outputSchema),
    generate: (messages) => llmService.chat({ messages, temperature, maxTokens }),
    captureRawOutput: process.env.BENCHMARK_CAPTURE_RAW_OUTPUT === "true"
  });
  return {
        agent: parsedRequest.agent,
        mode: effectiveMode,
        parsedOutput: execution.parsedOutput,
        rawOutput: execution.rawOutput,
        model: execution.response.model,
        provider: execution.response.provider,
        usage: execution.response.usage,
        attemptCount: execution.attemptCount,
        repairAttempt: execution.repairAttempt,
        diagnostics: execution.diagnostics,
        durationMs: Date.now() - startedAt
      };
};
