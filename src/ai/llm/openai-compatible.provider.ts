import { AppError } from "@/lib/errors";
import type { LlmChatRequest, LlmChatResponse, LlmProvider, LlmProviderHealth, LlmProviderName } from "@/ai/llm/llm.types";

type OpenAiCompatiblePayload = {
  model?: string;
  choices?: Array<{ message?: { content?: string | null; tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }> }; finish_reason?: string | null }>;
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
  supportsStructuredOutput?: boolean;
  supportsNativeToolCalling?: boolean;
};

export class OpenAiCompatibleProvider implements LlmProvider {
  readonly name: LlmProviderName;
  readonly supportsStructuredOutput: boolean;
  readonly supportsNativeToolCalling: boolean;

  constructor(private readonly config: OpenAiCompatibleProviderConfig) {
    this.name = config.name;
    this.supportsStructuredOutput = config.supportsStructuredOutput ?? false;
    this.supportsNativeToolCalling = config.supportsNativeToolCalling ?? false;
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
          messages: request.messages,
          ...(request.nativeTools && this.supportsNativeToolCalling ? { tools: request.nativeTools.map((tool) => ({ type: "function", function: tool })) , tool_choice: "auto" } : {}),
          ...(request.responseSchema && this.supportsStructuredOutput ? {
            response_format: {
              type: "json_schema",
              json_schema: { name: "vytronix_output", strict: true, schema: request.responseSchema }
            }
          } : {})
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

      const content = payload.choices?.[0]?.message?.content?.trim() ?? "";
      const nativeToolCalls = payload.choices?.[0]?.message?.tool_calls?.map((call) => ({
        id: call.id,
        name: call.function?.name ?? "",
        arguments: JSON.parse(call.function?.arguments ?? "{}") as Record<string, unknown>
      }));
      // An empty native-tools response is a valid "no tool selected" signal.
      // Keep empty-content strict for all ordinary/domain-only requests.
      if (!content && !nativeToolCalls?.length && !request.nativeTools) {
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
        finishReason: payload.choices?.[0]?.finish_reason ?? null,
        toolCalls: nativeToolCalls
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
