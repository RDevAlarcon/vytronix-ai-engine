import { supportInputSchema, supportOutputSchema } from "@/ai/agents/agent.schemas";
import type { AgentDefinition } from "@/ai/agents/agent.types";
import {
  buildSupportFastUserPrompt,
  buildSupportUserPrompt,
  supportFastSystemPrompt,
  supportSystemPrompt
} from "@/ai/prompts/support.prompt";
import { z } from "zod";

export type SupportAgentInput = z.infer<typeof supportInputSchema>;
export type SupportAgentOutput = z.infer<typeof supportOutputSchema>;

export const supportAgent: AgentDefinition<SupportAgentInput, SupportAgentOutput> = {
  name: "support",
  inputSchema: supportInputSchema,
  outputSchema: supportOutputSchema,
  llmOptions: {
    maxTokens: 550,
    fastMaxTokens: 220
  },
  buildMessages: (input) => [
    { role: "system", content: supportSystemPrompt },
    { role: "user", content: buildSupportUserPrompt(input) }
  ],
  buildFastMessages: (input) => [
    { role: "system", content: supportFastSystemPrompt },
    { role: "user", content: buildSupportFastUserPrompt(input) }
  ]
};
