import { leadInputSchema, leadOutputSchema } from "@/ai/agents/agent.schemas";
import type { AgentDefinition } from "@/ai/agents/agent.types";
import {
  buildLeadFastUserPrompt,
  buildLeadUserPrompt,
  leadFastSystemPrompt,
  leadSystemPrompt
} from "@/ai/prompts/lead.prompt";
import { z } from "zod";

export type LeadAgentInput = z.infer<typeof leadInputSchema>;
export type LeadAgentOutput = z.infer<typeof leadOutputSchema>;

export const leadAgent: AgentDefinition<LeadAgentInput, LeadAgentOutput> = {
  name: "lead",
  inputSchema: leadInputSchema,
  outputSchema: leadOutputSchema,
  llmOptions: {
    maxTokens: 700,
    fastMaxTokens: 380
  },
  buildMessages: (input) => [
    { role: "system", content: leadSystemPrompt },
    { role: "user", content: buildLeadUserPrompt(input) }
  ],
  buildFastMessages: (input) => [
    { role: "system", content: leadFastSystemPrompt },
    { role: "user", content: buildLeadFastUserPrompt(input) }
  ]
};
