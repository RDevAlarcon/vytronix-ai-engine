import { proposalInputSchema, proposalOutputSchema } from "@/ai/agents/agent.schemas";
import type { AgentDefinition } from "@/ai/agents/agent.types";
import {
  buildProposalFastUserPrompt,
  buildProposalUserPrompt,
  proposalFastSystemPrompt,
  proposalSystemPrompt
} from "@/ai/prompts/proposal.prompt";
import { z } from "zod";

export type ProposalAgentInput = z.infer<typeof proposalInputSchema>;
export type ProposalAgentOutput = z.infer<typeof proposalOutputSchema>;

export const proposalAgent: AgentDefinition<ProposalAgentInput, ProposalAgentOutput> = {
  name: "proposal",
  inputSchema: proposalInputSchema,
  outputSchema: proposalOutputSchema,
  llmOptions: {
    maxTokens: 650,
    fastMaxTokens: 300
  },
  buildMessages: (input) => [
    { role: "system", content: proposalSystemPrompt },
    { role: "user", content: buildProposalUserPrompt(input) }
  ],
  buildFastMessages: (input) => [
    { role: "system", content: proposalFastSystemPrompt },
    { role: "user", content: buildProposalFastUserPrompt(input) }
  ]
};
