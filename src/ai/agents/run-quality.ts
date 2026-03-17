import type { AgentName, AgentRunResult } from "@/ai/agents/agent.types";

type QualityEvaluation = {
  score: number;
  flags: string[];
  improvementSignals: string[];
};

const asRecord = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
};

const hasString = (payload: Record<string, unknown>, key: string): boolean => {
  const value = payload[key];
  return typeof value === "string" && value.trim().length > 0;
};

const hasArray = (payload: Record<string, unknown>, key: string): boolean => {
  return Array.isArray(payload[key]) && (payload[key] as unknown[]).length > 0;
};

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const requiredFieldsByAgent: Record<AgentName, string[]> = {
  lead: ["summary", "detected_service", "lead_temperature", "suggested_next_action", "reply_to_client"],
  landing: ["project_summary", "recommended_template", "primary_cta", "secondary_cta", "brief_markdown"],
  proposal: ["proposal_title", "executive_summary"],
  support: ["category", "priority", "summary", "suggested_reply"]
};

const requiredArraysByAgent: Partial<Record<AgentName, string[]>> = {
  lead: ["missing_information"],
  landing: ["suggested_sections", "missing_information"],
  proposal: ["scope", "deliverables", "assumptions", "next_steps"]
};

export const evaluateRunQuality = (params: {
  agent: AgentName | string;
  input: unknown;
  result?: AgentRunResult;
  errorMessage?: string;
}): QualityEvaluation => {
  const flags = new Set<string>();
  const improvementSignals = new Set<string>();

  if (!params.result) {
    flags.add("failed_run");
    improvementSignals.add("inspect_failure_path");
    if (params.errorMessage) {
      improvementSignals.add("capture_error_patterns");
    }

    return {
      score: 20,
      flags: [...flags],
      improvementSignals: [...improvementSignals]
    };
  }

  let score = 100;
  const payload = asRecord(params.result.parsedOutput);
  const agent = params.agent as AgentName;

  for (const field of requiredFieldsByAgent[agent] ?? []) {
    if (!hasString(payload, field)) {
      score -= 12;
      flags.add("missing_required_output");
      improvementSignals.add(`reinforce_${field}`);
    }
  }

  for (const field of requiredArraysByAgent[agent] ?? []) {
    if (!hasArray(payload, field)) {
      score -= 8;
      flags.add("thin_structured_output");
      improvementSignals.add(`expand_${field}`);
    }
  }

  if ((params.result.durationMs ?? 0) > 60000) {
    score -= 20;
    flags.add("high_latency");
    improvementSignals.add("optimize_prompt_or_model");
  } else if ((params.result.durationMs ?? 0) > 30000) {
    score -= 10;
    flags.add("slow_response");
  }

  if ((params.result.attemptCount ?? 1) > 1) {
    score -= 8;
    flags.add("retried_generation");
    improvementSignals.add("improve_output_stability");
  }

  if ((params.result.usage?.totalTokens ?? 0) > 900) {
    score -= 6;
    flags.add("high_token_cost");
    improvementSignals.add("compress_prompt_or_output");
  }

  if ((params.result.rawOutput?.trim().length ?? 0) < 60) {
    score -= 6;
    flags.add("brief_raw_output");
  }

  if (agent === "support" && payload.priority === "high" && payload.escalate_to_human !== true) {
    score -= 10;
    flags.add("escalation_mismatch");
    improvementSignals.add("review_support_priority_rules");
  }

  if (agent === "proposal" && !hasArray(payload, "deliverables")) {
    score -= 6;
    improvementSignals.add("strengthen_proposal_deliverables");
  }

  if (agent === "landing" && !hasArray(payload, "suggested_sections")) {
    score -= 6;
    improvementSignals.add("strengthen_section_generation");
  }

  const inputRecord = asRecord(params.input);
  if (Object.keys(inputRecord).length === 0) {
    score -= 4;
    flags.add("empty_input_shape");
  }

  const finalScore = clamp(score, 0, 100);
  if (finalScore < 70) {
    flags.add("needs_review");
  }

  return {
    score: finalScore,
    flags: [...flags],
    improvementSignals: [...improvementSignals]
  };
};
