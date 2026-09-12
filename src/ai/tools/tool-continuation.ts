import type { ToolDefinition, ToolProgressionEvidence } from "./tool-contract";
import { evaluateToolProgression } from "./tool-progression";

const normalized = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
export const refersToSelection = (text: string): boolean => /\b(?:ese|esa|este|esta)\s+(?:horario|resultado|opcion|elemento)\b|\b(?:that|this)\s+(?:slot|result|option|item)\b/u.test(normalized(text));

// Deliberately bounded grammar: unknown prose/corrections require clarification.
// Values are data copied verbatim from this turn, never historical authority.
export function safeContinuationTurn(text: string, args: Record<string, unknown>): boolean {
  if (text.length > 4000 || !refersToSelection(text)) return false;
  let remainder = normalized(text);
  // Check BEFORE masking copied values, so a model cannot hide a correction
  // inside a proposed contact/name value.
  if (/\b(?:pero|mejor|otro|otra|con|instead|rather|but|different|with|lunes|martes|miercoles|jueves|viernes|sabado|domingo|tomorrow|manana)\b|\b\d{1,2}:\d{2}\b|\b\d{4}-\d{2}-\d{2}\b/u.test(remainder)) return false;
  for (const value of Object.values(args).sort((a, b) => String(b).length - String(a).length)) {
    if (typeof value !== "string" || !value.trim() || /[\r\n;]/u.test(value) || !remainder.includes(normalized(value))) return false;
    remainder = remainder.replace(normalized(value), "VALUE");
  }
  return /^(?:si[, ]+)?(?:quiero\s+)?(?:reservar|reserva|agendar|agenda|crear|crea)\s+(?:ese|esa|este|esta)\s+(?:horario|resultado|opcion|elemento)(?:\s+(?:para|a nombre de)\s+VALUE)?[.\s]*(?:(?:soy|mi nombre es|mi telefono es|mi correo es|y mi correo es)\s+VALUE[.\s]*)*$/u.test(remainder)
    || /^(?:please\s+)?(?:book|reserve|schedule|create)\s+(?:that|this)\s+(?:slot|result|option|item)(?:\s+for\s+VALUE)?[.\s]*(?:(?:my name is|my phone is|my email is|and my email is)\s+VALUE[.\s]*)*$/u.test(remainder);
}

export function selectedContinuation(tool: ToolDefinition, tools: ToolDefinition[], evidence: ToolProgressionEvidence[] | undefined) {
  if (!tool.progression?.continuation || !evaluateToolProgression(tool, tools, evidence, Date.now()).satisfied) return undefined;
  const matches = (evidence ?? []).filter((item) => item.targetTool === tool.name && item.continuationKey);
  // Multiple selected prerequisites require an explicit merge policy, not guessing.
  return matches.length === 1 ? matches[0] : undefined;
}

export function continuationArgumentTool(tool: ToolDefinition): ToolDefinition {
  const fields = tool.progression?.continuation?.argumentFields ?? [];
  const properties = tool.inputSchema.properties ?? {};
  if (!fields.length || fields.some((field) => !properties[field])) throw new Error("Invalid continuation fields");
  return { ...tool, inputSchema: { type: "object", properties: Object.fromEntries(fields.map((field) => [field, properties[field]!])),
    required: (tool.inputSchema.required ?? []).filter((field) => fields.includes(field)), additionalProperties: false } };
}
