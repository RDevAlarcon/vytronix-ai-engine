import { createHash } from "node:crypto";
import { AppError } from "@/lib/errors";
import type { LlmChatRequest, LlmChatResponse, LlmProvider, LlmProviderHealth, LlmProviderName } from "@/ai/llm/llm.types";

type OpenAiCompatiblePayload = {
  model?: string;
  choices?: Array<{ message?: { content?: string | null; tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }> }; finish_reason?: string | null }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  error?: { code?: string; message?: string };
};

const estimateTokens = (chars: number): number => chars === 0 ? 0 : Math.ceil(chars / 3);

const sanitizeProviderMessage = (message: string | undefined): string | undefined => {
  if (!message) return undefined;
  return message.replace(/\s+/g, " ").trim().slice(0, 300);
};

const logSafeDiagnostic = (payload: Record<string, unknown>): void => {
  console.error(JSON.stringify(payload));
};

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => child !== undefined)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, child]) => [key, canonicalize(child)])
  );
};

export const buildSafeRequestHash = (value: unknown): string => createHash("sha256")
  .update(JSON.stringify(canonicalize(value)))
  .digest("hex")
  .slice(0, 16);

export type OpenAiCompatibleProviderConfig = {
  name: LlmProviderName;
  baseUrl: string;
  defaultModel: string;
  defaultTemperature: number;
  defaultMaxTokens: number;
  timeoutMs: number;
  keepAlive?: string;
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
    const requestPayload = {
      model: request.model ?? this.config.defaultModel,
      temperature: request.temperature ?? this.config.defaultTemperature,
      ...(request.seed !== undefined ? { seed: request.seed } : {}),
      max_tokens: request.maxTokens ?? this.config.defaultMaxTokens,
      messages: request.messages,
      ...((request.keepAlive ?? this.config.keepAlive) !== undefined && this.name === "ollama" ? { keep_alive: request.keepAlive ?? this.config.keepAlive } : {}),
      ...(request.nativeTools && this.supportsNativeToolCalling ? { tools: request.nativeTools.map((tool) => ({ type: "function", function: tool })) , tool_choice: "auto" } : {}),
      ...(request.responseSchema && this.supportsStructuredOutput ? {
        response_format: {
          type: "json_schema",
          json_schema: { name: "vytronix_output", strict: true, schema: request.responseSchema }
        }
      } : {})
    };
    const messageChars = request.messages.map((message) => message.content.length);
    const totalMessageChars = messageChars.reduce((total, chars) => total + chars, 0);
    const responseFormatChars = "response_format" in requestPayload ? JSON.stringify(requestPayload.response_format).length : 0;
    const nativeToolsChars = "tools" in requestPayload ? JSON.stringify(requestPayload.tools).length : 0;
    const serializedRequestChars = JSON.stringify(requestPayload).length;
    const requestHash = buildSafeRequestHash(requestPayload);

    if (request.diagnostic) {
      logSafeDiagnostic({
        event: "llm_provider_request",
        provider: this.name,
        stage: request.diagnostic.stage,
        correlationId: request.diagnostic.correlationId,
        agent: request.diagnostic.agent,
        toolName: request.diagnostic.toolName,
        messageCount: request.messages.length,
        totalMessageChars,
        largestMessageChars: messageChars.length ? Math.max(...messageChars) : 0,
        estimatedInputTokens: estimateTokens(totalMessageChars),
        maxTokens: requestPayload.max_tokens,
        estimatedContextTokens: estimateTokens(totalMessageChars) + Number(requestPayload.max_tokens),
        responseSchemaChars: request.responseSchema ? JSON.stringify(request.responseSchema).length : 0,
        responseFormatChars,
        nativeToolsChars,
        serializedRequestChars,
        requestHash
      });
    }

    try {
      const response = await fetch(`${this.config.baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify(requestPayload)
      });
      const payload = (await response.json()) as OpenAiCompatiblePayload;

      if (!response.ok) {
        if (request.diagnostic) {
          logSafeDiagnostic({
            event: "llm_provider_upstream_error",
            provider: this.name,
            stage: request.diagnostic.stage,
            correlationId: request.diagnostic.correlationId,
            agent: request.diagnostic.agent,
            toolName: request.diagnostic.toolName,
            upstreamStatus: response.status,
            upstreamCode: payload.error?.code,
            upstreamMessage: sanitizeProviderMessage(payload.error?.message)
          });
        }
        throw new AppError("LLM provider returned an error", {
          code: "LLM_UPSTREAM_ERROR",
          status: 502,
          details: {
            provider: this.name,
            upstreamStatus: response.status,
            upstreamCode: payload.error?.code,
            upstreamMessage: sanitizeProviderMessage(payload.error?.message)
          }
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
