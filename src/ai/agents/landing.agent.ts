import { landingInputSchema, landingOutputSchema } from "@/ai/agents/agent.schemas";
import type { AgentDefinition } from "@/ai/agents/agent.types";
import {
  buildLandingFastUserPrompt,
  buildLandingUserPrompt,
  landingFastSystemPrompt,
  landingSystemPrompt
} from "@/ai/prompts/landing.prompt";
import { z } from "zod";

export type LandingAgentInput = z.infer<typeof landingInputSchema>;
export type LandingAgentOutput = z.infer<typeof landingOutputSchema>;

export const landingAgent: AgentDefinition<LandingAgentInput, LandingAgentOutput> = {
  name: "landing",
  inputSchema: landingInputSchema,
  outputSchema: landingOutputSchema,
  llmOptions: {
    maxTokens: 650,
    fastMaxTokens: 260
  },
  buildMessages: (input) => [
    { role: "system", content: landingSystemPrompt },
    { role: "user", content: buildLandingUserPrompt(input) }
  ],
  buildFastMessages: (input) => [
    { role: "system", content: landingFastSystemPrompt },
    { role: "user", content: buildLandingFastUserPrompt(input) }
  ]
};
