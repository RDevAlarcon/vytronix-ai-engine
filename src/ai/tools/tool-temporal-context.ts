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

const weekdayNumbers = new Map<string, number>([
  ["domingo", 0], ["sunday", 0],
  ["lunes", 1], ["monday", 1],
  ["martes", 2], ["tuesday", 2],
  ["miercoles", 3], ["wednesday", 3],
  ["jueves", 4], ["thursday", 4],
  ["viernes", 5], ["friday", 5],
  ["sabado", 6], ["saturday", 6]
]);

const weekdayPattern = /\b(domingo|sunday|lunes|monday|martes|tuesday|miercoles|wednesday|jueves|thursday|viernes|friday|sabado|saturday)\b/g;

const dateAfterDays = (date: string, days: number): string | undefined => {
  if (!z.iso.date().safeParse(date).success) return undefined;
  const [year, month, day] = date.split("-").map(Number);
  const value = new Date(Date.UTC(year!, month! - 1, day! + days));
  return value.toISOString().slice(0, 10);
};

const weekdayFromEvidence = (text: string, currentDate: string): string | undefined => {
  const matches = [...text.matchAll(weekdayPattern)];
  if (matches.length !== 1) return undefined;
  const match = matches[0]!;
  const before = text.slice(0, match.index);
  const after = text.slice(match.index! + match[0].length);
  // Keep weekday evidence deliberately narrow. Relative modifiers and parts of
  // day remain clarification cases instead of becoming guessed dates.
  if (/\b(?:someday|sometime|later|weekend|next week|this weekend)\b/.test(text)) return undefined;
  if (/\b(?:next|this|last|previous|proximo)\s+$/.test(before)) return undefined;
  if (/^\s+(?:que viene|siguiente|next week|por la tarde|en la noche|afternoon|evening|night)\b/.test(after)) return undefined;
  const targetWeekday = weekdayNumbers.get(match[0]);
  const current = dateAfterDays(currentDate, 0);
  if (targetWeekday === undefined || !current) return undefined;
  const [year, month, day] = current.split("-").map(Number);
  const currentWeekday = new Date(Date.UTC(year!, month! - 1, day!)).getUTCDay();
  const daysAhead = (targetWeekday - currentWeekday + 7) % 7;
  return daysAhead === 0 ? undefined : dateAfterDays(current, daysAhead);
};

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
  const relativeDays = /\b(pasado manana|day_after_tomorrow|day after tomorrow)\b/.test(normalized)
    ? 2 : /\b(manana|tomorrow)\b/.test(normalized)
      ? 1 : /\b(hoy|today)\b/.test(normalized) ? 0 : undefined;
  if (relativeDays !== undefined) {
    const relativeDate = dateAfterDays(currentDate, relativeDays);
    if (relativeDate) dates.add(relativeDate);
  }
  const weekday = weekdayFromEvidence(normalized, currentDate);
  if (weekday) dates.add(weekday);
  if (dates.size !== 1) return undefined;
  const value = [...dates][0];
  return z.iso.date().safeParse(value).success ? value : undefined;
}
