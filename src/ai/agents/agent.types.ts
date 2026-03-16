import { z } from "zod";
import type { ChatMessage } from "@/ai/llm/llm.types";

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

export type AgentRunRequest = {
  agent: AgentName;
  input: unknown;
  mode?: AgentExecutionMode;
};

export type AgentRunResult<TOutput = unknown> = {
  agent: AgentName;
  mode: AgentExecutionMode;
  parsedOutput: TOutput;
  rawOutput: string;
  model: string;
  provider: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  attemptCount: number;
  durationMs: number;
};
