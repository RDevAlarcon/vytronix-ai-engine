import type { LlmChatRequest, LlmChatResponse } from "@/ai/llm/llm.types";
import { createConfiguredLlmProvider } from "@/ai/llm/provider.factory";

export class LlmService {
  constructor(private readonly provider = createConfiguredLlmProvider()) {}

  chat(request: LlmChatRequest): Promise<LlmChatResponse> {
    return this.provider.chat(request);
  }

  health() {
    return this.provider.health();
  }
}

export const llmService = new LlmService();
