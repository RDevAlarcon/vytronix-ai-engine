export type LlmProviderName = "lmstudio" | "ollama";

export type ChatRole = "system" | "user" | "assistant";

export type LlmMessage = {
  role: ChatRole;
  content: string;
};

export type ChatMessage = LlmMessage;

export type LlmChatRequest = {
  messages: LlmMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
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
};

export type LlmProviderHealth = {
  provider: LlmProviderName;
  configured: boolean;
};

export interface LlmProvider {
  readonly name: LlmProviderName;
  chat(request: LlmChatRequest): Promise<LlmChatResponse>;
  health(): LlmProviderHealth;
}
