export type LlmProviderName = "lmstudio" | "ollama" | "llamacpp";

export type ChatRole = "system" | "user" | "assistant";

export type LlmMessage = {
  role: ChatRole;
  content: string;
};

export type LlmNativeTool = { name: string; description: string; parameters: unknown };
export type LlmToolCall = { id?: string; name: string; arguments: Record<string, unknown> };

export type ChatMessage = LlmMessage;

export type LlmChatRequest = {
  messages: LlmMessage[];
  model?: string;
  temperature?: number;
  seed?: number;
  maxTokens?: number;
  timeoutMs?: number;
  responseSchema?: unknown;
  nativeTools?: LlmNativeTool[];
  keepAlive?: string | number;
  diagnostic?: {
    stage: string;
    correlationId?: string;
    agent?: string;
    toolName?: string;
  };
};

export type LlmUsage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

export type LlmChatResponse = {
  content: string;
  model: string;
  provider: LlmProviderName;
  usage?: LlmUsage;
  raw: unknown;
  finishReason?: string | null;
  toolCalls?: LlmToolCall[];
};

export type LlmProviderHealth = {
  provider: LlmProviderName;
  configured: boolean;
};

export interface LlmProvider {
  readonly name: LlmProviderName;
  chat(request: LlmChatRequest): Promise<LlmChatResponse>;
  health(): LlmProviderHealth;
  readonly supportsStructuredOutput: boolean;
  readonly supportsNativeToolCalling: boolean;
}
