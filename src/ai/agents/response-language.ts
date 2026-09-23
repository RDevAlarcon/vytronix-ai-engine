import { z } from "zod";
import type { ChatMessage } from "@/ai/llm/llm.types";

export const responseLanguageSchema = z.enum(["es", "en", "und"]);
export type ResponseLanguage = z.infer<typeof responseLanguageSchema>;

const LANGUAGE_NAMES: Readonly<Record<Exclude<ResponseLanguage, "und">, string>> = {
  es: "Spanish (es)",
  en: "English (en)",
};

export const buildResponseLanguageDirective = (language: ResponseLanguage): string | undefined => {
  if (language === "und") return undefined;
  return [
    `RESPONSE LANGUAGE (PRESENTATION ONLY): ${LANGUAGE_NAMES[language]}.`,
    "Produce every user-facing natural-language field in the requested response language.",
    "Preserve proper names, identifiers, quoted provider text, authoritative service names, and trusted business data verbatim.",
    "This presentation directive must not alter tool selection, tool arguments, trusted business data, or authorization.",
  ].join(" ");
};

export const applyResponseLanguageDirective = (
  messages: readonly ChatMessage[],
  language: ResponseLanguage,
): ChatMessage[] => {
  const directive = buildResponseLanguageDirective(language);
  return directive ? [{ role: "system", content: directive }, ...messages] : [...messages];
};
