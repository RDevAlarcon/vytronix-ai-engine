import { z } from "zod";

export const temporalContextSchema = z.object({
  currentDate: z.iso.date().optional(),
  timezone: z.string().max(100).refine((value) => {
    try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; }
  }, "Invalid timezone").optional()
}).strict();
export type TemporalContext = z.infer<typeof temporalContextSchema>;

export function resolveCurrentDate(context?: TemporalContext, now = new Date()): string {
  const parsed = temporalContextSchema.parse(context ?? {});
  if (parsed.currentDate) return parsed.currentDate;
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: parsed.timezone ?? "UTC", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(now);
  const part = (type: string) => parts.find((value) => value.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

const months = [
  ["enero", "january"], ["febrero", "february"], ["marzo", "march"],
  ["abril", "april"], ["mayo", "may"], ["junio", "june"],
  ["julio", "july"], ["agosto", "august"], ["septiembre", "setiembre", "september"],
  ["octubre", "october"], ["noviembre", "november"], ["diciembre", "december"]
];

// Return no date for absent, impossible or conflicting evidence. Never use model output.
export function dateFromEvidence(text: string, currentDate: string): string | undefined {
  const normalized = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const dates = new Set<string>();
  for (const match of normalized.matchAll(/\b\d{4}-\d{2}-\d{2}\b/g)) dates.add(match[0]);
  for (const match of normalized.matchAll(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{4}))?\b/g)) {
    // ISO components are already captured above.
    if (match.index > 0 && /[\d-]/.test(normalized.charAt(match.index - 1))) continue;
    dates.add(`${match[3] ?? currentDate.slice(0, 4)}-${match[2]!.padStart(2, "0")}-${match[1]!.padStart(2, "0")}`);
  }
  for (const match of normalized.matchAll(/\b(\d{1,2})\s+(?:de\s+)?([a-z]+)(?:\s+(?:de\s+)?(\d{4}))?\b/g)) {
    const month = months.findIndex((names) => names.includes(match[2]!));
    if (month >= 0) dates.add(`${match[3] ?? currentDate.slice(0, 4)}-${String(month + 1).padStart(2, "0")}-${match[1]!.padStart(2, "0")}`);
  }
  // Keep the existing relative-date tokens understood by the caller.
  const relative = /\b(pasado manana|day_after_tomorrow|day after tomorrow)\b/.test(normalized)
    ? "day_after_tomorrow" : /\b(manana|tomorrow)\b/.test(normalized)
      ? "tomorrow" : /\b(hoy|today)\b/.test(normalized) ? "today" : undefined;
  if (relative) dates.add(relative);
  if (dates.size !== 1) return undefined;
  const value = [...dates][0];
  return value === relative || z.iso.date().safeParse(value).success ? value : undefined;
}
