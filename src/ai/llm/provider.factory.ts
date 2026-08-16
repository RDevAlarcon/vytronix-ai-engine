import { env } from "@/lib/env";
import type { LlmProvider } from "@/ai/llm/llm.types";
import { createLmStudioProvider } from "@/ai/llm/lmstudio.provider";
import { createOllamaProvider } from "@/ai/llm/ollama.provider";

export const createLlmProvider = (provider: "lmstudio" | "ollama", config: {
  lmstudio: Parameters<typeof createLmStudioProvider>[0];
  ollama: Parameters<typeof createOllamaProvider>[0];
}): LlmProvider => provider === "lmstudio"
  ? createLmStudioProvider(config.lmstudio)
  : createOllamaProvider(config.ollama);

export const createConfiguredLlmProvider = (): LlmProvider => {
  return createLlmProvider(env.LLM_PROVIDER, {
    lmstudio: { ...env.LM_STUDIO, timeoutMs: env.LLM_REQUEST_TIMEOUT_MS },
    ollama: { ...env.OLLAMA, timeoutMs: env.LLM_REQUEST_TIMEOUT_MS }
  });
};
