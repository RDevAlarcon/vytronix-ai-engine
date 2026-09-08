import type { ToolDefinition } from "@/ai/tools/tool-contract";
import { buildExtractionSchema } from "@/ai/tools/tool-argument-extractor";
import { dateFromEvidence, resolveCurrentDate, type TemporalContext } from "@/ai/tools/tool-temporal-context";

export type ToolArgumentGroundingResult = {
  status: "READY" | "MISSING_INFORMATION" | "UNGROUNDED" | "INVALID";
  arguments: Record<string, unknown>;
  missing: string[];
  ungrounded: string[];
};

const inputText = (input: unknown): string => JSON.stringify(input).toLocaleLowerCase("es");

export const normalizeRelativeDate = (value: unknown): unknown => {
  if (typeof value !== "string") return value;
  const normalized = value.trim().toLocaleLowerCase("es");
  if (["mañana", "manana", "tomorrow"].includes(normalized)) return "tomorrow";
  if (["hoy", "today"].includes(normalized)) return "today";
  if (["pasado mañana", "pasado manana", "day_after_tomorrow"].includes(normalized)) return "day_after_tomorrow";
  return value;
};

const hasTimeEvidence = (text: string): boolean => /\b(?:[01]?\d|2[0-3]):[0-5]\d\b|\b(?:a\s+las|a\s+la)\s+\d{1,2}\b/i.test(text);

export const groundToolArguments = (input: unknown, tool: ToolDefinition, argumentsValue: Record<string, unknown>, temporalContext?: TemporalContext): ToolArgumentGroundingResult => {
  const text = inputText(input);
  const grounded = { ...argumentsValue };
  const missing: string[] = [];
  const ungrounded: string[] = [];
  const schema = buildExtractionSchema(tool.inputSchema);
  const required = schema.required ?? [];
  const currentDate = resolveCurrentDate(temporalContext);
  for (const field of new Set([...required, ...Object.keys(grounded)])) {
    if (!Object.hasOwn(schema.properties ?? {}, field)) { ungrounded.push(field); continue; }
    if (!(field in grounded) || grounded[field] === undefined || grounded[field] === null || grounded[field] === "") {
      missing.push(field);
      continue;
    }
    if (field === "date") {
      const date = dateFromEvidence(text, currentDate);
      if (!date) { missing.push(field); ungrounded.push(field); continue; }
      grounded[field] = date;
    } else if (field === "time") {
      if (!hasTimeEvidence(text)) { missing.push(field); ungrounded.push(field); continue; }
    } else if (typeof grounded[field] === "string" && !text.includes(String(grounded[field]).toLocaleLowerCase("es"))) {
      ungrounded.push(field);
    }
  }
  return { status: missing.length ? "MISSING_INFORMATION" : ungrounded.length ? "UNGROUNDED" : "READY", arguments: grounded, missing, ungrounded };
};
