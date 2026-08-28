import { env } from "@/lib/env";
import type { LlmProvider } from "@/ai/llm/llm.types";
import { createLmStudioProvider } from "@/ai/llm/lmstudio.provider";
import { createOllamaProvider } from "@/ai/llm/ollama.provider";
import { createLlamaCppProvider } from "@/ai/llm/llamacpp.provider";

export const createLlmProvider = (provider: "lmstudio" | "ollama" | "llamacpp", config: {
  lmstudio: Parameters<typeof createLmStudioProvider>[0];
  ollama: Parameters<typeof createOllamaProvider>[0];
  llamacpp?: Parameters<typeof createLlamaCppProvider>[0];
}): LlmProvider => provider === "lmstudio"
  ? createLmStudioProvider(config.lmstudio)
  : provider === "ollama"
    ? createOllamaProvider(config.ollama)
    : config.llamacpp
      ? createLlamaCppProvider(config.llamacpp)
      : (() => { throw new Error("Missing llama.cpp provider configuration"); })();

export const createConfiguredLlmProvider = (): LlmProvider => {
  return createLlmProvider(env.LLM_PROVIDER, {
    lmstudio: { ...env.LM_STUDIO, timeoutMs: env.LLM_REQUEST_TIMEOUT_MS },
    ollama: { ...env.OLLAMA, timeoutMs: env.LLM_REQUEST_TIMEOUT_MS },
    llamacpp: { ...env.LLAMACPP, timeoutMs: env.LLM_REQUEST_TIMEOUT_MS }
  });
};
