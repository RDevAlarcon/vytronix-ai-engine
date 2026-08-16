import { OpenAiCompatibleProvider } from "@/ai/llm/openai-compatible.provider";
import type { LlmProvider } from "@/ai/llm/llm.types";

export const createOllamaProvider = (config: { baseUrl: string; model: string; temperature: number; maxTokens: number; timeoutMs: number }): LlmProvider =>
  new OpenAiCompatibleProvider({ name: "ollama", baseUrl: config.baseUrl, defaultModel: config.model, defaultTemperature: config.temperature, defaultMaxTokens: config.maxTokens, timeoutMs: config.timeoutMs });
