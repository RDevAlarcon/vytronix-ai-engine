import { progressionEvidenceSchema, toolProgressionSchema, type ToolDefinition } from "@/ai/tools/tool-contract";
import { AppError } from "@/lib/errors";

/** Structural evidence only. The orchestrator must revalidate canonical scope
 * against persisted execution state before any confirmation proposal. */
export function evaluateToolProgression(target: ToolDefinition, tools: ToolDefinition[], evidence: unknown, nowMs: number) {
  const metadata = toolProgressionSchema.safeParse(target.progression);
  if (!metadata.success || target.sideEffect !== "WRITE" || !target.requiresConfirmation) {
    throw new AppError("Invalid tool prerequisite metadata", { code: "TOOL_PROGRESSION_INVALID", status: 400 });
  }
  const parsed = progressionEvidenceSchema.safeParse(evidence ?? []);
  const entries = parsed.success && Number.isFinite(nowMs) ? parsed.data : [];
  // An execution cannot attest multiple different relationships; duplicates are
  // ambiguous even if their text happens to be identical.
  const uniqueExecutions = new Set(entries.map((item) => item.executionId)).size === entries.length;
  const usable = uniqueExecutions ? entries : [];
  const missingTools: string[] = [];
  for (const prerequisite of metadata.data.prerequisites) {
    const available = tools.filter((tool) => tool.name === prerequisite.prerequisiteTool);
    const read = available[0];
    if (available.length !== 1 || !read || read.sideEffect !== "READ_ONLY" || read.progression || read.name === target.name) {
      throw new AppError("Declared read prerequisite is unavailable", { code: "TOOL_PREREQUISITE_UNAVAILABLE", status: 400 });
    }
    const matches = usable.filter((item) => item.targetTool === target.name && item.prerequisiteTool === prerequisite.prerequisiteTool);
    const match = matches.length === 1 ? matches[0] : undefined;
    const completedAt = match ? Date.parse(match.completedAt) : NaN;
    const expiresAt = match ? Date.parse(match.expiresAt) : NaN;
    const ageLimit = prerequisite.maxAgeSeconds * 1000;
    if (!match || completedAt > nowMs || expiresAt < nowMs || nowMs - completedAt > ageLimit || expiresAt - completedAt > ageLimit) {
      missingTools.push(prerequisite.prerequisiteTool);
    }
  }
  return { satisfied: missingTools.length === 0, missingTools };
}
