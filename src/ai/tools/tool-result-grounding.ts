import type { ToolDefinition, ToolEffect, ToolResult } from "@/ai/tools/tool-contract";
import type { AgentResponseAuthority } from "@/ai/agents/agent.types";

export type AuthoritativeToolResultGrounding = {
  performedEffect: ToolEffect;
  userFacingSummary: string;
  validationPassed: boolean;
  reason: "VALID" | "MISSING_PRESENTATION" | "READ_ONLY_EFFECT" | "WRITE_POLICY_MISSING" | "WRITE_EFFECT_MISMATCH" | "NON_SUCCESS_EFFECT";
};

export const informationalResponseAuthority = (): AgentResponseAuthority => ({
  kind: "INFORMATIONAL",
  performedEffect: "NONE",
});

export const responseAuthorityFromToolResult = (
  tool: ToolDefinition,
  result: ToolResult,
  grounding: AuthoritativeToolResultGrounding,
): AgentResponseAuthority => {
  if (
    grounding.validationPassed &&
    tool.sideEffect === "WRITE" &&
    result.status === "SUCCEEDED" &&
    grounding.performedEffect !== "NONE"
  ) {
    return {
      kind: "AUTHORITATIVE_WRITE",
      performedEffect: grounding.performedEffect,
      toolName: tool.name,
      toolCallId: result.toolCallId,
    };
  }
  return informationalResponseAuthority();
};

export const safeToolResultFallback = (tool: ToolDefinition | undefined, status: ToolResult["status"]): string => {
  if (status === "DENIED") return "La operacion fue rechazada; no se realizaron cambios.";
  if (status === "CONFIRMATION_REQUIRED" || status === "PENDING_CONFIRMATION") return "La operacion requiere confirmacion y aun no se realizaron cambios.";
  if (status === "FAILED") return "La operacion no se completo; no se realizaron cambios.";
  if (!tool || tool.sideEffect === "WRITE") return "No existe evidencia autoritativa suficiente para afirmar que se realizaron cambios.";
  return "La consulta se completo; no se realizaron cambios.";
};

const rejected = (tool: ToolDefinition, status: ToolResult["status"], reason: AuthoritativeToolResultGrounding["reason"]): AuthoritativeToolResultGrounding => ({
  performedEffect: "NONE",
  userFacingSummary: safeToolResultFallback(tool, status),
  validationPassed: false,
  reason,
});

export function groundAuthoritativeToolResult(tool: ToolDefinition, result: ToolResult): AuthoritativeToolResultGrounding | null {
  const usesAuthoritativePath = tool.resultPolicy !== undefined || result.presentation !== undefined;
  if (!usesAuthoritativePath) return null;
  if (!result.presentation) return rejected(tool, result.status, "MISSING_PRESENTATION");

  const effect = result.presentation.performedEffect;
  if (tool.sideEffect === "READ_ONLY" && effect !== "NONE") return rejected(tool, result.status, "READ_ONLY_EFFECT");
  if (result.status !== "SUCCEEDED" && effect !== "NONE") return rejected(tool, result.status, "NON_SUCCESS_EFFECT");
  if (tool.sideEffect === "WRITE" && result.status === "SUCCEEDED") {
    const expected = tool.resultPolicy?.successEffect;
    if (!expected || expected === "NONE") return rejected(tool, result.status, "WRITE_POLICY_MISSING");
    if (effect !== expected) return rejected(tool, result.status, "WRITE_EFFECT_MISMATCH");
  }

  return {
    performedEffect: effect,
    userFacingSummary: result.presentation.userFacingSummary,
    validationPassed: true,
    reason: "VALID",
  };
}
