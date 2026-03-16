import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import type { LlmChatRequest, LlmChatResponse } from "@/ai/llm/llm.types";

type OpenAiCompatibleResponse = {
  id?: string;
  object?: string;
  created?: number;
  model?: string;
  choices?: Array<{
    index?: number;
    message?: {
      role?: string;
      content?: string | null;
    };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: {
    message?: string;
    type?: string;
  };
};

export class LlmService {
  async chat(request: LlmChatRequest): Promise<LlmChatResponse> {
    const provider = env.LLM_PROVIDER;
    if (provider !== "lmstudio") {
      throw new AppError(`Unsupported provider: ${provider}`, {
        code: "LLM_PROVIDER_UNSUPPORTED",
        status: 500
      });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), env.LLM_REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(`${env.LM_STUDIO_BASE_URL}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          model: request.model ?? env.LM_STUDIO_MODEL,
          temperature: request.temperature ?? env.LM_STUDIO_TEMPERATURE,
          max_tokens: request.maxTokens ?? env.LM_STUDIO_MAX_TOKENS,
          messages: request.messages
        })
      });

      const payload = (await response.json()) as OpenAiCompatibleResponse;

      if (!response.ok) {
        throw new AppError(payload.error?.message ?? "LLM request failed", {
          code: "LLM_UPSTREAM_ERROR",
          status: 502,
          details: payload
        });
      }

      const content = payload.choices?.[0]?.message?.content?.trim();
      if (!content) {
        throw new AppError("LLM returned empty content", {
          code: "LLM_EMPTY_CONTENT",
          status: 502,
          details: payload
        });
      }

      return {
        content,
        provider: "lmstudio",
        model: payload.model ?? request.model ?? env.LM_STUDIO_MODEL,
        usage: {
          promptTokens: payload.usage?.prompt_tokens,
          completionTokens: payload.usage?.completion_tokens,
          totalTokens: payload.usage?.total_tokens
        },
        raw: payload
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      if (error instanceof DOMException && error.name === "AbortError") {
        throw new AppError("LLM request timed out", {
          code: "LLM_TIMEOUT",
          status: 504
        });
      }

      throw new AppError("Failed to connect to LLM provider", {
        code: "LLM_CONNECTION_ERROR",
        status: 503,
        details: error
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}

export const llmService = new LlmService();
