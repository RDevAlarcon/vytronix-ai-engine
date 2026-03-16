import { AppError } from "@/lib/errors";

export const safeJsonParse = <T>(raw: string): T => {
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    throw new AppError("Model output is not valid JSON", {
      code: "LLM_INVALID_JSON",
      status: 502,
      details: error
    });
  }
};

export const extractJsonObject = (text: string): string => {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new AppError("No JSON object found in model output", {
      code: "LLM_JSON_NOT_FOUND",
      status: 502,
      details: { output: text }
    });
  }

  return trimmed.slice(firstBrace, lastBrace + 1);
};
