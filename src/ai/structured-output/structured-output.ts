import { z } from "zod";
import type { ChatMessage, LlmChatResponse } from "@/ai/llm/llm.types";
import { AppError } from "@/lib/errors";
import { extractJsonObject, safeJsonParse } from "@/lib/json";

export type StructuredOutputIssue = {
  path: string;
  code: string;
  expected?: string;
  received?: string;
  message?: string;
};

export type StructuredOutputDiagnostic = {
  stage: "INITIAL_OUTPUT" | "INITIAL_PARSE" | "INITIAL_SCHEMA" | "REPAIR_OUTPUT" | "REPAIR_PARSE" | "REPAIR_SCHEMA";
  attempt: number;
  provider?: string;
  model?: string;
  finishReason?: string | null;
  contentLength?: number;
  rawOutput?: string;
  rawOutputTruncated?: boolean;
  rawContentExists?: boolean;
  fencedJsonDetected?: boolean;
  extractedJsonExists?: boolean;
  extractedJsonLength?: number;
  jsonParseSuccess?: boolean;
  zodIssues?: StructuredOutputIssue[];
  orchestrationType?: "RESPOND" | "CALL_TOOL" | "UNKNOWN";
  toolName?: string;
  argumentsPresent?: boolean;
  toolResultPresent?: boolean;
  toolResultStatus?: string;
  expectedBehavior?: "RESPOND" | "CALL_TOOL";
  success: boolean;
};

const MAX_ISSUES = 8;
const MAX_TEXT = 1200;

const compact = (value: unknown): string | undefined => {
  if (value === undefined) return undefined;
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > 160 ? `${text.slice(0, 157)}...` : text;
};

export const summarizeZodIssues = (error: z.ZodError, maxIssues = MAX_ISSUES): StructuredOutputIssue[] =>
  error.issues.slice(0, maxIssues).map((issue) => ({
    path: issue.path.length ? issue.path.join(".") : "$",
    code: issue.code,
    expected: "expected" in issue ? compact(issue.expected) : undefined,
    received: "received" in issue ? compact(issue.received) : undefined,
    message: compact(issue.message)
  }));

const validationError = (issues: StructuredOutputIssue[]) =>
  new AppError("LLM output does not match expected schema", {
    code: "AGENT_OUTPUT_INVALID",
    status: 502,
    details: { validationIssues: issues }
  });

export const parseStructuredOutput = <T>(content: string, schema: z.ZodType<T>): T => {
  const jsonText = extractJsonObject(content);
  const parsed = safeJsonParse<unknown>(jsonText);
  const result = schema.safeParse(parsed);
  if (!result.success) throw validationError(summarizeZodIssues(result.error));
  return result.data;
};

export const buildStructuredOutputRepairPrompt = (params: {
  previousOutput: string;
  issues: StructuredOutputIssue[];
  schema: unknown;
  additionalInstructions?: string;
}): string => {
  const previous = params.previousOutput.length > MAX_TEXT
    ? `${params.previousOutput.slice(0, MAX_TEXT - 3)}...`
    : params.previousOutput;
  return [
    "Tu respuesta anterior no cumple el schema requerido.",
    "Corrige únicamente la estructura, los tipos o los campos necesarios; conserva el contenido semántico válido.",
    "Devuelve exclusivamente un objeto JSON válido, sin markdown ni explicaciones.",
    `Errores de validación: ${JSON.stringify(params.issues).slice(0, MAX_TEXT)}`,
    `Schema esperado: ${JSON.stringify(params.schema).slice(0, MAX_TEXT)}`,
    `Respuesta anterior: ${previous}`,
    ...(params.additionalInstructions ? [params.additionalInstructions] : [])
  ].join("\n");
};

export type StructuredOutputExecution<T> = {
  parsedOutput: T;
  rawOutput: string;
  response: LlmChatResponse;
  attemptCount: number;
  repairAttempt: boolean;
  diagnostics: StructuredOutputDiagnostic[];
};

export const executeStructuredOutput = async <T>(params: {
  baseMessages: ChatMessage[];
  schema: z.ZodType<T>;
  schemaDescription: unknown;
  generate: (messages: ChatMessage[]) => Promise<LlmChatResponse>;
  validate?: (parsedOutput: T) => void;
  inspectParsed?: (parsedOutput: unknown) => Partial<StructuredOutputDiagnostic>;
  diagnosticContext?: Partial<StructuredOutputDiagnostic>;
  repairInstructions?: string;
  captureRawOutput?: boolean;
  maxDiagnosticOutputLength?: number;
}): Promise<StructuredOutputExecution<T>> => {
  let previousOutput = "";
  let issues: StructuredOutputIssue[] = [];
  const diagnostics: StructuredOutputDiagnostic[] = [];

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const messages = attempt === 1
      ? params.baseMessages
      : [...params.baseMessages, {
          role: "user" as const,
          content: buildStructuredOutputRepairPrompt({ previousOutput, issues, schema: params.schemaDescription, additionalInstructions: params.repairInstructions })
        }];
    try {
      const response = await params.generate(messages);
      previousOutput = response.content;
      const prefix = attempt === 1 ? "INITIAL" : "REPAIR";
      const limit = params.maxDiagnosticOutputLength ?? 4000;
      const diagnostic: StructuredOutputDiagnostic = {
        stage: `${prefix}_OUTPUT`, attempt, provider: response.provider, model: response.model,
        finishReason: response.finishReason ?? null, contentLength: response.content.length,
        rawContentExists: Boolean(response.content),
        rawOutput: params.captureRawOutput ? response.content.slice(0, limit) : undefined,
        rawOutputTruncated: params.captureRawOutput ? response.content.length > limit : undefined,
        fencedJsonDetected: /```(?:json)?\s*[\s\S]*?```/i.test(response.content),
        ...params.diagnosticContext,
        success: false
      };
      diagnostics.push(diagnostic);
      try {
        const jsonText = extractJsonObject(response.content);
        diagnostic.extractedJsonExists = true;
        diagnostic.extractedJsonLength = jsonText.length;
        const parsed = safeJsonParse<unknown>(jsonText);
        diagnostic.jsonParseSuccess = true;
        Object.assign(diagnostic, params.inspectParsed?.(parsed));
        const validated = params.schema.safeParse(parsed);
        if (!validated.success) {
          diagnostic.stage = `${prefix}_SCHEMA`;
          diagnostic.zodIssues = summarizeZodIssues(validated.error);
          throw validationError(diagnostic.zodIssues);
        }
        params.validate?.(validated.data);
        diagnostic.success = true;
        return { parsedOutput: validated.data, rawOutput: response.content, response, attemptCount: attempt, repairAttempt: attempt === 2, diagnostics };
      } catch (error) {
        if (error instanceof AppError && ["LLM_INVALID_JSON", "LLM_JSON_NOT_FOUND"].includes(error.code)) {
          diagnostic.stage = `${prefix}_PARSE`;
          diagnostic.jsonParseSuccess = false;
        }
        throw error;
      }
    } catch (error) {
      if (error instanceof AppError && error.code === "AGENT_OUTPUT_INVALID") {
        const details = error.details as { validationIssues?: StructuredOutputIssue[] } | undefined;
        issues = details?.validationIssues ?? [];
      } else if (error instanceof AppError && (error.code === "LLM_INVALID_JSON" || error.code === "LLM_JSON_NOT_FOUND")) {
        issues = [{ path: "$", code: error.code, message: "El resultado no contiene JSON válido." }];
      } else if (error instanceof AppError && ["TOOL_NOT_AVAILABLE", "TOOL_ARGUMENTS_INVALID", "TOOL_CALL_INVALID", "TOOL_SELECTION_INVALID"].includes(error.code)) {
        issues = [{ path: "action", code: error.code, message: error.message }];
      }
      if (attempt === 2 || !(error instanceof AppError) || !["LLM_INVALID_JSON", "LLM_JSON_NOT_FOUND", "AGENT_OUTPUT_INVALID", "TOOL_NOT_AVAILABLE", "TOOL_ARGUMENTS_INVALID", "TOOL_CALL_INVALID", "TOOL_SELECTION_INVALID"].includes(error.code)) {
        if (error instanceof AppError) throw new AppError(error.message, { code: error.code, status: error.status, details: { ...(error.details as object ?? {}), diagnostics } });
        throw error;
      }
    }
  }
  throw new AppError("LLM output is invalid", { code: "AGENT_OUTPUT_INVALID", status: 502 });
};
