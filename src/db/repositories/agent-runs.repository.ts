import { desc, eq, sql } from "drizzle-orm";
import type { AgentRunResult } from "@/ai/agents/agent.types";
import { db } from "@/db/client";
import {
  agentRuns,
  landingBriefs,
  leadRecords,
  proposalDrafts,
  supportCases,
  type AgentRunSelect
} from "@/db/schema";

type PersistParams = {
  input: unknown;
  result?: AgentRunResult;
  errorMessage?: string;
  agent: string;
};

export const createAgentRun = async (params: PersistParams): Promise<string> => {
  const [run] = await db
    .insert(agentRuns)
    .values({
      agentName: params.agent,
      status: params.result ? "success" : "failed",
      input: params.input,
      rawOutput: params.result?.rawOutput ?? null,
      parsedOutput: params.result?.parsedOutput ?? null,
      model: params.result?.model ?? null,
      provider: params.result?.provider ?? null,
      speedMode: params.result?.mode ?? null,
      attemptCount: params.result?.attemptCount ?? 1,
      durationMs: params.result?.durationMs ?? null,
      usage: params.result?.usage ?? null,
      errorMessage: params.errorMessage ?? null,
      completedAt: new Date()
    })
    .returning({ id: agentRuns.id });

  if (params.result && run) {
    await persistSpecializedRecord(run.id, params.agent, params.result.parsedOutput);
  }

  return run?.id ?? "";
};

const persistSpecializedRecord = async (agentRunId: string, agent: string, parsedOutput: unknown) => {
  if (agent === "lead") {
    const payload = parsedOutput as {
      summary: string;
      detected_service: string;
      lead_temperature: string;
      missing_information: string[];
      suggested_next_action: string;
      reply_to_client: string;
    };
    await db.insert(leadRecords).values({
      agentRunId,
      summary: payload.summary,
      detectedService: payload.detected_service,
      leadTemperature: payload.lead_temperature,
      missingInformation: payload.missing_information,
      suggestedNextAction: payload.suggested_next_action,
      replyToClient: payload.reply_to_client
    });
    return;
  }

  if (agent === "landing") {
    const payload = parsedOutput as {
      project_summary: string;
      recommended_template: string;
      primary_cta: string;
      secondary_cta: string;
      suggested_sections: string[];
      missing_information: string[];
      brief_markdown: string;
    };
    await db.insert(landingBriefs).values({
      agentRunId,
      projectSummary: payload.project_summary,
      recommendedTemplate: payload.recommended_template,
      primaryCta: payload.primary_cta,
      secondaryCta: payload.secondary_cta,
      suggestedSections: payload.suggested_sections,
      missingInformation: payload.missing_information,
      briefMarkdown: payload.brief_markdown
    });
    return;
  }

  if (agent === "proposal") {
    const payload = parsedOutput as {
      proposal_title: string;
      executive_summary: string;
      scope: string[];
      deliverables: string[];
      assumptions: string[];
      next_steps: string[];
    };
    await db.insert(proposalDrafts).values({
      agentRunId,
      proposalTitle: payload.proposal_title,
      executiveSummary: payload.executive_summary,
      scope: payload.scope,
      deliverables: payload.deliverables,
      assumptions: payload.assumptions,
      nextSteps: payload.next_steps
    });
    return;
  }

  if (agent === "support") {
    const payload = parsedOutput as {
      category: string;
      priority: string;
      summary: string;
      suggested_reply: string;
      escalate_to_human: boolean;
    };
    await db.insert(supportCases).values({
      agentRunId,
      category: payload.category,
      priority: payload.priority,
      summary: payload.summary,
      suggestedReply: payload.suggested_reply,
      escalateToHuman: payload.escalate_to_human
    });
  }
};

export const listRecentAgentRuns = async (limit = 20): Promise<AgentRunSelect[]> => {
  try {
    return await db.select().from(agentRuns).orderBy(desc(agentRuns.createdAt)).limit(limit);
  } catch {
    return [];
  }
};

export const getAgentRunById = async (id: string): Promise<AgentRunSelect | null> => {
  try {
    const [run] = await db.select().from(agentRuns).where(eq(agentRuns.id, id)).limit(1);
    return run ?? null;
  } catch {
    return null;
  }
};

export const checkDatabaseHealth = async (): Promise<boolean> => {
  try {
    await db.execute(sql`select 1`);
    return true;
  } catch {
    return false;
  }
};
