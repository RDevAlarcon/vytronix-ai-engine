import { AppError } from "@/lib/errors";
import type { LlmChatRequest, LlmChatResponse, LlmProvider, LlmProviderHealth, LlmProviderName } from "@/ai/llm/llm.types";

type OpenAiCompatiblePayload = {
  model?: string;
  choices?: Array<{ message?: { content?: string | null }; finish_reason?: string | null }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  error?: { message?: string };
};

export type OpenAiCompatibleProviderConfig = {
  name: LlmProviderName;
  baseUrl: string;
  defaultModel: string;
  defaultTemperature: number;
  defaultMaxTokens: number;
  timeoutMs: number;
};

export class OpenAiCompatibleProvider implements LlmProvider {
  readonly name: LlmProviderName;

  constructor(private readonly config: OpenAiCompatibleProviderConfig) {
    this.name = config.name;
  }

  health(): LlmProviderHealth {
    return { provider: this.name, configured: Boolean(this.config.baseUrl && this.config.defaultModel) };
  }

  async chat(request: LlmChatRequest): Promise<LlmChatResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), request.timeoutMs ?? this.config.timeoutMs);

    try {
      const response = await fetch(`${this.config.baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          model: request.model ?? this.config.defaultModel,
          temperature: request.temperature ?? this.config.defaultTemperature,
          max_tokens: request.maxTokens ?? this.config.defaultMaxTokens,
          messages: request.messages
        })
      });
      const payload = (await response.json()) as OpenAiCompatiblePayload;

      if (!response.ok) {
        throw new AppError("LLM provider returned an error", {
          code: "LLM_UPSTREAM_ERROR",
          status: 502,
          details: { provider: this.name, upstreamMessage: payload.error?.message }
        });
      }

      const content = payload.choices?.[0]?.message?.content?.trim();
      if (!content) {
        throw new AppError("LLM returned empty content", {
          code: "LLM_EMPTY_CONTENT",
          status: 502,
          details: { provider: this.name }
        });
      }

      return {
        content,
        provider: this.name,
        model: payload.model ?? request.model ?? this.config.defaultModel,
        usage: {
          promptTokens: payload.usage?.prompt_tokens,
          completionTokens: payload.usage?.completion_tokens,
          totalTokens: payload.usage?.total_tokens
        },
        raw: payload,
        finishReason: payload.choices?.[0]?.finish_reason ?? null
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new AppError("LLM request timed out", { code: "LLM_TIMEOUT", status: 504 });
      }
      throw new AppError("Failed to connect to LLM provider", {
        code: "LLM_CONNECTION_ERROR",
        status: 503,
        details: { provider: this.name }
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}
