import { z } from "zod";
import type { ChatMessage } from "@/ai/llm/llm.types";
import type { StructuredOutputDiagnostic } from "@/ai/structured-output/structured-output";
import type { RagContext } from "@/ai/rag/rag-context";
import type { ToolDefinition, ToolEffect, ToolProgressionEvidence, ToolResult } from "@/ai/tools/tool-contract";
import type { TemporalContext } from "@/ai/tools/tool-temporal-context";

export type AgentName = "lead" | "landing" | "proposal" | "support";
export type AgentExecutionMode = "standard" | "fast";

export type AgentDefinition<TInput, TOutput> = {
  name: AgentName;
  inputSchema: z.ZodType<TInput>;
  outputSchema: z.ZodType<TOutput>;
  buildMessages: (input: TInput) => ChatMessage[];
  buildFastMessages?: (input: TInput) => ChatMessage[];
  llmOptions?: {
    temperature?: number;
    maxTokens?: number;
    fastMaxTokens?: number;
  };
};

export type AgentResponseAuthority =
  | {
      kind: "INFORMATIONAL";
      performedEffect: "NONE";
    }
  | {
      kind: "AUTHORITATIVE_WRITE";
      performedEffect: Exclude<ToolEffect, "NONE">;
      toolName: string;
      toolCallId: string;
    };

export type AgentRunRequest = {
  agent: AgentName;
  input: unknown;
  mode?: AgentExecutionMode;
  ragContext?: RagContext;
  tools?: ToolDefinition[];
  toolResult?: ToolResult;
  progressionEvidence?: ToolProgressionEvidence[];
  diagnosticCorrelationId?: string;
  temporalContext?: TemporalContext;
};

export type AgentRunResult<TOutput = unknown> = {
  agent: AgentName;
  mode: AgentExecutionMode;
  parsedOutput: TOutput | null;
  rawOutput: string;
  model: string;
  provider: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  attemptCount: number;
  repairAttempt?: boolean;
  diagnostics?: StructuredOutputDiagnostic[];
  durationMs: number;
  responseAuthority: AgentResponseAuthority;
  totalDurationMs?: number;
  agentDurationMs?: number;
  toolSelection?: {
    selectorUsed: boolean;
    selectorSkipped: boolean;
    selectorDecision?: "NO_TOOL" | "USE_TOOL";
    selectedToolName?: string;
    selectorAttempts: number;
    selectorRepair: boolean;
    selectorValid: boolean;
    selectorDurationMs: number;
    selectorErrorCode?: string;
    diagnostics?: StructuredOutputDiagnostic[];
  };
  toolDiagnostics?: {
    finalAction: "RESPOND" | "CALL_TOOL";
    enforcementPassed: boolean;
    argumentsPresent: boolean;
    argumentsValid: boolean;
    argumentIssueCount: number;
  };
  structuredOutputMode?: "NATIVE_SCHEMA" | "TEXT_FALLBACK";
  structuredOutputRequested?: boolean;
  structuredOutputProviderSupported?: boolean;
  toolRoutingStrategy?: "NATIVE" | "SELECTOR" | "TOOL_RESULT_RESPOND" | "LEGACY";
  nativePathUsed?: boolean;
  selectorPathUsed?: boolean;
  structuredOutputUsed?: boolean;
  orchestration?: {
    action: "CALL_TOOL";
    toolCall: {
      toolCallId: string;
      toolName: string;
      arguments: Record<string, unknown>;
      requiresConfirmation: boolean;
      continuation?: { executionId: string; bindingKey: string };
    };
  };
};
