import { z } from "zod";
import type { ToolDefinition } from "./tool-contract";
import { currentTurnText, type ToolArgumentGroundingResult } from "./tool-argument-grounding";

const normalize = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const weekdays = /\b(domingo|sunday|lunes|monday|martes|tuesday|miercoles|wednesday|jueves|thursday|viernes|friday|sabado|saturday)\b/g;
const relativeLiteral = /^(?:(?:el |on )?(?:domingo|sunday|lunes|monday|martes|tuesday|miercoles|wednesday|jueves|thursday|viernes|friday|sabado|saturday)|hoy|today|manana|tomorrow|pasado manana|day_after_tomorrow|day after tomorrow)$/;

// Observation only: these categories never participate in date resolution.
const describeText = (text: string) => {
  const normalized = normalize(text);
  const matches = [...normalized.matchAll(weekdays)];
  const isoCount = [...normalized.matchAll(/\b\d{4}-\d{2}-\d{2}\b/g)].length;
  const afterTomorrow = /\b(pasado manana|day_after_tomorrow|day after tomorrow)\b/.test(normalized);
  const tomorrow = !afterTomorrow && /\b(manana|tomorrow)\b/.test(normalized);
  const today = /\b(hoy|today)\b/.test(normalized);
  const unsupported = /\b(someday|sometime|later|weekend|next week|this weekend)\b/.test(normalized) || matches.some((match) =>
    /\b(next|this|last|previous|proximo)\s+$/.test(normalized.slice(0, match.index)) ||
    /^\s+(que viene|siguiente|next week|por la tarde|en la noche|afternoon|evening|night)\b/.test(normalized.slice(match.index! + match[0].length)));
  const category = matches.length + isoCount + Number(afterTomorrow) + Number(tomorrow) + Number(today) > 1 ? "AMBIGUOUS"
    : unsupported ? "UNSUPPORTED" : matches.length ? "WEEKDAY" : isoCount ? "ISO_DATE"
      : afterTomorrow ? "DAY_AFTER_TOMORROW" : tomorrow ? "TOMORROW" : today ? "TODAY" : "NONE";
  return { currentTurnWeekdayMatchCount: Math.min(matches.length, 2), currentTurnRelativeDateCategory: category };
};

export type DateDiagnosticObservation = {
  correlationId?: string;
  tool: ToolDefinition;
  input: unknown;
  temporalContext?: unknown;
  extractedArguments?: Record<string, unknown>;
  grounding?: ToolArgumentGroundingResult;
  finalValidationRan: boolean;
  routerDecision: "CALL_TOOL" | "CLARIFICATION" | "OTHER";
};

export function buildDateGroundingDiagnostic(params: DateDiagnosticObservation) {
  const properties = params.tool.inputSchema.properties ?? {};
  const dateFields = Object.keys(properties).filter((name) => properties[name]?.format === "date");
  // Observe legacy `date` even when its format is absent. Do not collapse multiple dates.
  const field = Object.hasOwn(properties, "date") ? "date" : dateFields.length === 1 ? dateFields[0] : undefined;
  const required = field !== undefined && (params.tool.inputSchema.required ?? []).includes(field);
  const args = params.extractedArguments;
  const value = field === undefined ? undefined : args?.[field];
  const context = params.temporalContext && typeof params.temporalContext === "object" && !Array.isArray(params.temporalContext)
    ? params.temporalContext as Record<string, unknown> : {};
  const timezonePresent = context.timezone !== undefined;
  let timezoneValid = false;
  if (typeof context.timezone === "string" && context.timezone.length <= 100) {
    try { new Intl.DateTimeFormat("en", { timeZone: context.timezone }); timezoneValid = true; } catch { /* metadata only */ }
  }
  const missing = field !== undefined && Boolean(params.grounding?.missing.includes(field));
  const ungrounded = field !== undefined && Boolean(params.grounding?.ungrounded.includes(field));
  const resolverRan = Boolean(field && properties[field]?.format === "date" && params.grounding && (required || (args && Object.hasOwn(args, field))));
  const finalIso = field !== undefined && z.iso.date().safeParse(params.grounding?.arguments[field]).success;
  return {
    event: "tool_date_grounding_diagnostic",
    dateGroundingDiagnosticVersion: 1,
    ...(z.uuid().safeParse(params.correlationId).success ? { correlationId: params.correlationId } : {}),
    ...(/^[a-z0-9_]{1,80}$/.test(params.tool.name) ? { toolName: params.tool.name } : {}),
    dateFieldDeclared: field !== undefined,
    dateFieldRequired: required,
    ...(args && field ? {
      extractorDatePresence: !Object.hasOwn(args, field) ? "ABSENT" : value === "" ? "EMPTY" : typeof value === "string" ? "STRING" : "OTHER",
      extractorDateStringCategory: typeof value !== "string" || value === "" ? "NOT_APPLICABLE"
        : z.iso.date().safeParse(value).success ? "ISO_DATE" : relativeLiteral.test(normalize(value).trim()) ? "SUPPORTED_RELATIVE" : "OTHER_STRING"
    } : {}),
    temporalContextPresent: params.temporalContext !== undefined,
    timezonePresent,
    timezoneValid,
    currentDatePresent: context.currentDate !== undefined,
    currentDateValid: z.iso.date().safeParse(context.currentDate).success,
    ...describeText(currentTurnText(params.input)),
    knownContextUsedForTemporalGrounding: false,
    dateResolverResultCategory: !resolverRan ? "NOT_RUN" : missing || ungrounded ? "UNRESOLVED" : finalIso ? "RESOLVED_ISO" : "UNRESOLVED",
    groundingDateStatus: !field || !params.grounding ? "NOT_APPLICABLE" : missing && ungrounded ? "MISSING_AND_UNGROUNDED"
      : missing ? "MISSING" : ungrounded ? "UNGROUNDED" : finalIso ? "GROUNDED" : "NOT_APPLICABLE",
    finalDateSchemaStatus: !params.finalValidationRan || !field || properties[field]?.format !== "date" ? "NOT_RUN" : finalIso ? "PASS" : "FAIL",
    routerDecision: params.routerDecision
  };
}

export function logDateGroundingDiagnostic(params: DateDiagnosticObservation): void {
  // Logging must never change the response/error or trigger another model attempt.
  try { console.error(JSON.stringify(buildDateGroundingDiagnostic(params))); } catch { /* diagnostic failure is inert */ }
}
